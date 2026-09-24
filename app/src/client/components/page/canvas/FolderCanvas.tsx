import { useEffect, useMemo, useRef, useState } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteEditor } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import { useQueryClient } from '@tanstack/react-query'
import '@blocknote/shadcn/style.css'
import type { PageView } from '../../../../shared/pages.js'
import { AUDIO_MIMES, RASTER_MIMES, VIDEO_MIMES } from '../../../../shared/files.js'
import { getPageResponse } from '../../../../shared/pages.js'
import { documentTransaction } from '../../../../shared/page-document.js'
import { getPlain, mutateApi, uploadFile as uploadDanaFile } from '../../../api/http.js'
import { queryKeys } from '../../../api/keys.js'
import { Button } from '../../ui/button.js'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog.js'
import { Input } from '../../ui/input.js'
import { CanvasErrorBoundary } from './CanvasErrorBoundary.js'
import { CanvasTaskProvider } from './CanvasTask.js'
import { CanvasSurface } from './CanvasSurface.js'
import type { CanvasMediaKind, CanvasUploadedFile } from './CanvasFilePanel.js'
import { canvasSchema } from './schema.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { baselineOf, dehydrateCanvas, folderRefsOf, hydrateCanvas, mergeWorkDocument, richRuns, workPageOf } from './adapters.js'
import type { CanvasDocument, CanvasInput } from './adapters.js'
import { CanvasWriter } from './saving.js'
import { pasteIntoCanvas } from './paste.js'
import type { TaskRows } from '../../../pages/task-rows.js'

type Rows = Parameters<typeof TaskRows>[0]
interface Props extends Pick<Rows, 'tasks' | 'context' | 'actions' | 'onAsk'> {
  readonly page: PageView
  readonly folderId: string
  readonly arrangeable: boolean
  /** A facet with its own document passes this id. Work facets continue to
   * use the Folder page and never pass it. */
  readonly facetId?: string
  /** Purpose headings change document typography only; they never create Work Sections. */
  readonly presentationHeadings?: boolean
  readonly workRootId?: string
  /** The folder's completed task cards the page already loaded; a placement
   * found here draws as its real row, checked and muted. */
  readonly completed?: Rows['tasks']
  /** False hides completed placements in place (the View menu's "Show completed"). */
  readonly showCompleted?: boolean
}

/** Reset history only at identity-changing checkpoints or explicit server reconciliation. */
export default function FolderCanvas(props: Props): React.JSX.Element {
  const [checkpoint, setCheckpoint] = useState<{ page: PageView; epoch: number }>({ page: props.page, epoch: 0 })
  return <CanvasErrorBoundary>
    <PersistedCanvas key={`${props.folderId}:${checkpoint.epoch}`} {...props} initialPage={checkpoint.page} onCheckpoint={(page) => setCheckpoint((old) => ({ page, epoch: old.epoch + 1 }))} />
  </CanvasErrorBoundary>
}

