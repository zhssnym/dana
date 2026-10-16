// A synced block (#720): a live view of one original block. Edits go to the original's own
// document; this block stores only the original's id.
import { createReactBlockSpec } from '@blocknote/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router'

import type { DocumentTransaction, PageView } from '../../../../shared/pages.js'
import { getPageResponse } from '../../../../shared/pages.js'
import { syncedSource } from '../../../../shared/synced-blocks.js'
import type { SyncedSource } from '../../../../shared/synced-blocks.js'
import { getPlain, mutateApi } from '../../../api/http.js'
import { queryKeys } from '../../../api/keys.js'
import { RefreshCw } from '../../../lib/icons.js'
import { documentOf } from './adapters.js'
import { SyncedBlockMirror, mirroredBlockInput } from './SyncedBlockMirror.js'
import type { SyncedMirrorRecord } from './SyncedBlockMirror.js'
import type { AnyEditor } from './BlockSideMenu.js'

interface SourceDocument {
  readonly key: readonly unknown[]
  readonly read: string
  readonly write: string
  readonly method: 'POST' | 'PUT'
  readonly path: string
}

/** The original's document routes: the same reads and writes its own page uses. */
export function sourceDocument(source: SyncedSource): SourceDocument {
  const anchor = `#block-${source.block_id}`
  if (source.home === 'task') {
    const read = `/tasks/${source.home_id}/document`
    return { key: ['tasks', source.home_id, 'document'], read, write: read, method: 'PUT', path: `/app/tasks/${source.home_id}${anchor}` }
  }
  if (source.home === 'shelf') {
    const read = `/shelves/${source.home_id}/page`
    return { key: queryKeys.shelfPage(source.home_id), read, write: `${read}/actions`, method: 'POST', path: `/app/shelves/${source.home_id}${anchor}` }
  }
  if (source.facet_id === null) {
    const read = `/folders/${source.home_id}/page`
    return { key: queryKeys.folderPage(source.home_id), read, write: `${read}/actions`, method: 'POST', path: `/app/folders/${source.home_id}${anchor}` }
  }
  const read = `/pages/${source.home_id}/facets/${source.facet_id}/document`
  return {
    key: queryKeys.pageFacetDocument(source.home_id, source.facet_id),
    read,
    write: `${read}/actions`,
    method: 'POST',
    path: `/app/folders/${source.home_id}?facet=${source.facet_id}${anchor}`,
  }
}

async function writeOriginal(route: SourceDocument, record: SyncedMirrorRecord): Promise<PageView> {
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

function plural(count: number): string {
  return count === 1 ? '1 other page' : `${count} other pages`
}

function SyncedBlock({ blockId, sourceId, editor }: {
  readonly blockId: string
  readonly sourceId: string
  readonly editor: AnyEditor
}): React.JSX.Element {
  const client = useQueryClient()
  const located = useQuery({
    queryKey: queryKeys.syncedSource(sourceId),
    queryFn: () => getPlain(syncedSource, `/synced-blocks/${encodeURIComponent(sourceId)}`),
    retry: false,
    staleTime: 30_000,
  })
  const route = located.data === undefined ? null : sourceDocument(located.data)
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
      <div className="flex min-w-0 items-center gap-[var(--space-inline)] text-xs text-muted-foreground">
        <RefreshCw size={12} aria-hidden="true" className="shrink-0" />
        {located.data === undefined || route === null ? <span>Synced block</span> : (
          <span className="min-w-0 truncate">
            Synced from <RouterLink to={route.path} className="text-foreground! no-underline! hover:underline!">{located.data.label === '' ? 'Untitled' : located.data.label}</RouterLink>
            {located.data.copies > 1 ? ` · also in ${plural(located.data.copies - 1)}` : ''}
          </span>
        )}
        {editable && original !== undefined ? (
          <button type="button" className="ml-auto shrink-0 rounded-sm px-1 hover:text-foreground" onClick={unsync}>Unsync</button>
        ) : null}
      </div>
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
