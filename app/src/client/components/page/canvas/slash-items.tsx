/*
The one slash menu, for every canvas: a Folder's Work, Purpose and Results, a
Task body and a Shelf. Each canvas renders `<CanvasSlashMenu>` with the surface
it is; what a surface offers is what its server stores:

- `work` (Folder Main): "Heading n" is a Section (it groups Tasks, and folds)
  where a Section of that level stands, and a presentation heading anywhere
  else; "Toggle heading n" is a presentation heading that folds, as on a
  document. Task and Page (a sub-page, Wave 2) are offered. Purpose and Results are facet documents,
  where the server stores no page, so Page is Work's alone.
- `document` (Purpose, Results): flat headings, and toggle headings 1-3 (a
  heading that folds the blocks nested under it); no Task, no Section.
- `plain` (a facet with no headings).
- `shelf`: one heading level, stored flat; no toggle list.
- `task`: the Task composer's own schema (callout and divider; no toggle
  list), with toggle headings as on a document. Subtask is offered: the line
  joins the Task's subtasks, as Task turns a Work line into a Task.
- `post`: a discussion post; a document without toggle headings (the post
  contract has none).

No To-do list anywhere: Task covers it and people took one for the other. A
to-do already stored still renders and turns into anything (`turn-into.ts`).
Toggle heading 1-3 are found by typing ("toggle", "th1"), not listed, as in
Notion. Each row is an icon box, the name, and the markdown shortcut that makes
the same block on this surface, muted on the right.

Every surface nests any block under a writing block (0038); Tab does it.

Typed turn-into: `/turn h1`, `/turn toggle`, `/turnbullet` convert the block
the cursor is in, keeping its text, and its children where the target holds
them (otherwise they follow it). Cmd/Ctrl+/ opens the same list for the block.
*/
import { useEffect, useMemo, useRef } from 'react'
import type { JSX } from 'react'
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useComponentsContext } from '@blocknote/react'
import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react'
import { SuggestionMenu, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'

import { CheckCircle2, Code, FileText, Flag, Heading1, Heading2, Heading3, IconMotion, Image as ImageIcon, Lightbulb, Link2, List, ListCollapse, ListOrdered, Minus, Network, Quote, Type } from '../../../lib/icons.js'
import type { LucideIcon } from '../../../lib/icons.js'
import './slash-menu.css'
import { linkSlashItem } from '../../links/dana-link-picker.js'
import { folderMark } from '../../../parts/presenters.js'
import { openOnCreate, pendingPages } from './adapters.js'
import { placeSection, sectionPlace } from './commands.js'
import { TOGGLE_HEADING_SURFACES, TOGGLE_SURFACES, bindCanvasSurface, bindResultCanvas, offersResults, surfaceOf } from './markdown.js'
import { shelfOutlineFailure, validateCanvasOutline } from './outline.js'
import { TEXT_TYPES, TURN_TARGETS, isCurrent, simulate } from './turn-into.js'
import { turnBlocksInto } from './BlockSideMenu.js'
import { blockSelection, setBlockSelection } from './block-selection.js'
import type { TreeBlock, TurnKey, TurnTarget } from './turn-into.js'
import type { CanvasSurfaceKind } from './markdown.js'
import type { CanvasEditor } from './schema.js'

export type { CanvasSurfaceKind } from './markdown.js'

export interface SlashContext {
  readonly surface: CanvasSurfaceKind
  /** Folder Work only: the canvas's own Task creation. */
  readonly onCreateTask?: () => void
  /** Task only: the line becomes a subtask (#221: a Task's to-do is a Step). */
  readonly onCreateSubtask?: () => void
  /** False where no file can be stored (a Task outside a Folder). */
  readonly media?: boolean
  /** The Results tab alone offers Result (#213). */
  readonly results?: boolean
}

type Item = DefaultReactSuggestionItem & {
  readonly group: 'Basic blocks' | 'Media' | 'Dana' | 'Turn into'
  /** The markdown shortcut that makes the same block here, shown muted. */
  readonly hint?: string
  /** Listed only once something is typed (Notion's toggle headings). */
  readonly searchOnly?: boolean
}
type AnyEditor = CanvasEditor

const TURN_TRIGGER = '⁣turn'
/** What the sidebar names a new page (`app-sidebar.tsx`). */
const NEW_PAGE_TITLE = 'Untitled'

const has = (editor: AnyEditor, type: string): boolean => type in editor.schema.blockSchema

/* ------------------------------------------------------------ turn into */

/* The targets are the block menu's own (`turn-into.ts`), so the typed `/turn …`
   list and the ⋮⋮ menu's Turn into cannot disagree; only the words that find
   each one live here. */
const TURN_ALIASES: Record<TurnKey, readonly string[]> = {
  text: ['text', 'paragraph', 'plain', 'p'],
  h1: ['h1', '#', 'heading 1', 'title'],
  h2: ['h2', '##', 'heading 2', 'subheading'],
  h3: ['h3', '###', 'heading 3'],
  th1: ['toggle heading 1', 'toggle h1', 'toggleh1'],
  th2: ['toggle heading 2', 'toggle h2', 'toggleh2'],
  th3: ['toggle heading 3', 'toggle h3', 'toggleh3'],
  toggle: ['toggle', '>', 'collapsible', 'details'],
  bullet: ['bullet', 'bulleted', 'ul', '-', '*', 'unordered'],
  numbered: ['num', 'numbered', 'ol', '1.', 'ordered'],
  quote: ['quote', 'blockquote', '"'],
  callout: ['callout', 'note', 'tip'],
  code: ['code', '```', 'snippet'],
  result: ['result', 'outcome', 'finding', 'deliverable'],
}
/** One icon family (Lucide), one size, for every block kind the menus name. */
const HEADING_ICONS: Record<1 | 2 | 3, LucideIcon> = { 1: Heading1, 2: Heading2, 3: Heading3 }
const KIND_ICONS: Record<string, LucideIcon> = {
  paragraph: Type, bulletListItem: List, numberedListItem: ListOrdered, toggleListItem: ListCollapse,
  quote: Quote, callout: Lightbulb, codeBlock: Code, divider: Minus, result: Flag,
}
const glyph = (Icon: LucideIcon): JSX.Element => <Icon aria-hidden="true" />
function kindIcon(type: string, level?: 1 | 2 | 3): JSX.Element | undefined {
  const Icon = type === 'heading' ? HEADING_ICONS[level ?? 1] : KIND_ICONS[type]
  return Icon === undefined ? undefined : glyph(Icon)
}

/** How a surface stores a heading: a Section (`true`) or a presentation
 * heading (`false`; the Task composer's headings are presentation too). */
function headingTogglesOf(surface: CanvasSurfaceKind): boolean {
  return surface === 'work' || surface === 'shelf'
}

/**
 * How `block` becomes `target` here: `true` a Section, `false` a presentation
 * heading, `undefined` where the surface has one kind. A Work heading is a
 * Section where one of that level stands, and a presentation heading elsewhere.
 */
export function headingTogglesFor(editor: AnyEditor, block: TreeBlock, target: TurnTarget): boolean {
  const surface = surfaceOf(editor)
  if (surface !== 'work' || target.type !== 'heading' || target.toggle === true) return headingTogglesOf(surface)
  const section = simulate(editor.document as unknown as TreeBlock[], block.id, target, true)
  return validateCanvasOutline(section) === null
}

/** Every heading as a presentation heading (the Task surface's only kind). */
function presentationOnly(blocks: readonly TreeBlock[]): TreeBlock[] {
  return blocks.map((block) => ({ ...block, props: block.type === 'heading' ? { ...block.props, presentation: true } : block.props, children: presentationOnly(block.children) }))
}

/** The targets this block may become here: offered only when the result is a shape the page stores. */
export function turnTargetsFor(editor: AnyEditor, block: TreeBlock): TurnTarget[] {
  if (!TEXT_TYPES.has(block.type) && block.type !== 'toggleListItem') return []
  const surface = surfaceOf(editor)
  const document = editor.document as unknown as TreeBlock[]
  return TURN_TARGETS.filter((target) => {
    const toggles = headingTogglesFor(editor, block, target)
    if (!has(editor, target.type) || isCurrent(block, target)) return false
    if (target.type === 'result' && !offersResults(editor)) return false
    if (target.type === 'heading' && (surface === 'plain' || (surface === 'shelf' && target.level !== 1))) return false
    if (target.type === 'toggleListItem' && !TOGGLE_SURFACES.has(surface)) return false
    if (target.toggle === true && !TOGGLE_HEADING_SURFACES.has(surface)) return false
    const simulated = simulate(document, block.id, target, toggles)
    // A Task has no Sections: a heading pasted in with a fold but no
    // `presentation` (HTML <details>) is still a presentation heading there.
    const next = surface === 'task' ? presentationOnly(simulated) : simulated
    return validateCanvasOutline(next) === null && !(surface === 'shelf' && shelfOutlineFailure(next))
  })
}

/** The ⋮⋮ menu's Turn into: `turnTargetsFor`, plus the block's own kind (checked). */
export function blockMenuTargets(editor: AnyEditor, block: TreeBlock): TurnTarget[] {
  const own = turnTargetsFor(editor, block)
  if (!TEXT_TYPES.has(block.type) && block.type !== 'toggleListItem') return own
  return TURN_TARGETS.filter((target) => isCurrent(block, target) || own.some((allowed) => allowed.key === target.key))
}

/* Cmd/Ctrl+/ over picked blocks (`block-selection.ts`): the list is for all of
   them, opened at the end of the first one's text, and they stay picked. */
const turnScope = new WeakMap<object, readonly string[]>()

function turnItems(editor: AnyEditor): Item[] {
  const scope = turnScope.get(editor)
  const ids = scope ?? [editor.getTextCursorPosition().block.id]
  const blocks = ids.flatMap((id) => { const block = editor.getBlock(id) as TreeBlock | undefined; return block !== undefined && (TEXT_TYPES.has(block.type) || block.type === 'toggleListItem') ? [block] : [] })
  const own = blocks.map((block) => turnTargetsFor(editor, block))
  // A kind every picked block may become (or already is), and not all already are.
  const targets = TURN_TARGETS.filter((target) =>
    blocks.length > 0 &&
    blocks.every((block, index) => own[index]!.some((allowed) => allowed.key === target.key) || isCurrent(block, target)) &&
    blocks.some((block) => !isCurrent(block, target)))
  return targets.map((target) => ({
    title: target.title,
    aliases: [...TURN_ALIASES[target.key]],
    icon: kindIcon(target.type, target.level),
    group: 'Turn into',
    onItemClick: () => {
      turnScope.delete(editor)
      turnBlocksInto(editor, blocks.map((block) => block.id), target, (block) => headingTogglesFor(editor, block, target))
      if (scope !== undefined && scope.every((id) => editor.getBlock(id) !== undefined)) setBlockSelection(editor, scope)
    },
  }))
}

/* ------------------------------------------------------------ insert */

export function canvasSlashItems(editor: AnyEditor, context: SlashContext): Item[] {
  const { surface, onCreateTask, onCreateSubtask, media = true, results = false } = context
  const defaults = getDefaultReactSlashMenuItems(editor)
  const byKey = (key: string): DefaultReactSuggestionItem | undefined => defaults.find((item) => 'key' in item && item.key === key)
  const items: Item[] = []
  const add = (group: Item['group'], title: string, aliases: readonly string[], onItemClick: () => void, icon?: JSX.Element, extra: { hint?: string; searchOnly?: boolean } = {}): void => {
    items.push({ title, aliases: [...aliases], group, icon, onItemClick, ...extra })
  }
  const insert = (type: string, props: Record<string, unknown> = {}) => (): void => {
    insertOrUpdateBlockForSlashMenu(editor, { type, props } as never)
    editor.focus()
  }

  /* #213: a native Result, made only on purpose — ordinary writing on Results
     stays writing. First on the tab that exists for it. */
  if (results && has(editor, 'result')) add('Basic blocks', 'Result', ['result', 'outcome', 'finding', 'deliverable'], insert('result'), glyph(Flag))
  add('Basic blocks', 'Text', ['text', 'paragraph', 'plain', 'p'], insert('paragraph'), kindIcon('paragraph'))

  // Headings, by what the surface stores.
  if (surface === 'work') {
    const canvas = editor
    const cursor = canvas.getTextCursorPosition().block
    // The line as it will be once the menu clears its `/query`: empty, it
    // becomes the Section; written, the Section follows it.
    const written = Array.isArray(cursor.content) ? cursor.content.map((run) => run.type === 'text' ? run.text : '*').join('') : '*'
    const empty = written.replace(/\/[^/]*$/, '').trim() === ''
    for (const level of [1, 2, 3] as const) {
      // A Section where one of this level may stand, exactly as `#` makes one
      // (`markdown.ts`); a presentation heading elsewhere.
      const section = sectionPlace(canvas.document, cursor, level, !empty) !== null
      add('Basic blocks', `Heading ${level}`, [`h${level}`, '#'.repeat(level), 'title', 'heading', ...(section ? ['section'] : [])], section ? () => {
        // The query is already cleared: an empty line becomes the Section.
        const block = canvas.getTextCursorPosition().block
        placeSection(canvas, block, level, Array.isArray(block.content) && block.content.length === 0)
      } : insert('heading', { level, isToggleable: false, presentation: false }), kindIcon('heading', level), { hint: '#'.repeat(level) })
    }
  } else if (surface === 'shelf') {
    add('Basic blocks', 'Heading 1', ['h1', '#', 'title', 'heading'], insert('heading', { level: 1, isToggleable: true }), kindIcon('heading', 1), { hint: '#' })
  } else if (surface !== 'plain') {
    for (const level of [1, 2, 3] as const) {
      add('Basic blocks', `Heading ${level}`, [`h${level}`, '#'.repeat(level), 'title', 'heading'], insert('heading', { level, isToggleable: false, presentation: false }), kindIcon('heading', level), { hint: '#'.repeat(level) })
    }
  }
  /*
  The arrow wrapper is load-bearing. `SuggestionMenuController` calls
  `item.onItemClick(editor)` although the type says `() => void`, so handing
  `onCreateTask` itself gave it the editor as its optional block (#204, #234).
  Task answers "todo" and "checkbox" too: it is what a to-do became, and it
  sits right under Text and the headings, as a to-do does in Notion.
  */
  if (surface === 'work' && onCreateTask !== undefined) add('Basic blocks', 'Task', ['task', 'todo', 'to-do', 'checkbox', 'action', '[]'], () => { onCreateTask() }, glyph(CheckCircle2), { hint: '[]' })
  // Inside a Task the to-do is a subtask, one list above the writing (#221).
  if (surface === 'task' && onCreateSubtask !== undefined) add('Basic blocks', 'Subtask', ['subtask', 'step', 'todo', 'to-do', 'checkbox', '[]'], () => { onCreateSubtask() }, glyph(CheckCircle2), { hint: '[]' })
  /* A sub-page: its folder is created by the next save (`create_page`), with
     the title the sidebar gives a new page, and then opens with that title
     selected to be typed over (`FolderCanvas`), as Notion opens a new page. */
  if (surface === 'work' && has(editor, 'danaPage')) {
    const PageIcon = folderMark(undefined).icon
    add('Basic blocks', 'Page', ['page', 'subpage', 'sub-page'], () => {
      const folderId = crypto.randomUUID()
      pendingPages.set(folderId, NEW_PAGE_TITLE)
      openOnCreate.add(folderId)
      const current = editor.getTextCursorPosition().block
      const empty = current.type === 'paragraph' && Array.isArray(current.content) && current.content.length === 0 && current.children.length === 0
      // A fresh block id: a block the page already stored cannot become a page.
      editor.insertBlocks([{ id: crypto.randomUUID(), type: 'danaPage', props: { folderId } }], current, empty ? 'before' : 'after')
      editor.focus()
    }, glyph(PageIcon))
  }
  const toggles = has(editor, 'toggleListItem') && TOGGLE_SURFACES.has(surface)
  add('Basic blocks', 'Bulleted list', ['bullet', 'bulleted', '-', '*', 'ul', 'unordered'], insert('bulletListItem'), kindIcon('bulletListItem'), { hint: '-' })
  add('Basic blocks', 'Numbered list', ['num', 'numbered', '1.', 'ol', 'ordered'], insert('numberedListItem'), kindIcon('numberedListItem'), { hint: '1.' })
  if (toggles) add('Basic blocks', 'Toggle list', ['toggle', '>', 'collapsible', 'details'], insert('toggleListItem'), kindIcon('toggleListItem'), { hint: '>' })
  // A heading that folds the blocks nested under it (stored with `toggleable`),
  // found by typing: Notion does not list them either.
  if (TOGGLE_HEADING_SURFACES.has(surface)) {
    for (const level of [1, 2, 3] as const) {
      add('Basic blocks', `Toggle heading ${level}`, [`toggle heading ${level}`, `toggle h${level}`, `toggleh${level}`, `th${level}`, 'toggle', 'collapsible'], insert('heading', { level, isToggleable: true, presentation: true }), kindIcon('heading', level), { searchOnly: true })
    }
  }
  // `>` is the toggle list's where there is one, and the quote's elsewhere (`markdown.ts`).
  add('Basic blocks', 'Quote', ['quote', 'blockquote', '"'], insert('quote'), kindIcon('quote'), { hint: toggles ? '"' : '>' })
  if (has(editor, 'callout')) add('Basic blocks', 'Callout', ['callout', 'note', 'tip', 'info'], insert('callout'), kindIcon('callout'))
  if (has(editor, 'divider')) add('Basic blocks', 'Divider', ['div', 'divider', '---', 'hr', 'line', 'separator'], insert('divider'), kindIcon('divider'), { hint: '---' })
  if (has(editor, 'codeBlock')) add('Basic blocks', 'Code', ['code', '```', 'snippet'], byKey('code_block')?.onItemClick ?? insert('codeBlock'), kindIcon('codeBlock'), { hint: '```' })

  if (media) {
    const image = byKey('image')
    const file = byKey('file')
    // Upstream's items open the file panel on the new block (`CanvasFilePanel`).
    // Media is one command (#220): an empty image block whose chosen file
    // decides image, audio or video. File is the generic attachment.
    if (image !== undefined) add('Media', 'Media', ['media', 'img', 'image', 'picture', 'photo', 'audio', 'sound', 'music', 'video', 'movie'], () => { image.onItemClick() }, glyph(ImageIcon))
    if (file !== undefined) add('Media', 'File', ['file', 'attachment', 'upload', 'document'], () => { file.onItemClick() }, glyph(FileText))
  }

  if (has(editor, 'diagram')) add('Dana', 'Diagram', ['diagram', 'flowchart', 'mermaid', 'chart'], insert('diagram'), glyph(Network))
  const link = linkSlashItem(editor)
  add('Dana', link.title, ['link', 'mention', 'reference', '@', 'page'], link.onItemClick, glyph(Link2))
  return items
}

/* ------------------------------------------------------------ filter */

function score(item: Item, query: string): number {
  const title = item.title.toLowerCase()
  const words = [title, ...(item.aliases ?? []).map((alias) => alias.toLowerCase())]
  if (words.includes(query)) return 100
  if (title.startsWith(query)) return 80
  if (words.some((word) => word.startsWith(query))) return 70
  if (title.split(/\s+/).some((word) => word.startsWith(query))) return 60
  if (words.some((word) => word.includes(query))) return 40
  const compact = query.replace(/\s+/g, '')
  // A subsequence ("hd2", "bltd") still finds its item, last.
  const subsequence = (word: string): boolean => { let at = 0; for (const char of word) if (char === compact[at]) at += 1; return at === compact.length }
  return compact.length > 1 && words.some((word) => subsequence(word.replace(/\s+/g, ''))) ? 10 : 0
}

/** Rank by closeness; group headers only while nothing has been typed. */
export function filterSlashItems(items: readonly Item[], raw: string): DefaultReactSuggestionItem[] {
  const query = raw.trim().toLowerCase()
  if (query === '') return items.filter((item) => item.searchOnly !== true).map((item) => ({ ...item, size: 'small' as const }))
  return items
    .map((item, index) => ({ item, index, score: score(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => ({ ...item, group: undefined, size: 'small' as const }))
}

/** `/turn …`, `/turnbullet`: the rest of the query picks the target. */
function turnQuery(query: string): string | null {
  const match = /^\s*turn(?:\s+into)?\s*(.*)$/i.exec(query)
  return match === null ? null : match[1] ?? ''
}

export function slashItemsFor(editor: AnyEditor, context: SlashContext, query: string): DefaultReactSuggestionItem[] {
  const turn = turnQuery(query)
  if (turn !== null) {
    const found = filterSlashItems(turnItems(editor), turn)
    return found.map((item) => ({ ...item, title: `Turn into ${item.title.charAt(0).toLowerCase()}${item.title.slice(1)}` }))
  }
  return filterSlashItems(canvasSlashItems(editor, context), query)
}

/* ------------------------------------------------------------ menu */

/*
A query that matches nothing says "No results" (one muted row) and keeps the
menu open while the person may still be mistyping; it closes after a space or
NO_RESULT_KEYS more keys. BlockNote closes its own menu three keys after the
last query that had rows, which read as a menu closing on its own, so a miss
answers one marker row (never picked: Enter closes the menu, keeping the
text) and the closing is ours.
*/
const NO_RESULT_KEYS = 5
const NO_RESULTS = 'No results'
const misses = new WeakMap<object, number>()

function isNoResults(item: DefaultReactSuggestionItem): boolean {
  return (item as { noResults?: boolean }).noResults === true
}

function withNoResults(editor: AnyEditor, query: string, items: DefaultReactSuggestionItem[]): DefaultReactSuggestionItem[] {
  if (items.length > 0 || query.trim() === '') { misses.delete(editor); return items }
  const first = misses.get(editor) ?? query.length
  misses.set(editor, Math.min(first, query.length))
  if (query.endsWith(' ') || query.length - first >= NO_RESULT_KEYS) {
    misses.delete(editor)
    editor.getExtension(SuggestionMenu)?.closeMenu()
    return []
  }
  return [{ title: NO_RESULTS, onItemClick: () => {}, size: 'small', noResults: true } as DefaultReactSuggestionItem]
}

/*
One row: a fixed icon box, the name, and the shortcut hint, on one centre line
(`slash-menu.css`). Upstream's item copies its class onto the icon and label
wrappers too, which is how the old rows' icons and labels drifted apart, so
the row is drawn here; the controller still owns the keys and the choice.
*/
function SlashRow({ item, index, selected, onPick }: { readonly item: DefaultReactSuggestionItem & { hint?: string }; readonly index: number; readonly selected: boolean; readonly onPick: () => void }): JSX.Element {
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => { if (selected) row.current?.scrollIntoView({ block: 'nearest' }) }, [selected])
  return <div
    ref={row}
    id={`bn-suggestion-menu-item-${index}`}
    role="option"
    aria-selected={selected || undefined}
    className="dana-slash-row"
    onMouseDown={(event) => { event.preventDefault() }}
    onClick={onPick}
  >
    <span className="dana-slash-icon" aria-hidden="true">{item.icon}</span>
    <span className="dana-slash-name">{item.title}</span>
    {item.hint === undefined ? null : <kbd className="dana-slash-hint">{item.hint}</kbd>}
  </div>
}

/** The canvas's menu, grouped, saying "No results" for a miss. */
function CanvasSuggestionList(props: SuggestionMenuProps<DefaultReactSuggestionItem>): JSX.Element {
  const Components = useComponentsContext()!
  const { items, selectedIndex, onItemClick, loadingState } = props
  const rows: JSX.Element[] = []
  let group: string | undefined
  if (items.length === 1 && isNoResults(items[0]!)) {
    return <Components.SuggestionMenu.Root id="bn-suggestion-menu" className="bn-suggestion-menu dana-slash-menu">
      <div className="dana-slash-empty">{NO_RESULTS}</div>
    </Components.SuggestionMenu.Root>
  }
  items.forEach((item, index) => {
    if (item.group !== undefined && item.group !== group) {
      group = item.group
      rows.push(<div className="dana-slash-group" role="presentation" key={`group-${group}`}>{group}</div>)
    }
    rows.push(<SlashRow item={item} index={index} selected={index === selectedIndex} key={item.title} onPick={() => onItemClick?.(item)} />)
  })
  return <Components.SuggestionMenu.Root id="bn-suggestion-menu" className="bn-suggestion-menu dana-slash-menu">
    <IconMotion enabled={false}>{rows}</IconMotion>
    {rows.length === 0 && loadingState !== 'loading-initial'
      ? <div className="dana-slash-empty">{NO_RESULTS}</div>
      : null}
  </Components.SuggestionMenu.Root>
}

/** The slash menu and the Cmd/Ctrl+/ Turn into menu, for one canvas. */
export function CanvasSlashMenu({ editor, context }: { readonly editor: AnyEditor; readonly context: SlashContext }): JSX.Element {
  const { surface, results = false } = context
  useEffect(() => bindCanvasSurface(editor, surface), [editor, surface])
  useEffect(() => results ? bindResultCanvas(editor) : undefined, [editor, results])
  useEffect(() => {
    const open = (event: KeyboardEvent): void => {
      // Enter on "No results" closes the menu and keeps what was typed.
      if (event.key === 'Enter' && misses.has(editor) && editor.getExtension(SuggestionMenu)?.store.state?.show === true) {
        event.preventDefault()
        event.stopPropagation()
        misses.delete(editor)
        editor.getExtension(SuggestionMenu)?.closeMenu()
        return
      }
      if (event.key !== '/' || !(event.metaKey || event.ctrlKey) || event.altKey) return
      const picked = blockSelection(editor)
      if (picked.length > 0) {
        // Picked blocks: the same list, for all of them, opened at the first one's text.
        const anchor = picked.find((id) => Array.isArray(editor.getBlock(id)?.content))
        if (anchor === undefined) return
        event.preventDefault()
        event.stopPropagation()
        turnScope.set(editor, picked)
        editor.setTextCursorPosition(anchor, 'end')
      } else {
        const root = editor.domElement
        if (root === undefined || !(event.target instanceof Node) || !root.contains(event.target)) return
        const block = editor.getTextCursorPosition().block
        if (!Array.isArray(block.content) && block.type !== 'codeBlock') return
        event.preventDefault()
        turnScope.delete(editor)
      }
      editor.getExtension(SuggestionMenu)?.openSuggestionMenu(TURN_TRIGGER, { ignoreQueryLength: true })
    }
    // Closed without a choice: the picked blocks are picked again.
    const menus = editor.getExtension(SuggestionMenu)?.store
    const offMenus = menus?.subscribe(({ currentVal }) => {
      if (currentVal?.show === true) return
      misses.delete(editor)
      window.setTimeout(() => {
        const scope = turnScope.get(editor)
        turnScope.delete(editor)
        if (scope !== undefined && scope.every((id) => editor.getBlock(id) !== undefined)) setBlockSelection(editor, scope)
      }, 0)
    })
    document.addEventListener('keydown', open, true)
    return () => { offMenus?.(); document.removeEventListener('keydown', open, true) }
  }, [editor])
  const getItems = useMemo(() => async (query: string) => withNoResults(editor, query, slashItemsFor(editor, context, query)), [editor, context])
  const getTurnItems = useMemo(() => async (query: string) => withNoResults(editor, query, filterSlashItems(turnItems(editor), query)), [editor])
  return <>
    <SuggestionMenuController triggerCharacter="/" getItems={getItems} suggestionMenuComponent={CanvasSuggestionList} />
    <SuggestionMenuController triggerCharacter={TURN_TRIGGER} getItems={getTurnItems} suggestionMenuComponent={CanvasSuggestionList} />
  </>
}
