/*
The Shelf's composer (#221, Shelf half): the Folder canvas's BlockNote surface
and `CanvasWriter`, posting 7.16's `document_transaction` to
`/shelves/:id/page/actions` (`domain/shelf-document.ts`).

What a Shelf document is, and so what this adapter does on top of the shared one:

- **Flat, belonging by position.** The Shelf route refuses `section_block_id`
  and `list_parent_block_id`, and the legacy Shelf editor always meant "a block
  under a heading folds with it". So a read groups each block under the section
  before it (content before the first section stays at the root), and a write
  sends the editor's order flat. One heading level; the surface hides the
  gestures a reload would undo.
- **A Folder row is a `danaFolder` block** over a `folder_ref` row. Presence is
  the membership (`folder_members.shelf_name`), position is the document: a
  stored row whose folder has left the Shelf is not drawn and is deleted by the
  next save; a member with no row is drawn after the content and written by the
  next save. A row leaves only through Remove from shelf — the guard below
  refuses a generic delete, a paste that places a folder twice, and an undo
  that would place a folder that is no longer on the Shelf.
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { fragmentToBlocks } from '@blocknote/core'
import { useQueryClient } from '@tanstack/react-query'
import '@blocknote/shadcn/style.css'

import type { PageView } from '../../../../shared/pages.js'
import { getPageResponse } from '../../../../shared/pages.js'
import { AUDIO_MIMES, RASTER_MIMES, VIDEO_MIMES } from '../../../../shared/files.js'
import { getPlain, mutateApi, uploadFile } from '../../../api/http.js'
import { queryKeys } from '../../../api/keys.js'
import { FolderPlus, Plus } from '../../../lib/icons.js'
import { Button } from '../../ui/button.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../ui/dropdown-menu.js'
import { cn } from '../../ui/utils.js'
import { markIcon } from '../icon-manifest.js'
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
import { pasteIntoCanvas } from './paste.js'

interface Props {
  readonly shelfId: string
  readonly page: PageView
  /** The Shelf's members, in the folder list's order. */
  readonly folders: readonly CanvasFolderRow[]
  readonly addableFolders: readonly { id: string; name: string; color: string; icon: string | null }[]
  readonly folderHref: (folderId: string) => string
  readonly onOpenFolder: (folderId: string) => void
  /** Files the folder on this Shelf; resolves once the membership is written. */
  readonly onAddFolder: (folderId: string) => Promise<void>
  readonly onRemoveFolder: (folderId: string) => Promise<void>
  readonly onCreateFolder: () => void
}

const NO_REFS: ReadonlyMap<string, string> = new Map()

/** The page as the shared hydrator reads it: stale Folder rows dropped, each
 * block grouped under the section before it. */
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
    else blocks.push({ ...block, section_block_id: section, list_parent_block_id: null })
  }
  return { ...page, blocks, items: page.items.filter((item) => kept.has(item.id)), task_placements: [] }
}

function folderIdsOf(blocks: readonly OutlineBlock[]): string[] {
  return blocks.flatMap((block) => [
    ...(block.type === 'danaFolder' && typeof block.props.folderId === 'string' ? [block.props.folderId] : []),
    ...folderIdsOf(block.children),
  ])
}

function flat(document: CanvasDocument): CanvasDocument {
  return { blocks: document.blocks, items: document.items.map((item) => ({ ...item, section_block_id: null, list_parent_block_id: null })) }
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
  return <div ref={host} className="min-w-0">{width === null ? <p role="status">Loading writing…</p> : <ShelfEditor {...props} width={width} />}</div>
}

