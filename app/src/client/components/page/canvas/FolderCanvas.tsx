import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
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
import { useAllPages, useFolderCompletedTasks, useMultiMemberFolderIds } from '../../../api/queries.js'
import { projectTabs, resultsTab } from '../../../../shared/folders.js'
import { Button } from '../../ui/button.js'
import { CanvasErrorBoundary } from './CanvasErrorBoundary.js'
import { CanvasTaskProvider, ThreadFactsProvider } from './CanvasTask.js'
import type { ThreadFacts } from './CanvasTask.js'
import { freezeElision, threadModel, threadStyle } from './thread/thread-model.js'
import type { FrozenElision, ProgressState, ThreadBlock } from './thread/thread-model.js'
import './thread/thread.css'
import { SavedResults } from './CanvasResult.js'
import { CanvasSurface } from './CanvasSurface.js'
import type { CanvasMediaKind, CanvasUploadedFile } from './CanvasFilePanel.js'
import { canvasSchema } from './schema.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { baselineOf, dehydrateCanvas, folderRefsOf, hydrateCanvas, mergeWorkDocument, richRuns, workPageOf } from './adapters.js'
import type { CanvasDocument, CanvasInput } from './adapters.js'
import { CanvasWriter } from './saving.js'
import { isSectionHeading } from './outline.js'
import { NOT_SAVED, RecoveryNotice, SaveFailure } from './SaveFailure.js'
import { pasteIntoCanvas } from './paste.js'
import { lineTitles } from './commands.js'
import type { TaskRows } from '../../../pages/task-rows.js'
import type { TaskFilter } from '../../../views/filter.js'

type Rows = Parameters<typeof TaskRows>[0]
interface Props extends Pick<Rows, 'tasks' | 'context' | 'actions' | 'onAsk'> {
  readonly page: PageView
  readonly folderId: string
  readonly arrangeable: boolean
  /** A Doc page (step 7): flat headings that never make Work Sections, and no
   * thread. Without it the canvas is a Work page's thread. */
  readonly presentationHeadings?: boolean
  /** A Doc page's `/` Page: a sub-page made here, where the slash was; told its id once saved. */
  readonly onCreatePage?: (madeId: string) => void
  /** The Results tab: `/result` makes a native Result (#213). */
  readonly results?: boolean
  readonly workRootId?: string
  /** The folder's completed task cards the page already loaded; a placement
   * found here draws as its real row, checked and muted. */
  readonly completed?: Rows['tasks']
  /** View-only Task narrowing. It never changes the document or thread model. */
  readonly taskFilter?: TaskFilter
  /** Ignored since M4: done work always shows in place on the thread, where
   * long done stretches elide instead. */
  readonly showCompleted?: boolean
  /** The viewer may write the Results tab: the Work thread's end line
   * ("Write what came of it") is offered only then. */
  readonly resultsWritable?: boolean
}

/* The Work thread's elision is computed once per opening of the page (M4
   §2.9, "ticks linger"): a task ticked now stays where it is. Held above the
   checkpoint remount, so making a task does not re-elide the page. */
interface Frozen { current: FrozenElision | null }

/** Reset history only at identity-changing checkpoints or explicit server reconciliation. */
export default function FolderCanvas(props: Props): React.JSX.Element {
  const [checkpoint, setCheckpoint] = useState<{ page: PageView; epoch: number }>({ page: props.page, epoch: 0 })
  /* One id for this opening of the page, kept across checkpoint remounts: a
     draft stamped with it was written by this opening, not "from before". */
  const [opening] = useState(() => crypto.randomUUID())
  const [frozen] = useState<Frozen>(() => ({ current: null }))
  /* A checkpoint remounts the editor, which is empty for a few frames: the
     page would lose its height and the browser its scroll, so a tick on a
     repeating task (the server rewrites the document) threw the reader to
     the top. The page keeps its height until the new editor has drawn. */
  const shell = useRef<HTMLDivElement>(null)
  /* One hold at a time: a second checkpoint restarts it, so the first one's
     timer cannot let go of the height the second still needs. */
  const hold = useRef<number | undefined>(undefined)
  useEffect(() => () => { window.clearTimeout(hold.current) }, [])
  const onCheckpoint = useCallback((page: PageView): void => {
    const box = shell.current
    if (box !== null) {
      window.clearTimeout(hold.current)
      box.style.minHeight = `${Math.max(box.offsetHeight, parseFloat(box.style.minHeight) || 0)}px`
      hold.current = window.setTimeout(() => { box.style.minHeight = '' }, HOLD_HEIGHT_FOR)
    }
    setCheckpoint((old) => ({ page, epoch: old.epoch + 1 }))
  }, [])
  return <div ref={shell} className="min-w-0"><CanvasErrorBoundary>
    <PersistedCanvas key={`${props.folderId}:${checkpoint.epoch}`} {...props} opening={opening} frozen={frozen} initialPage={checkpoint.page} onCheckpoint={onCheckpoint} />
  </CanvasErrorBoundary></div>
}
/** How long a checkpoint remount keeps the page's height (ms): the new editor draws well within it. */
const HOLD_HEIGHT_FOR = 1500

