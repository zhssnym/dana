import { useEffect, useMemo, useRef, useState } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteEditor } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import '@blocknote/shadcn/style.css'
import type { PageView } from '../../../../shared/pages.js'
import { AUDIO_MIMES, RASTER_MIMES, VIDEO_MIMES } from '../../../../shared/files.js'
import { getPageResponse } from '../../../../shared/pages.js'
import { documentTransaction } from '../../../../shared/page-document.js'
import { getPlain, mutateApi, uploadFile as uploadDanaFile } from '../../../api/http.js'
import { queryKeys } from '../../../api/keys.js'
import { paths } from '../../../routes.js'
import { FOLDER_ACTION_PARAM } from '../../../shell/app-sidebar.js'
import { Button } from '../../ui/button.js'
import { CanvasErrorBoundary } from './CanvasErrorBoundary.js'
import { CanvasTaskProvider } from './CanvasTask.js'
import { CanvasSurface } from './CanvasSurface.js'
import type { CanvasMediaKind, CanvasUploadedFile } from './CanvasFilePanel.js'
import { canvasSchema } from './schema.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { baselineOf, dehydrateCanvas, openOnCreate, pendingPages, folderRefsOf, hydrateCanvas, mergeWorkDocument, richRuns, workPageOf } from './adapters.js'
import type { CanvasDocument, CanvasInput } from './adapters.js'
import { CanvasWriter } from './saving.js'
import { isSectionHeading } from './outline.js'
import { NOT_SAVED, RecoveryNotice, SaveFailure } from './SaveFailure.js'
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

