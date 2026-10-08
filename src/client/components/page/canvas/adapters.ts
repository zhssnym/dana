import { plainContentToString } from '@blocknote/core'
import type { PartialBlock } from '@blocknote/core'
import type { PageBlockKind, PageRichContent, PageView } from '../../../../shared/pages.js'
import { MAX_SECTION_DEPTH, NEST_PARENT_KINDS, isPresentationHeadingKind } from '../../../../shared/page-document.js'
import { tablePlainText, tableRichContent } from '../../../../shared/rich-content.js'
import type { TableRichContent } from '../../../../shared/rich-content.js'
import type { CanvasBlock, canvasSchema } from './schema.js'
import { isSectionHeading, isToggleHeading } from './outline.js'
import { danaLinkOf } from '../../links/dana-link.js'

export type CanvasInput = PartialBlock<typeof canvasSchema.blockSchema, typeof canvasSchema.inlineContentSchema, typeof canvasSchema.styleSchema>
export interface RichRun { text: string; bold?: boolean; italic?: boolean; href?: string; mention?: { user_id: string } }
export interface CanvasRecord {
  id: string
  block_kind: PageBlockKind
  text: string | null
  rich_content: PageRichContent | null
  file_id: string | null
  ref_folder_id: string | null
  width_pct: number | null
  checked: boolean | null
  /** True on a toggle heading, null on every other block. */
  toggleable: boolean | null
}
export interface CanvasPlacement { kind: 'block' | 'task'; id: string; section_block_id: string | null; list_parent_block_id: string | null }
export interface CanvasDocument { blocks: CanvasRecord[]; items: CanvasPlacement[] }

export class CanvasHydrationError extends Error {
  override readonly name = 'CanvasHydrationError'
}

export function contentOf(text: string | null, rich?: { version: 1; runs: RichRun[] } | null) {
  if (!rich) return text ?? ''
  return rich.runs.map((run) => {
    const node = { type: 'text' as const, text: run.text, styles: { ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}) } }
    // A Dana Link run draws as a live chip; its text is the label a save writes back.
    if (run.mention) return { type: 'mention' as const, props: { userId: run.mention.user_id, label: run.text } }
    if (run.href && danaLinkOf(run.href) !== null) return { type: 'danaLink' as const, props: { href: run.href, label: run.text } }
    return run.href ? { type: 'link' as const, href: run.href, content: [node] } : node
  })
}

export function tableContentOf(rich: PageRichContent | null | undefined): Extract<CanvasBlock, { type: 'table' }>['content'] {
  if (rich === null || rich === undefined || !('table' in rich)) throw new CanvasHydrationError('This table has no cells. Reload before editing.')
  return {
    type: 'tableContent',
    columnWidths: rich.table.columnWidths.map((width) => width ?? undefined),
    ...(rich.table.headerRows === undefined ? {} : { headerRows: rich.table.headerRows }),
    ...(rich.table.headerCols === undefined ? {} : { headerCols: rich.table.headerCols }),
    rows: rich.table.rows.map((row) => ({ cells: row.cells.map((cell) => ({
      type: 'tableCell' as const, props: cell.props,
      content: contentOf(null, { version: 1, runs: cell.runs }),
    })) })),
  } as Extract<CanvasBlock, { type: 'table' }>['content']
}

export function tableRichOf(block: CanvasBlock): TableRichContent {
  if (block.type !== 'table') throw new Error('This block is not a table.')
  const table = block.content
  const raw = {
    version: 1, runs: [],
    table: {
      columnWidths: table.columnWidths.map((width) => width ?? null),
      ...(table.headerRows ? { headerRows: table.headerRows } : {}),
      ...(table.headerCols ? { headerCols: table.headerCols } : {}),
      rows: table.rows.map((row) => ({ cells: row.cells.map((cell) => {
        const content = Array.isArray(cell) ? cell : cell.content
        const props = Array.isArray(cell) ? { backgroundColor: 'default', textColor: 'default', textAlignment: 'left' } : cell.props
        return { props: {
          backgroundColor: props.backgroundColor, textColor: props.textColor, textAlignment: props.textAlignment,
          ...(props.colspan && props.colspan > 1 ? { colspan: props.colspan } : {}),
          ...(props.rowspan && props.rowspan > 1 ? { rowspan: props.rowspan } : {}),
        }, runs: richRuns({ content } as CanvasBlock) }
      }) })),
    },
  }
  const checked = tableRichContent.safeParse(raw)
  if (!checked.success) throw new Error('This table is too large or has invalid cells. Shorten it before saving.')
  return checked.data
}