/** The one error "Load latest" answers besides a failed save. */
/* A Task made with Enter keeps the person writing Tasks: the save remounts
   the editor (a checkpoint), so the next line is opened by the new editor,
   right under the Task, with the page scrolled where it was. Keyed by draft key. */
const resumeAfter = new Map<string, { taskId: string; scroller: Element | null; top: number; line?: string; typed: string }>()
/* What is typed while the Task is being made (the editor is read-only for
   that round trip, then remounts) is kept and lands on the next line, so
   "Buy milk ⏎ Call mom" typed at speed loses no letters. Only plain letters
   and Backspace, and only while nothing else has focus; it lets go when the
   line opens or the resume is dropped. */
function keepTyping(key: string, resume: { typed: string }): void {
  const onKey = (event: KeyboardEvent): void => {
    if (resumeAfter.get(key) !== resume) { window.removeEventListener('keydown', onKey, true); return }
    const active = document.activeElement
    if (active !== null && active !== document.body && active.closest('.dana-writing-canvas') === null) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
    if (event.key.length === 1) resume.typed += event.key
    else if (event.key === 'Backspace') resume.typed = resume.typed.slice(0, -1)
    else return
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('keydown', onKey, true)
  window.setTimeout(() => { window.removeEventListener('keydown', onKey, true) }, 15_000)
}
function scrollerOf(element: Element | null): Element | null {
  for (let at = element?.parentElement ?? null; at !== null; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && at.scrollHeight > at.clientHeight) return at
  }
  return document.scrollingElement
}

const CHANGED_ELSEWHERE = 'This page changed elsewhere. Your writing is kept here. Load the latest to continue; your writing will be offered back.'

