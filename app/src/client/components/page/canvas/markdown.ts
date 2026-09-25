import { createExtension } from '@blocknote/core'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { ancestorsOf, createTaskAtCursor, hasTaskCommand, placeSection, sectionPlace } from './commands.js'
import { MAX_SECTION_DEPTH } from '../../../../shared/page-document.js'
import { isSectionHeading } from './outline.js'

/**
 * Which canvas an editor is, for the rules that differ by what its server
 * stores. `work` is a Folder's Main page (headings are Sections), `document` a
 * Purpose/Results facet (flat headings), `plain` a facet without headings,
 * `shelf` a Shelf (one heading level, stored flat), `task` a Task body and
 * `post` a discussion post (a document whose contract has no toggle heading).
 * The slash menu binds it (`CanvasSlashMenu`); an unbound editor is `work`.
 */
export type CanvasSurfaceKind = 'work' | 'document' | 'plain' | 'shelf' | 'task' | 'post'

const surfaces = new WeakMap<object, CanvasSurfaceKind>()
export function bindCanvasSurface(editor: object, surface: CanvasSurfaceKind): () => void {
  surfaces.set(editor, surface)
  return () => { if (surfaces.get(editor) === surface) surfaces.delete(editor) }
}
export function surfaceOf(editor: object): CanvasSurfaceKind {
  return surfaces.get(editor) ?? 'work'
}

/** The Results tab's editor: the one canvas where a block may become a Result (#213). */
const resultCanvases = new WeakSet<object>()
export function bindResultCanvas(editor: object): () => void {
  resultCanvases.add(editor)
  return () => { resultCanvases.delete(editor) }
}
export function offersResults(editor: object): boolean {
  return resultCanvases.has(editor)
}

/** Where a toggle list is offered. Every surface nests since 0038; a Shelf
 * does not offer the toggle list (its `>` stays a quote) and the Task
 * composer's schema has none. */
export const TOGGLE_SURFACES: ReadonlySet<CanvasSurfaceKind> = new Set(['work', 'document', 'plain', 'post'])

/** Where a presentation heading may fold (a toggle heading): Purpose, Results,
 * a Task body, and Work, where a toggle heading is writing beside the Sections
 * (it groups no Tasks; the server stores it as on a facet). */
export const TOGGLE_HEADING_SURFACES: ReadonlySet<CanvasSurfaceKind> = new Set(['document', 'task', 'work'])

const isSection = (block: CanvasBlock): boolean => isSectionHeading(block)

/**
 * The one Section a Work block may become where it stands: a Section's level
 * is its depth, so only an H2 stands under an H1. Null where no Section can
 * stand (nested under a block, or below an H3).
 */
export function workHeadingLevel(editor: CanvasEditor, block: CanvasBlock): 1 | 2 | 3 | null {
  const ancestors = ancestorsOf(editor.document, block.id) ?? []
  if (ancestors.some((item) => !isSection(item))) return null
  const depth = ancestors.length
  return depth >= MAX_SECTION_DEPTH ? null : (depth + 1) as 1 | 2 | 3
}

/** The heading a surface stores for "Heading n"; null where it has none. */
export function headingFor(editor: CanvasEditor, block: CanvasBlock, level: 1 | 2 | 3): { level: 1 | 2 | 3; isToggleable: boolean; presentation: boolean } | null {
  const surface = surfaceOf(editor)
  // A flat presentation heading; `presentation: false` clears a toggle heading's.
  if (surface === 'document' || surface === 'task' || surface === 'post') return { level, isToggleable: false, presentation: false }
  if (surface === 'shelf') return { level: 1, isToggleable: true, presentation: false }
  if (surface === 'plain') return null
  // Work: a Section where one of this level stands, otherwise a presentation
  // heading of the level asked for (writing; it groups nothing). One that
  // must step out of a Section first is `placeSection`'s (the `#` rule below).
  return workHeadingLevel(editor, block) === level
    ? { level, isToggleable: true, presentation: false }
    : { level, isToggleable: false, presentation: false }
}

/** Work's `#` where the Section must step out of the one it is typed in (a
 * Heading 1 typed inside a Section): the same Section `/heading 1` makes. */
function stepsOut(editor: CanvasEditor, block: CanvasBlock, level: 1 | 2 | 3): boolean {
  if (surfaceOf(editor) !== 'work') return false
  const place = sectionPlace(editor.document, block, level)
  return place !== null && level <= place.length
}

/**
 * Notion's markdown shortcuts, by surface: `#`/`##`/`###` + space headings,
 * `>` + space a toggle (a quote where no toggle list is offered), `"` + space a quote
 * (upstream's rule, kept), `---` a divider, ``` a code block. `-`/`*`/`+`,
 * `1.` are upstream's own rules; `[]` makes a Task (below). Upstream's `#`, `>` and `---` rules
 * are stripped from their specs (`schema.ts`) so these are the only ones.
 */
