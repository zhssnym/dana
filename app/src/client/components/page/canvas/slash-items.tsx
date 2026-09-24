/*
The one slash menu, for every canvas: a Folder's Work, Purpose and Results, a
Task body and a Shelf. Each canvas renders `<CanvasSlashMenu>` with the surface
it is; what a surface offers is what its server stores:

- `work` (Folder Main): headings are Sections, so "Heading n" and "Toggle
  heading n" are one thing there (a Section folds); Task is offered.
- `document` (Purpose, Results): flat headings; no Task, no Section.
- `plain` (a facet with no headings).
- `shelf`: one flat heading level, nothing nests (so no toggle list).
- `task`: the Task composer's own schema (no to-do, callout, divider, toggle).

Typed turn-into: `/turn h1`, `/turn toggle`, `/turnbullet` convert the block
the cursor is in, keeping its text, and its children where the target holds
them (otherwise they follow it). Cmd/Ctrl+/ opens the same list for the block.
*/
import { useEffect, useMemo } from 'react'
import type { JSX } from 'react'
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useComponentsContext } from '@blocknote/react'
import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react'
import { SuggestionMenu, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'

import { CheckCircle2, Lightbulb, Network } from '../../../lib/icons.js'
import { linkSlashItem } from '../../links/dana-link-picker.js'
import { ancestorsOf, insertCanvasHeading, sectionContext } from './commands.js'
import { TOGGLE_SURFACES, bindCanvasSurface, headingFor, surfaceOf, workHeadingLevel } from './markdown.js'
import type { CanvasSurfaceKind } from './markdown.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'

export type { CanvasSurfaceKind } from './markdown.js'

export interface SlashContext {
  readonly surface: CanvasSurfaceKind
  /** Folder Work only: the canvas's own Task creation. */
  readonly onCreateTask?: () => void
  /** False where no file can be stored (a Task outside a Folder). */
  readonly media?: boolean
}

type Item = DefaultReactSuggestionItem & { readonly group: 'Basic blocks' | 'Media' | 'Dana' | 'Turn into' }
type AnyEditor = CanvasEditor

const TURN_TRIGGER = '⁣turn'

const has = (editor: AnyEditor, type: string): boolean => type in editor.schema.blockSchema

/* ------------------------------------------------------------ turn into */

interface Target {
  readonly title: string
  readonly aliases: readonly string[]
  readonly type: string
  readonly level?: 1 | 2 | 3
  readonly toggle?: boolean
}

const LIST_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem'])
const TOGGLE_CHILD_TYPES = new Set(['paragraph', 'quote', 'callout', 'codeBlock', 'divider', ...LIST_TYPES])

function targetsFor(editor: AnyEditor): Target[] {
  const surface = surfaceOf(editor)
  const targets: Target[] = [{ title: 'Text', aliases: ['text', 'paragraph', 'plain', 'p'], type: 'paragraph' }]
  if (surface !== 'plain') {
    for (const level of surface === 'shelf' ? [1] as const : [1, 2, 3] as const) {
      targets.push({ title: `Heading ${level}`, aliases: [`h${level}`, '#'.repeat(level), `heading ${level}`, 'title'], type: 'heading', level })
    }
  }
  if (surface === 'work') {
    for (const level of [1, 2, 3] as const) {
      targets.push({ title: `Toggle heading ${level}`, aliases: [`toggle h${level}`, `toggleh${level}`, `toggle heading ${level}`], type: 'heading', level, toggle: true })
    }
  }
  if (has(editor, 'toggleListItem') && TOGGLE_SURFACES.has(surface)) targets.push({ title: 'Toggle list', aliases: ['toggle', '>', 'collapsible', 'details'], type: 'toggleListItem' })
  if (has(editor, 'checkListItem')) targets.push({ title: 'To-do list', aliases: ['todo', 'to-do', 'checkbox', 'checklist', '[]'], type: 'checkListItem' })
  targets.push(
    { title: 'Bulleted list', aliases: ['bullet', 'bulleted', 'ul', '-', '*', 'unordered'], type: 'bulletListItem' },
    { title: 'Numbered list', aliases: ['num', 'numbered', 'ol', '1.', 'ordered'], type: 'numberedListItem' },
    { title: 'Quote', aliases: ['quote', 'blockquote', '"'], type: 'quote' },
  )
  if (has(editor, 'callout')) targets.push({ title: 'Callout', aliases: ['callout', 'note', 'tip'], type: 'callout' })
  if (has(editor, 'codeBlock')) targets.push({ title: 'Code', aliases: ['code', '```', 'snippet'], type: 'codeBlock' })
  return targets
}

function holds(target: Target, surface: CanvasSurfaceKind, children: readonly CanvasBlock[]): boolean {
  if (children.length === 0) return true
  if (target.type === 'heading') return surface === 'work'
  if (target.type === 'toggleListItem') return children.every((child) => TOGGLE_CHILD_TYPES.has(child.type))
  if (LIST_TYPES.has(target.type)) return children.every((child) => LIST_TYPES.has(child.type))
  return false
}

/** Lift a Section's children one level, as its heading goes. */
function lifted(children: readonly CanvasBlock[]): CanvasBlock[] {
  return children.map((child) => child.type === 'heading' && child.props.isToggleable !== false
    ? { ...child, props: { ...child.props, level: Math.max(1, child.props.level - 1) as 1 | 2 | 3 }, children: lifted(child.children) }
    : child)
}

/** Convert a block in place, keeping its text, and its children where the target holds them. */
export function turnBlockInto(editor: AnyEditor, block: CanvasBlock, target: Target): void {
  const surface = surfaceOf(editor)
  let props: Record<string, unknown> = {}
  if (target.type === 'heading') {
    const heading = surface === 'work' ? (() => {
      const level = workHeadingLevel(editor, block)
      return level === null ? null : { level, isToggleable: true }
    })() : headingFor(editor, block, target.level ?? 1)
    if (heading === null) return
    props = surface === 'task' ? { level: heading.level } : heading
  }
  const content = target.type === 'codeBlock' || block.type === 'codeBlock'
    ? (Array.isArray(block.content) ? block.content.map((inline) => inline.type === 'text' ? inline.text : inline.type === 'link' ? inline.content.map((text) => text.text).join('') : '').join('') : '')
    : undefined
  const wasSection = block.type === 'heading' && block.props.isToggleable !== false
  const keep = holds(target, surface, block.children)
  editor.transact(() => {
    editor.updateBlock(block, {
      type: target.type as 'paragraph',
      props: props as never,
      ...(content === undefined ? {} : { content }),
      ...(keep ? {} : { children: [] }),
    })
    if (!keep) editor.insertBlocks(wasSection ? lifted(block.children) : block.children, block.id, 'after')
    editor.setTextCursorPosition(block.id, 'end')
  })
  editor.focus()
}

function turnItems(editor: AnyEditor): Item[] {
  const block = editor.getTextCursorPosition().block
  // Only a block of writing turns into another; a Task, a folder row or media does not.
  if (!Array.isArray(block.content) && block.type !== 'codeBlock') return []
  const headingDefaults = getDefaultReactSlashMenuItems(editor)
  const iconOf = (key: string): JSX.Element | undefined => headingDefaults.find((item) => 'key' in item && item.key === key)?.icon
  const icons: Record<string, string> = {
    paragraph: 'paragraph', bulletListItem: 'bullet_list', numberedListItem: 'numbered_list', checkListItem: 'check_list',
    toggleListItem: 'toggle_list', quote: 'quote', codeBlock: 'code_block',
  }
  return targetsFor(editor).map((target) => ({
    title: target.title,
    aliases: target.aliases.map((alias) => alias),
    icon: target.type === 'callout' ? <Lightbulb size={16} /> : iconOf(target.type === 'heading' ? (target.level === 1 ? 'heading' : `heading_${target.level}`) : icons[target.type] ?? ''),
    group: 'Turn into',
    onItemClick: () => {
      const current = editor.getBlock(block.id)
      if (current !== undefined) turnBlockInto(editor, current, target)
    },
  }))
}

/* ------------------------------------------------------------ insert */

export function canvasSlashItems(editor: AnyEditor, context: SlashContext): Item[] {
  const { surface, onCreateTask, media = true } = context
  const defaults = getDefaultReactSlashMenuItems(editor)
  const byKey = (key: string): DefaultReactSuggestionItem | undefined => defaults.find((item) => 'key' in item && item.key === key)
  const items: Item[] = []
  const add = (group: Item['group'], title: string, aliases: readonly string[], onItemClick: () => void, icon?: JSX.Element): void => {
    items.push({ title, aliases: [...aliases], group, icon, onItemClick })
  }
  const insert = (type: string, props: Record<string, unknown> = {}) => (): void => {
    insertOrUpdateBlockForSlashMenu(editor, { type, props } as never)
    editor.focus()
  }

  add('Basic blocks', 'Text', ['text', 'paragraph', 'plain', 'p'], insert('paragraph'), byKey('paragraph')?.icon)
  if (has(editor, 'checkListItem')) add('Basic blocks', 'To-do list', ['todo', 'to-do', '[]', 'checkbox', 'checklist'], insert('checkListItem'), byKey('check_list')?.icon)

  // Headings, by what the surface stores.
  const headingIcon = (level: number): JSX.Element | undefined => byKey(level === 1 ? 'heading' : `heading_${level}`)?.icon
  if (surface === 'work') {
    const cursor = editor.getTextCursorPosition().block
    const inside = (ancestorsOf(editor.document, cursor.id) ?? []).some((block) => block.type !== 'heading')
    for (const level of [1, 2, 3] as const) {
      if (inside || (level > 1 && sectionContext(editor, level - 1) === undefined)) continue
      // A Work heading is a Section, and a Section folds: both names reach it.
      add('Basic blocks', `Heading ${level}`, [`h${level}`, '#'.repeat(level), 'title', 'section', `toggle heading ${level}`, `toggle h${level}`], () => { insertCanvasHeading(editor, level) }, headingIcon(level))
    }
  } else if (surface === 'shelf') {
    add('Basic blocks', 'Heading 1', ['h1', '#', 'title', 'heading'], insert('heading', { level: 1, isToggleable: true }), headingIcon(1))
  } else if (surface !== 'plain') {
    for (const level of [1, 2, 3] as const) {
      add('Basic blocks', `Heading ${level}`, [`h${level}`, '#'.repeat(level), 'title', 'heading'], insert('heading', surface === 'task' ? { level } : { level, isToggleable: false }), headingIcon(level))
    }
  }
  if (has(editor, 'toggleListItem') && TOGGLE_SURFACES.has(surface)) add('Basic blocks', 'Toggle list', ['toggle', '>', 'collapsible', 'details'], insert('toggleListItem'), byKey('toggle_list')?.icon)
  add('Basic blocks', 'Bulleted list', ['bullet', 'bulleted', '-', '*', 'ul', 'unordered'], insert('bulletListItem'), byKey('bullet_list')?.icon)
  add('Basic blocks', 'Numbered list', ['num', 'numbered', '1.', 'ol', 'ordered'], insert('numberedListItem'), byKey('numbered_list')?.icon)
  add('Basic blocks', 'Quote', ['quote', 'blockquote', '"'], insert('quote'), byKey('quote')?.icon)
  if (has(editor, 'callout')) add('Basic blocks', 'Callout', ['callout', 'note', 'tip', 'info'], insert('callout'), <Lightbulb size={16} />)
  if (has(editor, 'divider')) add('Basic blocks', 'Divider', ['div', 'divider', '---', 'hr', 'line', 'separator'], insert('divider'), byKey('divider')?.icon)
  if (has(editor, 'codeBlock')) add('Basic blocks', 'Code', ['code', '```', 'snippet'], byKey('code_block')?.onItemClick ?? insert('codeBlock'), byKey('code_block')?.icon)

  if (media) {
    const image = byKey('image')
    const file = byKey('file')
    // Upstream's items open the file panel on the new block (`CanvasFilePanel`).
    if (image !== undefined) add('Media', 'Image', ['img', 'image', 'picture', 'photo'], () => { image.onItemClick() }, image.icon)
    if (file !== undefined) add('Media', 'File', ['file', 'attachment', 'upload', 'document'], () => { file.onItemClick() }, file.icon)
  }

  /*
  The arrow wrapper is load-bearing. `SuggestionMenuController` calls
  `item.onItemClick(editor)` although the type says `() => void`, so handing
  `onCreateTask` itself gave it the editor as its optional block (#204, #234).
  */
  if (surface === 'work' && onCreateTask !== undefined) add('Dana', 'Task', ['task', 'todo task', 'action'], () => { onCreateTask() }, <CheckCircle2 size={16} />)
  if (has(editor, 'diagram')) add('Dana', 'Diagram', ['diagram', 'flowchart', 'mermaid', 'chart'], insert('diagram'), <Network size={16} />)
  const link = linkSlashItem(editor)
  add('Dana', 'Link to page', ['link', 'mention', 'reference', '@', 'page'], link.onItemClick, link.icon)
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

/* ------------------------------------------------------------ menu */

/** BlockNote's own menu, saying "No results" (it closes after a few more keys). */
function CanvasSuggestionList(props: SuggestionMenuProps<DefaultReactSuggestionItem>): JSX.Element {
  const Components = useComponentsContext()!
  const { items, selectedIndex, onItemClick, loadingState } = props
  const rows: JSX.Element[] = []
  let group: string | undefined
  items.forEach((item, index) => {
    if (item.group !== undefined && item.group !== group) {
      group = item.group
      rows.push(<Components.SuggestionMenu.Label className="bn-suggestion-menu-label" key={`group-${group}`}>{group}</Components.SuggestionMenu.Label>)
    }
    rows.push(<Components.SuggestionMenu.Item
      className="bn-suggestion-menu-item bn-suggestion-menu-item-small"
      item={{ ...item, subtext: undefined, badge: undefined }}
      id={`bn-suggestion-menu-item-${index}`}
      isSelected={index === selectedIndex}
      key={item.title}
      onClick={() => onItemClick?.(item)}
    />)
  })
  return <Components.SuggestionMenu.Root id="bn-suggestion-menu" className="bn-suggestion-menu">
    {rows}
    {rows.length === 0 && loadingState !== 'loading-initial'
      ? <Components.SuggestionMenu.EmptyItem className="bn-suggestion-menu-item">No results</Components.SuggestionMenu.EmptyItem>
      : null}
  </Components.SuggestionMenu.Root>
}

/** The slash menu and the Cmd/Ctrl+/ Turn into menu, for one canvas. */
export function CanvasSlashMenu({ editor, context }: { readonly editor: AnyEditor; readonly context: SlashContext }): JSX.Element {
  const { surface } = context
  useEffect(() => bindCanvasSurface(editor, surface), [editor, surface])
  useEffect(() => {
    const open = (event: KeyboardEvent): void => {
      if (event.key !== '/' || !(event.metaKey || event.ctrlKey) || event.altKey) return
      const root = editor.domElement
      if (root === undefined || !(event.target instanceof Node) || !root.contains(event.target)) return
      const block = editor.getTextCursorPosition().block
      if (!Array.isArray(block.content) && block.type !== 'codeBlock') return
      event.preventDefault()
      editor.getExtension(SuggestionMenu)?.openSuggestionMenu(TURN_TRIGGER, { ignoreQueryLength: true })
    }
    document.addEventListener('keydown', open, true)
    return () => { document.removeEventListener('keydown', open, true) }
  }, [editor])
  const getItems = useMemo(() => async (query: string) => slashItemsFor(editor, context, query), [editor, context])
  const getTurnItems = useMemo(() => async (query: string) => filterSlashItems(turnItems(editor), query), [editor])
  return <>
    <SuggestionMenuController triggerCharacter="/" getItems={getItems} suggestionMenuComponent={CanvasSuggestionList} />
    <SuggestionMenuController triggerCharacter={TURN_TRIGGER} getItems={getTurnItems} suggestionMenuComponent={CanvasSuggestionList} />
  </>
}