function PersistedCanvas({ page, initialPage, folderId, presentationHeadings, onCreatePage, results, workRootId, tasks, completed, taskFilter, context, actions, onAsk, arrangeable, resultsWritable, onCheckpoint, opening, frozen }: Props & {
  readonly opening: string
  readonly frozen: Frozen
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
  const pageKey = queryKeys.folderPage(folderId)
  if (!initialPage.revision) return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
    This page opened without its version, so writing is paused to keep your page safe. Nothing was changed.
    <Button variant="outline" onClick={() => { setReloadNote('Loading…'); void queryClient.invalidateQueries({ queryKey: pageKey }).then(() => {
      const latest = queryClient.getQueryData<PageView>(pageKey)
      if (latest?.revision) onCheckpoint(latest)
      else setReloadNote('The page still has no version. Try again in a moment.')
    }) }}>Load the page again</Button>{reloadNote}
  </div>
  return <div ref={host} className="min-w-0">{width === null ? <p role="status" className="sr-only">Loading writing…</p> : <CanvasSession {...{ page, initialPage, folderId, presentationHeadings, onCreatePage, results, workRootId, tasks, completed, taskFilter, context, actions, onAsk, arrangeable, resultsWritable, onCheckpoint, opening, frozen }} width={width} onSaved={(next) => {
    queryClient.setQueryData(queryKeys.folderPage(folderId), next)
  }} />}</div>
}

function CanvasSession({ page, initialPage, folderId, presentationHeadings, onCreatePage, results, workRootId, tasks, completed, taskFilter, context, actions, onAsk, arrangeable, resultsWritable, onCheckpoint, opening, frozen, width, onSaved }: Props & {
  readonly opening: string
  readonly frozen: Frozen
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

  // One hint everywhere, the one the focused empty line shows too (canvas.css).
  const placeholder = "Press '/' for commands"
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
  const documentPath = `/folders/${folderId}/page`
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
  // This is a recoverable draft, never a cached page or an automatic offline queue.
  // One key per document: Work and each tab keep their own. A tab that was a
  // facet kept the facet's id, so a draft stored under it is still found.
  const draftKey = `dana-canvas-draft:${folderId}`
  const [writer] = useState(() => new CanvasWriter(firstProjection(), initialPage.revision ?? '',
    (body) => mutateApi(getPageResponse, { method: 'POST', path: `${documentPath}/actions`, body }),
    () => {
      render((value) => value + 1)
      try {
        if (writer.state === 'saved') sessionStorage.removeItem(draftKey)
        else sessionStorage.setItem(draftKey, JSON.stringify({ folderId, opening, revision: writer.revision, blocks: editor.document, pending: writer.pending?.request }))
      } catch { /* recoverable in memory; storage is optional */ }
    },
    (next, checkpoint, operations) => {
      onSaved(next)
      if (checkpoint) onCheckpoint(next)
      // A sub-page trashed or restored, or a Task made, changes the folder list.
      if (operations.some((op) => op.op === 'create_task' || op.op === 'create_page' || op.op === 'trash_page' || (op.op === 'put_block' && op.block_kind === 'page'))) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.folders(), exact: true })
        void queryClient.invalidateQueries({ queryKey: queryKeys.allPages(), exact: true })
      }
    },
  ))
  useEffect(() => {
    /* Offered back only when it predates this opening of the page. A save
       that makes a task remounts this editor while the previous one's draft
       is still stored; that writing is the page on screen, not "from before".
       "Load latest" stores its draft without the stamp, so it is offered. */
    try {
      const draft = sessionStorage.getItem(draftKey)
      const own = draft !== null && (JSON.parse(draft) as { opening?: unknown }).opening === opening
      setPreviousDraft(own ? null : draft)
      setRecovery(draft !== null && !own)
    } catch { /* storage is optional */ }
  }, [draftKey, opening])
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
  // Leaving the page or the tab sends what the 450 ms wait was holding; the
  // request outlives this editor, and the cache it answers into is shared.
  useEffect(() => () => { void writer.drain() }, [writer])
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
     refusal leaves the title where it was typed, so it is never lost, and
     says why below the canvas: on the page, or back in "Add a task…" when
     that line wrote it (`lineTitles`). */
  async function createTask(blockId: string | null, taskTitle: string): Promise<void> {
    if (!blockId || !taskTitle.trim()) return
    const line = lineTitles.get(blockId)
    lineTitles.delete(blockId)
    const refuse = (message: string): void => {
      resumeAfter.delete(draftKey)
      setError(message)
      if (line === undefined || editor.getBlock(blockId) === undefined) return
      editor.transact((tr) => {
        tr.setMeta('addToHistory', false)
        if (line.reused || editor.document.length === 1) editor.updateBlock(blockId, { type: 'paragraph', content: [] } as never)
        else editor.removeBlocks([blockId])
      })
      line.giveBack(taskTitle.trim())
    }
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
    const resume = resumeAfter.get(draftKey)
    if (resume !== undefined) resume.taskId = id
    // A failed send is reported by the save status below, whose Retry
    // re-sends this exact request, Task included.
    try { await writer.flush({ op: 'create_task', id, title: taskTitle.trim() }) } finally {
      setCreating(false)
      if ((writer.state as string) === 'failed') resumeAfter.delete(draftKey)
    }
  }
  /* A Doc's `/` Page: the page and its link are made in one save
     (`create_page`), the link where the slash was typed. The menu has already
     cleared its `/page` query, so an empty line becomes the link; a line
     with text keeps it and the link follows. The writing is saved first, as
     for a Task, so the save that makes the page carries nothing else. The
     link is drafted outside the live editor, so the editor is read-only
     (`creating`) until the save lands: typing meanwhile would replace the
     drafted document with one lacking the link, and the next save would
     trash the page just made. */
  const makePage = onCreatePage === undefined ? undefined : (): void => {
    const at = editor.getTextCursorPosition().block
    if (writer.state === 'failed') { setError(pageBlocked); return }
    setCreating(true)
    void (async () => {
      try {
        await writer.flush()
        if (writer.state !== 'saved') { setError(pageBlocked); return }
        const id = crypto.randomUUID()
        const blockId = crypto.randomUUID()
        const empty = at.type === 'paragraph' && richRuns(at).every((run) => !run.text.trim())
        const replace = (blocks: readonly CanvasInput[]): CanvasInput[] => blocks.flatMap((block) => {
          if (block.id === at.id) {
            const link: CanvasInput = { id: blockId, type: 'danaPage', props: { folderId: id } }
            return empty ? [link, ...replace(block.children ?? [])] : [{ ...block, children: block.children ? replace(block.children) : [] }, link]
          }
          return [{ ...block, children: block.children ? replace(block.children) : [] }]
        })
        let temporary: ReturnType<typeof BlockNoteEditor.create> | null = null
        let drafted: CanvasDocument
        try {
          temporary = BlockNoteEditor.create({ schema: canvasSchema, initialContent: replace(editor.document) })
          drafted = dehydrateCanvas(temporary.document, width, folderRefs)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : 'Could not make this page.')
          return
        } finally { temporary?.unmount() }
        writer.change(drafted)
        await writer.flush({ op: 'create_page', id, block_id: blockId, title: 'Untitled' })
        if ((writer.state as string) === 'failed') return
        onCreatePage(id)
      } finally { setCreating(false) }
    })()
  }
  const pageBlocked = 'Your writing has not saved, so a page cannot be made yet. Use Load latest below; your writing is kept.'
  // A failed save's line offers "Load latest" beside this sentence (SaveFailure): name that control, not ones it lacks.
  const taskBlocked = 'Your writing has not saved, so a task cannot be made yet. Use Load latest below; your writing is kept.'
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
    // Known at once, not after the next render: an Enter typed right after `[] ` is the draft's.
    draftRef.current = at
    setDraftTask(at)
    setDraftEmpty(true)
    editor.setTextCursorPosition(at, 'end')
    editor.focus()
  }
  function settleDraftTask(resume = false): void {
    const blockId = draftRef.current
    if (blockId === null) return
    draftRef.current = null
    setDraftTask(null)
    const block = editor.getBlock(blockId)
    if (block === undefined) return
    const text = block.type === 'paragraph' ? richRuns(block).map((run) => run.text).join('') : ''
    if (text.trim()) {
      if (resume) {
        const scroller = scrollerOf(document.querySelector(`.dana-writing-canvas .bn-block[data-id="${blockId}"]`))
        const resume = { taskId: '', scroller, top: scroller?.scrollTop ?? 0, typed: '' }
        resumeAfter.set(draftKey, resume)
        keepTyping(draftKey, resume)
      }
      void createTask(blockId, text)
      return
    }
    if (editor.document.length > 1) editor.removeBlocks([blockId])
  }
  /* Leaving the line — the cursor moving to another block, or focus leaving the
     editor — settles it the way Enter does. */
  useEffect(() => editor.onSelectionChange(() => {
    const blockId = draftRef.current
    if (blockId !== null && editor.getTextCursorPosition().block.id !== blockId) settleDraftTask()
  }), [editor])
  useEffect(() => {
    const resume = resumeAfter.get(draftKey)
    if (resume === undefined || resume.taskId === '') return
    // Idempotent: a development double run finds the line it opened.
    let id = resume.line !== undefined && editor.getBlock(resume.line) !== undefined ? resume.line : undefined
    if (id === undefined) {
      const task = editor.getBlock(resume.taskId)
      if (task === undefined) { resumeAfter.delete(draftKey); return }
      id = editor.insertBlocks([{ type: 'paragraph', content: '' }], task, 'after')[0]?.id
      if (id === undefined) { resumeAfter.delete(draftKey); return }
      resume.line = id
    }
    const line: string = id
    setDraftTask(line)
    setDraftEmpty(true)
    const settle = (): void => {
      if (editor.getBlock(line) === undefined) return
      editor.setTextCursorPosition(line, 'end')
      editor.focus()
      if (resume.scroller !== null) resume.scroller.scrollTop = resume.top
      document.querySelector(`.dana-writing-canvas .bn-block[data-id="${line}"]`)?.scrollIntoView({ block: 'nearest' })
    }
    // What was typed during the round trip (`keepTyping`) is the new line's text.
    const typedAhead = (): void => {
      if (resume.typed === '' || editor.getBlock(line) === undefined) return
      editor.setTextCursorPosition(line, 'end')
      editor.insertInlineContent(resume.typed)
      resume.typed = ''
    }
    settle()
    typedAhead()
    const frame = requestAnimationFrame(settle)
    const done = window.setTimeout(() => {
      if (resumeAfter.get(draftKey) !== resume) return
      typedAhead()
      resumeAfter.delete(draftKey)
    }, 0)
    return () => { cancelAnimationFrame(frame); window.clearTimeout(done) }
  }, [editor, draftKey])
  /* "Write what came of it" opened this Results tab: the cursor goes in it. */
  useEffect(() => {
    if (results !== true || focusResultsOf?.folderId !== folderId) return
    // A request older than a few seconds was left behind (the viewer went
    // elsewhere before Results opened): it must not grab focus later.
    if (performance.now() - focusResultsOf.at > FOCUS_RESULTS_WITHIN) { focusResultsOf = null; return }
    // The view mounts a frame or so after this session does, and the editor
    // may be made twice on the way; the request is let go once it lands or
    // the tries run out.
    let frame = 0
    let tries = 0
    const land = (): void => {
      if (editor.domElement?.isConnected !== true) { if (++tries < 30) frame = requestAnimationFrame(land); else focusResultsOf = null; return }
      const last = editor.document.at(-1)
      if (last !== undefined) editor.setTextCursorPosition(last, 'end')
      editor.focus()
      focusResultsOf = null
    }
    frame = requestAnimationFrame(land)
    return () => { cancelAnimationFrame(frame) }
  }, [editor, results, folderId])
  const draftKeys = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (draftRef.current === null) return
    const drafting = editor.getBlock(draftRef.current)
    const blank = drafting === undefined || richRuns(drafting).every((run) => run.text === '')
    /* Enter or Backspace on the line while it is empty ends the list, as on an
       empty to-do in Notion: the line stays, plain text, the caret on it. */
    if (blank && ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Backspace')) {
      event.preventDefault(); event.stopPropagation()
      draftRef.current = null; setDraftTask(null)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); event.stopPropagation(); settleDraftTask(true)
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      const blockId = draftRef.current
      draftRef.current = null; setDraftTask(null)
      const block = editor.getBlock(blockId)
      if (block !== undefined && editor.document.length > 1 && richRuns(block).every((run) => run.text.trim() === '')) editor.removeBlocks([blockId])
    }
  }
  const draftBox = `.dana-writing-canvas .bn-block[data-id="${draftTask}"] > .react-renderer > .bn-block-content`
  const draftStyle = draftTask === null ? '' : `${draftBox}{display:flex;flex-direction:row;align-items:center} ${draftBox}::before{content:"";flex-shrink:0;width:var(--checkbox-size);height:var(--checkbox-size);border:1px solid color-mix(in srgb, var(--muted-foreground) 50%, transparent);border-radius:var(--radius-sm);margin-inline:calc((var(--control-height) - var(--checkbox-size)) / 2)} ${draftBox}::after{content:none !important} ${draftBox} > *{flex:1;min-width:0}${draftEmpty ? ` ${draftBox} .bn-inline-content::before{content:"Task title" !important;color:var(--muted-foreground);position:absolute;pointer-events:none}` : ''}`
  /* The Results a save has stored: only those can be linked to yet, so only
     they ask for "Referenced from" (a new one would be a 404 in the console). */
  const savedResults = useMemo(() => new Set(page.blocks.filter((block) => block.kind === 'result').map((block) => block.id)), [page])
  const pendingTask = writer.pending?.request.operations.some((operation) => operation.op === 'create_task') === true
  const draftHasRequest = ((): boolean => {
    try {
      const data: unknown = JSON.parse(previousDraft ?? '{}')
      return typeof data === 'object' && data !== null && 'pending' in data && documentTransaction.safeParse(data.pending).success
    } catch { return false }
  })()
  const downloadDraft = (): void => {
    if (!previousDraft) return
    const url = URL.createObjectURL(new Blob([previousDraft], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `dana-recovered-${folderId}.json`; link.click(); URL.revokeObjectURL(url)
  }
  return <>
    {/* Purpose and Results pass the reader's edit right as `arrangeable`: a
       reader who cannot write there has nothing filtered or sorted to hear about. */}
    {!arrangeable && presentationHeadings !== true ? <p className="mb-3 text-sm text-muted-foreground">Writing is paused while this list is filtered or sorted.</p> : null}
    {recovery ? <RecoveryNotice
      onDownload={downloadDraft}
      onRestore={!draftHasRequest ? undefined : () => {
        void (async () => {
          try {
            const data: unknown = JSON.parse(previousDraft ?? '{}')
            const pending = typeof data === 'object' && data !== null && 'pending' in data ? documentTransaction.safeParse(data.pending) : null
            if (!pending?.success) { setError('This draft has no interrupted request. Download it to keep the writing.'); return }
            const next = await mutateApi(getPageResponse, { method: 'POST', path: `${documentPath}/actions`, body: pending.data })
            // Keep a copy of any writing made after that original request.
            downloadDraft()
            sessionStorage.removeItem(draftKey)
            onSaved(next); onCheckpoint(next)
          } catch (failure) { setError(failure instanceof Error ? failure.message : 'The interrupted save could not be recovered.') }
        })()
      }}
      onDiscard={() => { sessionStorage.removeItem(draftKey); setRecovery(false) }}
    /> : null}
    <SavedResults.Provider value={savedResults}>
    <CanvasTaskProvider tasks={tasks} completed={completed} taskFilter={taskFilter} context={context} actions={actions} onAsk={onAsk}>
      {draftStyle === '' ? null : <style>{draftStyle}</style>}
      <ThreadLayer enabled={presentationHeadings !== true} editor={editor} folderId={folderId} tasks={tasks} context={context} frozen={frozen} finish={workRootId === undefined && resultsWritable === true}>
      <div
        className="min-w-0"
        onKeyDownCapture={draftKeys}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) settleDraftTask() }}
      >
      <CanvasSurface
        peopleFolderId={folderId}
        // Only a reader who can write is asked to.
        placeholder={!arrangeable ? undefined : results === true ? 'Write what came of this' : placeholder}
        editor={editor}
        onChange={changed}
        onCreateTask={askTask}
        onCreatePage={makePage}
        results={results === true}
        folderRefs={folderRefs}
        onUploadFile={uploadCanvasFile}
        headingMode={presentationHeadings === true ? 'document' : 'section'}
        editable={arrangeable && !creating && !pendingTask}
        onNotice={setNotice}
      />
      </div>
      </ThreadLayer>
    </CanvasTaskProvider>
    </SavedResults.Provider>
    <SaveFailure
      message={error || (writer.state === 'failed' ? NOT_SAVED : null) || notice || null}
      onRetry={!error && writer.state === 'failed' && writer.pending ? () => { void writer.retry() } : undefined}
      onLoadLatest={writer.state === 'failed' || error === CHANGED_ELSEWHERE ? () => { void loadLatest() } : undefined}
    />
  </>
}

