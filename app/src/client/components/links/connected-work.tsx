/*
Connected work (#488, #526): reciprocal facet references that can participate
in the authored facet document without becoming another relationship model.

The relationship still belongs to the source's Dana Link / page_block_facets
edge. Placement is only a normal document block carrying one marked Dana Link
back to that source. That makes the reference a native document block:
BlockNote's existing drag handle, ordering, autosave, undo and Delete all work
unchanged. Deleting the placement therefore cannot unlink the relationship; it
simply returns the still-live relationship to the unplaced inbox below the
document.

A block source is rendered as a live read-only mirror of its canonical
PageBlock. The source document remains the only write path, so there is no
second copy to synchronize. Discussion posts keep the compact source fallback.

#488 promotion stays on that same primitive. Explicit Promote copies a short
source statement into the placed block and keeps the marked Dana Link as its
provenance. On Results the block becomes a native Result; on another document
facet it stays ordinary authored text. No promotion table or second relation
is introduced.
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
import { getPlain, mutateApi } from '../../api/http.js'
import { queryKeys } from '../../api/keys.js'
import { FileText, Flag, GripVertical, Plus, X } from '../../lib/icons.js'
import { backlinkPath } from './dana-link.js'
import { DanaLinkKindIcon } from './kind-icon.js'
import { ConnectedBlockMirror } from './ConnectedBlockMirror.js'
import type { CanvasInput } from '../page/canvas/adapters.js'
import type { AnyEditor } from '../page/canvas/BlockSideMenu.js'
import { canvasEditorNear } from '../page/canvas/editor-registry.js'
import './connected-work.css'

const DRAG_TYPE = 'application/x-dana-connected-work'
const PLACEMENT_PARAM = 'connected-work'
const FACET_PARAM = 'connected-facet'
const PROMOTED_SOURCE_PARAM = 'promoted-source'

export function connectedWorkKey(row: ConnectedWorkItem): string {
  return `${row.surface}:${row.home}:${row.home_id}:${row.member_id ?? ''}`
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
  promotedSourceId?: string,
): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(base, window.location.origin)
  url.searchParams.set(PLACEMENT_PARAM, connectedWorkKey(row))
  url.searchParams.set(FACET_PARAM, facetId)
  if (promotedSourceId !== undefined) url.searchParams.set(PROMOTED_SOURCE_PARAM, promotedSourceId)
  return `${url.pathname}${url.search}${url.hash}`
}

function placementPath(row: ConnectedWorkItem, facetId: string): string | null {
  const base = backlinkPath(row)
  return base === null ? null : markedPath(base, row, facetId)
}

function promotionPath(row: ConnectedWorkItem, source: ConnectedWorkSource, facetId: string): string | null {
  const base = sourcePath(row, source) ?? backlinkPath(row)
  return base === null ? null : markedPath(base, row, facetId, source.id)
}

interface PlacementMarker {
  readonly key: string
  readonly promotedSourceId: string | null
}

function placementMarkerFromHref(href: string, facetId: string): PlacementMarker | null {
  if (typeof window === 'undefined') return null
  try {
    const url = new URL(href, window.location.origin)
    if (url.searchParams.get(FACET_PARAM) !== facetId) return null
    const key = url.searchParams.get(PLACEMENT_PARAM)
    if (key === null || key === '') return null
    return { key, promotedSourceId: url.searchParams.get(PROMOTED_SOURCE_PARAM) }
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

export function promotedSourceOf(block: EditorBlock, facetId: string): string | null {
  return placementMarkerOf(block, facetId)?.promotedSourceId ?? null
}

function placementsOf(editor: AnyEditor, facetId: string): Map<string, string[]> {
  const placed = new Map<string, string[]>()
  const visit = (blocks: readonly EditorBlock[]): void => {
    for (const block of blocks) {
      const key = placementKeyOf(block, facetId)
      if (key !== null) placed.set(key, [...(placed.get(key) ?? []), block.id])
      if (Array.isArray(block.children) && block.children.length > 0) visit(block.children)
    }
  }
  visit(editor.document as readonly EditorBlock[])
  return placed
}

function placementSignature(placed: ReadonlyMap<string, readonly string[]>): string {
  return [...placed.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, ids]) => `${key}:${[...ids].sort().join(',')}`)
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

function usePlacements(editor: AnyEditor | null, facetId: string): ReadonlyMap<string, readonly string[]> {
  const [placed, setPlaced] = useState<ReadonlyMap<string, readonly string[]>>(new Map())
  const signature = useRef('')
  useEffect(() => {
    if (editor === null) {
      signature.current = ''
      setPlaced(new Map())
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

function placementBlock(row: ConnectedWorkItem, facetId: string): CanvasInput | null {
  const href = placementPath(row, facetId)
  if (href === null) return null
  return {
    type: 'paragraph',
    content: [{
      type: 'danaLink',
      props: { href, label: row.label === '' ? 'Untitled' : row.label },
    }],
  }
}

function insertPlacement(
  editor: AnyEditor,
  row: ConnectedWorkItem,
  facetId: string,
  target?: { id: string; side: 'before' | 'after' },
): void {
  const input = placementBlock(row, facetId)
  if (input === null) return
  const existing = placementsOf(editor, facetId)
  if (existing.has(connectedWorkKey(row))) return

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
  /* A File block has no authored caption. Older #488 presentation fell back
     to its filename and then drew the same filename again as a file chip. */
  if (source.files.some((file) => file.name === text)) return null
  return text
}

