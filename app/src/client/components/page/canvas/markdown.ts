import { createExtension } from '@blocknote/core'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { ancestorsOf } from './commands.js'
import { MAX_SECTION_DEPTH } from '../../../../shared/page-document.js'
import { isSectionHeading } from './outline.js'

/**
 * Which canvas an editor is, for the rules that differ by what its server
 * stores. `work` is a Folder's Main page (headings are Sections), `document` a
 * Purpose/Results facet (flat headings), `plain` a facet without headings,
 * `shelf` a Shelf (one heading level, stored flat) and `task` a Task body.
 * The slash menu binds it (`CanvasSlashMenu`); an unbound editor is `work`.
 */
export type CanvasSurfaceKind = 'work' | 'document' | 'plain' | 'shelf' | 'task'

const surfaces = new WeakMap<object, CanvasSurfaceKind>()
export function bindCanvasSurface(editor: object, surface: CanvasSurfaceKind): () => void {
  surfaces.set(editor, surface)
  return () => { if (surfaces.get(editor) === surface) surfaces.delete(editor) }
}
export function surfaceOf(editor: object): CanvasSurfaceKind {
  return surfaces.get(editor) ?? 'work'
}

/** Where a toggle list is offered. Every surface nests since 0038; a Shelf
 * does not offer the toggle list (its `>` stays a quote) and the Task
 * composer's schema has none. */
export const TOGGLE_SURFACES: ReadonlySet<CanvasSurfaceKind> = new Set(['work', 'document', 'plain'])

/** Where a presentation heading may fold (a toggle heading): Purpose, Results
 * and a Task body. On Work a heading is a Section, which folds already. */
export const TOGGLE_HEADING_SURFACES: ReadonlySet<CanvasSurfaceKind> = new Set(['document', 'task'])

const isSection = (block: CanvasBlock): boolean => isSectionHeading(block)

/**
 * The one heading a Work block may become where it stands: a Section's level is
 * its depth, so a block under an H1 becomes an H2 whatever was asked. Null
 * where no heading can stand (nested under a block, or below an H3).
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
  if (surface === 'document' || surface === 'task') return { level, isToggleable: false, presentation: false }
  if (surface === 'shelf') return { level: 1, isToggleable: true, presentation: false }
  if (surface === 'plain') return null
  const fitted = workHeadingLevel(editor, block)
  return fitted === null ? null : { level: fitted, isToggleable: true, presentation: false }
}

/**
 * Notion's markdown shortcuts, by surface: `#`/`##`/`###` + space headings,
 * `>` + space a toggle (a quote where no toggle list is offered), `"` + space a quote
 * (upstream's rule, kept), `---` a divider, ``` a code block. `-`/`*`/`+`,
 * `1.` and `[]` are upstream's own rules. Upstream's `#`, `>` and `---` rules
 * are stripped from their specs (`schema.ts`) so these are the only ones.
 */
export const canvasMarkdownShortcuts = createExtension({
  key: 'dana-markdown-shortcuts',
  inputRules: [
    ...([1, 2, 3] as const).map((level) => ({
      find: new RegExp(`^(#{${level}})\\s$`),
      replace({ editor }: { editor: unknown }) {
        const canvas = editor as CanvasEditor
        const heading = headingFor(canvas, canvas.getTextCursorPosition().block, level)
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
      find: /^```$/,
      replace() {
        return { type: 'codeBlock', props: {}, content: [] }
      },
    },
  ],
})

/** A copy of an upstream block extension without the input rules `drop` names. */
export function withoutInputRules<T>(extensions: readonly T[] | undefined, drop: (find: RegExp) => boolean): T[] {
  return (extensions ?? []).map((factory) => ((context: unknown) => {
    const instance = (typeof factory === 'function' ? (factory as (context: unknown) => { inputRules?: { find: RegExp }[] })(context) : factory) as { inputRules?: { find: RegExp }[] }
    return instance.inputRules === undefined ? instance : { ...instance, inputRules: instance.inputRules.filter((rule) => !drop(rule.find)) }
  }) as T)
}