/** The folder whose Results tab "Write what came of it" just opened, to put the cursor in, and when. */
let focusResultsOf: { readonly folderId: string; readonly at: number } | null = null
const FOCUS_RESULTS_WITHIN = 10_000

/* What the viewer opened on the thread, for this session only (M4 §2.9):
   the "Earlier work" breaks they expanded. Never stored. Section headings
   never fold, so a `toggle-<id>` an older build stored for one is ignored. */
const threadSession = new Map<string, { expanded: Set<string> }>()
function sessionOf(folderId: string): { expanded: Set<string> } {
  let found = threadSession.get(folderId)
  if (found === undefined) { found = { expanded: new Set() }; threadSession.set(folderId, found) }
  return found
}

/** A real control laid over the rail: an "Earlier work" break. */
interface RailMark { readonly id: string; readonly x: number; readonly y: number; readonly label: string }

type Card = Rows['tasks'][number]
const noFacts: ThreadFacts = { next: null, shared: false, completedOn: new Map() }
const sharedNoThread: ThreadFacts = { ...noFacts, shared: true }
/** Block `id` anywhere in the document, or undefined. */
function findBlock(blocks: readonly ThreadBlock[], id: string): ThreadBlock | undefined {
  for (const block of blocks) {
    if (block.id === id) return block
    const inner = findBlock(block.children ?? [], id)
    if (inner !== undefined) return inner
  }
  return undefined
}

