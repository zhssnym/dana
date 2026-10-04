/*
Connected work: reciprocal facet references placed in an authored facet without
creating a second relationship model.

One placement now represents exactly one source object. The durable placement
is still a normal document paragraph carrying a marked Dana Link, but its marker
also names the exact source block. That makes the visual row and the data model
agree: one compact source label on the left, one canonical live mirror on the
right. Legacy row-level placements are normalized in place into these exact
source placements, so existing work is not left grouped or lost.

The mirror is a live editor for the canonical block. Its save goes through the
source page's existing document transaction endpoint, with the source page's
current revision and outline. No copied content or mirror table is introduced.
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router'

import { getProjectBlockFacetsResponse, putBlockFacetsResponse } from '../../../shared/block-facets.js'
import { CONNECTED_WORK_TEXT_MAX, getConnectedWorkResponse } from '../../../shared/connected-work.js'
import type { ConnectedWorkItem, ConnectedWorkSource } from '../../../shared/connected-work.js'
import { getFacetsResponse } from '../../../shared/facets.js'
import type { FacetKind } from '../../../shared/facets.js'
import { getPageResponse } from '../../../shared/pages.js'
import type { DocumentOperation, DocumentTransaction, PageView } from '../../../shared/pages.js'
import { getPlain, mutateApi } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'
import { FileText, Flag, GripVertical, Plus, X } from '../../lib/icons.js'
import { backlinkPath } from './dana-link.js'
import { DanaLinkKindIcon } from './kind-icon.js'
import { ConnectedBlockMirror } from './ConnectedBlockMirror.js'
import type { ConnectedMirrorRecord } from './ConnectedBlockMirror.js'
import { documentOf } from '../page/canvas/adapters.js'
import type { CanvasInput } from '../page/canvas/adapters.js'
import type { AnyEditor } from '../page/canvas/BlockSideMenu.js'
import { canvasEditorNear } from '../page/canvas/editor-registry.js'
import './connected-work.css'

const DRAG_TYPE = 'application/x-dana-connected-work'
const PLACEMENT_PARAM = 'connected-work'
const FACET_PARAM = 'connected-facet'
const SOURCE_PARAM = 'connected-source'
const PROMOTED_SOURCE_PARAM = 'promoted-source'

export function connectedWorkKey(row: ConnectedWorkItem): string {
  return `${row.surface}:${row.home}:${row.home_id}:${row.member_id ?? ''}`
}

export function connectedWorkSourceKey(row: ConnectedWorkItem, sourceId: string | null): string {
  return `${connectedWorkKey(row)}::${sourceId ?? ''}`
}

function sourcePath(row: ConnectedWorkItem, source: ConnectedWorkSource): string | null {
  const base = backlinkPath(row)
  if (base === null) return null
  return `${base}${source.kind === 'post' ? '#post-' : '#block-'}${source.id}`
}

function markedPath(
  base: string,
  row: ConnectedWorkItem,
  facetId: string,
  sourceId?: string,
  promotedSourceId?: string,
): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(base, window.location.origin)
  url.searchParams.set(PLACEMENT_PARAM, connectedWorkKey(row))
  url.searchParams.set(FACET_PARAM, facetId)
  if (sourceId !== undefined) url.searchParams.set(SOURCE_PARAM, sourceId)
  if (promotedSourceId !== undefined) url.searchParams.set(PROMOTED_SOURCE_PARAM, promotedSourceId)
  return `${url.pathname}${url.search}${url.hash}`
}

function placementPath(
  row: ConnectedWorkItem,
  source: ConnectedWorkSource | null,
  facetId: string,
): string | null {
  const base = source === null ? backlinkPath(row) : sourcePath(row, source) ?? backlinkPath(row)
  return base === null ? null : markedPath(base, row, facetId, source?.id)
}

function promotionPath(row: ConnectedWorkItem, source: ConnectedWorkSource, facetId: string): string | null {
  const base = sourcePath(row, source) ?? backlinkPath(row)
  return base === null ? null : markedPath(base, row, facetId, source.id, source.id)
}

interface PlacementMarker {
  readonly key: string
  readonly sourceId: string | null
  readonly promotedSourceId: string | null
}

function placementMarkerFromHref(href: string, facetId: string): PlacementMarker | null {
  if (typeof window === 'undefined') return null
  try {
    const url = new URL(href, window.location.origin)
    if (url.searchParams.get(FACET_PARAM) !== facetId) return null
    const key = url.searchParams.get(PLACEMENT_PARAM)
    if (key === null || key === '') return null
    return {
      key,
      sourceId: url.searchParams.get(SOURCE_PARAM),
      promotedSourceId: url.searchParams.get(PROMOTED_SOURCE_PARAM),
    }
  } catch {
    return null
  }
}

interface EditorBlock {
  readonly id: string
  readonly type: string
  readonly content?: readonly unknown[] | string
  readonly children?: readonly EditorBlock[]
}

function placementMarkerOf(block: EditorBlock, facetId: string): PlacementMarker | null {
  if (!Array.isArray(block.content)) return null
  for (const inline of block.content) {
    if (typeof inline !== 'object' || inline === null) continue
    const candidate = inline as { type?: unknown; props?: { href?: unknown }; href?: unknown }
    const href = candidate.type === 'danaLink'
      ? candidate.props?.href
      : candidate.type === 'link'
        ? candidate.href
        : undefined
    if (typeof href !== 'string') continue
    const marker = placementMarkerFromHref(href, facetId)
    if (marker !== null) return marker
  }
  return null
}

export function placementKeyOf(block: EditorBlock, facetId: string): string | null {
  return placementMarkerOf(block, facetId)?.key ?? null
}

export function placementSourceOf(block: EditorBlock, facetId: string): string | null {
  return placementMarkerOf(block, facetId)?.sourceId ?? null
}

export function promotedSourceOf(block: EditorBlock, facetId: string): string | null {
  return placementMarkerOf(block, facetId)?.promotedSourceId ?? null
}

interface PlacementRef {
  readonly blockId: string
  readonly marker: PlacementMarker
}

function placementsOf(editor: AnyEditor, facetId: string): PlacementRef[] {
  const placed: PlacementRef[] = []
  const visit = (blocks: readonly EditorBlock[]): void => {
    for (const block of blocks) {
      const marker = placementMarkerOf(block, facetId)
      if (marker !== null) placed.push({ blockId: block.id, marker })
      if (Array.isArray(block.children) && block.children.length > 0) visit(block.children)
    }
  }
  visit(editor.document as readonly EditorBlock[])
  return placed
}

function placementSignature(placed: readonly PlacementRef[]): string {
  return placed
    .map(({ blockId, marker }) => `${blockId}:${marker.key}:${marker.sourceId ?? ''}:${marker.promotedSourceId ?? ''}`)
    .sort()
    .join('|')
}

function useCanvasEditor(host: React.RefObject<HTMLElement | null>): AnyEditor | null {
  const [editor, setEditor] = useState<AnyEditor | null>(null)
  useEffect(() => {
    const find = (): void => { setEditor(canvasEditorNear(host.current)) }
    find()
    const frame = window.requestAnimationFrame(find)
    window.addEventListener('dana:canvas-editor-ready', find)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('dana:canvas-editor-ready', find)
    }
  }, [host])
  return editor
}

function usePlacements(editor: AnyEditor | null, facetId: string): readonly PlacementRef[] {
  const [placed, setPlaced] = useState<readonly PlacementRef[]>([])
  const signature = useRef('')
  useEffect(() => {
    if (editor === null) {
      signature.current = ''
      setPlaced([])
      return
    }
    const check = (): void => {
      const next = placementsOf(editor, facetId)
      const nextSignature = placementSignature(next)
      if (nextSignature === signature.current) return
      signature.current = nextSignature
      setPlaced(next)
    }
    check()
    const off = editor.onChange(check)
    return () => { off() }
  }, [editor, facetId])
  return placed
}

interface PlacementItem {
  readonly row: ConnectedWorkItem
  readonly source: ConnectedWorkSource | null
}

function placementItems(rows: readonly ConnectedWorkItem[]): PlacementItem[] {
  return rows.flatMap((row): PlacementItem[] => row.sources.length === 0
    ? [{ row, source: null }]
    : row.sources.map((source) => ({ row, source })))
}

function itemKey(item: PlacementItem): string {
  return connectedWorkSourceKey(item.row, item.source?.id ?? null)
}

function effectiveSourceId(ref: PlacementRef, row: ConnectedWorkItem | undefined): string | null {
  return ref.marker.sourceId ?? ref.marker.promotedSourceId ?? row?.sources[0]?.id ?? null
}

function placedItemKeys(
  placements: readonly PlacementRef[],
  rowsByKey: ReadonlyMap<string, ConnectedWorkItem>,
): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const ref of placements) {
    const row = rowsByKey.get(ref.marker.key)
    if (row === undefined) continue
    keys.add(connectedWorkSourceKey(row, effectiveSourceId(ref, row)))
  }
  return keys
}

function placementBlock(item: PlacementItem, facetId: string): CanvasInput | null {
  const href = placementPath(item.row, item.source, facetId)
  if (href === null) return null
  return {
    type: 'paragraph',
    content: [{
      type: 'danaLink',
      props: { href, label: item.row.label === '' ? 'Untitled' : item.row.label },
    }],
  }
}

function insertPlacement(
  editor: AnyEditor,
  item: PlacementItem,
  facetId: string,
  target?: { id: string; side: 'before' | 'after' },
): void {
  const input = placementBlock(item, facetId)
  if (input === null) return
  const rowKey = connectedWorkKey(item.row)
  const sourceId = item.source?.id ?? null
  const existing = placementsOf(editor, facetId)
  if (existing.some(({ marker }) =>
    marker.key === rowKey &&
    (marker.sourceId === sourceId || (marker.sourceId === null && marker.promotedSourceId === null)))) return

  if (target !== undefined) {
    const targetBlock = editor.getBlock(target.id)
    if (targetBlock !== undefined) {
      editor.insertBlocks([input], targetBlock, target.side)
      return
    }
  }

  const document = editor.document
  const last = document.at(-1)
  if (last === undefined) return
  const onlyEmptyParagraph =
    document.length === 1 &&
    last.type === 'paragraph' &&
    Array.isArray(last.content) &&
    last.content.length === 0 &&
    last.children.length === 0
  if (onlyEmptyParagraph) editor.updateBlock(last, input)
  else editor.insertBlocks([input], last, 'after')
}

function sourceText(source: ConnectedWorkSource): string | null {
  const text = source.text?.trim() ?? ''
  if (text === '') return null
  if (source.files.some((file) => file.name === text)) return null
  return text
}

function clampPromotionStatement(value: string): string {
  const chars = [...value.trim()]
  if (chars.length <= CONNECTED_WORK_TEXT_MAX) return chars.join('')
  return `${chars.slice(0, CONNECTED_WORK_TEXT_MAX - 1).join('').trimEnd()}…`
}

export function promotionStatement(row: ConnectedWorkItem, source: ConnectedWorkSource): string {
  const text = sourceText(source)
  if (text !== null) return clampPromotionStatement(text)
  const files = source.files.map((file) => file.name.trim()).filter((name) => name !== '')
  if (files.length > 0) return clampPromotionStatement(files.join(', '))
  return clampPromotionStatement(row.label === '' ? 'Untitled' : row.label)
}

export function promotionBlock(
  row: ConnectedWorkItem,
  source: ConnectedWorkSource,
  facetId: string,
  results: boolean,
): CanvasInput | null {
  const href = promotionPath(row, source, facetId)
  if (href === null) return null
  const statement = promotionStatement(row, source)
  const label = row.label === '' ? 'Untitled' : row.label
  return {
    type: results ? 'result' : 'paragraph',
    content: [
      { type: 'text', text: statement, styles: {} },
      { type: 'text', text: ' ', styles: {} },
      { type: 'danaLink', props: { href, label } },
    ],
  }
}

function promotePlacement(
  editor: AnyEditor,
  blockId: string,
  row: ConnectedWorkItem,
  source: ConnectedWorkSource,
  facetId: string,
  results: boolean,
): void {
  const block = editor.getBlock(blockId)
  const input = promotionBlock(row, source, facetId, results)
  if (block === undefined || input === null) return
  editor.updateBlock(block, input)
}

export interface ConnectedSourceDocumentRoute {
  readonly read: string
  readonly write: string
  readonly method: 'POST' | 'PUT'
}

/** Page-block mirrors can write only through a source document that already
 * has Dana's document transaction contract. Current tabs/facets are native
 * folder pages, so they intentionally share the Folder route here. */