/** The one error "Load latest" answers besides a failed save. */
const CHANGED_ELSEWHERE = 'This page changed elsewhere. Your writing is kept here. Load the latest to continue; your writing will be offered back.'

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
  return <div ref={host} className="min-w-0">{width === null ? <p role="status" className="sr-only">Loading writing…</p> : <CanvasSession {...{ page, initialPage, folderId, facetId, presentationHeadings, workRootId, tasks, completed, showCompleted, context, actions, onAsk, arrangeable, onCheckpoint }} width={width} onSaved={(next) => {
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
  const [notice, setNotice] = useState('')
  /* The empty line "/ Task" turned into a task being titled in place: its
     block id while the person types, null otherwise. */
  const [draftTask, setDraftTask] = useState<string | null>(null)
  const draftRef = useRef<string | null>(null)
  draftRef.current = draftTask
  const [draftEmpty, setDraftEmpty] = useState(true)
  const [creating, setCreating] = useState(false)
  const [recovery, setRecovery] = useState(false)
  const [previousDraft, setPreviousDraft] = useState<string | null>(null)
  const editorPage = useMemo(() => workRootId === undefined ? initialPage : workPageOf(initialPage, workRootId), [initialPage, workRootId])
  const initial = useMemo(() => {
    const hydrated = hydrateCanvas(editorPage, width)
    if (workRootId === undefined) return hydrated
    const shift = (blocks: CanvasInput[]): CanvasInput[] => blocks.map((block) => {
      const children = block.children ? shift(block.children) : []
      // A Section's level is its depth, one deeper in the window; a
      // presentation heading keeps the level it is stored with.
      if (block.type === 'heading' && isSectionHeading({ type: block.type, props: (block.props ?? {}) as Record<string, unknown> })) {
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
  // of it, never the editor's rendering alone: a writer based on the rendering
  // alone has nothing to restore a kind the editor cannot draw from, and every
  // save would lose it. An empty page still starts from an empty
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
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const [writer] = useState(() => new CanvasWriter(firstProjection(), initialPage.revision ?? '',
    (body) => mutateApi(getPageResponse, { method: 'POST', path: `${documentPath}/actions`, body }),
    () => {
      render((value) => value + 1)
      try {
        if (writer.state === 'saved') sessionStorage.removeItem(`dana-canvas-draft:${folderId}`)
        else sessionStorage.setItem(`dana-canvas-draft:${folderId}`, JSON.stringify({ folderId, revision: writer.revision, blocks: editor.document, pending: writer.pending?.request }))
      } catch { /* recoverable in memory; storage is optional */ }
    },
    (next, checkpoint, operations) => {
      onSaved(next)
      if (checkpoint) onCheckpoint(next)
      /* A sub-page made, trashed or restored by this save: the sidebar's
         tree and every page row read the folder list. A `/page` title is let
         go only once that list has the page, so its row never blinks. */
      const created = operations.flatMap((op) => op.op === 'create_page' ? [op.id] : [])
      if (created.length > 0 || operations.some((op) => op.op === 'trash_page' || (op.op === 'put_block' && op.block_kind === 'page'))) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.folders(), exact: true }).finally(() => {
          for (const id of created) pendingPages.delete(id)
          // `/page` opens what it made, its title selected to be typed over.
          const opened = created.find((id) => openOnCreate.has(id))
          for (const id of created) openOnCreate.delete(id)
          if (opened !== undefined) void navigateRef.current(`${paths.folder(opened)}?${FOLDER_ACTION_PARAM}=rename`)
        })
      }
    },
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
    else setError(CHANGED_ELSEWHERE)
  }, [page, writer, onCheckpoint])

  function changed(current: CanvasEditor): void {
    const drafting = draftRef.current === null ? undefined : current.getBlock(draftRef.current)
    if (drafting !== undefined) setDraftEmpty(richRuns(drafting).every((run) => run.text === ''))
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
    // Kept as the Task and Shelf writers keep it: the draft goes to this tab's
    // storage and the remount offers it back ("Earlier writing…"); a download
    // only when storage refuses it.
    try { sessionStorage.setItem(draftKey, JSON.stringify({ folderId, revision: writer.revision, blocks: editor.document, pending: writer.pending?.request })) } catch { copyDraft() }
    try {
      const latest = await getPlain(getPageResponse, documentPath)
      onSaved(latest)
      onCheckpoint(latest)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not reload the page.') }
  }
  /* Takes its block and title as arguments rather than reading state, because
     the slash menu calls it in the same tick it would have set that state. A
     refusal leaves the title where it was typed, on the page, so it is never
     lost, and says why below the canvas. */
  async function createTask(blockId: string | null, taskTitle: string): Promise<void> {
    if (!blockId || !taskTitle.trim()) return
    const refuse = (message: string): void => { setError(message) }
    if (writer.state === 'failed') { refuse(taskBlocked); return }
    setCreating(true)
    await writer.flush()
    if (writer.state !== 'saved') { setCreating(false); refuse(taskBlocked); return }
    const id = crypto.randomUUID()
    const replace = (blocks: readonly CanvasInput[]): CanvasInput[] => blocks.flatMap((block) => {
      if (block.id === blockId) {
        const task: CanvasInput = { id, type: 'danaTask', props: { taskId: id } }
        // Text, or a stored to-do, becomes the Task (blocks nested under it follow it);
        // anything else keeps its place and the Task follows.
        return block.type === 'paragraph' || block.type === 'checkListItem' ? [task, ...replace(block.children ?? [])] : [block, task]
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
      // Nothing was sent; the title is still the line's own text.
      refuse(failure instanceof Error ? failure.message : 'Could not prepare this Task for saving.')
      setCreating(false)
      return
    } finally { temporary?.unmount() }
    writer.change(drafted)
    // A failed send is reported by the save status below, whose Retry
    // re-sends this exact request, Task included.
    try { await writer.flush({ id, title: taskTitle.trim() }) } finally { setCreating(false) }
  }
  const taskBlocked = 'Your writing has not saved, so a task cannot be created yet. Use Retry save or Download writing below.'
  /* A paragraph with text becomes its task at once. An empty line becomes a
     task being titled right there: the line takes a checkbox and a "Task
     title" placeholder, Enter or leaving it creates the task from what was
     typed, and leaving it empty takes the line away. No dialog. */
  function askTask(target?: CanvasBlock): void {
    const block = target ?? editor.getTextCursorPosition().block
    const text = block.type === 'paragraph' || block.type === 'checkListItem' ? richRuns(block).map((run) => run.text).join('') : ''
    if (text.trim()) { void createTask(block.id, text); return }
    if (writer.state === 'failed') { setError(taskBlocked); return }
    let at = block.id
    if (block.type !== 'paragraph') {
      const [inserted] = editor.insertBlocks([{ type: 'paragraph', content: '' }], block, 'after')
      if (inserted === undefined) return
      at = inserted.id
    }
    setDraftTask(at)
    setDraftEmpty(true)
    editor.setTextCursorPosition(at, 'end')
    editor.focus()
  }
  function settleDraftTask(): void {
    const blockId = draftRef.current
    if (blockId === null) return
    draftRef.current = null
    setDraftTask(null)
    const block = editor.getBlock(blockId)
    if (block === undefined) return
    const text = block.type === 'paragraph' ? richRuns(block).map((run) => run.text).join('') : ''
    if (text.trim()) { void createTask(blockId, text); return }
    if (editor.document.length > 1) editor.removeBlocks([blockId])
  }
  /* Leaving the line — the cursor moving to another block, or focus leaving the
     editor — settles it the way Enter does. */
  useEffect(() => editor.onSelectionChange(() => {
    const blockId = draftRef.current
    if (blockId !== null && editor.getTextCursorPosition().block.id !== blockId) settleDraftTask()
  }), [editor])
  const draftKeys = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (draftRef.current === null) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); event.stopPropagation(); settleDraftTask()
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      const blockId = draftRef.current
      draftRef.current = null; setDraftTask(null)
      const block = editor.getBlock(blockId)
      if (block !== undefined && editor.document.length > 1 && richRuns(block).every((run) => run.text.trim() === '')) editor.removeBlocks([blockId])
    }
  }
  const draftBox = `.dana-writing-canvas .bn-block[data-id="${draftTask}"] > .react-renderer > .bn-block-content`
  const draftStyle = draftTask === null ? '' : `${draftBox}{display:flex;flex-direction:row;align-items:center} ${draftBox}::before{content:"";flex-shrink:0;width:var(--checkbox-size);height:var(--checkbox-size);border:1px solid color-mix(in srgb, var(--muted-foreground) 50%, transparent);border-radius:var(--radius-sm);margin-inline:calc(var(--spacing) * 2.5) calc(var(--spacing) * 2)} ${draftBox} > *{flex:1;min-width:0}${draftEmpty ? ` ${draftBox} .bn-inline-content::before{content:"Task title" !important;color:var(--muted-foreground);position:absolute;pointer-events:none}` : ''}`
  const pendingTask = writer.pending?.request.operations.some((operation) => operation.op === 'create_task') === true
  const downloadDraft = (): void => {
    if (!previousDraft) return
    const url = URL.createObjectURL(new Blob([previousDraft], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `dana-recovered-${folderId}.json`; link.click(); URL.revokeObjectURL(url)
  }
  return <>
    {!arrangeable ? <p className="mb-3 text-sm text-muted-foreground">Writing is paused while this list is filtered or sorted.</p> : null}
    {recovery ? <RecoveryNotice
      onDownload={downloadDraft}
      onRestore={() => {
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
      }}
      onDiscard={() => { sessionStorage.removeItem(draftKey); setRecovery(false) }}
    /> : null}
    <CanvasTaskProvider tasks={tasks} completed={completed} context={context} actions={actions} onAsk={onAsk}>
      {draftStyle === '' ? null : <style>{draftStyle}</style>}
      <div
        className={showCompleted ? 'min-w-0' : 'dana-hide-completed min-w-0'}
        onKeyDownCapture={draftKeys}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) settleDraftTask() }}
      >
      <CanvasSurface
        peopleFolderId={folderId}
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
        onNotice={setNotice}
      />
      </div>
    </CanvasTaskProvider>
    <SaveFailure
      message={error || (writer.state === 'failed' ? NOT_SAVED : null) || notice || null}
      onRetry={!error && writer.state === 'failed' && writer.pending ? () => { void writer.retry() } : undefined}
      onLoadLatest={writer.state === 'failed' || error === CHANGED_ELSEWHERE ? () => { void loadLatest() } : undefined}
    />
  </>
}