/** How long after a tick the lists' answer still counts as that tick's (ms). */
const TICK_ANSWERS_WITHIN = 4000
/* Per page: where the done stretch last stopped and what it covered, and
   when this viewer last ticked there. Held outside ThreadLayer, because a
   repeating task's tick rewrites the document and remounts the editor (and
   ThreadLayer with it) between the tick and the stretch's move. */
const threadMotion = new Map<string, {
  readonly stop: string | null
  readonly progress: ReadonlyMap<string, ProgressState>
  /** When this viewer last ticked, and the stretch as it stood then; cleared once the growth has played. */
  readonly tick: { readonly at: number; readonly before: ReadonlyMap<string, ProgressState> } | null
}>()
/* How long the growth is held at most (ms). It ends when its animation does;
   this covers reduced motion, where none plays, and an editor a remount has
   not drawn yet (the animation starts when the blocks appear). */
const FILL_FOR = 2000

/**
 * The Work thread (M4 §2): the same document, drawn on a rail. It reads the
 * document on every change and turns `thread-model` into one style element,
 * keyed by block id, so nothing is written into ProseMirror's DOM. Task nodes
 * read the ring and meta facts through `ThreadFactsProvider`; the editor
 * itself does not re-render.
 *
 * "Earlier work" is a real button laid over the rail from this container, not
 * a widget in the document, so drag, selection and undo are untouched and a
 * keyboard or screen reader reaches it. Section headings are numbered stops
 * and never fold.
 */
