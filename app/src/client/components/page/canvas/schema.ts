import { BlockNoteSchema, createExtension, createHeadingBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from '@blocknote/core'

import { AUDIO_MIMES, RASTER_MIMES, VIDEO_MIMES } from '../../../../shared/files.js'
import { MAX_SECTION_DEPTH } from '../../../../shared/page-document.js'

import { createCanvasCallout } from './CanvasCallout.js'
import { formatDate } from '../../../lib/dates.js'
import { todayInBrowserZone } from '../../../api/tz.js'
import { isoDay } from '../../../tasks/task-model.js'
import { createCanvasTaskSpec } from './CanvasTask.js'
import { createCanvasFolderSpec } from './CanvasFolder.js'
import { createCanvasParagraph } from './CanvasParagraph.js'
import { createCanvasDiagramSpec } from './CanvasDiagram.js'
import { createTaskAtCursor, removeCanvasBlocks, removeEmptyBeforeHeading } from './commands.js'
import { danaLinkInlineSpec } from '../../links/dana-link-chip.js'
import { canvasMarkdownShortcuts, withoutInputRules } from './markdown.js'

// The vocabulary only, derived from the one ceiling rather than restated beside it.
// A Section's level is its depth in the persisted outline, so the editor must be able
// to hold an H3 to render a three-level page at all; offering one in the slash menu,
// and the move rules that would keep it valid, are the surface's own (#218).
const headingLevels = Array.from({ length: MAX_SECTION_DEPTH }, (_, index) => index + 1)
const heading = createHeadingBlockSpec({ levels: headingLevels, defaultLevel: 1, allowToggleHeadings: true })
const groupHeading = {
  ...heading,
  // Upstream's `#` rules would open a Section anywhere; Dana's are by surface (`markdown.ts`).
  extensions: [...withoutInputRules(heading.extensions, () => true), canvasMarkdownShortcuts, createExtension({
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

/* Issue #267: a media block whose file was reclaimed arrives with no url, which
   the stock block draws as the same empty frame as one never filled. `reclaimedAt`
   (hydrated from `file_reclaimed_at`, never saved) swaps that frame for a notice
   that says what happened, with the two ways out: pick a new file (clearing the
   notice shows the ordinary upload state) or remove the block. A picture had it
   first; file, audio and video carry the same notice, and the adapter keeps
   every reclaimed one in the saved document rather than dropping it. */
type MediaRender = (this: unknown, block: { id: string; props: { url: string; caption?: string } }, editor: unknown) => { dom: HTMLElement }
type WithReclaimedAt<T extends { config: { propSchema: object } }> = Omit<T, 'config'> & {
  config: Omit<T['config'], 'propSchema'> & { propSchema: T['config']['propSchema'] & { reclaimedAt: { default: '' } } }
}
function withReclaimNotice<T extends { config: { propSchema: object } }>(spec: T, noun: string): WithReclaimedAt<T> {
  const typed = spec as unknown as { config: { propSchema: Record<string, unknown> }; implementation: { render: MediaRender } }
  const stockRender = typed.implementation.render
  return {
    ...typed,
    config: { ...typed.config, propSchema: { ...typed.config.propSchema, reclaimedAt: { default: '' } } },
    implementation: {
      ...typed.implementation,
      render: function (block, editor) {
        const reclaimedAt = (block.props as { reclaimedAt?: string }).reclaimedAt ?? ''
        if (reclaimedAt === '' || block.props.url !== '') return stockRender.call(this, block, editor)
        const dom = document.createElement('div')
        dom.className = 'dana-reclaimed-image'
        dom.contentEditable = 'false'
        dom.setAttribute('role', 'group')
        const date = new Date(reclaimedAt)
        const message = document.createElement('p')
        message.textContent = `This ${noun} was deleted on ${Number.isNaN(date.getTime()) ? 'an earlier date' : formatDate(isoDay(date), todayInBrowserZone())}.`
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
        button(`Choose a new ${noun}`, () => { (editor as CanvasEditor).updateBlock(block.id, { props: { reclaimedAt: '' } }) })
        button('Remove', () => { const canvas = editor as CanvasEditor; const own = canvas.getBlock(block.id); if (own) removeCanvasBlocks(canvas, [own]) })
        dom.appendChild(actions)
        return { dom }
      } satisfies MediaRender,
    },
  } as unknown as WithReclaimedAt<T>
}

const audio = withReclaimNotice(mediaSpec(defaultBlockSpecs.audio, AUDIO_MIMES), 'file')
const video = withReclaimNotice(mediaSpec(defaultBlockSpecs.video, VIDEO_MIMES), 'file')
const file = withReclaimNotice(defaultBlockSpecs.file, 'file')
const image = withReclaimNotice(mediaSpec(defaultBlockSpecs.image, RASTER_MIMES), 'picture')

/* A toggle opens by default, like a Section, so what is written under it goes
   inside: Enter at the end of an open toggle's title starts its first child
   (upstream starts a sibling toggle, which stays the closed toggle's Enter). */
const upstreamToggle = defaultBlockSpecs.toggleListItem
const toggleList = {
  ...upstreamToggle,
  extensions: [createExtension({
    key: 'canvas-toggle-enter',
    keyboardShortcuts: {
      Enter: ({ editor }) => {
        const { selection } = editor.prosemirrorState
        const block = editor.getTextCursorPosition().block
        if (block.type !== 'toggleListItem' || !selection.empty || selection.$from.parentOffset !== selection.$from.parent.content.size) return false
        if (!Array.isArray(block.content) || block.content.length === 0) return false
        if (window.localStorage.getItem(`toggle-${block.id}`) === 'false') return false
        const id = crypto.randomUUID()
        editor.transact(() => {
          editor.updateBlock(block, { children: [{ id, type: 'paragraph', content: '' }, ...block.children] })
          editor.setTextCursorPosition(id)
        })
        return true
      },
    },
  }), ...upstreamToggle.extensions ?? []],
  implementation: {
    ...upstreamToggle.implementation,
    render: (function (block, editor) {
      try {
        if (window.localStorage.getItem(`toggle-${block.id}`) === null) window.localStorage.setItem(`toggle-${block.id}`, 'true')
      } catch { /* preference storage can be unavailable */ }
      return upstreamToggle.implementation.render.call(this, block, editor)
    }) as typeof upstreamToggle.implementation.render,
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
    // `> ` is a toggle (`markdown.ts`); `" ` stays upstream's quote rule.
    quote: { ...defaultBlockSpecs.quote, extensions: withoutInputRules(defaultBlockSpecs.quote.extensions, (find) => find.source === '^>\\s$') },
    toggleListItem: toggleList,
    divider: defaultBlockSpecs.divider,
    callout: createCanvasCallout(),
    codeBlock: defaultBlockSpecs.codeBlock,
    image,
    file,
    audio,
    video,
    danaTask: createCanvasTaskSpec(),
    // A Shelf's native Folder row (#221); only the Shelf canvas inserts one.
    danaFolder: createCanvasFolderSpec(),
    diagram: createCanvasDiagramSpec(),
  },
  // A Dana Link (#223) is a chip; `adapters.ts` stores it as an href run.
  inlineContentSpecs: { ...defaultInlineContentSpecs, danaLink: danaLinkInlineSpec },
  styleSpecs: { bold: defaultStyleSpecs.bold, italic: defaultStyleSpecs.italic },
})

export type CanvasBlock = typeof canvasSchema.Block
export type CanvasEditor = typeof canvasSchema.BlockNoteEditor