function ShelfEditor({ shelfId, page, initialPage, folders, addableFolders, folderHref, onOpenFolder, onAddFolder, onRemoveFolder, onCreateFolder, onCheckpoint, width }: Props & {
  readonly initialPage: PageView
  readonly onCheckpoint: (page: PageView) => void
  readonly width: number
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const [, render] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [picking, setPicking] = useState(false)
  const [previousDraft, setPreviousDraft] = useState<string | null>(null)
  const anchor = useRef<string | null>(null)
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
    return [...drawn, ...missing]
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
  useEffect(() => {
    try { setPreviousDraft(sessionStorage.getItem(draftKey)) } catch { /* storage is optional */ }
  }, [draftKey])
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
  useEffect(() => {
    if (!page.revision || page.revision === writer.revision || writer.state === 'saving') return
    if (writer.state === 'saved') onCheckpoint(page)
    else setError('This shelf changed elsewhere. Your writing is retained. Download it and load the latest shelf before continuing.')
  }, [page, writer, onCheckpoint])

  // The Folder-row guard. Runs beside the canvas's own (`installCanvasGuard`).
  useEffect(() => editor.onBeforeChange(({ tr }) => {
    if (!tr.docChanged) return
    const nested = (blocks: readonly OutlineBlock[]): boolean => blocks.some((block) =>
      (block.type !== 'heading' && block.children.length > 0) || nested(block.children))
    if (nested(fragmentToBlocks<typeof canvasSchema.blockSchema, typeof canvasSchema.inlineContentSchema, typeof canvasSchema.styleSchema>(tr.doc.content))) {
      setNotice('A shelf keeps its lists flat: nested list items are not supported here.')
      return false
    }
    const before = folderIdsOf(fragmentToBlocks<typeof canvasSchema.blockSchema, typeof canvasSchema.inlineContentSchema, typeof canvasSchema.styleSchema>(tr.before.content))
    const after = folderIdsOf(fragmentToBlocks<typeof canvasSchema.blockSchema, typeof canvasSchema.inlineContentSchema, typeof canvasSchema.styleSchema>(tr.doc.content))
    const had = new Set(before)
    const has = new Set(after)
    const failure = before.some((id) => !has.has(id) && !sanctioned.current.has(id))
      ? 'A folder leaves this shelf only through Remove from shelf, in its row\'s menu. Select only the writing to delete it.'
      : after.length !== new Set(after).size
        ? 'A folder can be placed on a shelf once.'
        : after.some((id) => !had.has(id) && !members.current.has(id) && !sanctioned.current.has(id))
          ? 'That folder is no longer on this shelf. Add it again with Add folder.'
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
  function place(folderId: string, at: string | null): void {
    if (blockOf(folderId) !== undefined) return
    const row = { id: crypto.randomUUID(), type: 'danaFolder' as const, props: { folderId } }
    const target = at === null ? undefined : editor.getBlock(at)
    withSanction(folderId, () => {
      if (target === undefined) editor.insertBlocks([row], editor.document.at(-1)!, 'after')
      else if (target.type === 'heading') editor.updateBlock(target, { children: [row, ...target.children] })
      else if (target.type === 'paragraph' && richText(target) === '') editor.replaceBlocks([target], [row])
      else editor.insertBlocks([row], target, 'after')
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
    for (const folderId of memberIds) place(folderId, null)
    for (const folderId of folderIdsOf(editor.document)) if (!memberIds.has(folderId)) unplace(folderId)
  }, [memberIds])

  async function add(folderId: string): Promise<void> {
    const at = anchor.current
    anchor.current = null
    try {
      await onAddFolder(folderId)
      place(folderId, at)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The folder could not be added. Try again.') }
  }
  async function remove(folderId: string): Promise<void> {
    try {
      await onRemoveFolder(folderId)
      unplace(folderId)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The folder could not be removed. Try again.') }
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
    copyDraft()
    try {
      const latest = await getPlain(getPageResponse, `/shelves/${shelfId}/page`)
      queryClient.setQueryData(queryKeys.shelfPage(shelfId), latest)
      onCheckpoint(latest)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not reload the shelf.') }
  }

  const folderSlash: DefaultReactSuggestionItem = {
    title: 'Folder', subtext: 'Place a folder on this shelf here', icon: <FolderPlus size={16} />,
    aliases: ['shelf'], group: 'Basic blocks',
    onItemClick: () => { anchor.current = editor.getTextCursorPosition().block.id; setPicking(true) },
  }
  const bridge = useMemo(() => ({ byId: new Map(folders.map((folder) => [folder.id, folder])), href: folderHref, open: onOpenFolder }), [folders, folderHref, onOpenFolder])
  const feedback = error || (writer.state === 'failed' ? writer.error instanceof Error ? writer.error.message : 'Could not save. Your writing is retained.' : '')
  return <>
    {previousDraft !== null && writer.state === 'saved' ? <div role="status" className="mb-3 text-sm text-muted-foreground">
      Writing from an earlier visit in this tab did not finish saving.
      <Button variant="ghost" onClick={() => download(previousDraft, `dana-recovered-shelf-${shelfId}.json`)}>Download previous draft</Button>
      <Button variant="ghost" onClick={() => { try { sessionStorage.removeItem(draftKey) } catch { /* optional */ } setPreviousDraft(null) }}>Dismiss</Button>
    </div> : null}
    <CanvasFolderProvider value={bridge}>
      <CanvasSurface
        editor={editor}
        onChange={changed}
        folderRefs={NO_REFS}
        label="Shelf writing and folders"
        flatGroups
        onUploadFile={uploadCanvasFile}
        onRemoveFolder={(folderId) => { void remove(folderId) }}
        extraSlashItems={[folderSlash]}
      />
    </CanvasFolderProvider>
    <DropdownMenu open={picking} onOpenChange={setPicking}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            onClick={() => { anchor.current = null }}
            className={cn(
              'flex h-[var(--control-height)] w-full items-center gap-3 rounded-md px-2 text-left text-sm text-[var(--color-graphite-500)] transition-colors outline-none',
              'hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]',
              'focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] data-popup-open:bg-[var(--color-graphite-50)]',
            )}
          />
        }
      >
        <Plus className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Add folder
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        {addableFolders.map((folder) => {
          const Glyph = markIcon(folder.icon)
          return (
            <DropdownMenuItem key={folder.id} onClick={() => { void add(folder.id) }}>
              <Glyph className="size-4" style={{ color: folder.color }} />
              <span className="truncate">{folder.name}</span>
            </DropdownMenuItem>
          )
        })}
        {addableFolders.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onClick={onCreateFolder}>
          <FolderPlus className="size-4" />
          New folder…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {feedback || notice || (writer.state === 'saving' ? 'Saving…' : writer.state === 'changed' ? 'Unsaved writing' : 'Saved')}
      {feedback ? <><Button variant="outline" onClick={() => { void writer.retry() }} disabled={!writer.pending}>Retry save</Button><Button variant="ghost" onClick={copyDraft}>Download writing</Button><Button variant="ghost" onClick={() => { void loadLatest() }}>Download writing and load latest</Button></> : null}
    </div>
  </>
}

function richText(block: CanvasBlock): string {
  if (!Array.isArray(block.content)) return ''
  return block.content.map((inline) => inline.type === 'text' ? inline.text : inline.type === 'link' ? inline.content.map((run) => run.text).join('') : '').join('')
}
