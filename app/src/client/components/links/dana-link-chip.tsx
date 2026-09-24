/*
A Dana Link as the canvas draws it: an inline chip whose label is the
target's *live* name, resolved through `GET /references/:kind/:id` on every
read (#223). The label stored in the document is only the durable text a
save writes (so export and plain-text readers still have words); the chip
never draws it, because a target the viewer cannot open must look exactly like
one that does not exist — "Unavailable", with no name, no kind hint beyond the
link's own shape, and no way in.

Persisted as an ordinary rich-content run `{ text, href: "/app/<kind>s/<id>" }`
by `canvas/adapters.ts`, so nothing on the server changed shape.
*/
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { createReactInlineContentSpec } from '@blocknote/react'

import { OfflineError } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'
import { Link2 } from '../../lib/icons.js'
import { danaLinkOf, resolveReference } from './dana-link.js'
import { DanaLinkKindIcon } from './kind-icon.js'

const CHIP = 'dana-link-chip mx-px inline-flex max-w-[24rem] items-center gap-1 rounded-md bg-muted px-1.5 align-baseline text-[length:var(--text-body-size)] leading-[1.5] font-medium text-foreground! no-underline!'

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
        <Link2 size={12} aria-hidden="true" className="shrink-0" />Unavailable
      </span>
    )
  }
  // Offline, the document's own words are the best we have; they are the
  // author's text, which this reader can already read in the page.
  const label = query.data?.label ?? (offline ? stored : '')
  return (
    <a
      href={target.path}
      className={`${CHIP} cursor-pointer hover:bg-accent hover:text-accent-foreground!`}
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

export const danaLinkInlineSpec = createReactInlineContentSpec(
  {
    type: 'danaLink',
    propSchema: { href: { default: '' }, label: { default: '' } },
    content: 'none',
  } as const,
  {
    render: ({ inlineContent }) => <DanaLinkChip href={inlineContent.props.href} stored={inlineContent.props.label} />,
    toExternalHTML: ({ inlineContent }) => <a href={inlineContent.props.href}>{inlineContent.props.label}</a>,
  },
)
