// A synced block (#720): a live view of one original block. Edits go to the original's own
// document; this block stores only the original's id.
import { createReactBlockSpec } from '@blocknote/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink, useLocation } from 'react-router'

import type { DocumentTransaction, PageView } from '../../../../shared/pages.js'
import { getPageResponse } from '../../../../shared/pages.js'
import { syncedSource } from '../../../../shared/synced-blocks.js'
import type { SyncedPage } from '../../../../shared/synced-blocks.js'
import { getPlain, mutateApi } from '../../../api/http.js'
import { queryKeys } from '../../../api/keys.js'
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Copy, FileText, IconMotion, MoreHorizontal } from '../../../lib/icons.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu.js'
import { documentOf } from './adapters.js'
import { syncLink } from './block-selection.js'
import { SyncedBlockMirror, mirroredBlockInput } from './SyncedBlockMirror.js'
import type { SyncedMirrorRecord } from './SyncedBlockMirror.js'
import type { AnyEditor } from './BlockSideMenu.js'

interface PageDocument {
  readonly key: readonly unknown[]
  readonly read: string
  readonly write: string
  readonly method: 'POST' | 'PUT'
  readonly path: string
}

/** A page's document routes (the same its own canvas uses) and its address at the block. */
export function pageDocument(page: SyncedPage): PageDocument {
  const anchor = `#block-${page.block_id}`
  if (page.home === 'task') {
    const read = `/tasks/${page.home_id}/document`
    return { key: ['tasks', page.home_id, 'document'], read, write: read, method: 'PUT', path: `/app/tasks/${page.home_id}${anchor}` }
  }
  if (page.home === 'shelf') {
    const read = `/shelves/${page.home_id}/page`
    return { key: queryKeys.shelfPage(page.home_id), read, write: `${read}/actions`, method: 'POST', path: `/app/shelves/${page.home_id}${anchor}` }
  }
  if (page.facet_id === null) {
    const read = `/folders/${page.home_id}/page`
    return { key: queryKeys.folderPage(page.home_id), read, write: `${read}/actions`, method: 'POST', path: `/app/folders/${page.home_id}${anchor}` }
  }
  const read = `/pages/${page.home_id}/facets/${page.facet_id}/document`
  return {
    key: queryKeys.pageFacetDocument(page.home_id, page.facet_id),
    read,
    write: `${read}/actions`,
    method: 'POST',
    path: `/app/folders/${page.home_id}?facet=${page.facet_id}${anchor}`,
  }
}

async function writeOriginal(route: PageDocument, record: SyncedMirrorRecord): Promise<PageView> {
  const latest = await getPlain(getPageResponse, route.read)
  if (latest.revision === undefined || latest.revision === '') throw new Error('The original page cannot be changed now.')
  if (!latest.blocks.some((block) => block.id === record.id)) throw new Error('The original block is no longer available.')
  const body: DocumentTransaction = {
    action: 'document_transaction',
    mutation_id: crypto.randomUUID(),
    base_revision: latest.revision,
    operations: [{ op: 'put_block', ...record }, { op: 'set_outline', items: documentOf(latest).items }],
  }
  return mutateApi(getPageResponse, { method: route.method, path: route.write, body })
}

function useSyncedSource(sourceId: string) {
  return useQuery({
    queryKey: queryKeys.syncedSource(sourceId),
    queryFn: () => getPlain(syncedSource, `/synced-blocks/${encodeURIComponent(sourceId)}`),
    retry: false,
    staleTime: 30_000,
  })
}

const BUTTON = 'inline-flex h-6 items-center gap-1 rounded-sm px-1.5 hover:bg-accent hover:text-foreground'