export function connectedSourceDocumentRoute(row: ConnectedWorkItem): ConnectedSourceDocumentRoute | null {
  if (row.surface !== 'page') return null
  if (row.home === 'folder' || row.home === 'facet') {
    return {
      read: `/folders/${encodeURIComponent(row.home_id)}/page`,
      write: `/folders/${encodeURIComponent(row.home_id)}/page/actions`,
      method: 'POST',
    }
  }
  if (row.home === 'shelf') {
    return {
      read: `/shelves/${encodeURIComponent(row.home_id)}/page`,
      write: `/shelves/${encodeURIComponent(row.home_id)}/page/actions`,
      method: 'POST',
    }
  }
  if (row.home === 'task') {
    return {
      read: `/tasks/${encodeURIComponent(row.home_id)}/document`,
      write: `/tasks/${encodeURIComponent(row.home_id)}/document`,
      method: 'PUT',
    }
  }
  return null
}

async function writeCanonicalSource(
  row: ConnectedWorkItem,
  source: ConnectedWorkSource,
  record: ConnectedMirrorRecord,
): Promise<PageView> {
  const route = connectedSourceDocumentRoute(row)
  if (route === null || source.kind !== 'block') throw new Error('This source cannot be edited here.')
  const latest = await getPlain(getPageResponse, route.read)
  if (latest.revision === undefined || latest.revision === '') throw new Error('The source page has no writable revision.')
  if (!latest.blocks.some((block) => block.id === source.id)) throw new Error('The source block is no longer available.')
  const operations: DocumentOperation[] = [
    { op: 'put_block', ...record },
    { op: 'set_outline', items: documentOf(latest).items },
  ]
  const transaction: DocumentTransaction = {
    action: 'document_transaction',
    mutation_id: crypto.randomUUID(),
    base_revision: latest.revision,
    operations,
  }
  return mutateApi(getPageResponse, {
    method: route.method,
    path: route.write,
    body: transaction,
  })
}