function PersistedCanvas({ page, initialPage, folderId, facetId, presentationHeadings, workRootId, tasks, completed, showCompleted, context, actions, onAsk, arrangeable, onCheckpoint }: Props & {
  readonly initialPage: PageView
  readonly onCheckpoint: (page: PageView) => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  const [reloadNote, setReloadNote] = useState('')
  useEffect(() => { setWidth(host.current?.clientWidth || 600) }, [])
  // A page without a revision cannot be written safely: every save would carry
  // no base and the server could not refuse a stale write. Say so and offer a
  // reload instead of crashing the canvas or guessing a base.
  const pageKey = facetId === undefined ? queryKeys.folderPage(folderId) : queryKeys.facetPage(folderId, facetId)
  if (!initialPage.revision) return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
    This page opened without its version, so writing is paused to keep your page safe. Nothing was changed.
    <Button variant="outline" onClick={() => { setReloadNote('Loading…'); void queryClient.invalidateQueries({ queryKey: pageKey }).then(() => {
      const latest = queryClient.getQueryData<PageView>(pageKey)
      if (latest?.revision) onCheckpoint(latest)
      else setReloadNote('The page still has no version. Try again in a moment.')
    }) }}>Load the page again</Button>{reloadNote}
  </div>
  return <div ref={host} className="min-w-0">{width === null ? <p role="status">Loading writing…</p> : <CanvasSession {...{ page, initialPage, folderId, facetId, presentationHeadings, workRootId, tasks, completed, showCompleted, context, actions, onAsk, arrangeable, onCheckpoint }} width={width} onSaved={(next) => {
    queryClient.setQueryData(facetId === undefined ? queryKeys.folderPage(folderId) : queryKeys.facetPage(folderId, facetId), next)
  }} />}</div>
}

function CanvasSession({ page, initialPage, folderId, facetId, presentationHeadings, workRootId, tasks, completed, showCompleted = true, context, actions, onAsk, arrangeable, onCheckpoint, width, onSaved }: Props & {
  readonly initialPage: PageView
  readonly onCheckpoint: (page: PageView) => void
  readonly width: number
  readonly onSaved: (page: PageView) => void
}): React.JSX.Element {
  const [, render] = useState(0)
  const [error, setError] = useState('')
  const [taskAt, setTaskAt] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [taskError, setTaskError] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [previousDraft, setPreviousDraft] = useState<string | null>(null)
  const editorPage = useMemo(() => workRootId === undefined ? initialPage : workPageOf(initialPage, workRootId), [initialPage, workRootId])
  const initial = useMemo(() => {
    const hydrated = hydrateCanvas(editorPage, width)
    if (workRootId === undefined) return hydrated
    const shift = (blocks: CanvasInput[]): CanvasInput[] => blocks.map((block) => {
      const children = block.children ? shift(block.children) : []
      if (block.type === 'heading') {
        return {
          ...block,
          props: { ...block.props, level: Math.min(3, Number(block.props?.level ?? 1) + 1) as 1 | 2 | 3 },
          children,
        }
      }
      return { ...block, children } as CanvasInput
    })
    return shift(hydrated)
  }, [editorPage, width, workRootId])
  /* Which of these block ids the server *currently* stores as a reference, so
     it is read from `page` — the query row `onSaved` writes back after every
     save — and never from `initialPage`, which the editor's content comes from.
     The two differ on purpose and reading both from `initialPage` is wrong in
     one direction.

     This session does not remount after an ordinary save. `onCheckpoint` fires
     only for a transaction carrying `create_task`, and the reconciliation
     effect below returns early while `page.revision === writer.revision`, so a
     map taken at mount keeps an entry for a block long after a save wrote
     `ref_folder_id: null` for it. BlockNote keeps a block's id across a type
     conversion and `dehydrateCanvas` re-applies the entry to whatever is a
     paragraph under that id, so reference → heading → paragraph inside one
     mounted session put the relation back and dropped the rich content the
     block gathered while it was a heading — a deliberate conversion silently
     reverted, and `page_blocks_ref_folder_id_fkey` being ON DELETE CASCADE,
     the folder then took the paragraph with it. Measured through this
     component against a real database in issue #255's review; AC-663 is it.

     `page` follows the server, so the entry goes as soon as the conversion
     lands. **What that does not close is the flight itself**: a conversion and
     its undo inside one save's flight read a map nothing has updated yet, and
     the relation is restored.

     **That window is one request long only while saves succeed, and it is
     unbounded when one fails.** Measured on this commit in #255's second
     review, which drove it end to end. `CanvasWriter.change` sets `latest`
     unconditionally and latches only the state transition, so every keystroke
     during a failure is still projected against this map; `committed` never
     runs, so `onSaved` never runs, so `page` — and this map with it — is
     frozen at the pre-failure row for the whole failure; and the editor stays
     editable throughout. `retry()` then re-sends the original request,
     `committed` runs, `settled(latest)` is computed from a projection built
     against the stale map and answers `'changed'`, and the autosave ships it
     **with no gesture after the retry**. Convert a reference to a heading, see
     the save fail, press undo, click Retry save: the row comes back a
     `folder_ref` under ON DELETE CASCADE on a block deliberately converted
     away. Narrower than the hole above — it needs a failure straddling a
     conversion — and far narrower than `main`, where the relation died on
     every keystroke. Closing it means reading `writer.pending?.document`
     rather than `page`, and it wants a criterion: nothing in the suite makes
     `route.send` throw, so this whole path is unmeasured. */
  const folderRefs = useMemo(() => folderRefsOf(page), [page])
  async function uploadCanvasFile(
    kind: CanvasMediaKind,
    file: File,
  ): Promise<CanvasUploadedFile> {
    try {
      const uploaded = await uploadDanaFile(kind, folderId, file)
      return {
        url: `/api/v1/files/${uploaded.id}`,
        name: file.name,
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'The file could not be uploaded. Try again.',
      )
      throw failure
    }
  }

  const placeholder = facetId === undefined ? 'Write, or type / for a task or heading' : 'Write, or type / for a heading'
  const editor = useCreateBlockNote({
    schema: canvasSchema,
    dictionary: { ...en, placeholders: { ...en.placeholders, emptyDocument: placeholder, default: placeholder } },
    initialContent: initial.length ? initial : [{ id: crypto.randomUUID(), type: 'paragraph', content: '' }],
    pasteHandler: ({ editor: current, event, defaultPasteHandler }) =>
      pasteIntoCanvas(
        current,
        event,
        setError,
        presentationHeadings === true,
      ) ?? defaultPasteHandler({ plainTextAsMarkdown: false }),
    /*
     * BlockNote uses this path for direct drops. The schema's fileBlockAccept
     * tables use the same shared allowlists, so an unsupported audio/video
     * MIME falls through to File and this classification stays in lockstep.
     * Explicit slash insertion/replacement uses CanvasFilePanel instead, where
     * the selected block kind is known and therefore cannot be reclassified.
     */
    uploadFile: async (file) => {
      const mime = file.type
      const kind: CanvasMediaKind =
        (RASTER_MIMES as readonly string[]).includes(mime)
          ? 'image'
          : (AUDIO_MIMES as readonly string[]).includes(mime)
            ? 'audio'
            : (VIDEO_MIMES as readonly string[]).includes(mime)
              ? 'video'
              : 'file'
      // BlockNote applies an object result as an updateBlock partial, so the
      // file's url and name go under `props` or the dropped block stays empty.
      return { props: await uploadCanvasFile(kind, file) }
    },
  })
  // The baseline is the server's page reconciled with what this editor can draw
  // of it, never the editor's rendering alone: `dehydrateCanvas` knows three
  // kinds and no nesting, so a writer based on it has nothing to restore from
  // and every save flattens the page. An empty page still starts from an empty
  // baseline, so the placeholder paragraph is written rather than assumed.
  const documentPath = facetId === undefined ? `/folders/${folderId}/page` : `/folders/${folderId}/facets/${facetId}/page`
  const projection = (current: readonly CanvasBlock[]): CanvasDocument => {
    const drawn = dehydrateCanvas(current, width, folderRefs)
    const lossless = baselineOf(editorPage, drawn)
    return workRootId === undefined ? lossless : mergeWorkDocument(page, workRootId, lossless)
  }
  const empty = { blocks: [], items: [] }
  // Projected once, at mount: on later renders the live document may hold an
  // unsaveable block (an external image) and projecting it here would throw
  // during render and take the whole canvas down.
  const firstProjection = (): CanvasDocument => initial.length
    ? projection(editor.document)
    : workRootId === undefined
      ? empty
      : mergeWorkDocument(initialPage, workRootId, empty)
  const [writer] = useState(() => new CanvasWriter(firstProjection(), initialPage.revision ?? '',
    (body) => mutateApi(getPageResponse, { method: 'POST', path: `${documentPath}/actions`, body }),
    () => {
      render((value) => value + 1)
      try {
        if (writer.state === 'saved') sessionStorage.removeItem(`dana-canvas-draft:${folderId}`)
        else sessionStorage.setItem(`dana-canvas-draft:${folderId}`, JSON.stringify({ folderId, revision: writer.revision, blocks: editor.document, pending: writer.pending?.request }))
      } catch { /* recoverable in memory; storage is optional */ }
    },
    (next, checkpoint) => { onSaved(next); if (checkpoint) onCheckpoint(next) },
  ))
  // This is a recoverable draft, never a cached page or an automatic offline queue.
  const draftKey = `dana-canvas-draft:${facetId ?? folderId}`
  useEffect(() => {
    try { const draft = sessionStorage.getItem(draftKey); setPreviousDraft(draft); setRecovery(draft !== null) } catch { /* storage is optional */ }
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
    else setError('This page changed elsewhere. Your writing is retained. Save a copy and load the latest page before continuing.')
  }, [page, writer, onCheckpoint])

  function changed(current: CanvasEditor): void {
    try {
      writer.change(projection(current.document))
      setError('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare this edit for saving.') }
  }
  function copyDraft(): void {
    const content = JSON.stringify({ folderId, revision: writer.revision, blocks: editor.document }, null, 2)
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `dana-writing-${folderId}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  async function loadLatest(): Promise<void> {
    copyDraft()
    try {
      const latest = await getPlain(getPageResponse, documentPath)
      onSaved(latest)
      onCheckpoint(latest)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not reload the page.') }
  }
  /* Takes its block and title as arguments rather than reading state, because
     the slash menu calls it in the same tick it would have set that state. A
     refusal opens the dialog with the title kept, so it is never lost. */
  async function createTask(blockId: string | null, taskTitle: string): Promise<void> {
    if (!blockId || !taskTitle.trim()) return
    const refuse = (message: string): void => { setTaskAt(blockId); setTitle(taskTitle); setTaskError(message) }
    if (writer.state === 'failed') { refuse(taskBlocked); return }
    setCreating(true)
    setTaskError('')
    await writer.flush()
    if (writer.state !== 'saved') { setCreating(false); refuse(taskBlocked); return }
    const id = crypto.randomUUID()
    const replace = (blocks: readonly CanvasInput[]): CanvasInput[] => blocks.flatMap((block) => {
      if (block.id === blockId) {
        const task: CanvasInput = { id, type: 'danaTask', props: { taskId: id } }
        return block.type === 'paragraph' ? [task] : [block, task]
      }
      return [{ ...block, children: block.children ? replace(block.children) : [] }]
    })
    const proposal = replace(editor.document)
    // Serialize with the schema's complete block shape; no temporary Task row or
    // simulated mutable Task record is put into the live editor before commit.
    let temporary: ReturnType<typeof BlockNoteEditor.create> | null = null
    let drafted: CanvasDocument
    try {
      temporary = BlockNoteEditor.create({ schema: canvasSchema, initialContent: proposal })
      drafted = dehydrateCanvas(temporary.document, width, folderRefs)
    } catch (failure) {
      // Nothing was sent; keep the dialog open so the title is not lost.
      refuse(failure instanceof Error ? failure.message : 'Could not prepare this Task for saving.')
      setCreating(false)
      return
    } finally { temporary?.unmount() }
    writer.change(drafted)
    // A failed send is reported by the save status below, whose Retry
    // re-sends this exact request, Task included.
    try { await writer.flush({ id, title: taskTitle.trim() }) } finally { setCreating(false); setTaskAt(null) }
  }
  const taskBlocked = 'Your writing has not saved, so a task cannot be created yet. Close this, then use Retry or Download writing below.'
  // A paragraph with text becomes its task at once; an empty line asks for a title.
  function askTask(target?: CanvasBlock): void {
    const block = target ?? editor.getTextCursorPosition().block
    const text = block.type === 'paragraph' ? richRuns(block).map((run) => run.text).join('') : ''
    if (text.trim()) { void createTask(block.id, text); return }
    setTaskAt(block.id)
    setTaskError(writer.state === 'failed' ? taskBlocked : '')
    setTitle(text)
  }
  const feedback = error || (writer.state === 'failed' ? writer.error instanceof Error ? writer.error.message : 'Could not save. Your writing is retained.' : '')
  const pendingTask = writer.pending?.request.operations.some((operation) => operation.op === 'create_task') === true
  // "Saving…" only after two seconds of continuous unsaved writing; a quick
  // save says nothing at all, and a saved page never says "Saved".
  const busy = writer.state === 'changed' || writer.state === 'saving'
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!busy) return
    const timer = window.setTimeout(() => setSlow(true), 2000)
    return () => { window.clearTimeout(timer); setSlow(false) }
  }, [busy])
  const downloadDraft = (): void => {
    if (!previousDraft) return
    const url = URL.createObjectURL(new Blob([previousDraft], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `dana-recovered-${folderId}.json`; link.click(); URL.revokeObjectURL(url)
  }
  return <>
    {!arrangeable ? <p className="mb-3 text-sm text-muted-foreground">Writing is paused while this list is filtered or sorted.</p> : null}
    {recovery ? <div role="status" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">Earlier writing from this tab was not saved.<Button variant="ghost" size="sm" onClick={downloadDraft}>Download it</Button><Button variant="ghost" size="sm" onClick={() => {
      void (async () => {
        try {
          const data: unknown = JSON.parse(previousDraft ?? '{}')
          const pending = typeof data === 'object' && data !== null && 'pending' in data ? documentTransaction.safeParse(data.pending) : null
          if (!pending?.success) { setError('This draft has no interrupted request. Download it to keep the writing.'); return }
          const next = await mutateApi(getPageResponse, { method: 'POST', path: `/folders/${folderId}/page/actions`, body: pending.data })
          // Keep a copy of any writing made after that original request.
          downloadDraft()
          sessionStorage.removeItem(draftKey)
          onSaved(next); onCheckpoint(next)
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'The interrupted save could not be recovered.') }
      })()
    }}>Retry saving it</Button><Button variant="ghost" size="sm" onClick={() => { sessionStorage.removeItem(draftKey); setRecovery(false) }}>Dismiss</Button></div> : null}
    <CanvasTaskProvider tasks={tasks} completed={completed} context={context} actions={actions} onAsk={onAsk}>
      <div className={showCompleted ? 'min-w-0' : 'dana-hide-completed min-w-0'}>
      <CanvasSurface
        placeholder={placeholder}
        editor={editor}
        onChange={changed}
        onCreateTask={facetId === undefined ? askTask : undefined}
        folderRefs={folderRefs}
        onUploadFile={uploadCanvasFile}
        headingMode={
          facetId === undefined
            ? 'section'
            : presentationHeadings === true
              ? 'document'
              : 'none'
        }
        editable={arrangeable && !creating && !pendingTask}
      />
      </div>
    </CanvasTaskProvider>
    <div role="status" aria-live="polite" className="flex min-h-6 flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {feedback ? <>
        <span>{writer.state === 'failed' && !error ? 'Not saved — ' : feedback}</span>
        {writer.pending ? <Button variant="ghost" size="sm" onClick={() => { void writer.retry() }}>Retry</Button> : null}
        <Button variant="ghost" size="sm" onClick={copyDraft}>Download writing</Button>
        <Button variant="ghost" size="sm" onClick={() => { void loadLatest() }}>Download writing and load latest</Button>
      </> : busy && slow ? 'Saving…' : null}
    </div>
    <Dialog open={taskAt !== null} onOpenChange={(open) => { if (!open && !creating) setTaskAt(null) }}>
      <DialogContent><DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
        <Input aria-label="Task title" placeholder="Task title" value={title} maxLength={500} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createTask(taskAt, title) }} />
        {taskError ? <p role="alert" className="text-sm text-destructive">{taskError}</p> : null}
        <DialogFooter><Button variant="ghost" onClick={() => setTaskAt(null)} disabled={creating}>Cancel</Button><Button variant="commit" onClick={() => { void createTask(taskAt, title) }} disabled={creating || !title.trim() || writer.state === 'failed'}>Add task</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
