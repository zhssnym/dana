import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { BlockFacetRef, GetProjectBlockFacetsResponse } from '../../../../shared/block-facets.js'
import { getProjectBlockFacetsResponse, putBlockFacetsResponse } from '../../../../shared/block-facets.js'
import { getPlain, mutateApi } from '../../../api/http.js'
import { queryKeys } from '../../../api/keys.js'
import { useAllPages, useTask } from '../../../api/queries.js'
import type { AnyEditor, BlockFacetMenuModel } from './BlockSideMenu.js'
import { registerCanvasEditor } from './editor-registry.js'

function key(folderId: string) {
  return ['block-facets', folderId] as const
}

function replaceRow(
  old: GetProjectBlockFacetsResponse | undefined,
  blockId: string,
  facets: readonly BlockFacetRef[],
): GetProjectBlockFacetsResponse | undefined {
  if (old === undefined) return old
  const blocks = old.blocks.filter((row) => row.block_id !== blockId)
  if (facets.length > 0) blocks.push({ block_id: blockId, facets: [...facets] })
  return { ...old, blocks }
}

function routedId(segment: 'folders' | 'facets' | 'tasks'): string | undefined {
  if (typeof window === 'undefined') return undefined
  const match = new RegExp(`^/app/${segment}/([0-9a-f-]{36})(?:/|$)`, 'i').exec(window.location.pathname)
  return match?.[1]
}

/**
 * Resolve the project scope from the current canvas route. This hook belongs
 * to the always-mounted canvas, not the transient BlockNote side menu: facet
 * relationships are durable metadata and their chips must exist before the
 * user ever hovers a gutter handle.
 */
export function useAutomaticBlockFacets(
  editor: AnyEditor,
  editable: boolean,
  onNotice?: (message: string) => void,
): BlockFacetMenuModel | undefined {
  const taskId = routedId('tasks') ?? null
  const task = useTask(taskId)
  const folderId = routedId('folders') ?? routedId('facets') ?? task.data?.folder.id
  return useBlockFacets(editor, folderId, editable, onNotice)
}

/**
 * One controller for the gutter action and the quiet exact-block chips.
 * Reading the relation is independent of editing it: Can-view members still
 * see what is connected; `editable` only decides whether the menu may mutate.
 */
export function useBlockFacets(
  editor: AnyEditor,
  folderId: string | undefined,
  editable: boolean,
  onNotice?: (message: string) => void,
): BlockFacetMenuModel | undefined {
  const pages = useAllPages(folderId !== undefined)
  const client = useQueryClient()

  /* #526: Connected work is mounted after BlockNote, but placing one belongs
     to this exact editor so it can use the normal document insertion/order
     path. Register the already-existing editor instead of plumbing another
     editor prop through every CanvasSurface caller. */
  useEffect(() => registerCanvasEditor(editor), [editor])

  const relations = useQuery({
    queryKey: folderId === undefined ? ['block-facets', 'none'] : key(folderId),
    queryFn: () => getPlain(getProjectBlockFacetsResponse, `/block-facets?folder=${encodeURIComponent(folderId!)}`),
    enabled: folderId !== undefined,
  })
  const mutation = useMutation({
    mutationFn: ({ blockId, facetIds }: { blockId: string; facetIds: string[] }) =>
      mutateApi(putBlockFacetsResponse, {
        method: 'PUT',
        path: '/block-facets',
        body: { block_id: blockId, facet_ids: facetIds },
      }),
    onSuccess: (answer) => {
      if (folderId === undefined) return
      const before = client.getQueryData<GetProjectBlockFacetsResponse>(key(folderId))
        ?.blocks.find((row) => row.block_id === answer.block_id)?.facets ?? []
      client.setQueryData<GetProjectBlockFacetsResponse>(
        key(folderId),
        (old) => replaceRow(old, answer.block_id, answer.facets),
      )
      /* A facet relation immediately changes that facet's unplaced/inline
         connected-work projection. Refresh both removed and newly added
         targets so the document never waits for a focus refetch. */
      const changed = new Set([...before.map((facet) => facet.id), ...answer.facets.map((facet) => facet.id)])
      for (const facetId of changed) {
        void client.invalidateQueries({ queryKey: queryKeys.connectedWork(facetId) })
      }
    },
    onError: (error) => onNotice?.(error instanceof Error ? error.message : 'The facet connection could not be changed.'),
  })

  const model = useMemo<BlockFacetMenuModel | undefined>(() => {
    if (folderId === undefined) return undefined
    const page = pages.data?.find((candidate) => candidate.id === folderId)
    const projectId = page?.project_id
    if (projectId === undefined) return undefined
    const options: BlockFacetRef[] = (pages.data ?? [])
      .filter((candidate) =>
        candidate.project_id === projectId &&
        candidate.kind === 'doc' &&
        candidate.tab_position !== null &&
        candidate.id !== candidate.project_id,
      )
      .sort((a, b) =>
        (a.tab_position ?? '').localeCompare(b.tab_position ?? '') || a.id.localeCompare(b.id),
      )
      .map((candidate) => ({ id: candidate.id, name: candidate.name }))
    const byBlock = new Map((relations.data?.blocks ?? []).map((row) => [row.block_id, row.facets] as const))
    return {
      options,
      editable,
      selected: (blockId) => byBlock.get(blockId) ?? [],
      toggle: (blockId, facetId) => {
        if (!editable) return
        const current = byBlock.get(blockId) ?? []
        const ids = current.some((facet) => facet.id === facetId)
          ? current.filter((facet) => facet.id !== facetId).map((facet) => facet.id)
          : [...current.map((facet) => facet.id), facetId]
        mutation.mutate({ blockId, facetIds: ids })
      },
      busy: mutation.isPending,
    }
  }, [folderId, editable, pages.data, relations.data, mutation])

  useFacetDecorations(editor, model)
  return model
}

