/*
Connected work (#488): the reciprocal side of a facet reference.

The facet chip is persisted as a Dana Link, but its reciprocal presentation is
source-aware: the server answers the exact containing block/post and a small
preview of that source. The UI groups sources under their parent Task/Page/
Discussion so a facet reads as connected work rather than as a list of pages
that happen to contain links.
*/
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router'

import { getConnectedWorkResponse } from '../../../shared/connected-work.js'
import type { ConnectedWorkItem, ConnectedWorkSource } from '../../../shared/connected-work.js'
import { getPlain } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'
import { ChevronRight, FileText } from '../../lib/icons.js'
import { backlinkPath } from './dana-link.js'
import { DanaLinkKindIcon } from './kind-icon.js'

function rowKey(row: ConnectedWorkItem): string {
  return `${row.surface}:${row.home}:${row.home_id}:${row.member_id ?? ''}`
}

function sourcePath(row: ConnectedWorkItem, source: ConnectedWorkSource): string | null {
  const base = backlinkPath(row)
  if (base === null) return null
  return `${base}${source.kind === 'post' ? '#post-' : '#block-'}${source.id}`
}

export function ConnectedWork({ id, className = '' }: {
  readonly id: string
  readonly className?: string
}): React.JSX.Element | null {
  const connected = useQuery({
    queryKey: queryKeys.connectedWork(id),
    queryFn: () => getPlain(getConnectedWorkResponse, `/facets/${encodeURIComponent(id)}/connected-work`),
    retry: false,
    staleTime: 0,
  })
  const rows = connected.data?.results ?? []
  if (rows.length === 0) return null
  const count = rows.reduce((total, row) => total + Math.max(1, row.sources.length), 0)

  return (
    <details className={`group mt-6 border-t border-border/60 pt-3 text-sm ${className}`} data-connected-work>
      <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight size={12} aria-hidden="true" className="transition-transform group-open:rotate-90" />
        <span>Connected work</span>
        <span className="tabular-nums">{count}{connected.data?.truncated === true ? '+' : ''}</span>
      </summary>
      <div className="mt-2 space-y-2 pl-1">
        {rows.map((row) => <ConnectedWorkGroup key={rowKey(row)} row={row} />)}
      </div>
    </details>
  )
}

function ConnectedWorkGroup({ row }: { readonly row: ConnectedWorkItem }): React.JSX.Element {
  const parentPath = backlinkPath(row)
  const label = row.surface === 'responsibility'
    ? `${row.label} · Responsibilities`
    : row.label === '' ? 'Untitled' : row.label
  const parent = <><DanaLinkKindIcon kind={row.home} /><span className="truncate">{label}</span></>

  return (
    <div className="min-w-0">
      {parentPath === null ? (
        <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 px-1 text-xs text-muted-foreground">{parent}</div>
      ) : (
        <RouterLink to={parentPath} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
          {parent}
        </RouterLink>
      )}
      {row.sources.length === 0 ? null : (
        <ul className="mt-0.5 space-y-0.5 border-l border-border/70 pl-2.5">
          {row.sources.map((source) => (
            <li key={`${source.kind}:${source.id}`}>
              <ConnectedSource row={row} source={source} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ConnectedSource({ row, source }: {
  readonly row: ConnectedWorkItem
  readonly source: ConnectedWorkSource
}): React.JSX.Element {
  const path = sourcePath(row, source)
  const text = source.text ?? (source.files.length > 0 ? source.files[0]?.name ?? 'File' : 'Referenced this facet')
  const body = (
    <div className="min-w-0 py-1">
      <p className="line-clamp-2 break-words text-foreground">{text}</p>
      {source.files.length === 0 ? null : (
        <div className="mt-1 flex min-w-0 flex-wrap gap-1">
          {source.files.map((file) => (
            <span key={file.id} className="inline-flex max-w-full items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              <FileText size={11} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{file.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
  return path === null ? body : (
    <RouterLink to={path} className="block rounded-md px-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </RouterLink>
  )
}
