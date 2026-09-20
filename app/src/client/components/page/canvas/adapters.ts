import type { PartialBlock } from '@blocknote/core'
import type { PageBlockKind, PageView } from '../../../../shared/pages.js'
import { MAX_SECTION_DEPTH, RICH_TEXT_BLOCK_KINDS, STRUCTURED_BLOCK_KINDS, isListKind } from '../../../../shared/page-document.js'
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
export function dehydrateCanvas(blocks: readonly CanvasBlock[], columnWidth: number, folderRefs: ReadonlyMap<string, string>): CanvasDocument {
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
        /* Only over the paragraph this editor drew the reference as, which is
           the same test the structured carry below makes: a block the person
           has deliberately retyped as a heading or an image is a conversion
           they asked for, and restoring the relation onto it would undo a
           gesture rather than preserve one. The map answering that question
           has to follow the server rather than the page the editor was
           hydrated from, or the conversion is reverted one save later;
           `FolderCanvas` carries why, and AC-663 pins it.

           **`rich_content` goes with the kind, and on this kind it costs
           something.** `page_blocks_rich_content_check` and `put_block` both
           refuse rich content on a `folder_ref`, so a reference keeps its
           words and loses its runs: bold and italic are dropped, and a second
           link typed inside it is dropped with them. `hydrateCanvas` then
           draws the whole remaining string as one link to the folder, so a
           reference typed as "Design notes **urgent**[elsewhere](…)" comes
           back as "Design notes urgentelsewhere" under a single folder link.
           That is a real loss and it is still the ruling, because the
           alternative is not a better projection but a 422: the database
           refuses the column on this kind, and a save that will not save is
           worse than a style that will not survive — the same direction the
           structured carry below argues at length. On `main` those runs
           survived and the relation did not, which is this loss pointed the
           other way. AC-665 pins it, with two runs and a style. */
        const reference = block.type === 'paragraph' ? folderRefs.get(block.id) ?? null : null
        result.blocks.push({ id: block.id, block_kind: block.type === 'heading' ? 'section' : image ? 'image' : reference !== null ? 'folder_ref' : 'paragraph', text: image ? block.props.caption : runs.map((run) => run.text).join(''), rich_content: image || reference !== null ? null : { version: 1, runs }, file_id: fileId, ref_folder_id: reference, width_pct: image ? Math.max(25, Math.min(100, Math.round((block.props.previewWidth || columnWidth) / columnWidth * 100))) : null, checked: null })
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
tick and its list parent across a save. Every case the server would refuse is
handled rather than restored: if the list parent is gone from the document, or
no longer precedes this item, or is no longer a list item at all, the child is
promoted to the top level, exactly as ON DELETE SET NULL would leave it. That
direction is not a preference. A save this editor makes that `applyDocument`
refuses is worse than the nesting the restore was protecting, because
`CanvasWriter.flush` latches `failed` on a refusal and nothing the person types
after it is ever sent again; losing one list's indentation is recoverable by
re-indenting, and a page that will not save is not recoverable at all.

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
  const blocks = after.blocks.map((block) => {
    const previous = old.get(block.id)
    return previous && block.block_kind === 'paragraph' && UNEXPRESSED.has(previous.block_kind)
      ? { ...block, block_kind: previous.block_kind, rich_content: RICH_TEXT.has(previous.block_kind) ? block.rich_content : null, checked: previous.checked }
      : block
  })
  const kept = new Map(blocks.map((block) => [block.id, block]))
  const placed = new Map(after.items.map((item) => [item.id, item]))
  const nested = new Map(before.items.map((item) => [item.id, item.list_parent_block_id]))
  /*
  A restored list parent is written into the outline the save sends, so it has
  to satisfy every rule `applyDocument` states about one. The four conditions
  below are that function's own, read off this outline the way it reads that
  one, each against the document *after* restoration because that is what the
  server will be given:

  - the item is still a list item, which `isListKind` answers and nothing else
    may (`page-document.ts`'s "Only a bullet, numbered or checklist item is a
    nested list item"). **This one is unreachable while
    `page_blocks_list_parent_kind_check` holds** — the database cannot store a
    list parent on any other kind, so `before` cannot carry one to restore — and
    it is written anyway so that all three of the server's list rules are read
    off one function here rather than two of them being;
  - the parent is still a list item too, after this same pass has restored the
    kinds — retyping a bullet as a heading is one editor gesture and leaves the
    child naming a `section`;
  - the parent appears **earlier in this outline**, which is the server's whole
    cycle rule and is what Move up on a nested item breaks by putting the child
    above its parent;
  - and the parent shares this item's Section, because a list inside two
    Sections is one no reader can draw.

  `isListKind` is imported rather than restated: it is the written-once test the
  server uses, and a fifth list kind added to 4.17 must move both ends at once.
  */
  const earlier = new Set<string>()
  const items = after.items.map((item) => {
    const restored = ((): CanvasPlacement => {
      if (item.list_parent_block_id !== null || !isListKind(kept.get(item.id)?.block_kind ?? '')) return item
      const parent = nested.get(item.id) ?? null
      if (parent === null) return item
      const keeps = earlier.has(parent)
        && isListKind(kept.get(parent)?.block_kind ?? '')
        && placed.get(parent)?.section_block_id === item.section_block_id
      return keeps ? { ...item, list_parent_block_id: parent } : item
    })()
    earlier.add(item.id)
    return restored
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
