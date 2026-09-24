import { plainContentToString } from '@blocknote/core'
import type { PartialBlock } from '@blocknote/core'
import type { PageBlockKind, PageView } from '../../../../shared/pages.js'
import { MAX_SECTION_DEPTH, isPresentationHeadingKind } from '../../../../shared/page-document.js'
import type { CanvasBlock, canvasSchema } from './schema.js'
import { danaLinkOf } from '../../links/dana-link.js'

export type CanvasInput = PartialBlock<typeof canvasSchema.blockSchema, typeof canvasSchema.inlineContentSchema, typeof canvasSchema.styleSchema>
export interface RichRun { text: string; bold?: boolean; italic?: boolean; href?: string }
export interface CanvasRecord {
  id: string
  block_kind: PageBlockKind
  text: string | null
  rich_content: { version: 1; runs: RichRun[] } | null
  file_id: string | null
  ref_folder_id: string | null
  width_pct: number | null
  checked: boolean | null
}
export interface CanvasPlacement { kind: 'block' | 'task'; id: string; section_block_id: string | null; list_parent_block_id: string | null }
export interface CanvasDocument { blocks: CanvasRecord[]; items: CanvasPlacement[] }

/** A stored page that the canvas cannot safely turn into editable content. */
export class CanvasHydrationError extends Error {
  override readonly name = 'CanvasHydrationError'
}

export function contentOf(text: string | null, rich?: { version: 1; runs: RichRun[] } | null): CanvasInput['content'] {
  if (!rich) return text ?? ''
  return rich.runs.map((run) => {
    const node = { type: 'text' as const, text: run.text, styles: { ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}) } }
    // A run whose href is a Dana Link draws as a live chip (#223); its text
    // rides along as the label a save writes back.
    if (run.href && danaLinkOf(run.href) !== null) return { type: 'danaLink' as const, props: { href: run.href, label: run.text } }
    return run.href ? { type: 'link' as const, href: run.href, content: [node] } : node
  })
}

/**
 * Explicit parent IDs alone establish groups; root prose never follows proximity.
 *
 * A Section carries no heading level of its own: its level is its depth in the
 * section_block_id relation, so a root Section is H1, its child H2 and its
 * grandchild H3. The outline lists a parent before its content, so each level is
 * read off the parent's already-recorded one. The clamp is defensive only — the
 * server refuses a deeper Section before it writes.
 */