function FileChip({ file }: { readonly file: { id: string; name: string } }): React.JSX.Element {
  return (
    <a
      href={`/api/v1/files/${file.id}`}
      className="inline-flex max-w-full items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground no-underline hover:bg-accent hover:text-foreground"
      onMouseDown={(event) => { event.stopPropagation() }}
    >
      <FileText size={11} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{file.name}</span>
    </a>
  )
}

function SourceActions({
  source,
  facetId,
  explicitFacetIds,
  canPromote,
  promoteLabel,
  onPromote,
  onUnlink,
  busy,
}: {
  readonly source: ConnectedWorkSource
  readonly facetId: string
  readonly explicitFacetIds: readonly string[] | undefined
  readonly canPromote: boolean
  readonly promoteLabel: string
  readonly onPromote: () => void
  readonly onUnlink: (blockId: string, remaining: string[]) => void
  readonly busy: boolean
}): React.JSX.Element | null {
  const explicit = source.kind === 'block' && explicitFacetIds?.includes(facetId) === true
  if (!canPromote && !explicit) return null
  return (
    <div className="flex shrink-0 items-center">
      {canPromote ? (
        <button
          type="button"
          title={promoteLabel}
          aria-label={promoteLabel}
          onClick={onPromote}
          className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/source:opacity-100 pointer-coarse:opacity-100"
        >
          <Flag size={13} aria-hidden="true" />
        </button>
      ) : null}
      {explicit ? (
        <button
          type="button"
          title="Unlink"
          aria-label="Unlink from this facet"
          disabled={busy}
          onClick={() => onUnlink(source.id, explicitFacetIds!.filter((id) => id !== facetId))}
          className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/source:opacity-100 pointer-coarse:opacity-100 disabled:opacity-40"
        >
          <X size={13} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

function SourceDetails({
  facetId,
  row,
  source,
  explicitFacetIds,
  promoted,
  canPromote,
  promoteLabel,
  editableMirror,
  onPromote,
  onUnlink,
  onEditSource,
  busy,
}: {
  readonly facetId: string
  readonly row: ConnectedWorkItem
  readonly source: ConnectedWorkSource
  readonly explicitFacetIds: readonly string[] | undefined
  readonly promoted: boolean
  readonly canPromote: boolean
  readonly promoteLabel: string
  readonly editableMirror: boolean
  readonly onPromote: () => void
  readonly onUnlink: (blockId: string, remaining: string[]) => void
  readonly onEditSource: (source: ConnectedWorkSource, record: ConnectedMirrorRecord) => Promise<void>
  readonly busy: boolean
}): React.JSX.Element | null {
  const path = sourcePath(row, source)
  const actions = (
    <SourceActions
      source={source}
      facetId={facetId}
      explicitFacetIds={explicitFacetIds}
      canPromote={canPromote}
      promoteLabel={promoteLabel}
      onPromote={onPromote}
      onUnlink={onUnlink}
      busy={busy}
    />
  )

  if (!promoted && source.kind === 'block' && source.block !== undefined && source.block !== null) {
    return (
      <div className="group/source relative min-w-0 py-0.5" data-connected-work-native-source>
        <ConnectedBlockMirror
          block={source.block}
          sourcePath={path}
          editable={editableMirror}
          onCommit={(record) => onEditSource(source, record)}
        />
        <div className="absolute right-7 top-0 z-20">{actions}</div>
      </div>
    )
  }

  const authoredText = sourceText(source)
  const text = promoted ? null : authoredText
  const canonicalFromFiles = authoredText === null && source.files.length > 0
  const files = promoted && canonicalFromFiles ? [] : source.files
  const explicit = source.kind === 'block' && explicitFacetIds?.includes(facetId) === true
  const hasAction = canPromote || explicit
  if (text === null && files.length === 0 && !hasAction) return null
  return (
    <div className="group/source flex min-w-0 items-start gap-1 py-0.5">
      <div className="min-w-0 flex-1">
        {text === null ? null : path === null ? (
          <p className="line-clamp-2 break-words text-xs text-muted-foreground">{text}</p>
        ) : (
          <RouterLink to={path} className="line-clamp-2 break-words rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            {text}
          </RouterLink>
        )}
        {files.length === 0 ? null : (
          <div className="flex min-w-0 flex-wrap gap-1 pt-0.5">
            {files.map((file) => <FileChip key={file.id} file={file} />)}
          </div>
        )}
      </div>
      {actions}
    </div>
  )
}

function ConnectedOutput({
  facetId,
  row,
  source,
  promotedSourceId,
  canPromote,
  promoteLabel,
  explicitByBlock,
  editableMirror,
  onPromote,
  onUnlink,
  onEditSource,
  busy,
}: {
  readonly facetId: string
  readonly row: ConnectedWorkItem
  readonly source: ConnectedWorkSource | null
  readonly promotedSourceId: string | null
  readonly canPromote: boolean
  readonly promoteLabel: string
  readonly explicitByBlock: ReadonlyMap<string, readonly string[]>
  readonly editableMirror: boolean
  readonly onPromote: (source: ConnectedWorkSource) => void
  readonly onUnlink: (blockId: string, remaining: string[]) => void
  readonly onEditSource: (source: ConnectedWorkSource, record: ConnectedMirrorRecord) => Promise<void>
  readonly busy: boolean
}): React.JSX.Element | null {
  if (source === null) return null
  return (
    <div className="min-w-0" data-connected-work-sources>
      <SourceDetails
        facetId={facetId}
        row={row}
        source={source}
        explicitFacetIds={explicitByBlock.get(source.id)}
        promoted={promotedSourceId === source.id}
        canPromote={canPromote && promotedSourceId === null}
        promoteLabel={promoteLabel}
        editableMirror={editableMirror}
        onPromote={() => onPromote(source)}
        onUnlink={onUnlink}
        onEditSource={onEditSource}
        busy={busy}
      />
    </div>
  )
}

interface PortalTarget {
  readonly blockId: string
  readonly row: ConnectedWorkItem
  readonly source: ConnectedWorkSource | null
  readonly mount: HTMLElement
  readonly promotedSourceId: string | null
  readonly mirrored: boolean
}

function samePortalTargets(
  before: readonly PortalTarget[],
  after: readonly PortalTarget[],
): boolean {
  return before.length === after.length && before.every((target, index) => {
    const next = after[index]
    return next !== undefined &&
      target.blockId === next.blockId &&
      target.row === next.row &&
      target.source === next.source &&
      target.mount === next.mount &&
      target.promotedSourceId === next.promotedSourceId &&
      target.mirrored === next.mirrored
  })
}

function setSourceLane(content: HTMLElement, enabled: boolean): void {
  for (const child of [...content.children]) {
    if (!(child instanceof HTMLElement) || child.dataset.connectedWorkDetail !== undefined) continue
    if (enabled) {
      child.dataset.connectedWorkSourceLane = ''
      child.setAttribute('contenteditable', 'false')
    } else if (child.dataset.connectedWorkSourceLane !== undefined) {
      delete child.dataset.connectedWorkSourceLane
      child.removeAttribute('contenteditable')
    }
  }
}

function clearSourceLanes(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-connected-work-source-lane]').forEach((lane) => {
    delete lane.dataset.connectedWorkSourceLane
    lane.removeAttribute('contenteditable')
  })
}

function usePlacementPortals(
  editor: AnyEditor | null,
  facetId: string,
  rows: readonly ConnectedWorkItem[],
  placements: readonly PlacementRef[],
): readonly PortalTarget[] {
  const [targets, setTargets] = useState<readonly PortalTarget[]>([])
  useEffect(() => {
    if (editor === null) {
      setTargets([])
      return
    }
    const root = editor.domElement
    if (root === undefined || root === null) {
      setTargets([])
      return
    }
    const rowsByKey = new Map(rows.map((row) => [connectedWorkKey(row), row] as const))
    let current: readonly PortalTarget[] = []
    let frame = 0

    const sync = (): void => {
      frame = 0
      const wanted = new Set<string>()
      const next: PortalTarget[] = []
      for (const ref of placements) {
        const row = rowsByKey.get(ref.marker.key)
        if (row === undefined) continue
        const sourceId = effectiveSourceId(ref, row)
        const source = sourceId === null ? null : row.sources.find((candidate) => candidate.id === sourceId) ?? null
        const outer = [...root.querySelectorAll<HTMLElement>('.bn-block-outer[data-id]')]
          .find((element) => element.dataset.id === ref.blockId)
        const content = outer?.querySelector<HTMLElement>('.bn-block-content')
        const block = editor.getBlock(ref.blockId) as unknown as EditorBlock | undefined
        if (outer === undefined || content === undefined || content === null || block === undefined) continue
        wanted.add(ref.blockId)
        content.dataset.connectedWorkPlacement = 'true'
        let mount = content.querySelector<HTMLElement>(`:scope > [data-connected-work-detail="${ref.blockId}"]`)
        if (mount === null) {
          mount = document.createElement('div')
          mount.dataset.connectedWorkDetail = ref.blockId
          mount.setAttribute('contenteditable', 'false')
          mount.className = 'min-w-0'
          content.append(mount)
        }
        const promotedSourceId = promotedSourceOf(block, facetId)
        const mirrored = promotedSourceId === null && source?.kind === 'block' && source.block !== undefined && source.block !== null
        setSourceLane(content, mirrored)
        next.push({ blockId: ref.blockId, row, source, mount, promotedSourceId, mirrored })
      }
      root.querySelectorAll<HTMLElement>('[data-connected-work-detail]').forEach((mount) => {
        const blockId = mount.dataset.connectedWorkDetail ?? ''
        if (wanted.has(blockId)) return
        const content = mount.closest<HTMLElement>('.bn-block-content')
        mount.remove()
        if (content !== null) {
          delete content.dataset.connectedWorkPlacement
          setSourceLane(content, false)
        }
      })
      if (!samePortalTargets(current, next)) {
        current = next
        setTargets(next)
      }
    }
    const schedule = (): void => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(sync)
    }

    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(root, { childList: true, subtree: true })
    const off = editor.onChange(schedule)
    return () => {
      off()
      observer.disconnect()
      if (frame !== 0) window.cancelAnimationFrame(frame)
      root.querySelectorAll<HTMLElement>('[data-connected-work-detail]').forEach((mount) => {
        const content = mount.closest<HTMLElement>('.bn-block-content')
        mount.remove()
        if (content !== null) delete content.dataset.connectedWorkPlacement
      })
      clearSourceLanes(root)
    }
  }, [editor, facetId, rows, placements])
  return targets
}

