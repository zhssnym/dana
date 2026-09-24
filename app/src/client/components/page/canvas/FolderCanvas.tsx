import { useEffect, useMemo, useRef, useState } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteEditor } from '@blocknote/core'
import { useQueryClient } from '@tanstack/react-query'
import '@blocknote/shadcn/style.css'
import type { PageView } from '../../../../shared/pages.js'
import { AUDIO_MIMES, RASTER_MIMES, VIDEO_MIMES } from '../../../../shared/files.js'
import { getPageResponse } from '../../../../shared/pages.js'
import { documentTransaction } from '../../../../shared/page-document.js'
import { getPlain, mutateApi, uploadFile as uploadDanaFile } from '../../../api/http.js'
import { queryKeys } from '../../../api/keys.js'
import { Button } from '../../ui/button.js'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog.js'
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
}

/** Reset history only at identity-changing checkpoints or explicit server reconciliation. */
export default function FolderCanvas(props: Props): React.JSX.Element {
  const [checkpoint, setCheckpoint] = useState<{ page: PageView; epoch: number }>({ page: props.page, epoch: 0 })
  return <CanvasErrorBoundary>
    <PersistedCanvas key={`${props.folderId}:${checkpoint.epoch}`} {...props} initialPage={checkpoint.page} onCheckpoint={(page) => setCheckpoint((old) => ({ page, epoch: old.epoch + 1 }))} />
  </CanvasErrorBoundary>
}

function PersistedCanvas({ page, initialPage, folderId, facetId, presentationHeadings, workRootId, tasks, context, actions, onAsk, arrangeable, onCheckpoint }: Props & {
  readonly initialPage: PageView
  readonly onCheckpoint: (page: PageView) => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => { setWidth(host.current?.clientWidth || 600) }, [])
  return <div ref={host} className="min-w-0">{width === null ? <p role="status">Loading writing…</p> : <CanvasSession {...{ page, initialPage, folderId, facetId, presentationHeadings, workRootId, tasks, context, actions, onAsk, arrangeable, onCheckpoint }} width={width} onSaved={(next) => {
    queryClient.setQueryData(facetId === undefined ? queryKeys.folderPage(folderId) : queryKeys.facetPage(folderId, facetId), next)
  }} />}</div>
}

function CanvasSession({ page, initialPage, folderId, facetId, presentationHeadings, workRootId, tasks, context, actions, onAsk, arrangeable, onCheckpoint, width, onSaved }: Props & {
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

  const editor = useCreateBlockNote({
    schema: canvasSchema,
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
      return uploadCanvasFile(kind, file)
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
  const firstProjection = initial.length
    ? projection(editor.document)
    : workRootId === undefined
      ? empty
      : mergeWorkDocument(initialPage, workRootId, empty)
  const [writer] = useState(() => new CanvasWriter(firstProjection, initialPage.revision!,
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
  async function createTask(): Promise<void> {
    if (!taskAt || !title.trim() || writer.state === 'failed') return
    setCreating(true)
    await writer.flush()
    if (writer.state !== 'saved') { setCreating(false); return }
    const id = crypto.randomUUID()
    const replace = (blocks: readonly CanvasInput[]): CanvasInput[] => blocks.flatMap((block) => {
      if (block.id === taskAt) {
        const task: CanvasInput = { id, type: 'danaTask', props: { taskId: id } }
        return block.type === 'paragraph' ? [task] : [block, task]
      }
      return [{ ...block, children: block.children ? replace(block.children) : [] }]
    })
    const proposal = replace(editor.document)
    // Serialize with the schema's complete block shape; no temporary Task row or
    // simulated mutable Task record is put into the live editor before commit.
    const temporary = BlockNoteEditor.create({ schema: canvasSchema, initialContent: proposal })
    try {
      writer.change(dehydrateCanvas(temporary.document, width, folderRefs))
      await writer.flush({ id, title: title.trim() })
    } finally { temporary.unmount(); setCreating(false); setTaskAt(null) }
  }
  function askTask(target?: CanvasBlock): void {
    const block = target ?? editor.getTextCursorPosition().block
    setTaskAt(block.id)
    setTitle(block.type === 'paragraph' ? richRuns(block).map((run) => run.text).join('') : '')
  }
  const feedback = error || (writer.state === 'failed' ? writer.error instanceof Error ? writer.error.message : 'Could not save. Your writing is retained.' : '')
  const pendingTask = writer.pending?.request.operations.some((operation) => operation.op === 'create_task') === true
  return <>
    {!arrangeable ? <p className="mb-3 text-sm text-muted-foreground">Writing and movement are paused while this view is sorted, filtered or grouped. Return to manual order to edit the outline.</p> : null}
    {recovery ? <div role="status" className="mb-3 text-sm text-muted-foreground">A writing draft from this tab is available. <Button variant="ghost" onClick={() => {
      const saved = previousDraft
      if (saved) {
        const url = URL.createObjectURL(new Blob([saved], { type: 'application/json' }))
        const link = document.createElement('a'); link.href = url; link.download = `dana-recovered-${folderId}.json`; link.click(); URL.revokeObjectURL(url)
      }
    }}>Download previous draft</Button><Button variant="outline" onClick={() => {
      void (async () => {
        try {
          const data: unknown = JSON.parse(previousDraft ?? '{}')
          const pending = typeof data === 'object' && data !== null && 'pending' in data ? documentTransaction.safeParse(data.pending) : null
          if (!pending?.success) { setError('This draft has no interrupted request. Download it to keep the writing.'); return }
          const next = await mutateApi(getPageResponse, { method: 'POST', path: `/folders/${folderId}/page/actions`, body: pending.data })
          // Keep a copy of any writing made after that original request.
          if (previousDraft) {
            const url = URL.createObjectURL(new Blob([previousDraft], { type: 'application/json' }))
            const link = document.createElement('a'); link.href = url; link.download = `dana-recovered-${folderId}.json`; link.click(); URL.revokeObjectURL(url)
          }
          sessionStorage.removeItem(draftKey)
          onSaved(next); onCheckpoint(next)
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'The interrupted save could not be recovered.') }
      })()
    }}>Retry interrupted save</Button><Button variant="ghost" onClick={() => { sessionStorage.removeItem(draftKey); setRecovery(false) }}>Dismiss</Button></div> : null}
    <CanvasTaskProvider tasks={tasks} context={context} actions={actions} onAsk={onAsk}>
      <CanvasSurface
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
    </CanvasTaskProvider>
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {feedback || (writer.state === 'saving' ? 'Saving…' : writer.state === 'changed' ? 'Unsaved writing' : 'Saved')}
      {feedback ? <><Button variant="outline" onClick={() => { void writer.retry() }} disabled={!writer.pending}>Retry save</Button><Button variant="ghost" onClick={copyDraft}>Download writing</Button><Button variant="ghost" onClick={() => { void loadLatest() }}>Download writing and load latest</Button></> : null}
    </div>
    <Dialog open={taskAt !== null} onOpenChange={(open) => { if (!open && !creating) setTaskAt(null) }}>
      <DialogContent><DialogHeader><DialogTitle>Create Task</DialogTitle><DialogDescription>The Task keeps this position. Document undo starts a new history after creation; Task actions remain in its own menu.</DialogDescription></DialogHeader>
        <Input aria-label="Task title" value={title} maxLength={500} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createTask() }} />
        <DialogFooter><Button variant="ghost" onClick={() => setTaskAt(null)} disabled={creating}>Cancel</Button><Button variant="commit" onClick={() => { void createTask() }} disabled={creating || !title.trim()}>Create Task</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