function visitBlocks(
  blocks: readonly { id: string; children?: readonly unknown[] }[],
  visit: (id: string) => void,
): void {
  for (const block of blocks) {
    visit(block.id)
    if (Array.isArray(block.children) && block.children.length > 0) {
      visitBlocks(block.children as readonly { id: string; children?: readonly unknown[] }[], visit)
    }
  }
}

const VISIBLE_FACETS = 2
const FACET_GUTTER = '136px'

function facetChip(facet: BlockFacetRef): HTMLAnchorElement {
  const link = document.createElement('a')
  link.href = `/app/facets/${facet.id}`
  link.textContent = facet.name
  link.title = `Open ${facet.name}`
  link.className = 'inline-flex h-5 max-w-28 shrink-0 items-center truncate rounded-sm border border-primary/30 bg-primary/10 px-1.5 text-[11px] font-medium leading-none text-foreground no-underline hover:bg-primary/15'
  link.addEventListener('mousedown', (event) => event.stopPropagation())
  return link
}

function prepareHost(content: HTMLElement): void {
  if (content.dataset.danaFacetHost === 'true') return
  content.dataset.danaFacetHost = 'true'
  content.dataset.danaFacetPosition = content.style.position
  content.dataset.danaFacetOverflow = content.style.overflow
  content.dataset.danaFacetPaddingInlineEnd = content.style.paddingInlineEnd
  content.style.position = 'relative'
  content.style.overflow = 'visible'
  /* Keep metadata beside the first line instead of creating a detached second
     row. The gutter exists only while this block has a relationship. */
  content.style.paddingInlineEnd = FACET_GUTTER
}

function releaseHost(content: HTMLElement): void {
  if (content.dataset.danaFacetHost !== 'true') return
  content.style.position = content.dataset.danaFacetPosition ?? ''
  content.style.overflow = content.dataset.danaFacetOverflow ?? ''
  content.style.paddingInlineEnd = content.dataset.danaFacetPaddingInlineEnd ?? ''
  delete content.dataset.danaFacetHost
  delete content.dataset.danaFacetPosition
  delete content.dataset.danaFacetOverflow
  delete content.dataset.danaFacetPaddingInlineEnd
}

/** A relationship is durable metadata, not a hover action. Keep the rail itself
 * visible regardless of whichever BlockNote hover rules surround its host. */
function keepFacetRailVisible(rail: HTMLElement): void {
  rail.style.setProperty('display', rail.dataset.inline === 'true' ? 'inline-flex' : 'flex', 'important')
  rail.style.setProperty('visibility', 'visible', 'important')
  rail.style.setProperty('opacity', '1', 'important')
}

/**
 * Sync exact-block facet metadata without changing BlockNote's structural DOM.
 *
 * File blocks already have a compact identity row, so their chips live in that
 * row. Other block kinds use a reserved right-side metadata gutter aligned to
 * the first line. A long prose/list block therefore never gains an awkward
 * second metadata line underneath it.
 */