export const canvasMarkdownShortcuts = createExtension({
  key: 'dana-markdown-shortcuts',
  keyboardShortcuts: {
    // The `#` that steps out of a Section, at once where the key is known (a
    // hardware keyboard); the input rule below is the fallback.
    ' ': ({ editor }): boolean => {
      const canvas = editor as CanvasEditor
      const { selection } = canvas.prosemirrorState
      if (!selection.empty) return false
      const hashes = /^(#{1,3})$/.exec(selection.$from.parent.textContent.slice(0, selection.$from.parentOffset))?.[1]
      const block = canvas.getTextCursorPosition().block
      const level = hashes?.length as 1 | 2 | 3 | undefined
      if (level === undefined || block.type !== 'paragraph' || !stepsOut(canvas, block, level)) return false
      const [first, ...rest] = Array.isArray(block.content) ? block.content : []
      if (first?.type !== 'text') return false
      const text = first.text.slice(level)
      return placeSection(canvas, block, level, true, (text === '' ? rest : [{ ...first, text }, ...rest]) as CanvasBlock['content'])
    },
  },
  inputRules: [
    ...([1, 2, 3] as const).map((level) => ({
      find: new RegExp(`^(#{${level}})\\s$`),
      replace({ editor }: { editor: unknown }) {
        const canvas = editor as CanvasEditor
        const block = canvas.getTextCursorPosition().block
        if (stepsOut(canvas, block, level)) {
          // A rule changes only its own block, and the guard refuses a
          // Section nested out of order, so the move runs once the typed
          // space has landed: the `#`s and the space are dropped from the text.
          window.setTimeout(() => {
            const typed = canvas.getBlock(block.id)
            const [first, ...rest] = Array.isArray(typed?.content) ? typed.content : []
            if (typed === undefined || first?.type !== 'text' || !first.text.startsWith(`${'#'.repeat(level)} `)) return
            const text = first.text.slice(level + 1)
            // Keys that landed first (an Enter) keep their line.
            const cursor = canvas.getTextCursorPosition().block.id
            placeSection(canvas, typed, level, true, (text === '' ? rest : [{ ...first, text }, ...rest]) as CanvasBlock['content'])
            if (cursor !== typed.id && canvas.getBlock(cursor) !== undefined) canvas.setTextCursorPosition(cursor, 'end')
          }, 0)
          return undefined
        }
        const heading = headingFor(canvas, block, level)
        return heading === null ? undefined : { type: 'heading', props: heading }
      },
    })),
    {
      find: /^>\s$/,
      replace({ editor }: { editor: unknown }) {
        return TOGGLE_SURFACES.has(surfaceOf(editor as object)) ? { type: 'toggleListItem', props: {} } : { type: 'quote', props: {} }
      },
    },
    {
      // Upstream's rule leaves the cursor on the rule itself, so what is typed next
      // is lost; here the line after it takes the cursor, as in Notion.
      find: /^---$/,
      replace({ editor }: { editor: unknown }) {
        const canvas = editor as CanvasEditor
        if (!('divider' in canvas.schema.blockSchema)) return undefined
        const id = canvas.getTextCursorPosition().block.id
        window.setTimeout(() => {
          if (canvas.getBlock(id)?.type !== 'divider') return
          const [next] = canvas.insertBlocks([{ type: 'paragraph' }], id, 'after')
          if (next !== undefined) canvas.setTextCursorPosition(next, 'start')
        }, 0)
        return { type: 'divider', props: {}, content: [] }
      },
    },
    {
      // `[] ` or `[ ] ` makes a Task where Tasks are made (Work): the line
      // becomes the Task being titled, or, with words after the caret, that
      // Task at once. Elsewhere the brackets stay text.
      find: /^\[ ?\]\s$/,
      replace({ editor }: { editor: unknown }) {
        const canvas = editor as CanvasEditor
        if (!hasTaskCommand(canvas)) return undefined
        window.setTimeout(() => { createTaskAtCursor(canvas) }, 0)
        return { type: 'paragraph', props: {} }
      },
    },
    {
      find: /^```$/,
      replace() {
        return { type: 'codeBlock', props: {}, content: [] }
      },
    },
  ],
})

/**
 * The to-do block, kept only so documents that hold one still render, check
 * and save: nothing makes a new one. Task covers it, and people took one for
 * the other. Upstream's `[]` / `[x]` rules and its Mod-Shift-9 go; its Enter
 * (a to-do continues the list) stays.
 */
export function legacyCheckList<T extends { extensions?: readonly unknown[] }>(spec: T): T {
  const extensions = withoutInputRules(spec.extensions, () => true).map((factory) => ((context: unknown) => {
    const instance = (factory as (context: unknown) => { keyboardShortcuts?: Record<string, unknown> })(context)
    if (instance.keyboardShortcuts === undefined) return instance
    const { 'Mod-Shift-9': _make, ...kept } = instance.keyboardShortcuts
    return { ...instance, keyboardShortcuts: kept }
  }))
  return { ...spec, extensions } as T
}

/** A copy of an upstream block extension without the input rules `drop` names. */
export function withoutInputRules<T>(extensions: readonly T[] | undefined, drop: (find: RegExp) => boolean): T[] {
  return (extensions ?? []).map((factory) => ((context: unknown) => {
    const instance = (typeof factory === 'function' ? (factory as (context: unknown) => { inputRules?: { find: RegExp }[] })(context) : factory) as { inputRules?: { find: RegExp }[] }
    return instance.inputRules === undefined ? instance : { ...instance, inputRules: instance.inputRules.filter((rule) => !drop(rule.find)) }
  }) as T)
}
