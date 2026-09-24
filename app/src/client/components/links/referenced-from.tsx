/*
"Referenced from" (#214): the documents that link here, as the reader can
open them. Live, never stored — the server scans on read and answers only
sources this reader may open. Small and collapsible, and absent altogether
while nothing references the target, so it costs a page nothing until it has
something to say.
*/
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router'

import { queryKeys } from '../../api/keys.js'
import { backlinkPath, backlinksOf } from './dana-link.js'
import type { BacklinkTargetKind } from './dana-link.js'
import { ChevronRight } from '../../lib/icons.js'
import { DanaLinkKindIcon } from './kind-icon.js'

export function ReferencedFrom({ kind, id, className = '' }: {
  readonly kind: BacklinkTargetKind
  readonly id: string
  readonly className?: string
}): React.JSX.Element | null {
  const query = useQuery({
    queryKey: queryKeys.backlinks(kind, id),
    queryFn: () => backlinksOf(kind, id),
    retry: false,
  })
  const rows = query.data?.results ?? []
  if (rows.length === 0) return null
  return (
    <details className={`group text-sm ${className}`} data-referenced-from>
      <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight size={12} aria-hidden="true" className="transition-transform group-open:rotate-90" />
        Referenced from {rows.length}{query.data?.truncated ? '+' : ''} {rows.length === 1 ? 'place' : 'places'}
      </summary>
      <ul className="mt-1 space-y-0.5 pl-1">
        {rows.map((row) => {
          const path = backlinkPath(row)
          const label = row.surface === 'responsibility' ? `${row.label} · Responsibilities` : row.label === '' ? 'Untitled' : row.label
          const key = `${row.surface}:${row.home}:${row.home_id}:${row.member_id ?? ''}`
          const body = <><DanaLinkKindIcon kind={row.home} /><span className="truncate">{label}</span></>
          return (
            <li key={key}>
              {path === null
                ? <span className="inline-flex max-w-full items-center gap-1.5 px-1 text-muted-foreground">{body}</span>
                : <RouterLink to={path} className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-foreground hover:bg-accent">{body}</RouterLink>}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
