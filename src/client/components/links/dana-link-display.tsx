// The live Dana Link chip, kept apart from the BlockNote spec so post lists do not
// load the editor.
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { OfflineError } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'
import { Link2 } from '../../lib/icons.js'
import { danaLinkOf, referenceDisplayLabel, resolveReference } from './dana-link.js'
import { DanaLinkKindIcon } from './kind-icon.js'

const CHIP = 'dana-link-chip mx-px inline-flex max-w-full items-baseline gap-1 rounded-sm border border-border bg-muted px-1.5 align-baseline text-[length:inherit] leading-[inherit] font-section text-foreground! no-underline!'
const FACET = 'border-primary/30 bg-primary/10'
const ARRIVED = 'ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
export function DanaLinkChip({ href, stored }: { readonly href: string; readonly stored: string }): React.JSX.Element {
  const target = danaLinkOf(href)
  const navigate = useNavigate()
  const anchor = useRef<HTMLAnchorElement>(null)
  const [arrived, setArrived] = useState(false)
  const query = useQuery({
    queryKey: queryKeys.reference(target?.kind ?? '', target?.id ?? ''),
    queryFn: () => resolveReference(target!.kind, target!.id),
    enabled: target !== null,
    retry: false,
    staleTime: 30_000,
  })

  // Honour `#block-<id>` from the link itself; posts handle `#post-<id>` in ThreadPosts.
  useEffect(() => {
    let timer: number | undefined
    const reveal = (): void => {
      const block = anchor.current?.closest<HTMLElement>('.bn-block[data-id]')
      const id = block?.getAttribute('data-id')
      if (block === undefined || block === null || id === null || window.location.hash !== `#block-${id}`) return
      block.scrollIntoView({ block: 'center' })
      setArrived(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { setArrived(false) }, 1600)
    }
    reveal()
    window.addEventListener('hashchange', reveal)
    return () => {
      window.removeEventListener('hashchange', reveal)
      window.clearTimeout(timer)
    }
  }, [])

  const offline = query.error instanceof OfflineError
  if (target === null || (query.isError && !offline)) {
    return (
      <span className={`${CHIP} text-muted-foreground!`} contentEditable={false} data-dana-link="unavailable" title="This link's target is unavailable" aria-disabled="true">
        <Link2 size={12} aria-hidden="true" className="shrink-0 self-center" />Unavailable
      </span>
    )
  }
  // Offline, fall back to the stored text, which this reader can already see in the page.
  const resolved = query.data?.label ?? (offline ? stored : '')
  const label = referenceDisplayLabel(target.kind, resolved)
  const classes = `${target.kind === 'facet' ? `${CHIP} ${FACET}` : CHIP}${arrived ? ` ${ARRIVED}` : ''}`
  return (
    <a
      ref={anchor}
      href={target.path}
      className={`${classes} cursor-pointer hover:bg-accent hover:text-accent-foreground! focus-visible:outline-2 focus-visible:outline-ring`}
      contentEditable={false}
      data-dana-link={target.kind}
      data-facet-reference={target.kind === 'facet' ? '' : undefined}
      title={target.kind === 'facet' ? 'Facet reference' : undefined}
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
