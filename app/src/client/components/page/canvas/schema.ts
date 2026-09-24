import { BlockNoteSchema, createExtension, createHeadingBlockSpec, defaultBlockSpecs, defaultStyleSpecs } from '@blocknote/core'

import { AUDIO_MIMES, RASTER_MIMES, VIDEO_MIMES } from '../../../../shared/files.js'
import { MAX_SECTION_DEPTH } from '../../../../shared/page-document.js'

import { createCanvasCallout } from './CanvasCallout.js'
import { createCanvasTaskSpec } from './CanvasTask.js'
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
        if (block.type !== 'heading' || block.props.isToggleable === false || !selection.empty || selection.$from.parentOffset !== selection.$from.parent.content.size) return false
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

/**
 * Keep BlockNote's media recognition on the exact same MIME allowlists the
 * server accepts. This makes a dropped unsupported media file fall through to
 * the generic File block instead of drawing a player the server will refuse.
 */
function mediaSpec<T>(spec: T, accept: readonly string[]): T {
  const typed = spec as unknown as {
    implementation: {
      meta?: Record<string, unknown>
    }
  }
  return {
    ...typed,
    implementation: {
      ...typed.implementation,
      meta: {
        ...typed.implementation.meta,
        fileBlockAccept: [...accept],
      },
    },
  } as unknown as T
}

const audio = mediaSpec(defaultBlockSpecs.audio, AUDIO_MIMES)
const video = mediaSpec(defaultBlockSpecs.video, VIDEO_MIMES)

/* Issue #267: a picture whose file was reclaimed arrives with no url, which the
   stock block draws as the same empty frame as one never filled. `reclaimedAt`
   (hydrated from `file_reclaimed_at`, never saved) swaps that frame for a notice
   that says what happened, with the two ways out: pick a new file (clearing the
   notice shows the ordinary upload state) or remove the block. */
const stockImage = mediaSpec(defaultBlockSpecs.image, RASTER_MIMES)
const image = {
  ...stockImage,
  config: { ...stockImage.config, propSchema: { ...stockImage.config.propSchema, reclaimedAt: { default: '' } } },
  implementation: {
    ...stockImage.implementation,
    render: (function (block, editor) {
      const reclaimedAt = (block.props as { reclaimedAt?: string }).reclaimedAt ?? ''
      if (reclaimedAt === '' || block.props.url !== '') return stockImage.implementation.render.call(this, block, editor)
      const dom = document.createElement('div')
      dom.className = 'dana-reclaimed-image'
      dom.contentEditable = 'false'
      dom.setAttribute('role', 'group')
      const date = new Date(reclaimedAt)
      const message = document.createElement('p')
      message.textContent = `This picture was deleted on ${Number.isNaN(date.getTime()) ? 'an earlier date' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`
      dom.setAttribute('aria-label', message.textContent)
      dom.appendChild(message)
      if (block.props.caption) {
        const caption = document.createElement('p')
        caption.className = 'dana-reclaimed-image-caption'
        caption.textContent = block.props.caption
        dom.appendChild(caption)
      }
      const actions = document.createElement('div')
      const button = (label: string, run: () => void): void => {
        const element = document.createElement('button')
        element.type = 'button'
        element.textContent = label
        element.addEventListener('click', (event) => { event.preventDefault(); run() })
        actions.appendChild(element)
      }
      button('Choose a new picture', () => { (editor as unknown as CanvasEditor).updateBlock(block.id, { props: { reclaimedAt: '' } }) })
      button('Remove', () => { (editor as unknown as CanvasEditor).removeBlocks([block.id]) })
      dom.appendChild(actions)
      return { dom }
    }) as typeof stockImage.implementation.render,
  },
}

/** Restricted vocabulary, projected to Dana records by the persistence adapter. */
export const canvasSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: createCanvasParagraph(),
    heading: groupHeading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    quote: defaultBlockSpecs.quote,
    callout: createCanvasCallout(),
    codeBlock: defaultBlockSpecs.codeBlock,
    image,
    file: defaultBlockSpecs.file,
    audio,
    video,
    danaTask: createCanvasTaskSpec(),
  },
  styleSpecs: { bold: defaultStyleSpecs.bold, italic: defaultStyleSpecs.italic },
})

export type CanvasBlock = typeof canvasSchema.Block
export type CanvasEditor = typeof canvasSchema.BlockNoteEditor