export function hydrateCanvas(page: PageView, columnWidth: number): CanvasInput[] {
  const records = new Map(page.blocks.map((block) => [block.id, block]))
  const sectionParents = new Map(
    page.task_placements?.map((task) => [task.id, task.section_block_id]) ?? [],
  )
  const listParents = new Map(
    page.blocks.map((block) => [block.id, block.list_parent_block_id]),
  )
  const levels = new Map<string, number>()
  const nodes = new Map<string, CanvasInput>()

  const mediaProps = (
    block: PageView['blocks'][number],
  ): Record<string, string | number | boolean | undefined> => ({
    url: block.file_id ? `/api/v1/files/${block.file_id}` : '',
    name: block.kind === 'file' ? 'File' : '',
    caption: '',
    showPreview: true,
    ...(block.kind === 'video'
      ? {
          previewWidth:
            columnWidth * (block.width_pct ?? 100) / 100,
        }
      : {}),
  })

  for (const item of page.items) {
    if (item.kind === 'task') {
      nodes.set(item.id, {
        id: item.id,
        type: 'danaTask',
        props: { taskId: item.id },
        children: [],
      })
      continue
    }
    const block = records.get(item.id)
    if (!block) {
      throw new CanvasHydrationError(
        'The page contains an unavailable block. Reload before editing.',
      )
    }
    sectionParents.set(block.id, block.section_block_id)
    let node: CanvasInput
    if (block.kind === 'section') {
      const level = Math.min(
        block.section_block_id === null
          ? 1
          : (levels.get(block.section_block_id) ?? 0) + 1,
        MAX_SECTION_DEPTH,
      )
      levels.set(block.id, level)
      node = {
        id: block.id,
        type: 'heading',
        props: { level, isToggleable: true },
        content: contentOf(block.text, block.rich_content),
        children: [],
      }
    } else if (isPresentationHeadingKind(block.kind)) {
      const level = Number(block.kind.slice(-1)) as 1 | 2 | 3
      node = {
        id: block.id,
        type: 'heading',
        props: { level, isToggleable: false },
        content: contentOf(block.text, block.rich_content),
        children: [],
      }
    } else if (block.kind === 'bullet') {
      node = {
        id: block.id,
        type: 'bulletListItem',
        content: contentOf(block.text, block.rich_content),
        children: [],
      }
    } else if (block.kind === 'numbered') {
      node = {
        id: block.id,
        type: 'numberedListItem',
        content: contentOf(block.text, block.rich_content),
        children: [],
      }
    } else if (block.kind === 'checklist') {
      node = {
        id: block.id,
        type: 'checkListItem',
        props: { checked: block.checked ?? false },
        content: contentOf(block.text, block.rich_content),
        children: [],
      }
    } else if (block.kind === 'quote') {
      node = {
        id: block.id,
        type: 'quote',
        content: contentOf(block.text, block.rich_content),
        children: [],
      }
    } else if (block.kind === 'callout') {
      node = {
        id: block.id,
        type: 'callout',
        content: contentOf(block.text, block.rich_content),
        children: [],
      }
    } else if (block.kind === 'code') {
      node = {
        id: block.id,
        type: 'codeBlock',
        content: block.text ?? '',
        children: [],
      }
    } else if (block.kind === 'image') {
      node = {
        id: block.id,
        type: 'image',
        props: {
          url: block.file_id ? `/api/v1/files/${block.file_id}` : '',
          reclaimedAt: block.file_id ? '' : block.file_reclaimed_at ?? '',
          caption: block.text ?? '',
          previewWidth:
            columnWidth * (block.width_pct ?? 100) / 100,
        },
        children: [],
      }
    } else if (
      block.kind === 'file' ||
      block.kind === 'audio' ||
      block.kind === 'video'
    ) {
      node = {
        id: block.id,
        type: block.kind,
        props: mediaProps(block),
        children: [],
      } as CanvasInput
    } else if (block.kind === 'diagram') {
      node = { id: block.id, type: 'diagram', props: { source: block.text ?? '' }, children: [] }
    } else if (block.kind === 'folder_ref') {
      node = {
        id: block.id,
        type: 'paragraph',
        content: [
          {
            type: 'link',
            href: `/app/folders/${block.ref_folder_id ?? ''}`,
            content: block.text ?? 'Open folder',
          },
        ],
        children: [],
      }
    } else {
      node = {
        id: block.id,
        type: 'paragraph',
        content: contentOf(block.text, block.rich_content),
        children: [],
      }
    }
    nodes.set(block.id, node)
  }

  const root: CanvasInput[] = []
  for (const item of page.items) {
    const node = nodes.get(item.id)!
    const listParentId = listParents.get(item.id) ?? null
    if (listParentId !== null) {
      const listParent = nodes.get(listParentId)
      if (
        listParent?.type !== 'bulletListItem' &&
        listParent?.type !== 'numberedListItem' &&
        listParent?.type !== 'checkListItem'
      ) {
        throw new CanvasHydrationError(
          'The page has an invalid list. Its content has been preserved; reload before editing.',
        )
      }
      listParent.children!.push(node)
      continue
    }

    const sectionParentId = sectionParents.get(item.id) ?? null
    if (sectionParentId === null) {
      root.push(node)
      continue
    }
    const sectionParent = nodes.get(sectionParentId)
    if (
      sectionParent?.type !== 'heading' ||
      sectionParent.props?.isToggleable === false
    ) {
      throw new CanvasHydrationError(
        'The page has an invalid group. Its content has been preserved; reload before editing.',
      )
    }
    sectionParent.children!.push(node)
  }
  return root
}

export function richRuns(block: CanvasBlock): RichRun[] {
  if (!Array.isArray(block.content)) return []
  const runs: RichRun[] = []
  for (const inline of block.content) {
    const append = (text: string, styles: { bold?: boolean; italic?: boolean }, href?: string): void => {
      if (!text) return
      const run: RichRun = { text, ...(styles.bold ? { bold: true } : {}), ...(styles.italic ? { italic: true } : {}), ...(href ? { href } : {}) }
      const last = runs.at(-1)
      if (last && last.bold === run.bold && last.italic === run.italic && last.href === run.href) last.text += text
      else runs.push(run)
    }
    if (inline.type === 'text') append(inline.text, inline.styles)
    else if (inline.type === 'link') for (const text of inline.content) append(text.text, text.styles, inline.href)
    // Its own run, never merged into a neighbour, so two chips stay two.
    else if (inline.type === 'danaLink') runs.push({ text: inline.props.label || 'Link', href: inline.props.href })
  }
  return runs
}