function ThreadLayer({ enabled, editor, folderId, tasks, context, frozen, finish, children }: {
  readonly enabled: boolean
  readonly editor: CanvasEditor
  readonly folderId: string
  readonly tasks: readonly Card[]
  readonly context: Rows['context']
  readonly frozen: Frozen
  /** The end line may be offered: the page's own Work, to a writer. */
  readonly finish: boolean
  readonly children: ReactNode
}): React.JSX.Element {
  const [, bump] = useState(0)
  useEffect(() => enabled ? editor.onChange(() => { bump((value) => value + 1) }) : undefined, [editor, enabled])
  const shared = useMultiMemberFolderIds().has(folderId)
  const done = useFolderCompletedTasks(folderId, enabled)
  const pages = useAllPages(enabled && finish)
  const navigate = useNavigate()
  const completedOn = useMemo(() => {
    const on = new Map<string, string>()
    for (const page of done.data?.pages ?? []) for (const day of page.days) for (const row of day.rows) if (!on.has(row.id)) on.set(row.id, day.date)
    return on
  }, [done.data])
  const open = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const blocks = editor.document as unknown as readonly ThreadBlock[]
  const still = enabled ? freezeElision(frozen, blocks, open) : null
  const session = sessionOf(folderId)
  const elided = new Map<string, string>()
  const breaks = new Set<string>()
  for (const [id, at] of still?.elision.elided ?? []) if (!session.expanded.has(at)) { elided.set(id, at); breaks.add(at) }
  const model = threadModel({ blocks: enabled ? blocks : [], open, today: context.today, viewerId: context.viewerId, shared, elided })
  /* The one motion (AC-1514): a tick by this viewer grows the done stretch
     down to the new frontier. The tick is heard first (`onTick`); the stretch
     moves when the page's lists answer, which may be a moment later (after a
     remount, for a repeating task), and only a move that follows the viewer's
     own tick is animated. Compared after commit, so a render React throws
     away changes nothing. */
  const [grown, setGrown] = useState<{ readonly from: ReadonlyMap<string, ProgressState>; readonly at: number } | null>(null)
  const css = enabled ? threadStyle(model, new Set(elided.keys()), breaks, grown?.from ?? null) : ''
  const stop = [...model.progress].find(([, state]) => state === 'done-frontier')?.[0] ?? null
  useLayoutEffect(() => {
    if (!enabled) return
    const seen = threadMotion.get(folderId)
    const tick = seen?.tick ?? null
    threadMotion.set(folderId, { stop, progress: model.progress, tick })
    if (seen === undefined || seen.stop === stop || tick === null || performance.now() - tick.at >= TICK_ANSWERS_WITHIN) return
    /* Always from the stretch as it stood at the tick: a repeating task's
       tick moves the stop twice (the lists answer before the rewritten
       document does), and the second move lands on a freshly drawn editor. */
    setGrown({ from: tick.before, at: performance.now() })
  })
  useEffect(() => {
    if (grown === null) return undefined
    const timer = window.setTimeout(() => { setGrown(null) }, FILL_FOR)
    return () => { window.clearTimeout(timer) }
  }, [grown])
  /* Only a tick of the task the stretch stops at moves it: any other tick
     arms nothing, so a collaborator's tick of that task a moment later does
     not play the motion here. */
  const frontierBlock = [...model.line].find(([, style]) => style === 'frontier')?.[0]
  const frontierTask = useRef<string | null>(null)
  const frontierProps = frontierBlock === undefined ? undefined : findBlock(blocks, frontierBlock)?.props
  frontierTask.current = typeof frontierProps?.['taskId'] === 'string' ? frontierProps['taskId'] : null
  const onTick = useCallback((taskId: string): void => {
    if (taskId !== frontierTask.current) return
    const seen = threadMotion.get(folderId)
    if (seen !== undefined) threadMotion.set(folderId, { ...seen, tick: { at: performance.now(), before: seen.progress } })
  }, [folderId])
  const grew = useCallback((): void => {
    const seen = threadMotion.get(folderId)
    if (seen !== undefined) threadMotion.set(folderId, { ...seen, tick: null })
    setGrown(null)
  }, [folderId])
  const facts = useMemo<ThreadFacts>(() => ({ next: model.next, shared, completedOn, onTick }), [model.next, shared, completedOn, onTick])
  /* The project's Results tab, where "Write what came of it" goes. */
  const projectId = pages.data?.find((page) => page.id === folderId)?.project_id
  const results = projectId === undefined ? undefined : resultsTab(projectTabs(pages.data ?? [], projectId))
  /* A press on an "Earlier work" break shows what it holds. Heard on the
     window, before the marquee (CanvasMarquee), which takes any press outside
     a block's row for a band selection. */
  const host = useRef<HTMLDivElement>(null)
  const live = useRef({ breaks })
  live.current = { breaks }
  /* Where the rail's controls go: measured after every render and on every
     resize, and set only when something moved. */
  const [marks, setMarks] = useState<readonly RailMark[]>([])
  const drawn = useRef('')
  const measure = useCallback((): void => {
    const root = host.current
    if (root === null) return
    const origin = root.getBoundingClientRect()
    const found: RailMark[] = []
    for (const id of live.current.breaks) {
      const outer = root.querySelector<HTMLElement>(`.bn-block-outer[data-id="${CSS.escape(id)}"]`)
      if (outer === null || outer.getClientRects().length === 0) continue
      const box = outer.getBoundingClientRect()
      found.push({ id, x: Math.round(box.left - origin.left), y: Math.round(box.top - origin.top), label: 'Earlier work' })
    }
    const text = JSON.stringify(found)
    if (text !== drawn.current) { drawn.current = text; setMarks(found) }
  }, [])
  useLayoutEffect(() => { if (enabled) measure() })
  useEffect(() => {
    const root = host.current
    if (!enabled || root === null || typeof ResizeObserver === 'undefined') return undefined
    const watch = new ResizeObserver(() => { measure() })
    watch.observe(root)
    return () => { watch.disconnect() }
  }, [enabled, measure])
  useEffect(() => {
    if (!enabled) return undefined
    const onPress = (event: MouseEvent): void => {
      if (event.button !== 0 || !(event.target instanceof HTMLElement) || host.current?.contains(event.target) !== true) return
      const target = event.target
      if (!target.classList.contains('bn-block-outer')) return
      const id = target.getAttribute('data-id')
      const row = target.querySelector(':scope > .bn-block')
      if (id !== null && live.current.breaks.has(id) && row !== null && event.clientY < row.getBoundingClientRect().top) {
        event.preventDefault()
        event.stopPropagation()
        sessionOf(folderId).expanded.add(id)
        bump((value) => value + 1)
      }
    }
    window.addEventListener('mousedown', onPress, true)
    return () => window.removeEventListener('mousedown', onPress, true)
  }, [enabled, folderId])
  /* A Doc draws no thread, but its tasks still show who has them. */
  if (!enabled) return <ThreadFactsProvider value={shared ? sharedNoThread : noFacts}>{children}</ThreadFactsProvider>
  return (
    <ThreadFactsProvider value={facts}>
      <style>{css}</style>
      <div
        ref={host}
        className="dana-thread min-w-0"
        onAnimationEnd={(event) => { if (event.animationName === 'dana-thread-grow') grew() }}
      >
        {marks.map((mark) => (
          <button
            key={`break-${mark.id}`}
            type="button"
            className="dana-thread-break"
            style={{ '--dana-at-x': `${mark.x}px`, '--dana-at-y': `${mark.y}px` } as CSSProperties}
            aria-expanded={false}
            onClick={() => { sessionOf(folderId).expanded.add(mark.id); bump((value) => value + 1) }}
          >
            {mark.label}
          </button>
        ))}
        {children}
        {finish && model.hasTasks && !model.anyOpen && results !== undefined ? (
          <button
            type="button"
            className="dana-thread-end"
            onClick={() => {
              focusResultsOf = { folderId: results.id, at: performance.now() }
              void navigate(`/app/folders/${encodeURIComponent(results.id)}`)
            }}
          >
            Write what came of it
          </button>
        ) : null}
      </div>
    </ThreadFactsProvider>
  )
}
