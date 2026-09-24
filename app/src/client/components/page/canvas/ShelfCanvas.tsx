/*
The Shelf's composer (#221, Shelf half): the Folder canvas's BlockNote surface
and `CanvasWriter`, posting 7.16's `document_transaction` to
`/shelves/:id/page/actions` (`domain/shelf-document.ts`).

What a Shelf document is, and so what this adapter does on top of the shared one:

- **Headings group by position; blocks nest by parent.** The Shelf route
  refuses `section_block_id`, and the legacy Shelf editor always meant "a block
  under a heading folds with it". So a read groups each root block under the
  section before it (content before the first section stays at the root), and
  a write sends the editor's order with no Section. One heading level; the
  surface hides the gestures a reload would undo. Since 0038 a Shelf stores
  `list_parent_block_id` like every home: any block but a heading nests under
  a writing block (Tab), and a nested block is read back under its parent,
  never regrouped under a heading.
- **Folders join a Shelf elsewhere, never here**: the sidebar drag and "Move to
  shelf" write the membership, and the arrival is placed after the content.
  The page offers no picker of its own — one home per action.
- **A Folder row is a `danaFolder` block** over a `folder_ref` row. Presence is
  the membership (`folder_members.shelf_name`), position is the document: a
  stored row whose folder has left the Shelf is not drawn and is deleted by the
  next save; a member with no row is drawn after the content and written by the
  next save. A row leaves only through Remove from collection — the guard below
  refuses a generic delete, a paste that places a folder twice, and an undo
  that would place a folder that is no longer on the Shelf.
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { fragmentToBlocks } from '@blocknote/core'
import { useQueryClient } from '@tanstack/react-query'
import '@blocknote/shadcn/style.css'

import type { PageView } from '../../../../shared/pages.js'
import { getPageResponse } from '../../../../shared/pages.js'
import { AUDIO_MIMES, RASTER_MIMES, VIDEO_MIMES } from '../../../../shared/files.js'
import { getPlain, mutateApi, uploadFile } from '../../../api/http.js'
import { queryKeys } from '../../../api/keys.js'
import { CanvasErrorBoundary } from './CanvasErrorBoundary.js'
import { CanvasFolderProvider } from './CanvasFolder.js'
import type { CanvasMediaKind, CanvasUploadedFile } from './CanvasFilePanel.js'
import type { CanvasFolderRow } from './CanvasFolder.js'
import { CanvasSurface } from './CanvasSurface.js'
import { canvasSchema } from './schema.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { dehydrateCanvas, documentOf, hydrateCanvas } from './adapters.js'
import type { CanvasDocument, CanvasInput } from './adapters.js'
import type { OutlineBlock } from './outline.js'
import { CanvasWriter } from './saving.js'
import { NOT_SAVED, RecoveryNotice, SaveFailure } from './SaveFailure.js'
import { pasteIntoCanvas } from './paste.js'

interface Props {
  readonly shelfId: string
  readonly page: PageView
  /** The Shelf's members, in the folder list's order. */
  readonly folders: readonly CanvasFolderRow[]
  readonly folderHref: (folderId: string) => string
  readonly onOpenFolder: (folderId: string) => void
  readonly onRemoveFolder: (folderId: string) => Promise<void>
  /** False while the shelf or its folders refetch. A rename relabels both, and
      between the two answers the membership reads empty. */
  readonly settled: boolean
}

const NO_REFS: ReadonlyMap<string, string> = new Map()

/** The one error "Load latest" answers besides a failed save. */
const CHANGED_ELSEWHERE = 'This collection changed elsewhere. Your writing is kept here. Load the latest to continue; your writing will be offered back.'

/** The page as the shared hydrator reads it: stale Folder rows dropped, each
 * root block grouped under the section before it, and each nested block left
 * under its own parent (the hydrator places it by `list_parent_block_id`). */
function positionalPage(page: PageView, members: ReadonlySet<string>): PageView {
  const byId = new Map(page.blocks.map((block) => [block.id, block]))
  const kept = new Set<string>()
  let section: string | null = null
  const blocks = []
  for (const item of page.items) {
    const block = byId.get(item.id)
    if (item.kind !== 'block' || block === undefined) continue
    if (block.kind === 'folder_ref' && (block.ref_folder_id === null || !members.has(block.ref_folder_id))) continue
    kept.add(block.id)
    if (block.kind === 'section') { section = block.id; blocks.push({ ...block, section_block_id: null, list_parent_block_id: null }) }
    else blocks.push({ ...block, section_block_id: section })
  }
  return { ...page, blocks, items: page.items.filter((item) => kept.has(item.id)), task_placements: [] }
}