function useProtectedPlacementRows(editor: AnyEditor | null, targets: readonly PortalTarget[]): void {
  useEffect(() => {
    if (editor === null) return
    const root = editor.domElement
    if (root === undefined || root === null) return
    const protectedIds = new Set(targets.filter((target) => target.mirrored).map((target) => target.blockId))
    if (protectedIds.size === 0) return
    const keydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') return
      if (!(event.target instanceof Element)) return
      if (event.target.closest('[data-connected-work-mirror]') !== null) return
      const outer = event.target.closest<HTMLElement>('.bn-block-outer[data-id]')
      const blockId = outer?.dataset.id
      if (blockId === undefined || !protectedIds.has(blockId)) return
      event.preventDefault()
      event.stopPropagation()
    }
    root.addEventListener('keydown', keydown, true)
    return () => { root.removeEventListener('keydown', keydown, true) }
  }, [editor, targets])
}

function UnplacedRow({
  facetId,
  item,
  editor,
}: {
  readonly facetId: string
  readonly item: PlacementItem
  readonly editor: AnyEditor
}): React.JSX.Element {
  const { row, source } = item
  const path = source === null ? backlinkPath(row) : sourcePath(row, source)
  const label = row.surface === 'responsibility'
    ? `${row.label} · Responsibilities`
    : row.label === '' ? 'Untitled' : row.label
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData(DRAG_TYPE, itemKey(item))
      }}
      className="group flex min-h-8 min-w-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-accent/70 hover:text-foreground"
    >
      <GripVertical size={13} aria-hidden="true" className="shrink-0 opacity-50" />
      {path === null ? (
        <span className="flex min-w-0 flex-1 items-center gap-1.5"><DanaLinkKindIcon kind={row.home} /><span className="truncate">{label}</span></span>
      ) : (
        <RouterLink to={path} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
          <DanaLinkKindIcon kind={row.home} /><span className="truncate">{label}</span>
        </RouterLink>
      )}
      <button
        type="button"
        title="Place in document"
        aria-label={`Place ${label} in document`}
        onClick={() => insertPlacement(editor, item, facetId)}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm opacity-0 hover:bg-background focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
      >
        <Plus size={13} aria-hidden="true" />
      </button>
    </div>
  )
}