/**
 * Explicit parent ids alone make groups. A Section's level is its depth; the clamp
 * is defensive, since the server refuses deeper sections.
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
    // A stored file with no file was reclaimed: keep it as a notice, never as the
    // empty placeholder a save drops.
    reclaimedAt: block.file_id ? '' : block.file_reclaimed_at ?? 'earlier',
    name: block.kind === 'file' ? (block.file_name ?? 'File') : '',
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
      // `presentation` keeps a toggle heading apart from a Section, which folds too.
      node = {
        id: block.id,
        type: 'heading',
        props: block.toggleable === true ? { level, isToggleable: true, presentation: true } : { level, isToggleable: false },
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
    } else if (block.kind === 'toggle') {
      node = {
        id: block.id,
        type: 'toggleListItem',
        content: contentOf(block.text, block.rich_content),
        children: [],
      }
    } else if (block.kind === 'divider') {
      node = { id: block.id, type: 'divider', children: [] }
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
    } else if (block.kind === 'result') {
      node = {
        id: block.id,
        type: 'result',
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
    } else if (block.kind === 'table') {
      node = { id: block.id, type: 'table', content: tableContentOf(block.rich_content), children: [] }
    } else if (block.kind === 'page') {
      node = { id: block.id, type: 'danaPage', props: { folderId: block.ref_folder_id ?? '' }, children: [] }
    } else if (block.kind === 'folder_ref' && block.ref_folder_id !== null && (block.text ?? '') === '') {
      // A reference with no text is a page row: the page's name to a member,
      // "Page you can't open" otherwise.
      node = { id: block.id, type: 'danaPageRef', props: { folderId: block.ref_folder_id }, children: [] }
    } else if (block.kind === 'folder_ref') {
      node = {
        id: block.id,
        type: 'paragraph',
        content: [
          {
            type: 'link',
            href: `/app/folders/${block.ref_folder_id ?? ''}`,
            content: block.text ?? 'Open page',
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

  // Any block but a Section may nest; the parent's stored kind says whether it holds.
  const kinds = new Map(page.blocks.map((block) => [block.id, block.kind]))
  const root: CanvasInput[] = []
  for (const item of page.items) {
    const node = nodes.get(item.id)!
    const listParentId = listParents.get(item.id) ?? null
    if (listParentId !== null) {
      const parent = nodes.get(listParentId)
      const parentKind = kinds.get(listParentId)
      if (
        parent === undefined ||
        parentKind === undefined ||
        !(NEST_PARENT_KINDS as readonly string[]).includes(parentKind)
      ) {
        throw new CanvasHydrationError(
          'The page has an invalid nesting. Its content has been preserved; reload before editing.',
        )
      }
      parent.children!.push(node)
      continue
    }

    const sectionParentId = sectionParents.get(item.id) ?? null
    if (sectionParentId === null) {
      root.push(node)
      continue
    }
    const sectionParent = nodes.get(sectionParentId)
    if (
      sectionParent === undefined ||
      kinds.get(sectionParentId) !== 'section'
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
      if (last && last.mention === undefined && last.bold === run.bold && last.italic === run.italic && last.href === run.href) last.text += text
      else runs.push(run)
    }
    if (inline.type === 'text') append(inline.text, inline.styles)
    else if (inline.type === 'link') for (const text of inline.content) append(text.text, text.styles, inline.href)
    // Its own run, never merged, so two chips stay two.
    else if (inline.type === 'danaLink') runs.push({ text: inline.props.label || 'Link', href: inline.props.href })
    // A person mention: its own run, like a chip.
    else if (inline.type === 'mention' && inline.props.userId) runs.push({ text: inline.props.label || '@', mention: { user_id: inline.props.userId } })
  }
  return runs
}

/**
 * Block id to folder for each `folder_ref`. The schema draws one as a paragraph with a
 * link, so without this map a save would drop the relation. Never infer it from an
 * href: ON DELETE CASCADE would then delete the paragraph with the folder.
 */
export function folderRefsOf(page: PageView): ReadonlyMap<string, string> {
  return new Map(page.blocks.flatMap((block) => block.kind === 'folder_ref' && block.ref_folder_id !== null ? [[block.id, block.ref_folder_id] as const] : []))
}