function folderIdsOf(blocks: readonly OutlineBlock[]): string[] {
  return blocks.flatMap((block) => [
    ...(block.type === 'danaFolder' && typeof block.props.folderId === 'string' ? [block.props.folderId] : []),
    ...folderIdsOf(block.children),
  ])
}

/** What a Shelf stores: no Section membership (headings group by position),
 * and each nested block's parent. */
function flat(document: CanvasDocument): CanvasDocument {
  return { blocks: document.blocks, items: document.items.map((item) => ({ ...item, section_block_id: null })) }
}

export default function ShelfCanvas(props: Props): React.JSX.Element {
  const [checkpoint, setCheckpoint] = useState<{ page: PageView; epoch: number }>({ page: props.page, epoch: 0 })
  return <CanvasErrorBoundary>
    <ShelfSession key={`${props.shelfId}:${checkpoint.epoch}`} {...props} initialPage={checkpoint.page} onCheckpoint={(page) => setCheckpoint((old) => ({ page, epoch: old.epoch + 1 }))} />
  </CanvasErrorBoundary>
}

function ShelfSession(props: Props & { readonly initialPage: PageView; readonly onCheckpoint: (page: PageView) => void }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => { setWidth(host.current?.clientWidth || 600) }, [])
  return <div ref={host} className="min-w-0">{width === null ? <p role="status" className="sr-only">Loading writing…</p> : <ShelfEditor {...props} width={width} />}</div>
}