/** "Synced to N other pages", the copy action and, on a copy, Unsync. Shown while the block is edited. */
export function SyncedToolbar({ sourceId, onUnsync, className = '' }: {
  readonly sourceId: string
  readonly onUnsync?: () => void
  readonly className?: string
}): React.JSX.Element | null {
  const located = useSyncedSource(sourceId)
  const routed = /^\/app\/(?:folders|tasks|shelves)\/([0-9a-f-]{36})/i.exec(useLocation().pathname)?.[1]
  const pages = located.data?.pages ?? []
  if (pages.length === 0) return null
  const here = (page: SyncedPage): boolean => page.home_id === routed
  const others = pages.filter((page) => !here(page)).length
  const Arrow = pages.some((page) => page.original && here(page)) ? ArrowDownLeft : ArrowUpRight
  return (
    <IconMotion enabled={false}>
    <div
      contentEditable={false}
      className={`flex items-center gap-px whitespace-nowrap rounded-md border border-border bg-background p-px text-xs text-muted-foreground ${className}`}
      data-synced-toolbar=""
      onPointerDown={(event) => { event.stopPropagation() }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" className={BUTTON} />}>
          <Arrow size={12} aria-hidden="true" />
          Synced to {others === 1 ? '1 other page' : `${others} other pages`}
          <ChevronDown size={12} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Synced to</p>
          {pages.map((page) => (
            <DropdownMenuItem key={`${page.home}:${page.home_id}:${page.facet_id ?? ''}`} render={<RouterLink to={pageDocument(page).path} />}>
              <FileText size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{page.label === '' ? 'Untitled' : page.label}</span>
              {page.original ? <span className="rounded-sm bg-muted px-1 text-xs text-muted-foreground">Original</span> : null}
              {here(page) ? <span className="rounded-sm bg-muted px-1 text-xs text-muted-foreground">This page</span> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span aria-hidden="true" className="h-4 w-px bg-border" />
      <button type="button" className={BUTTON} aria-label="Copy and sync" title="Copy and sync"
        onClick={() => { void navigator.clipboard?.writeText(syncLink(sourceId)) }}>
        <Copy size={12} aria-hidden="true" />
      </button>
      {onUnsync === undefined ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={BUTTON} aria-label="Synced block actions" title="Synced block actions" />}>
            <MoreHorizontal size={12} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onUnsync}>Unsync</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
    </IconMotion>
  )
}

function SyncedBlock({ blockId, sourceId, editor }: {
  readonly blockId: string
  readonly sourceId: string
  readonly editor: AnyEditor
}): React.JSX.Element {
  const client = useQueryClient()
  const located = useSyncedSource(sourceId)
  const home = located.data?.pages.find((page) => page.original)
  const route = home === undefined ? null : pageDocument(home)
  const sourcePage = useQuery({
    queryKey: route?.key ?? ['synced-source-document', sourceId],
    queryFn: () => getPlain(getPageResponse, route!.read),
    enabled: route !== null,
    retry: false,
  })
  const original = sourcePage.data?.blocks.find((block) => block.id === sourceId)
  const editable = editor.isEditable

  const unsync = (): void => {
    if (original === undefined) return
    // The copy keeps the original's current content as its own block.
    const input = { ...mirroredBlockInput(original, 640), id: crypto.randomUUID() }
    editor.replaceBlocks([blockId], [input] as never)
  }

  const status = located.isPending || (route !== null && sourcePage.isPending)
    ? 'Loading synced block…'
    : original === undefined ? 'The original block is not available.' : null

  return (
    <div contentEditable={false} className="dana-synced-block" data-synced-block="">
      <span aria-hidden="true" className="dana-synced-frame" />
      {original === undefined ? null : (
        <SyncedToolbar
          sourceId={sourceId}
          {...(editable ? { onUnsync: unsync } : {})}
          className="dana-synced-toolbar"
        />
      )}
      {status !== null || original === undefined || route === null
        ? <p className="py-[var(--space-row)] text-sm text-muted-foreground">{status}</p>
        : <SyncedBlockMirror
            block={original}
            editable={editable}
            onCommit={async (record) => {
              const next = await writeOriginal(route, record)
              client.setQueryData(route.key, next)
            }}
          />}
    </div>
  )
}

// A hoisted function, not a const: schema.ts and this file import each other through the mirror.
export function createCanvasSyncedSpec() {
  return createReactBlockSpec(
    { type: 'synced', propSchema: { sourceId: { default: '' } }, content: 'none' },
    {
      render: ({ block, editor }) => <SyncedBlock blockId={block.id} sourceId={block.props.sourceId} editor={editor as AnyEditor} />,
      toExternalHTML: () => <p>Synced block</p>,
    },
  )()
}
