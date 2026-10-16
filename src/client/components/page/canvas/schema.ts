import { BlockNoteSchema, createExtension, createHeadingBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from '@blocknote/core'

import { AUDIO_MIMES, RASTER_MIMES, VIDEO_MIMES } from '../../../../shared/files.js'
import { MAX_SECTION_DEPTH } from '../../../../shared/page-document.js'
import { fileMime } from '../../../api/http.js'

import { createCanvasCallout } from './CanvasCallout.js'
import { createCanvasResult } from './CanvasResult.js'
import { formatDate } from '../../../lib/dates.js'
import { todayInBrowserZone } from '../../../api/tz.js'
import { isoDay } from '../../../tasks/task-model.js'
import { createCanvasTaskSpec } from './CanvasTask.js'
import { createCanvasFolderSpec } from './CanvasFolder.js'
import { createCanvasPageRefSpec, createCanvasPageSpec } from './CanvasPage.js'
import { createCanvasParagraph } from './CanvasParagraph.js'
import { createCanvasDiagramSpec } from './CanvasDiagram.js'
import { createCanvasPersonSpec } from './CanvasPerson.js'
import { createCanvasSyncedSpec } from './CanvasSynced.js'
import { createTaskAtCursor, removeCanvasBlocks, removeEmptyBeforeHeading } from './commands.js'
import { danaLinkInlineSpec } from '../../links/dana-link-chip.js'
import { mentionInlineSpec } from './mentions.js'
import { canvasMarkdownShortcuts, legacyCheckList, withoutInputRules } from './markdown.js'
import { isSectionHeading } from './outline.js'
import './file-chip.css'

// Levels come from the shared depth limit: a three-level page needs H3 in the editor.
const headingLevels = Array.from({ length: MAX_SECTION_DEPTH }, (_, index) => index + 1)
const heading = createHeadingBlockSpec({ levels: headingLevels, defaultLevel: 1, allowToggleHeadings: true })

export const canvasTableOptions = {
  headers: true,
  splitCells: true,
  cellBackgroundColor: true,
  cellTextColor: true,
} as const

// Toggle state uses BlockNote's `toggle-<id>` keys, read as open only when 'true'. Dana
// opens by default, so the key is seeded for the render and removed after; only closed
// toggles ('false') stay stored. Blocked storage reads as open.
export function toggleClosed(id: string): boolean {
  try { return window.localStorage.getItem(`toggle-${id}`) === 'false' } catch { return false }
}
export function openByDefault<T>(id: string, render: () => T): T {
  const key = `toggle-${id}`
  try { if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, 'true') } catch { /* storage unavailable */ }
  const result = render()
  try { if (window.localStorage.getItem(key) === 'true') window.localStorage.removeItem(key) } catch { /* storage unavailable */ }
  return result
}

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
        // Leave selections, mid-title splits and flat headings to BlockNote. A folding heading
        // takes this path: Enter at the end starts its first child.
        if (block.type !== 'heading' || block.props.isToggleable === false || !selection.empty || selection.$from.parentOffset !== selection.$from.parent.content.size) return false
        // Upstream splitting moves children to the new paragraph; Dana's grouping must survive.
        if (!isSectionHeading(block) && toggleClosed(block.id)) {
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
    // A heading is a Section unless it says otherwise (`isSectionHeading`). `presentation`
    // is never stored itself.
    propSchema: { ...heading.config.propSchema, isToggleable: { default: true }, presentation: { default: false } },
  },
  implementation: {
    ...heading.implementation,
    render: (function (block, editor) {
      // A Section draws as a plain heading: no arrow, no fold. `isToggleable` marks it a
      // Section in storage only. Toggle headings fold.
      if (isSectionHeading(block)) {
        const plain = heading.implementation.render.call(this, { ...block, props: { ...block.props, isToggleable: false } }, editor)
        // Keep the Section's own props on the DOM, so a copied Section pastes as one.
        // BlockNote writes the default `isToggleable: true` as no attribute.
        if (plain.dom instanceof HTMLElement) { plain.dom.setAttribute('data-dana-section', ''); plain.dom.removeAttribute('data-is-toggleable') }
        if (plain.contentDOM !== undefined) plain.contentDOM.setAttribute('aria-level', String(block.props.level + 1))
        return plain
      }
      // Keep the complete upstream renderer and its structural CSS wrapper.
      const result = openByDefault(block.id, () => heading.implementation.render.call(this, block, editor))
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
 * Media recognition uses the server's MIME allowlists, so an unsupported drop falls
 * through to a File block.
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

// A media block whose file was reclaimed has no url. `reclaimedAt` (hydrated, never
// saved) shows a notice with two ways out: choose a new file or remove the block.
type MediaRender = (this: unknown, block: { id: string; props: { url: string; caption?: string } }, editor: unknown) => { dom: HTMLElement }
type WithReclaimedAt<T extends { config: { propSchema: object } }> = Omit<T, 'config'> & {
  config: Omit<T['config'], 'propSchema'> & { propSchema: T['config']['propSchema'] & { reclaimedAt: { default: '' } } }
}
function withReclaimNotice<T extends { config: { propSchema: object } }>(spec: T, noun: string, addLabel?: string): WithReclaimedAt<T> {
  const typed = spec as unknown as { config: { propSchema: Record<string, unknown> }; implementation: { render: MediaRender } }
  const stockRender = typed.implementation.render
  return {
    ...typed,
    config: { ...typed.config, propSchema: { ...typed.config.propSchema, reclaimedAt: { default: '' } } },
    implementation: {
      ...typed.implementation,
      render: function (block, editor) {
        const reclaimedAt = (block.props as { reclaimedAt?: string }).reclaimedAt ?? ''
        if (reclaimedAt === '' || block.props.url !== '') {
          const stock = stockRender.call(this, block, editor)
          // The empty block's one quiet row (canvas.css); a click opens `CanvasFilePanel`.
          const text = stock.dom.querySelector('.bn-add-file-button-text')
          if (text && addLabel !== undefined) text.textContent = addLabel
          return stock
        }
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

// File stays BlockNote's stock block, with a type badge from the stored MIME, else the
// extension.
const FILE_TYPE_BADGES: Readonly<Record<string, string>> = {
  pdf: 'PDF',
  doc: 'DOC', docx: 'DOCX', odt: 'DOC', rtf: 'DOC', txt: 'TXT', md: 'TXT',
  xls: 'XLS', xlsx: 'XLSX', ods: 'XLS', csv: 'CSV',
  ppt: 'PPT', pptx: 'PPT', odp: 'PPT',
  zip: 'ZIP', rar: 'ZIP', '7z': 'ZIP', tar: 'ZIP', gz: 'ZIP',
  json: 'CODE', js: 'CODE', jsx: 'CODE', ts: 'CODE', tsx: 'CODE', html: 'CODE', css: 'CODE', xml: 'CODE', yaml: 'CODE', yml: 'CODE', sql: 'CODE', py: 'CODE', java: 'CODE', go: 'CODE', rs: 'CODE',
  png: 'PNG', jpg: 'JPG', jpeg: 'JPG', gif: 'GIF', webp: 'WEBP', svg: 'SVG',
  mp3: 'AUD', wav: 'AUD', m4a: 'AUD', ogg: 'AUD', flac: 'AUD',
  mp4: 'VID', mov: 'VID', webm: 'VID', mkv: 'VID', avi: 'VID',
}

const FILE_MIME_BADGES: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.oasis.opendocument.text': 'DOC',
  'application/rtf': 'DOC',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.oasis.opendocument.spreadsheet': 'XLS',
  'text/csv': 'CSV',
  'text/plain': 'TXT',
  'application/zip': 'ZIP',
  'application/x-zip-compressed': 'ZIP',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/gif': 'GIF',
  'image/webp': 'WEBP',
  'image/svg+xml': 'SVG',
}

const mimeCache = new Map<string, Promise<string | null>>()

function fileType(name: string, mime: string | null): string | undefined {
  const normalized = mime?.split(';', 1)[0]?.trim().toLowerCase()
  const fromMime = normalized === undefined ? undefined
    : FILE_MIME_BADGES[normalized] ?? (normalized.startsWith('audio/') ? 'AUD' : normalized.startsWith('video/') ? 'VID' : undefined)
  return fromMime ?? FILE_TYPE_BADGES[fileExtension(name)]
}

function fileExtension(name: string): string {
  const leaf = name.split(/[\\/]/).at(-1) ?? name
  const dot = leaf.lastIndexOf('.')
  return dot > 0 && dot < leaf.length - 1 ? leaf.slice(dot + 1).toLowerCase() : ''
}

function withFileTypeIdentity<T>(spec: T): T {
  const typed = spec as unknown as { implementation: { render: MediaRender } }
  const stockRender = typed.implementation.render
  return {
    ...typed,
    implementation: {
      ...typed.implementation,
      render: function (block, editor) {
        const stock = stockRender.call(this, block, editor)
        if (block.props.url === '') return stock
        const row = stock.dom.querySelector<HTMLElement>('.bn-file-name-with-icon')
        const nameElement = row?.querySelector<HTMLElement>('.bn-file-name')
        if (row === null || row === undefined || nameElement === null || nameElement === undefined) return stock

        const name = String((block.props as { name?: string }).name ?? nameElement.textContent ?? '')
        const icon = row.querySelector<HTMLElement>('.bn-file-icon')
        row.querySelector('.dana-file-type')?.remove()
        const type = document.createElement('span')
        type.className = 'dana-file-type'
        type.contentEditable = 'false'
        nameElement.insertAdjacentElement('afterend', type)
        const paint = (mime: string | null): void => {
          const badge = fileType(name, mime)
          if (icon !== null) {
            if (badge === undefined) delete icon.dataset.danaFileType
            else icon.dataset.danaFileType = badge
          }
          type.textContent = badge ?? 'File'
        }
        paint(null)
        const id = /\/api\/v1\/files\/([0-9a-f-]{36})$/.exec(String(block.props.url))?.[1]
        if (id !== undefined) {
          let pending = mimeCache.get(id)
          if (pending === undefined) {
            pending = fileMime(id)
            mimeCache.set(id, pending)
          }
          void pending.then(paint)
        }
        return stock
      } satisfies MediaRender,
    },
  } as unknown as T
}

const audio = withReclaimNotice(mediaSpec(defaultBlockSpecs.audio, AUDIO_MIMES), 'file')
const video = withReclaimNotice(mediaSpec(defaultBlockSpecs.video, VIDEO_MIMES), 'file')
const file = withFileTypeIdentity(withReclaimNotice(defaultBlockSpecs.file, 'file', 'Add a file'))
// An empty image block is the Media command's placeholder (`CanvasFilePanel`).
const image = withReclaimNotice(mediaSpec(defaultBlockSpecs.image, RASTER_MIMES), 'picture', 'Add media')

// A toggle opens by default, so Enter at the end of an open toggle's title starts its
// first child.
const upstreamToggle = defaultBlockSpecs.toggleListItem
const toggleList = {
  ...upstreamToggle,
  extensions: [createExtension({
    key: 'canvas-toggle-enter',
    runsBefore: ['toggle-list-item-shortcuts'],
    keyboardShortcuts: {
      Enter: ({ editor }) => {
        const { selection } = editor.prosemirrorState
        const block = editor.getTextCursorPosition().block
        if (block.type !== 'toggleListItem' || !selection.empty || selection.$from.parentOffset !== selection.$from.parent.content.size) return false
        if (!Array.isArray(block.content) || block.content.length === 0) return false
        if (toggleClosed(block.id)) return false
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
      return openByDefault(block.id, () => upstreamToggle.implementation.render.call(this, block, editor))
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
    // Stored to-dos only: nothing makes a new one (`legacyCheckList`).
    checkListItem: legacyCheckList(defaultBlockSpecs.checkListItem),
    // `> ` is a toggle (`markdown.ts`); `" ` stays upstream's quote rule.
    quote: { ...defaultBlockSpecs.quote, extensions: withoutInputRules(defaultBlockSpecs.quote.extensions, (find) => find.source === '^>\\s$') },
    toggleListItem: toggleList,
    divider: { ...defaultBlockSpecs.divider, extensions: withoutInputRules(defaultBlockSpecs.divider.extensions, () => true) },
    callout: createCanvasCallout(),
    // Only the Results tab's `/result` inserts one.
    result: createCanvasResult(),
    codeBlock: defaultBlockSpecs.codeBlock,
    image,
    file,
    audio,
    video,
    danaTask: createCanvasTaskSpec(),
    // A shelf's folder row; only the shelf canvas inserts one.
    danaFolder: createCanvasFolderSpec(),
    diagram: createCanvasDiagramSpec(),
    person: createCanvasPersonSpec(),
    // A live view of another block; only "Copy and sync" then paste inserts one.
    synced: createCanvasSyncedSpec(),
    table: defaultBlockSpecs.table,
    // A sub-page; only Folder Work's `/page` inserts one.
    danaPage: createCanvasPageSpec(),
    // A page of another project (`folder_ref` with no text); never inserted.
    danaPageRef: createCanvasPageRefSpec(),
  },
  // A Dana Link is a chip; `adapters.ts` stores it as an href run.
  inlineContentSpecs: { ...defaultInlineContentSpecs, danaLink: danaLinkInlineSpec, mention: mentionInlineSpec },
  styleSpecs: { bold: defaultStyleSpecs.bold, italic: defaultStyleSpecs.italic },
})

export type CanvasBlock = typeof canvasSchema.Block
export type CanvasEditor = typeof canvasSchema.BlockNoteEditor
