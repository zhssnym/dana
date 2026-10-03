import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { BlockFacetRef, GetProjectBlockFacetsResponse } from '../../../../shared/block-facets.js'
import { getProjectBlockFacetsResponse, putBlockFacetsResponse } from '../../../../shared/block-facets.js'
import { getPlain, mutateApi } from '../../../api/http.js'
import { useAllPages } from '../../../api/queries.js'
import type { AnyEditor, BlockFacetMenuModel } from './BlockSideMenu.js'

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
      client.setQueryData<GetProjectBlockFacetsResponse>(
        key(folderId),
        (old) => replaceRow(old, answer.block_id, answer.facets),
      )
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
const FACET_SPACE = '24px'

function facetChip(facet: BlockFacetRef): HTMLAnchorElement {
  const link = document.createElement('a')
  link.href = `/app/facets/${facet.id}`
  link.textContent = facet.name
  link.title = `Open ${facet.name}`
  link.className = 'inline-flex h-5 max-w-36 shrink-0 items-center truncate rounded-sm border border-primary/30 bg-primary/10 px-1.5 text-[11px] font-medium leading-none text-foreground no-underline hover:bg-primary/15'
  link.addEventListener('mousedown', (event) => event.stopPropagation())
  return link
}

function prepareHost(content: HTMLElement): void {
  if (content.dataset.danaFacetHost === 'true') return
  content.dataset.danaFacetHost = 'true'
  content.dataset.danaFacetPosition = content.style.position
  content.dataset.danaFacetOverflow = content.style.overflow
  content.dataset.danaFacetPaddingBottom = content.style.paddingBottom
  content.style.position = 'relative'
  content.style.overflow = 'visible'
  content.style.paddingBottom = FACET_SPACE
}

function releaseHost(content: HTMLElement): void {
  if (content.dataset.danaFacetHost !== 'true') return
  content.style.position = content.dataset.danaFacetPosition ?? ''
  content.style.overflow = content.dataset.danaFacetOverflow ?? ''
  content.style.paddingBottom = content.dataset.danaFacetPaddingBottom ?? ''
  delete content.dataset.danaFacetHost
  delete content.dataset.danaFacetPosition
  delete content.dataset.danaFacetOverflow
  delete content.dataset.danaFacetPaddingBottom
}

/**
 * Sync exact-block facet metadata without changing BlockNote's structural DOM.
 * Dana's stable row identity lives on `.bn-block-outer[data-id]`; the rail is
 * absolutely positioned inside that row's content padding, so it cannot become
 * a sibling of `.bn-block` (which breaks BlockNote's drag-handle discovery) or
 * participate in media/file width measurement.
 */
export function syncFacetDecorations(
  host: HTMLElement,
  wanted: ReadonlyMap<string, readonly BlockFacetRef[]>,
): void {
  host.querySelectorAll<HTMLElement>('[data-dana-block-facets]').forEach((rail) => {
    const id = rail.dataset.danaBlockFacets ?? ''
    if (wanted.has(id)) return
    const content = rail.parentElement
    rail.remove()
    if (content instanceof HTMLElement) releaseHost(content)
  })

  for (const [blockId, facets] of wanted) {
    const outer = [...host.querySelectorAll<HTMLElement>('.bn-block-outer[data-id]')]
      .find((element) => element.dataset.id === blockId)
    const content = outer?.querySelector<HTMLElement>(
      ':scope > .bn-block > .react-renderer > .bn-block-content, :scope > .bn-block > .bn-block-content',
    ) ?? outer?.querySelector<HTMLElement>('.bn-block-content')
    if (outer === undefined || content === undefined || content === null) continue

    prepareHost(content)
    let rail = content.querySelector<HTMLElement>(`:scope > [data-dana-block-facets="${blockId}"]`)
    const signature = facets.map((facet) => `${facet.id}:${facet.name}`).join('|')
    if (rail?.dataset.signature === signature) continue
    if (rail === null) {
      rail = document.createElement('div')
      rail.dataset.danaBlockFacets = blockId
      rail.className = 'dana-block-facet-rail absolute bottom-0 left-0 z-10 flex h-5 min-w-0 max-w-full items-center gap-1 overflow-visible'
      rail.setAttribute('contenteditable', 'false')
      rail.setAttribute('role', 'group')
      rail.setAttribute('aria-label', 'Connected facets')
      content.append(rail)
    }
    rail.dataset.signature = signature
    const visible: HTMLElement[] = facets.slice(0, VISIBLE_FACETS).map(facetChip)
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
 * BlockNote owns the block DOM, so relationship chips stay outside its
 * document schema. They move with the exact block but never become authored
 * text or a neighboring reference block.
 */
function useFacetDecorations(editor: AnyEditor, model: BlockFacetMenuModel | undefined): void {
  useEffect(() => {
    const host = editor.domElement
    if (host === undefined || host === null) return
    let frame = 0
    const sync = (): void => {
      frame = 0
      const wanted = new Map<string, readonly BlockFacetRef[]>()
      if (model !== undefined) {
        visitBlocks(editor.document, (blockId) => {
          const facets = model.selected(blockId)
          if (facets.length > 0) wanted.set(blockId, facets)
        })
      }
      syncFacetDecorations(host, wanted)
    }
    const schedule = (): void => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(sync)
    }
    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(host, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (frame !== 0) window.cancelAnimationFrame(frame)
      syncFacetDecorations(host, new Map())
    }
  }, [editor, model])
}