function ShelfEditor({ shelfId, page, initialPage, folders, folderHref, onOpenFolder, onRemoveFolder, onCheckpoint, width, settled }: Props & {
  readonly initialPage: PageView
  readonly onCheckpoint: (page: PageView) => void
  readonly width: number
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const [, render] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [previousDraft, setPreviousDraft] = useState<string | null>(null)
  const memberIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders])
  const members = useRef(memberIds)
  members.current = memberIds
  /* Folder ids whose arrival or departure is this page's own act, which the
     guard lets through for the one transaction that makes it. */
  const sanctioned = useRef(new Set<string>())

  const initial = useMemo((): CanvasInput[] => {
    const grouped = positionalPage(initialPage, members.current)
    const refs = new Map(grouped.blocks.flatMap((block) => block.kind === 'folder_ref' && block.ref_folder_id !== null ? [[block.id, block.ref_folder_id] as const] : []))
    const swap = (blocks: CanvasInput[]): CanvasInput[] => blocks.map((block) => {
      const folderId = block.id === undefined ? undefined : refs.get(block.id)
      if (folderId !== undefined) return { id: block.id, type: 'danaFolder', props: { folderId } }
      return { ...block, children: block.children ? swap(block.children) : [] } as CanvasInput
    })
    const drawn = swap(hydrateCanvas(grouped, width))
    const placed = new Set(refs.values())
    const missing = [...members.current].filter((id) => !placed.has(id))
      .map((folderId): CanvasInput => ({ id: crypto.randomUUID(), type: 'danaFolder', props: { folderId } }))
    /* A line to write on after the last Folder row: with only rows on the
       page there would be nowhere to put the cursor. It is stored only once
       something is written. */
    const all = [...drawn, ...missing]
    return all.at(-1)?.type === 'danaFolder' ? [...all, { id: crypto.randomUUID(), type: 'paragraph' } as CanvasInput] : all
  }, [initialPage, width])

  // A Shelf is nobody's Folder: its media is the person's own (7.15, #220).
  async function uploadCanvasFile(kind: CanvasMediaKind, file: File): Promise<CanvasUploadedFile> {
    try {
      const uploaded = await uploadFile(kind, null, file)
      return { url: `/api/v1/files/${uploaded.id}`, name: file.name }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The file could not be uploaded. Try again.')
      throw failure
    }
  }
  const editor = useCreateBlockNote({
    schema: canvasSchema,
    initialContent: initial.length ? initial : [{ id: crypto.randomUUID(), type: 'paragraph', content: '' }],
    pasteHandler: ({ editor: current, event, defaultPasteHandler }) => pasteIntoCanvas(current, event, setError) ?? defaultPasteHandler({ plainTextAsMarkdown: false }),
    uploadFile: async (file) => {
      const mime = file.type
      const kind: CanvasMediaKind = (RASTER_MIMES as readonly string[]).includes(mime) ? 'image'
        : (AUDIO_MIMES as readonly string[]).includes(mime) ? 'audio'
          : (VIDEO_MIMES as readonly string[]).includes(mime) ? 'video' : 'file'
      return uploadCanvasFile(kind, file)
    },
  })
  const projection = (current: readonly CanvasBlock[]): CanvasDocument => flat(dehydrateCanvas(current, width, NO_REFS))
  /* The baseline is the stored page, each row the editor also draws replaced by
     its drawing: so an unchanged row writes nothing, a stale Folder row the
     editor dropped is deleted, and a member drawn without a stored row is put. */
  const [writer] = useState(() => {
    const drawn = projection(editor.document)
    const byId = new Map(drawn.blocks.map((block) => [block.id, block]))
    const stored = flat(documentOf(initialPage))
    const baseline = { blocks: stored.blocks.map((block) => byId.get(block.id) ?? block), items: stored.items }
    const created = new CanvasWriter(baseline, initialPage.revision!,
      (body) => mutateApi(getPageResponse, { method: 'POST', path: `/shelves/${shelfId}/page/actions`, body }),
      () => {
        render((value) => value + 1)
        try {
          if (created.state === 'saved') sessionStorage.removeItem(draftKey)
          else sessionStorage.setItem(draftKey, JSON.stringify({ shelfId, revision: created.revision, blocks: editor.document }))
        } catch { /* recoverable in memory; storage is optional */ }
      },
      (next) => { queryClient.setQueryData(queryKeys.shelfPage(shelfId), next) },
    )
    created.latest = drawn
    return created
  })
  const draftKey = `dana-canvas-draft:shelf:${shelfId}`
  /* A draft left by an earlier visit (or by Load latest) moves to its own key on
     mount, so this visit's first keystroke cannot overwrite it; it is offered
     until dismissed. Two unsaved drafts are both kept. */
  const recoveredKey = `dana-canvas-recovered:shelf:${shelfId}`
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem(draftKey)
      if (draft !== null) {
        const held = sessionStorage.getItem(recoveredKey)
        let next = draft
        if (held !== null) {
          try {
            const list: unknown = JSON.parse(held)
            next = JSON.stringify([...(Array.isArray(list) ? list : [list]), JSON.parse(draft)])
          } catch { next = JSON.stringify([held, draft]) }
        }
        sessionStorage.setItem(recoveredKey, next)
        sessionStorage.removeItem(draftKey)
      }
      setPreviousDraft(sessionStorage.getItem(recoveredKey))
    } catch { /* storage is optional */ }
  }, [draftKey, recoveredKey])
  useEffect(() => {
    if (writer.state === 'saved') return
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [writer, writer.state])
  useEffect(() => {
    if (writer.state !== 'changed') return
    const timer = window.setTimeout(() => { void writer.flush() }, 450)
    return () => window.clearTimeout(timer)
  }, [writer, writer.state, writer.latest])
  // Leaving inside the autosave delay (a folder row, another tab), or mid-save, still saves.
  useEffect(() => () => { void writer.drain() }, [writer])
  useEffect(() => {
    if (!page.revision || page.revision === writer.revision || writer.state === 'saving') return
    if (writer.state === 'saved') onCheckpoint(page)
    else setError(CHANGED_ELSEWHERE)
  }, [page, writer, onCheckpoint])

  // The Folder-row guard. Runs beside the canvas's own (`installCanvasGuard`).
  useEffect(() => editor.onBeforeChange(({ tr }) => {
    if (!tr.docChanged) return
    const before = folderIdsOf(fragmentToBlocks<typeof canvasSchema.blockSchema, typeof canvasSchema.inlineContentSchema, typeof canvasSchema.styleSchema>(tr.before.content))
    const after = folderIdsOf(fragmentToBlocks<typeof canvasSchema.blockSchema, typeof canvasSchema.inlineContentSchema, typeof canvasSchema.styleSchema>(tr.doc.content))
    const had = new Set(before)
    const has = new Set(after)
    const failure = before.some((id) => !has.has(id) && !sanctioned.current.has(id))
      ? 'A page leaves this collection only through Remove from collection, in its row\'s menu. Select only the writing to delete it.'
      : after.length !== new Set(after).size
        ? 'A page can be placed in a collection once.'
        : after.some((id) => !had.has(id) && !members.current.has(id) && !sanctioned.current.has(id))
          ? 'That page is no longer in this collection. Move it here from the sidebar.'
          : null
    if (failure === null) return
    setNotice(failure)
    return false
  }), [editor])

  function changed(current: CanvasEditor): void {
    try {
      writer.change(projection(current.document))
      setError('')
      setNotice('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare this edit for saving.') }
  }

  function withSanction(folderId: string, act: () => void): void {
    sanctioned.current.add(folderId)
    try { act() } finally { sanctioned.current.delete(folderId) }
  }
  function blockOf(folderId: string, blocks: readonly CanvasBlock[] = editor.document): CanvasBlock | undefined {
    for (const block of blocks) {
      if (block.type === 'danaFolder' && block.props.folderId === folderId) return block
      const found = blockOf(folderId, block.children)
      if (found) return found
    }
    return undefined
  }
  function place(folderId: string): void {
    if (blockOf(folderId) !== undefined) return
    const row = { id: crypto.randomUUID(), type: 'danaFolder' as const, props: { folderId } }
    const last = editor.document.at(-1)!
    // Before the trailing empty line, so the line to write on stays last.
    const beforeLine = editor.document.length > 1 && last.type === 'paragraph' && richText(last) === ''
    withSanction(folderId, () => {
      if (beforeLine) editor.insertBlocks([row], last, 'before')
      else editor.insertBlocks([row, { type: 'paragraph' }], last, 'after')
      /* An insert the person did not make leaves ProseMirror's selection on
         the first Folder row, drawn as a box around it: park it on the
         writing line instead, without taking focus. */
      if (!editor.isFocused()) editor.setTextCursorPosition(editor.document.at(-1)!, 'end')
    })
  }
  function unplace(folderId: string): void {
    const block = blockOf(folderId)
    if (block === undefined) return
    withSanction(folderId, () => {
      if (editor.document.length === 1) editor.insertBlocks([{ type: 'paragraph' }], block, 'after')
      editor.removeBlocks([block])
    })
  }
  /* Membership that changed outside this composer (Move to shelf elsewhere,
     New folder…, the sidebar drag): an arrival is placed at the root after the
     content, a departure's row goes. */
  useEffect(() => {
    if (!settled) return
    for (const folderId of memberIds) place(folderId)
    for (const folderId of folderIdsOf(editor.document)) if (!memberIds.has(folderId)) unplace(folderId)
  }, [memberIds, settled])

  async function remove(folderId: string): Promise<void> {
    try {
      await onRemoveFolder(folderId)
      unplace(folderId)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The page could not be removed. Try again.') }
  }

  function download(content: string, name: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
  }
  function copyDraft(): void {
    download(JSON.stringify({ shelfId, revision: writer.revision, blocks: editor.document }, null, 2), `dana-writing-shelf-${shelfId}.json`)
  }
  async function loadLatest(): Promise<void> {
    // The remount moves this draft to the recovered slot and offers it back.
    try { sessionStorage.setItem(draftKey, JSON.stringify({ shelfId, revision: writer.revision, blocks: editor.document })) } catch { copyDraft() }
    try {
      const latest = await getPlain(getPageResponse, `/shelves/${shelfId}/page`)
      queryClient.setQueryData(queryKeys.shelfPage(shelfId), latest)
      onCheckpoint(latest)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not reload the collection.') }
  }

  const bridge = useMemo(() => ({ byId: new Map(folders.map((folder) => [folder.id, folder])), href: folderHref, open: onOpenFolder }), [folders, folderHref, onOpenFolder])
  // The folder page's line: a failure only; a refused gesture's notice when nothing failed.
  const failure = error || (writer.state === 'failed' ? NOT_SAVED : '')
  return <>
    {previousDraft !== null ? <RecoveryNotice
      onDownload={() => { download(previousDraft, `dana-recovered-shelf-${shelfId}.json`) }}
      onDiscard={() => { try { sessionStorage.removeItem(recoveredKey) } catch { /* optional */ } setPreviousDraft(null) }}
    /> : null}
    <CanvasFolderProvider value={bridge}>
      <CanvasSurface
        editor={editor}
        onChange={changed}
        folderRefs={NO_REFS}
        label="Collection writing and pages"
        flatGroups
        onUploadFile={uploadCanvasFile}
        onRemoveFolder={(folderId) => { void remove(folderId) }}
        onNotice={setNotice}
      />
    </CanvasFolderProvider>
    <SaveFailure
      message={failure || notice || null}
      onRetry={!error && writer.state === 'failed' && writer.pending ? () => { void writer.retry() } : undefined}
      onLoadLatest={writer.state === 'failed' || error === CHANGED_ELSEWHERE ? () => { void loadLatest() } : undefined}
    />
  </>
}

function richText(block: CanvasBlock): string {
  if (!Array.isArray(block.content)) return ''
  return block.content.map((inline) => inline.type === 'text' ? inline.text : inline.type === 'link' ? inline.content.map((run) => run.text).join('') : '').join('')
}