function promotableFacet(kind: FacetKind | undefined): boolean {
  return kind === 'purpose' || kind === 'results' || kind === 'shared_blank' || kind === 'private_blank'
}

export function ConnectedWork({ id, className = '' }: {
  readonly id: string
  readonly className?: string
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const client = useQueryClient()
  const editor = useCanvasEditor(host)
  const placements = usePlacements(editor, id)
  const connected = useQuery({
    queryKey: queryKeys.connectedWork(id),
    queryFn: () => getPlain(getConnectedWorkResponse, `/facets/${encodeURIComponent(id)}/backlinks`),
    retry: false,
    staleTime: 0,
  })
  const blockFacets = useQuery({
    queryKey: ['block-facets', id],
    queryFn: () => getPlain(getProjectBlockFacetsResponse, `/block-facets?folder=${encodeURIComponent(id)}`),
    retry: false,
    staleTime: 0,
  })
  const projectId = blockFacets.data?.project_id
  const facets = useQuery({
    queryKey: ['facets', 'connected-work-promotion', projectId ?? 'none'],
    queryFn: () => getPlain(getFacetsResponse, `/folders/${encodeURIComponent(projectId!)}/facets`),
    enabled: projectId !== undefined,
    retry: false,
    staleTime: 0,
  })
  const facetKind = facets.data?.facets.find((facet) => facet.id === id)?.kind
  const results = facetKind === 'results'
  const rows = connected.data?.results ?? []
  const rowsByKey = useMemo(() => new Map(rows.map((row) => [connectedWorkKey(row), row] as const)), [rows])
  const items = useMemo(() => placementItems(rows), [rows])
  const itemsByKey = useMemo(() => new Map(items.map((item) => [itemKey(item), item] as const)), [items])
  const placed = useMemo(() => placedItemKeys(placements, rowsByKey), [placements, rowsByKey])
  const explicitByBlock = useMemo(
    () => new Map((blockFacets.data?.blocks ?? []).map((row) => [row.block_id, row.facets.map((facet) => facet.id)] as const)),
    [blockFacets.data],
  )
  const portals = usePlacementPortals(editor, id, rows, placements)
  useProtectedPlacementRows(editor, portals)
  const unplaced = items.filter((item) => !placed.has(itemKey(item)))
  const canPromote = editor?.isEditable === true && promotableFacet(facetKind)
  const editableMirrors = editor?.isEditable === true
  const promoteLabel = results ? 'Promote to Result' : 'Promote to facet'

  const unlink = useMutation({
    mutationFn: ({ blockId, facetIds }: { blockId: string; facetIds: string[] }) =>
      mutateApi(putBlockFacetsResponse, {
        method: 'PUT',
        path: '/block-facets',
        body: { block_id: blockId, facet_ids: facetIds },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.connectedWork(id) })
      void client.invalidateQueries({ queryKey: ['block-facets', id] })
    },
  })

  /* Old placements named only their containing source document, so one marker
     could draw several mirrors. Normalize only those legacy markers. Existing
     source-specific placements are never auto-moved: unplaced work stays a
     person's placement decision. */
  useEffect(() => {
    if (editor === null || !connected.isSuccess) return
    const byRow = new Map<string, PlacementRef[]>()
    for (const ref of placements) byRow.set(ref.marker.key, [...(byRow.get(ref.marker.key) ?? []), ref])
    for (const [key, refs] of byRow) {
      const row = rowsByKey.get(key)
      if (row === undefined || row.sources.length === 0) continue
      const legacy = refs.filter(({ marker }) => marker.sourceId === null && marker.promotedSourceId === null)
      if (legacy.length === 0) continue
      const explicit = new Set(refs.flatMap(({ marker }) => {
        const sourceId = marker.sourceId ?? marker.promotedSourceId
        return sourceId === null ? [] : [sourceId]
      }))
      const missing = row.sources.filter((source) => !explicit.has(source.id))
      const assigned = Math.min(legacy.length, missing.length)
      for (let index = 0; index < assigned; index += 1) {
        const ref = legacy[index]
        const source = missing[index]
        if (ref === undefined || source === undefined) continue
        const block = editor.getBlock(ref.blockId)
        const input = placementBlock({ row, source }, id)
        if (block !== undefined && input !== null) editor.updateBlock(block, input)
      }
      const extras = legacy.slice(assigned).map(({ blockId }) => blockId)
      if (extras.length > 0) editor.removeBlocks(extras)
      const remaining = missing.slice(assigned)
      if (remaining.length > 0 && legacy[0] !== undefined) {
        const anchor = editor.getBlock(legacy[Math.max(0, assigned - 1)]?.blockId ?? legacy[0].blockId)
        const inputs = remaining.flatMap((source) => {
          const input = placementBlock({ row, source }, id)
          return input === null ? [] : [input]
        })
        if (anchor !== undefined && inputs.length > 0) editor.insertBlocks(inputs, anchor, 'after')
      }
    }
  }, [editor, id, connected.isSuccess, placements, rowsByKey])

  /* A removed relationship cannot leave a dead placement. Exact source ids let
     us remove only the source that vanished while leaving sibling references
     from the same document intact. */
  useEffect(() => {
    if (editor === null || !connected.isSuccess || connected.data.truncated) return
    const stale = placements.filter((ref) => {
      const row = rowsByKey.get(ref.marker.key)
      if (row === undefined) return true
      const sourceId = ref.marker.sourceId ?? ref.marker.promotedSourceId
      return sourceId !== null && !row.sources.some((source) => source.id === sourceId)
    }).map(({ blockId }) => blockId)
    if (stale.length > 0) editor.removeBlocks(stale)
  }, [editor, connected.isSuccess, connected.data, placements, rowsByKey])

  useEffect(() => {
    if (editor === null) return
    const root = editor.domElement
    if (root === undefined || root === null) return
    const dragOver = (event: DragEvent): void => {
      if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
    const drop = (event: DragEvent): void => {
      const key = event.dataTransfer?.getData(DRAG_TYPE) ?? ''
      const item = itemsByKey.get(key)
      if (item === undefined || placed.has(key)) return
      event.preventDefault()
      event.stopPropagation()
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('.bn-block-outer[data-id]')
        : null
      if (target === null) {
        insertPlacement(editor, item, id)
        return
      }
      const blockId = target.dataset.id
      if (blockId === undefined) return
      const box = target.getBoundingClientRect()
      insertPlacement(editor, item, id, {
        id: blockId,
        side: event.clientY < box.top + box.height / 2 ? 'before' : 'after',
      })
    }
    root.addEventListener('dragover', dragOver)
    root.addEventListener('drop', drop, true)
    return () => {
      root.removeEventListener('dragover', dragOver)
      root.removeEventListener('drop', drop, true)
    }
  }, [editor, id, itemsByKey, placed])

  const commitSource = async (
    row: ConnectedWorkItem,
    source: ConnectedWorkSource,
    record: ConnectedMirrorRecord,
  ): Promise<void> => {
    const updated = await writeCanonicalSource(row, source, record)
    if (row.home === 'folder' || row.home === 'facet') {
      client.setQueryData(queryKeys.folderPage(row.home_id), updated)
    } else if (row.home === 'shelf') {
      client.setQueryData(queryKeys.shelfPage(row.home_id), updated)
    } else if (row.home === 'task') {
      void client.invalidateQueries({ queryKey: queryKeys.task(row.home_id) })
    }
    await client.invalidateQueries({ queryKey: queryKeys.connectedWork(id) })
  }

  return (
    <div ref={host} className={`contents ${className}`} data-connected-work>
      {portals.map(({ blockId, row, source, mount, promotedSourceId, mirrored }) => createPortal(
        <ConnectedOutput
          facetId={id}
          row={row}
          source={source}
          promotedSourceId={promotedSourceId}
          canPromote={canPromote}
          promoteLabel={promoteLabel}
          explicitByBlock={explicitByBlock}
          editableMirror={editableMirrors && mirrored && connectedSourceDocumentRoute(row) !== null}
          onPromote={(ownSource) => {
            if (editor === null || !canPromote) return
            promotePlacement(editor, blockId, row, ownSource, id, results)
          }}
          onUnlink={(sourceId, remaining) => unlink.mutate({ blockId: sourceId, facetIds: remaining })}
          onEditSource={(ownSource, record) => commitSource(row, ownSource, record)}
          busy={unlink.isPending}
        />,
        mount,
        blockId,
      ))}
      {editor !== null && unplaced.length > 0 ? (
        <details className="mt-5 border-t border-border/50 pt-2" aria-label="Unplaced connected work">
          <summary className="flex min-h-7 cursor-pointer list-none items-center gap-1.5 rounded-sm px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
            <span>Unplaced connected work</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none">{unplaced.length}</span>
          </summary>
          <div className="space-y-0.5 pt-1">
            {unplaced.map((item) => (
              <UnplacedRow key={itemKey(item)} facetId={id} item={item} editor={editor} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}