function clampPromotionStatement(value: string): string {
  const chars = [...value.trim()]
  if (chars.length <= CONNECTED_WORK_TEXT_MAX) return chars.join('')
  return `${chars.slice(0, CONNECTED_WORK_TEXT_MAX - 1).join('').trimEnd()}…`
}

/** The authored sentence created by explicit promotion. The source's own text
 * wins; a file-only source promotes its file name(s), and a source with no
 * projection falls back to its parent work label rather than fabricating copy. */
export function promotionStatement(row: ConnectedWorkItem, source: ConnectedWorkSource): string {
  const text = sourceText(source)
  if (text !== null) return clampPromotionStatement(text)
  const files = source.files.map((file) => file.name.trim()).filter((name) => name !== '')
  if (files.length > 0) return clampPromotionStatement(files.join(', '))
  return clampPromotionStatement(row.label === '' ? 'Untitled' : row.label)
}

/** Promotion is a document conversion, not a new relation. The same marked
 * provenance link remains in the canonical block. Results receives its native
 * Result kind; every other document facet receives ordinary authored text. */
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
  onPromote,
  onUnlink,
  busy,
}: {
  readonly facetId: string
  readonly row: ConnectedWorkItem
  readonly source: ConnectedWorkSource
  readonly explicitFacetIds: readonly string[] | undefined
  readonly promoted: boolean
  readonly canPromote: boolean
  readonly promoteLabel: string
  readonly onPromote: () => void
  readonly onUnlink: (blockId: string, remaining: string[]) => void
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

  /* One canonical block, another live placement. The durable paragraph marker
     still owns ordering in this facet, but its UI is replaced by Dana's native
     rendering of the exact source block. */
  if (!promoted && source.kind === 'block' && source.block !== undefined && source.block !== null) {
    return (
      <div className="group/source relative min-w-0 py-0.5" data-connected-work-native-source>
        <ConnectedBlockMirror block={source.block} sourcePath={path} />
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

function ConnectedOutputs({
  facetId,
  row,
  promotedSourceId,
  canPromote,
  promoteLabel,
  explicitByBlock,
  onPromote,
  onUnlink,
  busy,
}: {
  readonly facetId: string
  readonly row: ConnectedWorkItem
  readonly promotedSourceId: string | null
  readonly canPromote: boolean
  readonly promoteLabel: string
  readonly explicitByBlock: ReadonlyMap<string, readonly string[]>
  readonly onPromote: (source: ConnectedWorkSource) => void
  readonly onUnlink: (blockId: string, remaining: string[]) => void
  readonly busy: boolean
}): React.JSX.Element | null {
  if (row.sources.length === 0) return null
  return (
    <div className="min-w-0 space-y-1" data-connected-work-sources>
      {row.sources.map((source) => (
        <SourceDetails
          key={`${source.kind}:${source.id}`}
          facetId={facetId}
          row={row}
          source={source}
          explicitFacetIds={explicitByBlock.get(source.id)}
          promoted={promotedSourceId === source.id}
          canPromote={canPromote && promotedSourceId === null}
          promoteLabel={promoteLabel}
          onPromote={() => onPromote(source)}
          onUnlink={onUnlink}
          busy={busy}
        />
      ))}
    </div>
  )
}

interface PortalTarget {
  readonly blockId: string
  readonly row: ConnectedWorkItem
  readonly mount: HTMLElement
  readonly promotedSourceId: string | null
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
      target.mount === next.mount &&
      target.promotedSourceId === next.promotedSourceId
  })
}

function usePlacementPortals(
  editor: AnyEditor | null,
  facetId: string,
  rows: readonly ConnectedWorkItem[],
  placements: ReadonlyMap<string, readonly string[]>,
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
      for (const [key, ids] of placements) {
        const row = rowsByKey.get(key)
        if (row === undefined) continue
        for (const blockId of ids) {
          const outer = [...root.querySelectorAll<HTMLElement>('.bn-block-outer[data-id]')]
            .find((element) => element.dataset.id === blockId)
          const content = outer?.querySelector<HTMLElement>('.bn-block-content')
          const block = editor.getBlock(blockId) as unknown as EditorBlock | undefined
          if (outer === undefined || content === undefined || content === null || block === undefined) continue
          wanted.add(blockId)
          content.dataset.connectedWorkPlacement = 'true'
          let mount = content.querySelector<HTMLElement>(`:scope > [data-connected-work-detail="${blockId}"]`)
          if (mount === null) {
            mount = document.createElement('div')
            mount.dataset.connectedWorkDetail = blockId
            mount.setAttribute('contenteditable', 'false')
            mount.className = 'min-w-0'
            content.append(mount)
          }
          next.push({ blockId, row, mount, promotedSourceId: promotedSourceOf(block, facetId) })
        }
      }
      root.querySelectorAll<HTMLElement>('[data-connected-work-detail]').forEach((mount) => {
        const blockId = mount.dataset.connectedWorkDetail ?? ''
        if (wanted.has(blockId)) return
        const content = mount.closest<HTMLElement>('.bn-block-content')
        mount.remove()
        if (content !== null) delete content.dataset.connectedWorkPlacement
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
    }
  }, [editor, facetId, rows, placements])
  return targets
}