/** `folderRefs` is required on purpose, so no call site can drop relations silently. */
export function dehydrateCanvas(
  blocks: readonly CanvasBlock[],
  columnWidth: number,
  folderRefs: ReadonlyMap<string, string>,
): CanvasDocument {
  const result: CanvasDocument = { blocks: [], items: [] }
  const fileIdOf = (url: string): string | null =>
    /(?:^|\/)api\/v1\/files\/([0-9a-f-]{36})$/i.exec(url)?.[1] ?? null

  // A Section's children get it as their Section and no block parent; other blocks'
  // children get it as their block parent and keep its Section.
  function visit(
    children: readonly CanvasBlock[],
    sectionParent: string | null,
    blockParent: string | null,
  ): void {
    for (const block of children) {
      const task = block.type === 'danaTask'
      const groupHeading = isSectionHeading(block)
      const unuploadedRequiredMedia =
        (block.type === 'file' ||
          block.type === 'audio' ||
          block.type === 'video') &&
        block.props.url === '' &&
        ((block.props as { reclaimedAt?: string }).reclaimedAt ?? '') === ''

      // Empty file, audio and video blocks are local placeholders and are not saved; an
      // empty image is allowed. A reclaimed one is saved back as the server holds it.
      if (unuploadedRequiredMedia) {
        visit(block.children, sectionParent, blockParent)
        continue
      }

      result.items.push({
        kind: task ? 'task' : 'block',
        id: task ? block.props.taskId : block.id,
        section_block_id: sectionParent,
        list_parent_block_id: task ? null : blockParent,
      })

      if (!task) {
        const runs = richRuns(block)
        const presentationHeading =
          block.type === 'heading' && !groupHeading
        // A shelf's folder row is a `folder_ref` by type; a paragraph only by the page's map.
        const reference =
          block.type === 'danaFolder' || block.type === 'danaPageRef'
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
        else if (block.type === 'toggleListItem') blockKind = 'toggle'
        else if (block.type === 'quote') blockKind = 'quote'
        else if (block.type === 'callout') blockKind = 'callout'
        else if (block.type === 'result') blockKind = 'result'
        else if (block.type === 'codeBlock') blockKind = 'code'
        else if (block.type === 'image') blockKind = 'image'
        else if (block.type === 'file') blockKind = 'file'
        else if (block.type === 'audio') blockKind = 'audio'
        else if (block.type === 'video') blockKind = 'video'
        else if (block.type === 'table') blockKind = 'table'
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
                : block.type === 'danaFolder' || block.type === 'danaPageRef'
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

        if (block.type === 'divider') result.blocks.push({ id: block.id, block_kind: 'divider', text: null, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null, toggleable: null })
        // A sub-page is only its reference, the same record `documentOf` reads.
        else if (block.type === 'danaPage') result.blocks.push({ id: block.id, block_kind: 'page', text: null, rich_content: null, file_id: null, ref_folder_id: block.props.folderId, width_pct: null, checked: null, toggleable: null })
        else if (block.type === 'diagram') result.blocks.push({ id: block.id, block_kind: 'diagram', text: block.props.source, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null, toggleable: null })
        else if (block.type === 'table') {
          const table = tableRichOf(block)
          result.blocks.push({ id: block.id, block_kind: 'table', text: tablePlainText(table.table), rich_content: table, file_id: null, ref_folder_id: null, width_pct: null, checked: null, toggleable: null })
        }
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
          toggleable: presentationHeading && isToggleHeading(block) ? true : null,
        })
      }

      if (groupHeading) {
        visit(block.children, block.id, null)
      } else if (task) {
        // A task holds nothing (`validateCanvasOutline`); kept all the same.
        visit(block.children, sectionParent, blockParent)
      } else {
        visit(block.children, sectionParent, block.id)
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
    return { id: block.id, block_kind: block.kind, text: block.text, rich_content: block.rich_content ?? null, file_id: block.file_id, ref_folder_id: block.ref_folder_id, width_pct: block.width_pct, checked: block.checked, toggleable: block.toggleable === true ? true : null }
  })
  const listParents = new Map(page.blocks.map((block) => [block.id, block.list_parent_block_id]))
  return { blocks, items: page.items.map((item) => ({ ...item, section_block_id: parents.get(item.id) ?? null, list_parent_block_id: listParents.get(item.id) ?? null })) }
}

/** A Work facet's editable window onto one root Section; the root heading stays outside. */
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

/** Put an edited Work projection back into the full document before diffing. */
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

/** Kept as a seam for CanvasWriter; today the normalized form is the projection itself. */
export function restoreCanvas(
  _before: CanvasDocument,
  after: CanvasDocument,
): CanvasDocument {
  return after
}

/**
 * What a save of the untouched page would send. Today `restoreCanvas` returns
 * `projected` unchanged.
 */
export function baselineOf(page: PageView, projected: CanvasDocument): CanvasDocument {
  return restoreCanvas(documentOf(page), projected)
}

/** A new `page` block restores its trashed sub-page; a removed one trashes it. */
export function canvasOperations(before: CanvasDocument, after: CanvasDocument) {
  const restored = restoreCanvas(before, after)
  const old = new Map(before.blocks.map((block) => [block.id, block]))
  const ids = new Set(restored.blocks.map((block) => block.id))
  return [
    ...before.blocks.filter((block) => !ids.has(block.id)).flatMap((block) => [
      { op: 'delete_block' as const, id: block.id },
      ...(block.block_kind === 'page' && block.ref_folder_id !== null ? [{ op: 'trash_page' as const, folder_id: block.ref_folder_id }] : []),
    ]),
    ...restored.blocks.filter((block) => JSON.stringify(old.get(block.id)) !== JSON.stringify(block)).map((block) => ({ op: 'put_block' as const, ...block })),
    { op: 'set_outline' as const, items: restored.items },
  ]
}
