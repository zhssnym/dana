import { createExtension } from '@blocknote/core'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { ancestorsOf, createTaskAtCursor, hasTaskCommand, placeSection, sectionPlace } from './commands.js'
import { MAX_SECTION_DEPTH } from '../../../../shared/page-document.js'
import { isSectionHeading } from './outline.js'

/**
 * Which canvas an editor is, for rules that differ by what its server stores. The
 * slash menu binds it; an unbound editor is `work`.
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

/** The Results tab's editor: the one canvas where a block may become a Result. */
const resultCanvases = new WeakSet<object>()
export function bindResultCanvas(editor: object): () => void {
  resultCanvases.add(editor)
  return () => { resultCanvases.delete(editor) }
}
export function offersResults(editor: object): boolean {
  return resultCanvases.has(editor)
}

/** Shelf and Task keep `>` as a quote. Task offers Toggle through the block menu. */
export const TOGGLE_SURFACES: ReadonlySet<CanvasSurfaceKind> = new Set(['work', 'document', 'plain', 'post'])

/**
 * Where a presentation heading may fold. On Work it is writing beside the sections
 * and groups no tasks.
 */
export const TOGGLE_HEADING_SURFACES: ReadonlySet<CanvasSurfaceKind> = new Set(['document', 'task', 'work'])

const isSection = (block: CanvasBlock): boolean => isSectionHeading(block)

/**
 * A section's level is its depth, so only an H2 stands under an H1. Null where no
 * section can stand.
 */
export function workHeadingLevel(editor: CanvasEditor, block: CanvasBlock): 1 | 2 | 3 | null {
  const ancestors = ancestorsOf(editor.document, block.id) ?? []
  if (ancestors.some((item) => !isSection(item))) return null
  const depth = ancestors.length
  return depth >= MAX_SECTION_DEPTH ? null : (depth + 1) as 1 | 2 | 3
}

export function headingFor(editor: CanvasEditor, block: CanvasBlock, level: 1 | 2 | 3): { level: 1 | 2 | 3; isToggleable: boolean; presentation: boolean } | null {
  const surface = surfaceOf(editor)
  // A flat presentation heading; `presentation: false` clears a toggle heading's.
  if (surface === 'document' || surface === 'task' || surface === 'post') return { level, isToggleable: false, presentation: false }
  if (surface === 'shelf') return { level: 1, isToggleable: true, presentation: false }
  if (surface === 'plain') return null
  // Work: a section where one of this level stands, else a presentation heading.
  // Stepping out of a section first is `placeSection`'s job.
  return workHeadingLevel(editor, block) === level
    ? { level, isToggleable: true, presentation: false }
    : { level, isToggleable: false, presentation: false }
}

/** Work's `#` where the new section must step out of the one it is typed in. */
function stepsOut(editor: CanvasEditor, block: CanvasBlock, level: 1 | 2 | 3): boolean {
  if (surfaceOf(editor) !== 'work') return false
  const place = sectionPlace(editor.document, block, level)
  return place !== null && level <= place.length
}

/** `#`, `##` or `###` typed into Work's last line: the new line becomes that heading. */
export function headingLine(editor: CanvasEditor, blockId: string, level: 1 | 2 | 3): boolean {
  const block = editor.getBlock(blockId)
  if (block === undefined) return false
  if (stepsOut(editor, block, level)) return placeSection(editor, block, level, true, [] as CanvasBlock['content'])
  const heading = headingFor(editor, block, level)
  if (heading === null) return false
  editor.updateBlock(block, { type: 'heading', props: heading } as never)
  editor.setTextCursorPosition(blockId, 'end')
  editor.focus()
  return true
}

/**
 * Markdown shortcuts by surface. Upstream's `#`, `>` and `---` rules are stripped
 * from their specs (`schema.ts`), so these are the only ones.
 */
export const canvasMarkdownShortcuts = createExtension({
  key: 'dana-markdown-shortcuts',
  keyboardShortcuts: {
    // Handle `#` that steps out of a section at once where the key is known; the input
    // rule below is the fallback.
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
          // A rule changes only its own block and the guard refuses an out-of-order section,
          // so the move runs after the typed space lands.
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
      // Upstream leaves the cursor on the rule, so the next typing is lost; move it to a new line.
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
      // `[] ` makes a task where tasks are made (Work); elsewhere the brackets stay text.
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
 * The to-do block exists only so stored ones still render, check and save; nothing
 * creates one. Its Enter (continue the list) stays.
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