function UnplacedRow({
  facetId,
  row,
  editor,
}: {
  readonly facetId: string
  readonly row: ConnectedWorkItem
  readonly editor: AnyEditor
}): React.JSX.Element {
  const path = backlinkPath(row)
  const label = row.surface === 'responsibility'
    ? `${row.label} · Responsibilities`
    : row.label === '' ? 'Untitled' : row.label
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData(DRAG_TYPE, connectedWorkKey(row))
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
        onClick={() => insertPlacement(editor, row, facetId)}
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
  const explicitByBlock = useMemo(
    () => new Map((blockFacets.data?.blocks ?? []).map((row) => [row.block_id, row.facets.map((facet) => facet.id)] as const)),
    [blockFacets.data],
  )
  const portals = usePlacementPortals(editor, id, rows, placements)
  const unplaced = rows.filter((row) => !placements.has(connectedWorkKey(row)))
  const canPromote = editor?.isEditable === true && promotableFacet(facetKind)
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

  /* A relationship that was explicitly unlinked (or whose inline source was
     edited elsewhere) cannot leave a dead placement in the authored facet.
     Never prune against a truncated read because the missing row may simply
     be beyond this response's cap. */
  useEffect(() => {
    if (editor === null || !connected.isSuccess || connected.data.truncated) return
    const stale = [...placements.entries()]
      .filter(([key]) => !rowsByKey.has(key))
      .flatMap(([, ids]) => [...ids])
    if (stale.length > 0) editor.removeBlocks(stale)
  }, [editor, connected.isSuccess, connected.data, placements, rowsByKey])

  /* Dragging from the inbox creates the same ordinary document reference as
     the keyboard/touch Place action. After that, BlockNote owns all movement. */
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
      const row = rowsByKey.get(key)
      if (row === undefined || placements.has(key)) return
      event.preventDefault()
      event.stopPropagation()
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('.bn-block-outer[data-id]')
        : null
      if (target === null) {
        insertPlacement(editor, row, id)
        return
      }
      const blockId = target.dataset.id
      if (blockId === undefined) return
      const box = target.getBoundingClientRect()
      insertPlacement(editor, row, id, {
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
  }, [editor, id, placements, rowsByKey])

  return (
    <div ref={host} className={`contents ${className}`} data-connected-work>
      {portals.map(({ blockId, row, mount, promotedSourceId }) => createPortal(
        <ConnectedOutputs
          facetId={id}
          row={row}
          promotedSourceId={promotedSourceId}
          canPromote={canPromote}
          promoteLabel={promoteLabel}
          explicitByBlock={explicitByBlock}
          onPromote={(source) => {
            if (editor === null || !canPromote) return
            promotePlacement(editor, blockId, row, source, id, results)
          }}
          onUnlink={(sourceId, remaining) => unlink.mutate({ blockId: sourceId, facetIds: remaining })}
          busy={unlink.isPending}
        />,
        mount,
        blockId,
      ))}
      {editor !== null && unplaced.length > 0 ? (
        <section className="mt-5 border-t border-border/50 pt-2" aria-label="Unplaced connected work">
          <p className="px-1.5 pb-1 text-[11px] font-medium text-muted-foreground">Unplaced connected work</p>
          <div className="space-y-0.5">
            {unplaced.map((row) => (
              <UnplacedRow key={connectedWorkKey(row)} facetId={id} row={row} editor={editor} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
