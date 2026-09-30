/* One live Dana Link treatment for editable canvases and read-only posts.
 * Kept separate from the BlockNote inline spec so post lists do not load the editor. */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { OfflineError } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'
import { Link2 } from '../../lib/icons.js'
import { danaLinkOf, resolveReference } from './dana-link.js'
import { DanaLinkKindIcon } from './kind-icon.js'

const CHIP = 'dana-link-chip mx-px inline-flex max-w-full items-baseline gap-1 rounded-sm border border-border bg-muted px-1.5 align-baseline text-[length:inherit] leading-[inherit] font-section text-foreground! no-underline!'

export function DanaLinkChip({ href, stored }: { readonly href: string; readonly stored: string }): React.JSX.Element {
  const target = danaLinkOf(href)
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: queryKeys.reference(target?.kind ?? '', target?.id ?? ''),
    queryFn: () => resolveReference(target!.kind, target!.id),
    enabled: target !== null,
    retry: false,
    staleTime: 30_000,
  })
  const offline = query.error instanceof OfflineError
  if (target === null || (query.isError && !offline)) {
    return (
      <span className={`${CHIP} text-muted-foreground!`} contentEditable={false} data-dana-link="unavailable" title="This link's target is unavailable" aria-disabled="true">
        <Link2 size={12} aria-hidden="true" className="shrink-0 self-center" />Unavailable
      </span>
    )
  }
  // Offline, the document's own words are the best we have; they are the
  // author's text, which this reader can already read in the page.
  const label = query.data?.label ?? (offline ? stored : '')
  return (
    <a
      href={target.path}
      className={`${CHIP} cursor-pointer hover:bg-accent hover:text-accent-foreground! focus-visible:outline-2 focus-visible:outline-ring`}
      contentEditable={false}
      data-dana-link={target.kind}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        void navigate(target.path)
      }}
    >
      <DanaLinkKindIcon kind={target.kind} />
      <span className="truncate">{query.isPending ? '…' : label === '' ? 'Untitled' : label}</span>
    </a>
  )
}