/**
 * Which blocks of a stored page are folder references, as block id to the
 * folder each one names.
 *
 * A `folder_ref` is a typed relation and `canvasSchema` has no block type for
 * it, so `hydrateCanvas` draws it as a paragraph carrying a link and the
 * projection below would otherwise write it back as a paragraph with
 * `ref_folder_id` null — the link surviving as a rich-content run, so the
 * person sees a working link and the relation is gone (issue #255). This map
 * is the page's own answer to "which of these paragraphs is really a
 * reference", and it is the only source: an href in the content is the
 * person's text, and a paragraph that merely contains a folder link must not
 * become a relation, because `page_blocks_ref_folder_id_fkey` is ON DELETE
 * CASCADE and would take that paragraph with the folder.
 *
 * **Which page to read it from is the caller's decision and it is not free.**
 * The page the editor was *hydrated* from is the wrong one: the session
 * outlives many saves, so a map taken there keeps an entry for a block a save
 * has already converted, and the projection below puts the relation back on
 * the person's next keystroke. `FolderCanvas` reads it from the query row the
 * writer writes back after every save, and carries the measurement; AC-663
 * pins it.
 *
 * A reference with no folder is left out. `shelfItemsOf` drops one on read for
 * the same reason, and carrying a null relation would write a `folder_ref`
 * that names nothing.
 *
 * **Why this is its own carry and not a seventh member of
 * `STRUCTURED_BLOCK_KINDS`.** That constant means structured *text*, and every
 * reader of it was read before this was chosen: `DOCUMENT_BLOCK_KINDS` is
 * spread from it, `put_block`'s superRefine is the list it refuses a file and
 * a folder reference on, `pages.ts` re-exports it and nothing imports that
 * re-export, and the `UNEXPRESSED` set below is the fourth. So putting
 * `folder_ref` in it would make the contract refuse the very column this
 * exists to keep, and would say of it the one thing that is not true: that it
 * is text. And the carry below could not reach a `folder_ref` anyway: it reads
 * the kind off `before`, which the writer builds from this projection, so a
 * kind this projection has already dropped is not there to restore. That is
 * issue #250's finding about its own half, and it is why this one is fixed one
 * layer earlier, in the projection rather than in the diff.
 */
export function folderRefsOf(page: PageView): ReadonlyMap<string, string> {
  return new Map(page.blocks.flatMap((block) => block.kind === 'folder_ref' && block.ref_folder_id !== null ? [[block.id, block.ref_folder_id] as const] : []))
}

/**
 * Per-record projection, independent of the editor's JSON serialization.
 *
 * `folderRefs` is required rather than optional on purpose: the defect it
 * exists to stop is a relation dropped in silence, and an optional argument is
 * a call site that drops it in silence again with nothing to read.
 */
