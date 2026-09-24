import { BlockNoteSchema, createExtension, createHeadingBlockSpec, defaultBlockSpecs, defaultStyleSpecs } from '@blocknote/core'

import { MAX_SECTION_DEPTH } from '../../../../shared/page-document.js'

import { createCanvasTaskSpec } from './CanvasTask.js'
import { createCanvasFolderSpec } from './CanvasFolder.js'
import { createCanvasParagraph } from './CanvasParagraph.js'
import { createTaskAtCursor, removeEmptyBeforeHeading } from './commands.js'

// The vocabulary only, derived from the one ceiling rather than restated beside it.
// A Section's level is its depth in the persisted outline, so the editor must be able
// to hold an H3 to render a three-level page at all; offering one in the slash menu,
// and the move rules that would keep it valid, are the surface's own (#218).
const headingLevels = Array.from({ length: MAX_SECTION_DEPTH }, (_, index) => index + 1)
const heading = createHeadingBlockSpec({ levels: headingLevels, defaultLevel: 1, allowToggleHeadings: true })
const groupHeading = {
  ...heading,
  extensions: [...heading.extensions ?? [], createExtension({
    key: 'canvas-heading-enter',
    keyboardShortcuts: {
      'Mod-Enter': ({ editor }): boolean => createTaskAtCursor(editor as CanvasEditor),
      Backspace: ({ editor }): boolean => removeEmptyBeforeHeading(editor as CanvasEditor, 'Backspace'),
      Delete: ({ editor }): boolean => removeEmptyBeforeHeading(editor as CanvasEditor, 'Delete'),
      Enter: ({ editor }) => {
        const { selection } = editor.prosemirrorState
        const block = editor.getTextCursorPosition().block
        // Let BlockNote handle selections, mid-title splitting and ordinary prose.
        if (block.type !== 'heading' || !selection.empty || selection.$from.parentOffset !== selection.$from.parent.content.size) return false
        // Upstream splitting transfers children to the new paragraph. Dana's group
        // membership must survive, so use its public subtree insertion operation.
        if (window.localStorage.getItem(`toggle-${block.id}`) === 'false') {
          editor.transact(() => {
            const [next] = editor.insertBlocks([{ type: 'paragraph' }], block, 'after')
            editor.setTextCursorPosition(next!)
          })
          return true
        }
        const id = crypto.randomUUID()
        editor.transact(() => {
          editor.updateBlock(block, { children: [{ id, type: 'paragraph', content: '' }, ...block.children] })
          editor.setTextCursorPosition(id)
        })
        return true
      },
    },
  })],
  config: {
    ...heading.config,
    propSchema: { ...heading.config.propSchema, isToggleable: { default: true } },
  },
  implementation: {
    ...heading.implementation,
    render: (function (block, editor) {
      // Keep the complete upstream renderer and its structural CSS wrapper.
      const key = `toggle-${block.id}`
      try {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, 'true')
      } catch { /* preference storage can be unavailable */ }
      const result = heading.implementation.render.call(this, block, editor)
      const contentDOM = result.contentDOM
      const toggle = result.dom.querySelector<HTMLButtonElement>('.bn-toggle-button')
      const wrapper = result.dom.querySelector('.bn-toggle-wrapper')
      if (contentDOM !== undefined) {
        contentDOM.id = `canvas-heading-${block.id}`
        contentDOM.setAttribute('aria-level', String(block.props.level + 1))
        toggle?.setAttribute('aria-labelledby', contentDOM.id)
      }
      const syncExpanded = (): void => { toggle?.setAttribute('aria-expanded', wrapper?.getAttribute('data-show-children') ?? 'false') }
      syncExpanded()
      toggle?.addEventListener('click', syncExpanded)
      const stop = editor.onChange(syncExpanded)
      return {
        ...result,
        ignoreMutation: (mutation) => (mutation.type === 'attributes' && mutation.target === toggle) || result.ignoreMutation?.(mutation) === true,
        destroy: () => { toggle?.removeEventListener('click', syncExpanded); stop(); result.destroy?.() },
      }
    }) as typeof heading.implementation.render,
  },
}

/** Restricted vocabulary, projected to Dana records by the persistence adapter. */
export const canvasSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: createCanvasParagraph(),
    heading: groupHeading,
    image: defaultBlockSpecs.image,
    danaTask: createCanvasTaskSpec(),
    // A Shelf's native Folder row (#221); only the Shelf canvas inserts one.
    danaFolder: createCanvasFolderSpec(),
  },
  styleSpecs: { bold: defaultStyleSpecs.bold, italic: defaultStyleSpecs.italic },
})

export type CanvasBlock = typeof canvasSchema.Block
export type CanvasEditor = typeof canvasSchema.BlockNoteEditor
