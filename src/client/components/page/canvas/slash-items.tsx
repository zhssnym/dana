// Work, Doc and Task share writing blocks. Each home adds its own actions.
// A typed `/turn` converts the current block; Cmd/Ctrl+/ opens the same list.
import { useEffect, useMemo, useRef } from 'react'
import type { JSX } from 'react'
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useComponentsContext } from '@blocknote/react'
import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react'
import { SuggestionMenu, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'

import { CheckCircle2, Code, FileText, Flag, Heading1, Heading2, Heading3, IconMotion, Image as ImageIcon, Lightbulb, Link2, List, ListChecks, ListCollapse, ListOrdered, Minus, Network, Quote, Table2, Type, UserRound, Workflow } from '../../../lib/icons.js'
import type { LucideIcon } from '../../../lib/icons.js'
import './slash-menu.css'
import { linkSlashItem } from '../../links/dana-link-picker.js'
import { placeSection, sectionPlace } from './commands.js'
import { TOGGLE_HEADING_SURFACES, TOGGLE_SURFACES, bindCanvasSurface, bindResultCanvas, offersResults, surfaceOf } from './markdown.js'
import { shelfOutlineFailure, validateCanvasOutline } from './outline.js'
import { HEADING_NAMES, TEXT_TYPES, TURN_TARGETS, isCurrent, simulate } from './turn-into.js'
import { turnBlocksInto } from './BlockSideMenu.js'
import { blockSelection, setBlockSelection } from './block-selection.js'
import type { TreeBlock, TurnKey, TurnTarget } from './turn-into.js'
import type { CanvasSurfaceKind } from './markdown.js'
import type { CanvasEditor } from './schema.js'
import type { BlockHome } from '../../../../shared/block-kinds.js'

export type { CanvasSurfaceKind } from './markdown.js'

export interface SlashContext {
  readonly surface: CanvasSurfaceKind
  /** Work only: the canvas's authoritative task creation. */
  readonly onCreateTask?: () => void
  /** Doc and Work pages: a sub-page made here. */
  readonly onCreatePage?: () => void
  /** Task only: opens the Blocked by picker; inserts nothing. */
  readonly onCreateBlocker?: () => void
  /** False where no file can be stored (a task outside a folder). */
  readonly media?: boolean
  /** Only the Results tab offers Result. */
  readonly results?: boolean
}

type Item = DefaultReactSuggestionItem & {
  readonly group: 'Basic blocks' | 'Media' | 'Advanced' | 'Turn into'
  /** The markdown shortcut that makes the same block here, shown muted. */
  readonly hint?: string
}
type AnyEditor = CanvasEditor

const TURN_TRIGGER = '⁣turn'

const has = (editor: AnyEditor, type: string): boolean => type in editor.schema.blockSchema

// The targets are the block menu's own (`turn-into.ts`), so the two lists cannot
// disagree; only the search words live here.
const TURN_ALIASES: Record<TurnKey, readonly string[]> = {
  text: ['text', 'paragraph', 'plain', 'p'],
  h1: ['h1', '#', 'heading 1', 'large heading', 'title'],
  h2: ['h2', '##', 'heading 2', 'medium heading', 'subheading'],
  h3: ['h3', '###', 'heading 3', 'small heading'],
  th1: ['toggle heading 1', 'toggle large heading', 'toggle h1', 'toggleh1'],
  th2: ['toggle heading 2', 'toggle medium heading', 'toggle h2', 'toggleh2'],
  th3: ['toggle heading 3', 'toggle small heading', 'toggle h3', 'toggleh3'],
  toggle: ['toggle', '>', 'collapsible', 'details'],
  bullet: ['bullet', 'bulleted', 'ul', '-', '*', 'unordered'],
  numbered: ['num', 'numbered', 'ol', '1.', 'ordered'],
  quote: ['quote', 'blockquote', '"'],
  callout: ['callout', 'note', 'tip'],
  code: ['code', '```', 'snippet'],
  result: ['result', 'outcome', 'finding', 'deliverable'],
}
const HEADING_ICONS: Record<1 | 2 | 3, LucideIcon> = { 1: Heading1, 2: Heading2, 3: Heading3 }
const KIND_ICONS: Record<string, LucideIcon> = {
  paragraph: Type, bulletListItem: List, numberedListItem: ListOrdered, toggleListItem: ListCollapse,
  quote: Quote, callout: Lightbulb, codeBlock: Code, divider: Minus, result: Flag,
}
const glyph = (Icon: LucideIcon): JSX.Element => <Icon aria-hidden="true" />
/** The icon a block kind wears in every menu that names it (`/`, Turn into). */
export function kindIconOf(type: string, level?: 1 | 2 | 3): LucideIcon | undefined {
  return type === 'heading' ? HEADING_ICONS[level ?? 1] : KIND_ICONS[type]
}
function kindIcon(type: string, level?: 1 | 2 | 3): JSX.Element | undefined {
  const Icon = kindIconOf(type, level)
  return Icon === undefined ? undefined : glyph(Icon)
}

/** How a surface stores a heading: a Section (`true`) or a presentation heading (`false`). */
function headingTogglesOf(surface: CanvasSurfaceKind): boolean {
  return surface === 'work' || surface === 'shelf'
}

/**
 * How `block` becomes `target` here. A Work heading is a Section where one of that
 * level can stand, else a presentation heading.
 */
export function headingTogglesFor(editor: AnyEditor, block: TreeBlock, target: TurnTarget): boolean {
  const surface = surfaceOf(editor)
  if (surface !== 'work' || target.type !== 'heading' || target.toggle === true) return headingTogglesOf(surface)
  const section = simulate(editor.document as unknown as TreeBlock[], block.id, target, true)
  return validateCanvasOutline(section) === null
}

/** Every heading as a presentation heading, the task surface's only kind. */
function presentationOnly(blocks: readonly TreeBlock[]): TreeBlock[] {
  return blocks.map((block) => ({ ...block, props: block.type === 'heading' ? { ...block.props, presentation: true } : block.props, children: presentationOnly(block.children) }))
}

/** Offered only when the result is a shape the page stores. */
export function turnTargetsFor(editor: AnyEditor, block: TreeBlock): TurnTarget[] {
  if (!TEXT_TYPES.has(block.type) && block.type !== 'toggleListItem') return []
  const surface = surfaceOf(editor)
  const document = editor.document as unknown as TreeBlock[]
  return TURN_TARGETS.filter((target) => {
    const toggles = headingTogglesFor(editor, block, target)
    if (!has(editor, target.type) || isCurrent(block, target)) return false
    if (target.type === 'result' && !offersResults(editor)) return false
    if (target.type === 'heading' && (surface === 'plain' || (surface === 'shelf' && target.level !== 1))) return false
    if (target.type === 'toggleListItem' && !TOGGLE_SURFACES.has(surface) && surface !== 'task') return false
    if (target.toggle === true && !TOGGLE_HEADING_SURFACES.has(surface)) return false
    const simulated = simulate(document, block.id, target, toggles)
    // A task has no sections: a pasted folding heading without `presentation` is still
    // a presentation heading there.
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

// Cmd/Ctrl+/ over picked blocks: the list applies to all of them, and they stay picked.
const turnScope = new WeakMap<object, readonly string[]>()

function turnItems(editor: AnyEditor): Item[] {
  const scope = turnScope.get(editor)
  const ids = scope ?? [editor.getTextCursorPosition().block.id]
  const blocks = ids.flatMap((id) => { const block = editor.getBlock(id) as TreeBlock | undefined; return block !== undefined && (TEXT_TYPES.has(block.type) || block.type === 'toggleListItem') ? [block] : [] })
  const own = blocks.map((block) => turnTargetsFor(editor, block))
  // A kind every picked block may become or already is, and not all already are.
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

type SlashCommand = 'text' | 'heading' | 'checklist' | 'task' | 'page' | 'person' | 'blocked_by' | 'media' | 'bullet' | 'numbered' | 'toggle' | 'quote' | 'callout' | 'divider' | 'code' | 'file' | 'diagram' | 'table' | 'link'

const DOC_MENU: readonly SlashCommand[] = [
  'text', 'heading', 'page', 'person', 'checklist', 'bullet', 'numbered', 'toggle',
  'quote', 'callout', 'divider', 'code', 'table', 'media', 'file', 'diagram', 'link',
]
const WORK_MENU: readonly SlashCommand[] = [
  'text', 'heading', 'task', ...DOC_MENU.slice(2),
]
const TASK_MENU: readonly SlashCommand[] = [
  'text', 'heading', 'checklist', 'blocked_by', ...DOC_MENU.slice(5),
]

const SLASH_MENUS: Readonly<Record<BlockHome, readonly SlashCommand[]>> = {
  work: WORK_MENU,
  doc: DOC_MENU,
  results: DOC_MENU,
  task: TASK_MENU,
  shelf: ['text', 'heading', 'bullet', 'numbered', 'quote', 'callout', 'divider', 'code', 'table', 'media', 'file', 'diagram', 'link'],
}

/** The registry's home for a surface; a post has no `/` menu. */
export function slashHomeOf(surface: CanvasSurfaceKind, results: boolean): BlockHome | null {
  if (surface === 'post') return null
  if (surface === 'document' || surface === 'plain') return results ? 'results' : 'doc'
  return surface
}

export function canvasSlashItems(editor: AnyEditor, context: SlashContext): Item[] {
  const { surface, onCreateTask, onCreatePage, onCreateBlocker, media = true, results = false } = context
  const home = slashHomeOf(surface, results)
  if (home === null) return []
  const defaults = getDefaultReactSlashMenuItems(editor)
  const byKey = (key: string): DefaultReactSuggestionItem | undefined => defaults.find((item) => 'key' in item && item.key === key)
  const items: Item[] = []
  const add = (group: Item['group'], title: string, aliases: readonly string[], onItemClick: () => void, icon?: JSX.Element, extra: { hint?: string } = {}): void => {
    items.push({ title, aliases: [...aliases], group, icon, onItemClick, ...extra })
  }
  const insert = (type: string, props: Record<string, unknown> = {}) => (): void => {
    insertOrUpdateBlockForSlashMenu(editor, { type, props } as never)
    editor.focus()
  }
  const toggles = has(editor, 'toggleListItem') && (TOGGLE_SURFACES.has(surface) || surface === 'task')

  const commands: Record<SlashCommand, () => void> = {
    text: () => { add('Basic blocks', 'Text', ['text', 'paragraph', 'plain', 'p'], insert('paragraph'), kindIcon('paragraph')) },
    heading: () => {
      if (surface === 'work') {
        const canvas = editor
        const cursor = canvas.getTextCursorPosition().block
        // The line as it will be once the menu clears its `/query`: empty, it becomes the
        // Section; written, the Section follows it.
        const written = Array.isArray(cursor.content) ? cursor.content.map((run) => run.type === 'text' ? run.text : '*').join('') : '*'
        const empty = written.replace(/\/[^/]*$/, '').trim() === ''
        for (const level of [1, 2, 3] as const) {
          // A Section where one of this level may stand, exactly as `#` makes one.
          const section = sectionPlace(canvas.document, cursor, level, !empty) !== null
          add('Basic blocks', HEADING_NAMES[level], [`h${level}`, '#'.repeat(level), `heading ${level}`, 'title', 'heading', ...(section ? ['section'] : [])], section ? () => {
            // The query is already cleared: an empty line becomes the Section.
            const block = canvas.getTextCursorPosition().block
            placeSection(canvas, block, level, Array.isArray(block.content) && block.content.length === 0)
          } : insert('heading', { level, isToggleable: false, presentation: false }), kindIcon('heading', level), { hint: '#'.repeat(level) })
        }
      } else if (surface === 'shelf') {
        add('Basic blocks', HEADING_NAMES[1], ['h1', '#', 'heading 1', 'title', 'heading'], insert('heading', { level: 1, isToggleable: true }), kindIcon('heading', 1), { hint: '#' })
      } else if (surface !== 'plain') {
        for (const level of [1, 2, 3] as const) {
          add('Basic blocks', HEADING_NAMES[level], [`h${level}`, '#'.repeat(level), `heading ${level}`, 'title', 'heading'], insert('heading', { level, isToggleable: false, presentation: false }), kindIcon('heading', level), { hint: '#'.repeat(level) })
        }
      }
    },
    // Inside a task its checklist items are subtasks, and `[]` + space makes one. On a Doc
    // `[]` makes no to-do, so the menu is the one way.
    checklist: () => {
      if (surface === 'task') {
        if (has(editor, 'checkListItem')) add('Basic blocks', 'Checklist', ['checklist', 'check', 'subtask', 'step', 'todo', 'to-do', 'checkbox', '[]'], insert('checkListItem'), glyph(ListChecks), { hint: '[]' })
      } else if (has(editor, 'checkListItem')) {
        add('Basic blocks', 'Checklist', ['checklist', 'check', 'todo', 'to-do', 'checkbox'], insert('checkListItem'), glyph(ListChecks))
      }
    },
    // The arrow wrapper is required: the controller calls `onItemClick(editor)`, which
    // would reach `onCreateTask` as its optional block.
    task: () => { if (surface === 'work' && onCreateTask !== undefined) add('Basic blocks', 'Task', ['task', 'todo', 'to-do', 'checkbox', 'action', '[]'], () => { onCreateTask() }, glyph(CheckCircle2), { hint: '[]' }) },
    page: () => { if (onCreatePage !== undefined) add('Basic blocks', 'Page', ['page', 'sub-page', 'subpage', 'child page'], () => { onCreatePage() }, glyph(FileText)) },
    blocked_by: () => { if (onCreateBlocker !== undefined) add('Basic blocks', 'Blocked by', ['blocked', 'blocked by', 'waits', 'waits on', 'depends', 'dependency'], () => { onCreateBlocker() }, glyph(Workflow)) },
    // Media is one command: an empty image block whose chosen file decides image, audio
    // or video.
    media: () => {
      const image = byKey('image')
      if (media && image !== undefined) add('Media', 'Media', ['media', 'img', 'image', 'picture', 'photo', 'audio', 'sound', 'music', 'video', 'movie'], () => { image.onItemClick() }, glyph(ImageIcon))
    },
    bullet: () => { add('Basic blocks', 'Bulleted list', ['bullet', 'bulleted', '-', '*', 'ul', 'unordered'], insert('bulletListItem'), kindIcon('bulletListItem'), { hint: '-' }) },
    numbered: () => { add('Basic blocks', 'Numbered list', ['num', 'numbered', '1.', 'ol', 'ordered'], insert('numberedListItem'), kindIcon('numberedListItem'), { hint: '1.' }) },
    toggle: () => { if (toggles) add('Basic blocks', 'Toggle', ['toggle', 'collapsible', 'details', '>'], insert('toggleListItem'), kindIcon('toggleListItem'), surface === 'task' ? {} : { hint: '>' }) },
    // `>` is the toggle's where there is one, and the quote's elsewhere.
    quote: () => { add('Basic blocks', 'Quote', ['quote', 'blockquote', '"'], insert('quote'), kindIcon('quote'), { hint: toggles && surface !== 'task' ? '"' : '>' }) },
    callout: () => { if (has(editor, 'callout')) add('Basic blocks', 'Callout', ['callout', 'note', 'tip', 'info'], insert('callout'), kindIcon('callout')) },
    divider: () => { if (has(editor, 'divider')) add('Basic blocks', 'Divider', ['div', 'divider', '---', 'hr', 'line', 'separator'], insert('divider'), kindIcon('divider'), { hint: '---' }) },
    code: () => { if (has(editor, 'codeBlock')) add('Basic blocks', 'Code', ['code', '```', 'snippet'], byKey('code_block')?.onItemClick ?? insert('codeBlock'), kindIcon('codeBlock'), { hint: '```' }) },
    table: () => { if (has(editor, 'table')) add('Basic blocks', 'Table', ['table', 'grid', 'rows', 'columns'], () => {
      const rows = Array.from({ length: 3 }, () => ({ cells: [[], [], []] }))
      insertOrUpdateBlockForSlashMenu(editor, { type: 'table', content: { type: 'tableContent', headerRows: 1, rows } } as never)
      editor.focus()
    }, glyph(Table2)) },
    person: () => { if (has(editor, 'person')) add('Advanced', 'Person', ['person', 'team', 'member'], insert('person'), glyph(UserRound)) },
    file: () => {
      const file = byKey('file')
      if (media && file !== undefined) add('Media', 'File', ['file', 'attachment', 'upload', 'document'], () => { file.onItemClick() }, glyph(FileText))
    },
    diagram: () => { if (has(editor, 'diagram')) add('Advanced', 'Diagram', ['diagram', 'flowchart', 'mermaid', 'chart'], insert('diagram'), glyph(Network)) },
    link: () => {
      const link = linkSlashItem(editor)
      add('Advanced', link.title, ['link', 'mention', 'reference', '@', 'page'], link.onItemClick, glyph(Link2))
    },
  }
  for (const command of SLASH_MENUS[home]) commands[command]()
  return items
}

function score(item: Item, query: string): number {
  const title = item.title.toLowerCase()
  const words = [title, ...(item.aliases ?? []).map((alias) => alias.toLowerCase())]
  if (words.includes(query)) return 100
  if (title.startsWith(query)) return 80
  if (words.some((word) => word.startsWith(query))) return 70
  if (title.split(/\s+/).some((word) => word.startsWith(query))) return 60
  if (words.some((word) => word.includes(query))) return 40
  const compact = query.replace(/\s+/g, '')
  // A subsequence ("hd2") still finds its item, last.
  const subsequence = (word: string): boolean => { let at = 0; for (const char of word) if (char === compact[at]) at += 1; return at === compact.length }
  return compact.length > 1 && words.some((word) => subsequence(word.replace(/\s+/g, ''))) ? 10 : 0
}

/** Rank by closeness; group headers only while nothing has been typed. */
export function filterSlashItems(items: readonly Item[], raw: string): DefaultReactSuggestionItem[] {
  const query = raw.trim().toLowerCase()
  if (query === '') return items.map((item) => ({ ...item, size: 'small' as const }))
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

// A miss shows one "No results" row and closes after a space or NO_RESULT_KEYS more
// keys. BlockNote would close three keys after the last hit, which felt random.
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

// Drawn here because upstream's item copies its class onto the icon and label
// wrappers; the controller still owns the keys and the choice.
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
        // Picked blocks: the same list for all of them, opened at the first one's text.
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
    {/* A post has no `/` menu, so a slash stays a slash. Cmd/Ctrl+/ still turns a block. */}
    {slashHomeOf(surface, results) === null ? null : <SuggestionMenuController triggerCharacter="/" getItems={getItems} suggestionMenuComponent={CanvasSuggestionList} />}
    <SuggestionMenuController triggerCharacter={TURN_TRIGGER} getItems={getTurnItems} suggestionMenuComponent={CanvasSuggestionList} />
  </>
}