export function dehydrateCanvas(
  blocks: readonly CanvasBlock[],
  columnWidth: number,
  folderRefs: ReadonlyMap<string, string>,
): CanvasDocument {
  const result: CanvasDocument = { blocks: [], items: [] }
  const fileIdOf = (url: string): string | null =>
    /(?:^|\/)api\/v1\/files\/([0-9a-f-]{36})$/i.exec(url)?.[1] ?? null

  function visit(
    children: readonly CanvasBlock[],
    sectionParent: string | null,
    listParent: string | null,
  ): void {
    for (const block of children) {
      const task = block.type === 'danaTask'
      const groupHeading =
        block.type === 'heading' && block.props.isToggleable !== false
      const listKind =
        block.type === 'bulletListItem' ||
        block.type === 'numberedListItem' ||
        block.type === 'checkListItem'
      const unuploadedRequiredMedia =
        (block.type === 'file' ||
          block.type === 'audio' ||
          block.type === 'video') &&
        block.props.url === ''

      /*
       * File/audio/video are invalid on the wire without a file id. Their
       * empty editor block is only the local file-picker placeholder, so do
       * not put it in the durable outline until a file has actually uploaded.
       * Image is different by contract: an empty image placeholder is allowed.
       */
      if (unuploadedRequiredMedia) continue

      result.items.push({
        kind: task ? 'task' : 'block',
        id: task ? block.props.taskId : block.id,
        section_block_id: sectionParent,
        list_parent_block_id: listKind ? listParent : null,
      })

      if (!task) {
        const runs = richRuns(block)
        const presentationHeading =
          block.type === 'heading' && !groupHeading
        // A Shelf's native Folder row (#221) is a `folder_ref` by type; a
        // paragraph is one only by the page's own map (#255).
        const reference =
          block.type === 'danaFolder'
            ? block.props.folderId || null
            : block.type === 'paragraph'
              ? folderRefs.get(block.id) ?? null
              : null

        let blockKind: PageBlockKind = 'paragraph'
        if (block.type === 'heading') {
          blockKind = presentationHeading
            ? (`heading${String(block.props.level)}` as PageBlockKind)
            : 'section'
        } else if (block.type === 'bulletListItem') blockKind = 'bullet'
        else if (block.type === 'numberedListItem') blockKind = 'numbered'
        else if (block.type === 'checkListItem') blockKind = 'checklist'
        else if (block.type === 'quote') blockKind = 'quote'
        else if (block.type === 'callout') blockKind = 'callout'
        else if (block.type === 'codeBlock') blockKind = 'code'
        else if (block.type === 'image') blockKind = 'image'
        else if (block.type === 'file') blockKind = 'file'
        else if (block.type === 'audio') blockKind = 'audio'
        else if (block.type === 'video') blockKind = 'video'
        else if (reference !== null) blockKind = 'folder_ref'

        const media =
          block.type === 'image' ||
          block.type === 'file' ||
          block.type === 'audio' ||
          block.type === 'video'
        const url = media ? block.props.url : ''
        const fileId = media ? fileIdOf(url) : null
        if (media && url && fileId === null) {
          throw new Error(
            'Upload this file to Dana before saving. External media URLs are not supported.',
          )
        }

        const codeText =
          block.type === 'codeBlock'
            ? plainContentToString(block.content)
            : null
        const text =
          block.type === 'image'
            ? block.props.caption
            : block.type === 'file' ||
                block.type === 'audio' ||
                block.type === 'video'
              ? null
              : block.type === 'codeBlock'
                ? codeText
                : block.type === 'danaFolder'
                  ? null
                  : runs.map((run) => run.text).join('')
        const rich =
          block.type === 'image' ||
          block.type === 'file' ||
          block.type === 'audio' ||
          block.type === 'video' ||
          block.type === 'codeBlock' ||
          reference !== null
            ? null
            : { version: 1 as const, runs }
        const widthPct =
          block.type === 'image' || block.type === 'video'
            ? Math.max(
                25,
                Math.min(
                  100,
                  Math.round(
                    ((block.props.previewWidth || columnWidth) / columnWidth) *
                      100,
                  ),
                ),
              )
            : null

        // #222: a diagram is its source text; no rich content, file or width.
        if (block.type === 'diagram') result.blocks.push({ id: block.id, block_kind: 'diagram', text: block.props.source, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null })
        else result.blocks.push({
          id: block.id,
          block_kind: blockKind,
          text,
          rich_content: rich,
          file_id: fileId,
          ref_folder_id: reference,
          width_pct: widthPct,
          checked:
            block.type === 'checkListItem' ? block.props.checked : null,
        })
      }

      if (groupHeading) {
        visit(block.children, block.id, null)
      } else if (listKind) {
        visit(block.children, sectionParent, block.id)
      } else {
        visit(block.children, sectionParent, null)
      }
    }
  }

  visit(blocks, null, null)
  return result
}

export function documentOf(page: PageView): CanvasDocument {
  const parents = new Map(page.task_placements?.map((task) => [task.id, task.section_block_id]) ?? [])
  const blocks = page.blocks.map((block): CanvasRecord => {
    parents.set(block.id, block.section_block_id)
    return { id: block.id, block_kind: block.kind, text: block.text, rich_content: block.rich_content ?? null, file_id: block.file_id, ref_folder_id: block.ref_folder_id, width_pct: block.width_pct, checked: block.checked }
  })
  const listParents = new Map(page.blocks.map((block) => [block.id, block.list_parent_block_id]))
  return { blocks, items: page.items.map((item) => ({ ...item, section_block_id: parents.get(item.id) ?? null, list_parent_block_id: listParents.get(item.id) ?? null })) }
}

