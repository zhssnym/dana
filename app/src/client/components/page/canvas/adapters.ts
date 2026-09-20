import type { PartialBlock } from '@blocknote/core'
import type { PageBlockKind, PageView } from '../../../../shared/pages.js'
import { MAX_SECTION_DEPTH, RICH_TEXT_BLOCK_KINDS, STRUCTURED_BLOCK_KINDS } from '../../../../shared/page-document.js'
import type { CanvasBlock, canvasSchema } from './schema.js'

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

function contentOf(text: string | null, rich?: { version: 1; runs: RichRun[] } | null): CanvasInput['content'] {
  if (!rich) return text ?? ''
  return rich.runs.map((run) => {
    const node = { type: 'text' as const, text: run.text, styles: { ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}) } }
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
  const parents = new Map(page.task_placements?.map((task) => [task.id, task.section_block_id]) ?? [])
  const levels = new Map<string, number>()
  const nodes = new Map<string, CanvasInput>()
  for (const item of page.items) {
    if (item.kind === 'task') {
      nodes.set(item.id, { id: item.id, type: 'danaTask', props: { taskId: item.id }, children: [] })
      continue
    }
    const block = records.get(item.id)
    if (!block) throw new Error('The page contains an unavailable block. Reload before editing.')
    parents.set(block.id, block.section_block_id)
    if (block.kind === 'section') {
      const level = Math.min(block.section_block_id === null ? 1 : (levels.get(block.section_block_id) ?? 0) + 1, MAX_SECTION_DEPTH)
      levels.set(block.id, level)
      nodes.set(block.id, { id: block.id, type: 'heading', props: { level, isToggleable: true }, content: contentOf(block.text, block.rich_content), children: [] })
    } else if (block.kind === 'image') nodes.set(block.id, { id: block.id, type: 'image', props: { url: block.file_id ? `/api/v1/files/${block.file_id}` : '', caption: block.text ?? '', previewWidth: columnWidth * (block.width_pct ?? 100) / 100 }, children: [] })
    else if (block.kind === 'folder_ref') nodes.set(block.id, { id: block.id, type: 'paragraph', content: [{ type: 'link', href: `/app/folders/${block.ref_folder_id}`, content: block.text ?? 'Open folder' }], children: [] })
    else nodes.set(block.id, { id: block.id, type: 'paragraph', content: contentOf(block.text, block.rich_content), children: [] })
  }
  const root: CanvasInput[] = []
  for (const item of page.items) {
    const node = nodes.get(item.id)!
    const parentId = parents.get(item.id) ?? null
    if (parentId === null) root.push(node)
    else {
      const parent = nodes.get(parentId)
      if (parent?.type !== 'heading') throw new Error('The page has an invalid group. Its content has been preserved; reload before editing.')
      parent.children!.push(node)
    }
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
  }
  return runs
}

/** Per-record projection, independent of the editor's JSON serialization. */
export function dehydrateCanvas(blocks: readonly CanvasBlock[], columnWidth: number): CanvasDocument {
  const result: CanvasDocument = { blocks: [], items: [] }
  function visit(children: readonly CanvasBlock[], parent: string | null): void {
    for (const block of children) {
      const task = block.type === 'danaTask'
      result.items.push({ kind: task ? 'task' : 'block', id: task ? block.props.taskId : block.id, section_block_id: parent, list_parent_block_id: null })
      if (!task) {
        const runs = richRuns(block)
        const image = block.type === 'image'
        const fileId = image ? /(?:^|\/)api\/v1\/files\/([0-9a-f-]{36})$/i.exec(block.props.url)?.[1] ?? null : null
        if (image && block.props.url && !fileId) throw new Error('Upload this image to Dana before saving. External image URLs are not supported.')
        result.blocks.push({ id: block.id, block_kind: block.type === 'heading' ? 'section' : image ? 'image' : 'paragraph', text: image ? block.props.caption : runs.map((run) => run.text).join(''), rich_content: image ? null : { version: 1, runs }, file_id: fileId, ref_folder_id: null, width_pct: image ? Math.max(25, Math.min(100, Math.round((block.props.previewWidth || columnWidth) / columnWidth * 100))) : null, checked: null })
      }
      visit(block.children, block.type === 'heading' ? block.id : parent)
    }
  }
  visit(blocks, null)
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

/*
This build's editor draws every #219 structured kind as an ordinary paragraph
and expresses no list nesting, because the BlockNote half of #219 is the
frontend phase. Saving must therefore not read that rendering as a conversion:
a page holding a nested checklist would otherwise come back as flat paragraphs
with their ticks gone, which is silent loss rather than a refusal.

So a block whose stored kind this editor cannot express keeps that kind, its
tick and its list parent across a save. The dangling case is handled rather
than refused: if the list parent itself is gone from the document, the child is
promoted to the top level, exactly as ON DELETE SET NULL would leave it, so
deleting a list parent cannot leave a document that will never save again.

Every line of this disappears when the frontend phase teaches the editor the
real vocabulary; until then it is what keeps the intermediate state lossless.
*/
const UNEXPRESSED = new Set<string>(STRUCTURED_BLOCK_KINDS)
/**
 * Rich content belongs to the kind, so restoring a kind restores the rule that
 * travels with it: `put_block` refuses rich content on a kind outside
 * `RICH_TEXT_BLOCK_KINDS`, and `page_blocks_rich_content_check` says the same
 * in the database. Derived from the shared constant rather than written as
 * "except code" — `code` is the only kind outside it today, and a seventh kind
 * added to 4.17 must not need this file edited before a page holding one can
 * be saved.
 */
const RICH_TEXT = new Set<string>(RICH_TEXT_BLOCK_KINDS)

/**
 * `after` as it should be written, given that `before` is what is stored.
 *
 * Restoring a kind restores everything the kind decides: its tick, its list
 * parent, and whether it may carry rich content at all. Dropping that last one
 * is how the first draft of this guard would have turned silent loss into a
 * page that answers 422 on every save forever, `dehydrateCanvas` putting a
 * text projection on every non-image block including the ones the contract
 * refuses it on.
 */
export function restoreCanvas(before: CanvasDocument, after: CanvasDocument): CanvasDocument {
  const old = new Map(before.blocks.map((block) => [block.id, block]))
  const ids = new Set(after.blocks.map((block) => block.id))
  const blocks = after.blocks.map((block) => {
    const previous = old.get(block.id)
    return previous && block.block_kind === 'paragraph' && UNEXPRESSED.has(previous.block_kind)
      ? { ...block, block_kind: previous.block_kind, rich_content: RICH_TEXT.has(previous.block_kind) ? block.rich_content : null, checked: previous.checked }
      : block
  })
  const kept = new Map(blocks.map((block) => [block.id, block]))
  const items = after.items.map((item) => {
    if (item.list_parent_block_id !== null || !UNEXPRESSED.has(kept.get(item.id)?.block_kind ?? '')) return item
    const parent = before.items.find((candidate) => candidate.id === item.id)?.list_parent_block_id ?? null
    // The parent must still exist and must still share this item's Section; the
    // server refuses a list that spans two Sections, and dragging one item out
    // of a Section is a gesture this editor can make while nesting is not.
    const stays = after.items.find((candidate) => candidate.id === parent)
    return parent !== null && ids.has(parent) && stays?.section_block_id === item.section_block_id
      ? { ...item, list_parent_block_id: parent }
      : item
  })
  return { blocks, items }
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