export function syncFacetDecorations(
  host: HTMLElement,
  wanted: ReadonlyMap<string, readonly BlockFacetRef[]>,
): void {
  host.querySelectorAll<HTMLElement>('[data-dana-block-facets]').forEach((rail) => {
    const id = rail.dataset.danaBlockFacets ?? ''
    if (wanted.has(id)) return
    const content = rail.closest<HTMLElement>('.bn-block-content')
    rail.remove()
    if (content !== null) releaseHost(content)
  })

  for (const [blockId, facets] of wanted) {
    const outer = [...host.querySelectorAll<HTMLElement>('.bn-block-outer[data-id]')]
      .find((element) => element.dataset.id === blockId)
    const content = outer?.querySelector<HTMLElement>(
      ':scope > .bn-block > .react-renderer > .bn-block-content, :scope > .bn-block > .bn-block-content',
    ) ?? outer?.querySelector<HTMLElement>('.bn-block-content')
    if (outer === undefined || content === undefined || content === null) continue

    const fileRow = content.querySelector<HTMLElement>('.bn-file-name-with-icon')
    const inline = fileRow !== null
    const mount = fileRow ?? content
    if (inline) releaseHost(content)
    else prepareHost(content)

    let rail = outer.querySelector<HTMLElement>(`[data-dana-block-facets="${blockId}"]`)
    if (rail !== null && rail.parentElement !== mount) {
      rail.remove()
      rail = null
    }
    const visibleCount = inline ? VISIBLE_FACETS : 1
    const signature = `${inline ? 'inline' : 'gutter'}:${facets.map((facet) => `${facet.id}:${facet.name}`).join('|')}`
    if (rail !== null) keepFacetRailVisible(rail)
    if (rail?.dataset.signature === signature) continue
    if (rail === null) {
      rail = document.createElement('div')
      rail.dataset.danaBlockFacets = blockId
      rail.dataset.inline = inline ? 'true' : 'false'
      rail.setAttribute('contenteditable', 'false')
      rail.setAttribute('role', 'group')
      rail.setAttribute('aria-label', 'Connected facets')
      mount.append(rail)
    }
    rail.dataset.inline = inline ? 'true' : 'false'
    rail.className = inline
      ? 'dana-block-facet-rail ml-1 inline-flex h-5 min-w-0 shrink-0 items-center gap-1 overflow-visible'
      : 'dana-block-facet-rail absolute right-0 top-0 z-10 flex h-5 min-w-0 max-w-[128px] items-center justify-end gap-1 overflow-visible'
    keepFacetRailVisible(rail)
    rail.dataset.signature = signature
    const visible: HTMLElement[] = facets.slice(0, visibleCount).map(facetChip)
    const hidden = facets.length - visible.length
    if (hidden > 0) {
      const more = document.createElement('span')
      more.textContent = `+${hidden}`
      more.title = `${hidden} more connected ${hidden === 1 ? 'facet' : 'facets'}`
      more.className = 'inline-flex h-5 shrink-0 items-center px-1 text-[11px] font-medium leading-none text-muted-foreground'
      visible.push(more)
    }
    rail.replaceChildren(...visible)
  }
}

/**
 * Own the relationship decorations for the entire canvas lifetime. BlockNote's
 * DOM can become available after the React effect has already run, so wait for
 * it instead of silently giving up and depending on a later hover mount.
 */
export function installFacetDecorations(editor: AnyEditor, model: BlockFacetMenuModel): () => void {
  let frame = 0
  let host: HTMLElement | null = null
  let observer: MutationObserver | null = null
  let stopped = false

  const schedule = (): void => {
    if (stopped || frame !== 0) return
    frame = window.requestAnimationFrame(sync)
  }

  const sync = (): void => {
    frame = 0
    if (stopped) return
    const nextHost = editor.domElement
    if (nextHost === undefined || nextHost === null) {
      schedule()
      return
    }
    if (host !== nextHost) {
      observer?.disconnect()
      host = nextHost
      observer = new MutationObserver(schedule)
      observer.observe(host, { childList: true, subtree: true })
    }
    const wanted = new Map<string, readonly BlockFacetRef[]>()
    visitBlocks(editor.document, (blockId) => {
      const facets = model.selected(blockId)
      if (facets.length > 0) wanted.set(blockId, facets)
    })
    syncFacetDecorations(nextHost, wanted)
  }

  const ready = (): void => { schedule() }
  window.addEventListener('dana:canvas-editor-ready', ready)
  sync()
  return () => {
    stopped = true
    window.removeEventListener('dana:canvas-editor-ready', ready)
    observer?.disconnect()
    if (frame !== 0) window.cancelAnimationFrame(frame)
    /* Decorations live with BlockNote's DOM and disappear when that DOM does.
       Do not actively clear them here: another still-mounted controller may
       own the same rails, and hover-menu teardown must never erase durable
       relationship metadata. */
  }
}

/**
 * BlockNote owns the block DOM, so relationship chips stay outside its
 * document schema. They move with the exact block but never become authored
 * text or a neighboring reference block.
 */
function useFacetDecorations(editor: AnyEditor, model: BlockFacetMenuModel | undefined): void {
  useEffect(() => {
    /* An unresolved relation model must never clear decorations owned by the
       always-mounted canvas. */
    if (model === undefined) return
    return installFacetDecorations(editor, model)
  }, [editor, model])
}