/** The editable window a Work facet opens onto one root Section. The root H1
 * itself is the facet title and stays outside the editor; everything beneath
 * it keeps the same ids and therefore remains Main's document. */
export function workPageOf(page: PageView, rootId: string): PageView {
  const included = new Set<string>([rootId])
  for (const block of page.blocks) {
    if (block.section_block_id !== null && included.has(block.section_block_id)) included.add(block.id)
  }
  const taskParents = new Map(page.task_placements?.map((placement) => [placement.id, placement.section_block_id]) ?? [])
  const itemIds = new Set(page.items.flatMap((item) => {
    if (item.kind === 'block') return included.has(item.id) && item.id !== rootId ? [item.id] : []
    const parent = taskParents.get(item.id)
    return parent !== undefined && parent !== null && included.has(parent) ? [item.id] : []
  }))
  return {
    ...page,
    blocks: page.blocks
      .filter((block) => itemIds.has(block.id))
      .map((block) => block.section_block_id === rootId ? { ...block, section_block_id: null } : block),
    items: page.items.filter((item) => itemIds.has(item.id)),
    task_placements: page.task_placements
      ?.filter((placement) => itemIds.has(placement.id))
      .map((placement) => placement.section_block_id === rootId ? { ...placement, section_block_id: null } : placement),
  }
}

/** Put an edited Work projection back into the complete Main document before
 * diffing. Siblings outside the linked H1 never enter the editor and are
 * copied byte-for-byte into the proposal. */
export function mergeWorkDocument(page: PageView, rootId: string, work: CanvasDocument): CanvasDocument {
  const base = documentOf(page)
  const old = workPageOf(page, rootId)
  const replaced = new Set(old.items.map((item) => item.id))
  const projectedItems = work.items.map((item) => item.section_block_id === null ? { ...item, section_block_id: rootId } : item)
  const first = base.items.findIndex((item) => replaced.has(item.id))
  const root = base.items.findIndex((item) => item.id === rootId)
  const at = first >= 0 ? first : root >= 0 ? root + 1 : base.items.length
  const keptItems = base.items.filter((item) => !replaced.has(item.id))
  const before = base.items.slice(0, at).filter((item) => !replaced.has(item.id)).length
  keptItems.splice(before, 0, ...projectedItems)
  return {
    blocks: [
      ...base.blocks.filter((block) => !replaced.has(block.id)),
      ...work.blocks,
    ],
    items: keptItems,
  }
}

/**
 * The editor now expresses the accepted authored vocabulary directly. Keep this
 * named seam because CanvasWriter asks the same normalization question when it
 * decides whether the latest document is settled; today the normalized form is
 * simply the projection itself.
 */
export function restoreCanvas(
  _before: CanvasDocument,
  after: CanvasDocument,
): CanvasDocument {
  return after
}

/**
 * The writer's baseline: what a save of this page, untouched, would send.
 *
 * `documentOf(page)` is the truth and `projected` is what the editor can draw
 * of it, and neither alone is a baseline. The truth cannot be diffed against
 * an editor projection — every plain paragraph would read as changed — and the
 * projection carries none of the kinds, ticks and list parents the restore
 * above needs to read. This is the two of them reconciled, and it is what the
 * writer must hold at mount **and** after every commit: a baseline correct
 * once and stale afterwards loses the same page one save later.
 */
export function baselineOf(page: PageView, projected: CanvasDocument): CanvasDocument {
  return restoreCanvas(documentOf(page), projected)
}

export function canvasOperations(before: CanvasDocument, after: CanvasDocument) {
  const restored = restoreCanvas(before, after)
  const old = new Map(before.blocks.map((block) => [block.id, block]))
  const ids = new Set(restored.blocks.map((block) => block.id))
  return [
    ...before.blocks.filter((block) => !ids.has(block.id)).map((block) => ({ op: 'delete_block' as const, id: block.id })),
    ...restored.blocks.filter((block) => JSON.stringify(old.get(block.id)) !== JSON.stringify(block)).map((block) => ({ op: 'put_block' as const, ...block })),
    { op: 'set_outline' as const, items: restored.items },
  ]
}
