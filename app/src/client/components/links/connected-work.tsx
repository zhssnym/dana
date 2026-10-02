/*
Connected work (#488): the reciprocal side of a facet reference.

A facet reference is still an ordinary Dana Link. Nothing new is persisted and
nothing in the facet document is rewritten. The existing #214 backlink read is
the source of truth; this component only gives that read a facet-specific,
quiet presentation.

Tabs have lived through two canonical URL shapes. Current page links use
`/app/folders/:id`, while the stable facet grammar also accepts
`/app/facets/:id`. Read both so an existing Purpose/Results link and a newer
custom-facet link converge on one Connected work list. The two answers are
access-filtered independently by the same server resolver and are de-duplicated
by source document here.
*/
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router'

import { queryKeys } from '../../api/keys.js'
import { ChevronRight } from '../../lib/icons.js'
import { backlinkPath, backlinksOf } from './dana-link.js'
import type { LooseBacklink } from './dana-link.js'
import { DanaLinkKindIcon } from './kind-icon.js'

function sourceKey(row: LooseBacklink): string {
  return `${row.surface}:${row.home}:${row.home_id}:${row.member_id ?? ''}`
}

/**
 * Merge the two historical target spellings without turning two links from the
 * same document into two pieces of work. The server already groups matching
 * blocks inside a document; this is only the final cross-kind de-duplication.
 */
export function connectedWorkRows(
  pageRows: readonly LooseBacklink[],
  facetRows: readonly LooseBacklink[],
): LooseBacklink[] {
  const unique = new Map<string, LooseBacklink>()
  for (const row of [...pageRows, ...facetRows]) {
    if (!unique.has(sourceKey(row))) unique.set(sourceKey(row), row)
  }
  return [...unique.values()].sort(
    (a, b) =>
      a.label.toLowerCase().localeCompare(b.label.toLowerCase()) ||
      sourceKey(a).localeCompare(sourceKey(b)),
  )
}

export function ConnectedWork({ id, className = '' }: {
  readonly id: string
  readonly className?: string
}): React.JSX.Element | null {
  const page = useQuery({
    queryKey: queryKeys.backlinks('folder', id),
    queryFn: () => backlinksOf('folder', id),
    retry: false,
    staleTime: 0,
  })
  const facet = useQuery({
    queryKey: queryKeys.backlinks('facet', id),
    queryFn: () => backlinksOf('facet', id),
    retry: false,
    staleTime: 0,
  })
  const rows = connectedWorkRows(page.data?.results ?? [], facet.data?.results ?? [])
  if (rows.length === 0) return null
  const truncated = page.data?.truncated === true || facet.data?.truncated === true

  return (
    <details className={`group mt-6 border-t border-border/60 pt-3 text-sm ${className}`} data-connected-work>
      <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight size={12} aria-hidden="true" className="transition-transform group-open:rotate-90" />
        <span>Connected work</span>
        <span className="tabular-nums">{rows.length}{truncated ? '+' : ''}</span>
      </summary>
      <ul className="mt-1 space-y-0.5 pl-1">
        {rows.map((row) => <li key={sourceKey(row)}><ConnectedWorkRow row={row} /></li>)}
      </ul>
    </details>
  )
}

function ConnectedWorkRow({ row }: { readonly row: LooseBacklink }): React.JSX.Element {
  const path = backlinkPath(row)
  const label = row.surface === 'responsibility'
    ? `${row.label} · Responsibilities`
    : row.label === '' ? 'Untitled' : row.label
  const body = <><DanaLinkKindIcon kind={row.home} /><span className="truncate">{label}</span></>
  return path === null
    ? <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 px-1 text-muted-foreground">{body}</span>
    : <RouterLink to={path} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-foreground hover:bg-accent">{body}</RouterLink>
}
