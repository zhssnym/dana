import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
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
import { useFolderCompletedTasks, useMultiMemberFolderIds } from '../../../api/queries.js'
import { Button } from '../../ui/button.js'
import { CanvasErrorBoundary } from './CanvasErrorBoundary.js'
import { CanvasTaskProvider, ThreadFactsProvider } from './CanvasTask.js'
import { FreeformCompleted } from './FreeformCompleted.js'
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
import { lineTitles, removeCanvasBlocks } from './commands.js'
import { RECONCILED } from './guard.js'
import type { TaskRows } from '../../../pages/task-rows.js'
import type { TaskFilter } from '../../../views/filter.js'
import { useCurrentWorkView } from '../../../views/work-view.js'

type Rows = Parameters<typeof TaskRows>[0]
const noCompleted: Rows['tasks'] = []
interface Props extends Pick<Rows, 'tasks' | 'context' | 'actions' | 'onAsk'> {
  readonly page: PageView
  readonly folderId: string
  readonly arrangeable: boolean
  /** A Doc page: flat headings that never make Work sections, and no thread. */
  readonly presentationHeadings?: boolean
  /** A Doc page's `/` Page; told the new page's id once saved. */
  readonly onCreatePage?: (madeId: string) => void
  readonly results?: boolean
  readonly workRootId?: string
  /** A placement found here draws as its real row, checked and muted. */
  readonly completed?: Rows['tasks']
  /** View-only narrowing; never changes the document or thread model. */
  readonly taskFilter?: TaskFilter
  /** Ignored: done work always shows in place on the thread. */
  readonly showCompleted?: boolean
  /** Kept for the page caller; Results is reached through its tab. */
  readonly resultsWritable?: boolean
}

// The thread's elision is computed once per opening, so a task ticked now stays put.
// Held above the checkpoint remount.
interface Frozen { current: FrozenElision | null }

/** Reset history only at identity-changing checkpoints or server reconciliation. */
export default function FolderCanvas(props: Props): React.JSX.Element {
  const [checkpoint, setCheckpoint] = useState<{ page: PageView; epoch: number }>({ page: props.page, epoch: 0 })
  // One id per opening, kept across remounts, so a draft can tell it came from this opening.
  const [opening] = useState(() => crypto.randomUUID())
  const [frozen] = useState<Frozen>(() => ({ current: null }))
  // A checkpoint remount leaves the editor empty for a few frames; hold the page's
  // height so the scroll does not jump to the top.
  const shell = useRef<HTMLDivElement>(null)
  // One hold at a time, so an earlier timer cannot release a later hold.
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
/** How long a checkpoint remount keeps the page's height (ms). */
const HOLD_HEIGHT_FOR = 1500

/**
 * After a task made with Enter, the remounted editor opens the next line under it,
 * with the scroll restored. Keyed by draft key.
 */
const resumeAfter = new Map<string, { taskId: string; scroller: Element | null; top: number; line?: string; typed: string }>()
// Keep letters typed while the task saves (the editor is read-only, then remounts)
// and put them on the next line.
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

/** The trashed tasks `page` no longer holds, when that is the only difference. */
function trashedOnly(held: PageView, page: PageView, trashing: ReadonlySet<string>): ReadonlySet<string> | null {
  const gone = new Set(held.items.filter((item) => item.kind === 'task' && trashing.has(item.id) && !page.items.some((kept) => kept.id === item.id)).map((item) => item.id))
  if (gone.size === 0) return null
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
  return same(page.blocks, held.blocks)
    && same(page.items, held.items.filter((item) => !gone.has(item.id)))
    && same(page.task_placements ?? [], (held.task_placements ?? []).filter((task) => !gone.has(task.id)))
    ? gone : null
}
function taskBlocks(blocks: readonly CanvasBlock[], taskIds: ReadonlySet<string>): CanvasBlock[] {
  return blocks.flatMap((block) => [...(block.type === 'danaTask' && taskIds.has(String(block.props.taskId)) ? [block] : []), ...taskBlocks(block.children, taskIds)])
}

function PersistedCanvas({ page, initialPage, folderId, presentationHeadings, onCreatePage, results, workRootId, tasks, completed, taskFilter, context, actions, onAsk, arrangeable, onCheckpoint, opening, frozen }: Props & {
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
  // Without a revision every save would carry no base, so pause writing instead.
  const pageKey = queryKeys.folderPage(folderId)
  if (!initialPage.revision) return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
    This page opened without its version, so writing is paused to keep your page safe. Nothing was changed.
    <Button variant="outline" onClick={() => { setReloadNote('Loading…'); void queryClient.invalidateQueries({ queryKey: pageKey }).then(() => {
      const latest = queryClient.getQueryData<PageView>(pageKey)
      if (latest?.revision) onCheckpoint(latest)
      else setReloadNote('The page still has no version. Try again in a moment.')
    }) }}>Load the page again</Button>{reloadNote}
  </div>
  return <div ref={host} className="min-w-0">{width === null ? <p role="status" className="sr-only">Loading writing…</p> : <CanvasSession {...{ page, initialPage, folderId, presentationHeadings, onCreatePage, results, workRootId, tasks, completed, taskFilter, context, actions, onAsk, arrangeable, onCheckpoint, opening, frozen }} width={width} onSaved={(next) => {
    queryClient.setQueryData(queryKeys.folderPage(folderId), next)
  }} />}</div>
}

function CanvasSession({ page, initialPage, folderId, presentationHeadings, onCreatePage, results, workRootId, tasks, completed, taskFilter, context, actions, onAsk, arrangeable, onCheckpoint, opening, frozen, width, onSaved }: Props & {
  readonly opening: string
  readonly frozen: Frozen
  readonly initialPage: PageView
  readonly onCheckpoint: (page: PageView) => void
  readonly width: number
  readonly onSaved: (page: PageView) => void
}): React.JSX.Element {
  const [, render] = useState(0)
  const completedContainer = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // The block id of an empty "/ Task" line being titled in place, or null.
  const [draftTask, setDraftTask] = useState<string | null>(null)
  const draftRef = useRef<string | null>(null)
  draftRef.current = draftTask
  const [draftEmpty, setDraftEmpty] = useState(true)
  const [creating, setCreating] = useState(false)
  const [recovery, setRecovery] = useState(false)
  const [previousDraft, setPreviousDraft] = useState<string | null>(null)
  const [workView] = useCurrentWorkView()
  const editorPage = useMemo(() => workRootId === undefined ? initialPage : workPageOf(initialPage, workRootId), [initialPage, workRootId])
  const initial = useMemo(() => {
    const hydrated = hydrateCanvas(editorPage, width)
    if (workRootId === undefined) return hydrated
    const shift = (blocks: CanvasInput[]): CanvasInput[] => blocks.map((block) => {
      const children = block.children ? shift(block.children) : []
      // A section's level is its depth, one deeper in the window.
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
  // Read refs from `page` (the saved row), never `initialPage`: a stale entry re-applies
  // a reference to a converted block, and ON DELETE CASCADE then deletes it (AC-663).
  // Known gap: while a save fails `page` is frozen, so an undo before Retry can restore it.
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

  // The same hint as the focused empty line (canvas.css).
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
    // Direct drops. The schema's accept tables use the same allowlists, so this stays
    // in step; slash insertion uses CanvasFilePanel instead.
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
      // BlockNote applies the result as an updateBlock partial, so the file goes under `props`.
      return { props: await uploadCanvasFile(kind, file) }
    },
  })
  // The writer's baseline is what a save of the untouched page would send (`baselineOf`).
  // An empty page starts from an empty baseline, so the placeholder line is written.
  const documentPath = `/folders/${folderId}/page`
  const projection = (current: readonly CanvasBlock[]): CanvasDocument => {
    const drawn = dehydrateCanvas(current, width, folderRefs)
    const lossless = baselineOf(editorPage, drawn)
    return workRootId === undefined ? lossless : mergeWorkDocument(page, workRootId, lossless)
  }
  const empty = { blocks: [], items: [] }
  // Projected once at mount: a later document may hold an unsaveable block and
  // projecting it during render would throw.
  const firstProjection = (): CanvasDocument => initial.length
    ? projection(editor.document)
    : workRootId === undefined
      ? empty
      : mergeWorkDocument(initialPage, workRootId, empty)
  const queryClient = useQueryClient()
  // The page at the writer's revision, and tasks this editor trashed with writing,
  // so their removal is not mistaken for a change from elsewhere.
  const held = useRef(initialPage)
  const trashing = useRef(new Set<string>())
  // A recoverable draft, never a cache or offline queue. One key per document.
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
      held.current = next
      onSaved(next)
      if (checkpoint) onCheckpoint(next)
      // Trashing or restoring a sub-page, or making a task, changes the folder list.
      if (operations.some((op) => op.op === 'create_task' || op.op === 'create_page' || op.op === 'trash_page' || (op.op === 'put_block' && op.block_kind === 'page'))) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.folders(), exact: true })
        void queryClient.invalidateQueries({ queryKey: queryKeys.allPages(), exact: true })
      }
    },
  ))
  useEffect(() => {
    // Offer a draft back only when it predates this opening; "Load latest" stores one
    // without the stamp, so it is offered.
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
  // Leaving sends what the 450 ms wait was holding; the request outlives this editor.
  useEffect(() => () => { void writer.drain() }, [writer])
  useEffect(() => {
    if (!page.revision || page.revision === writer.revision || writer.state === 'saving') return
    // Writing and tasks deleted together: when the page differs only by those tasks
    // being gone, remove their rows outside history instead of remounting.
    const gone = writer.state === 'saved' ? trashedOnly(held.current, page, trashing.current) : null
    if (gone !== null) {
      const rows = taskBlocks(editor.document, gone)
      if (rows.length > 0) editor.transact((tr) => { tr.setMeta('addToHistory', false); tr.setMeta(RECONCILED, true); removeCanvasBlocks(editor, rows) })
      for (const id of gone) trashing.current.delete(id)
      held.current = page
      writer.adopt(page, projection(editor.document))
      return
    }
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
    // Store the draft for the remount to offer back; download only if storage refuses.
    try { sessionStorage.setItem(draftKey, JSON.stringify({ folderId, revision: writer.revision, blocks: editor.document, pending: writer.pending?.request })) } catch { copyDraft() }
    try {
      const latest = await getPlain(getPageResponse, documentPath)
      onSaved(latest)
      onCheckpoint(latest)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not reload the page.') }
  }
  // Takes block and title as arguments: the slash menu calls it in the same tick it
  // would set that state. A refusal leaves the title where it was typed.
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
        // Text or a stored to-do becomes the task; anything else stays and the task follows.
        return block.type === 'paragraph' || block.type === 'checkListItem' ? [task, ...replace(block.children ?? [])] : [block, task]
      }
      return [{ ...block, children: block.children ? replace(block.children) : [] }]
    })
    const proposal = replace(editor.document)
    // Serialize through a temporary editor; nothing is put into the live editor before commit.
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
    // A failed send shows in the save status, whose Retry re-sends this request.
    try { await writer.flush({ op: 'create_task', id, title: taskTitle.trim() }) } finally {
      setCreating(false)
      if ((writer.state as string) === 'failed') resumeAfter.delete(draftKey)
    }
  }
  // A Doc's `/` Page: page and link are made in one save. The editor is read-only
  // until it lands, or typing would replace the drafted link and trash the new page.
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
  // The failed-save line offers "Load latest", so name only that control.
  const taskBlocked = 'Your writing has not saved, so a task cannot be made yet. Use Load latest below; your writing is kept.'
  // A paragraph with text becomes a task at once; an empty line is titled in place.
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
    // Set now, not after render: an Enter right after `[] ` belongs to the draft.
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
  // Leaving the line settles it the way Enter does.
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
    // Text typed during the round trip (`keepTyping`) goes on the new line.
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
  const draftKeys = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (draftRef.current === null) return
    const drafting = editor.getBlock(draftRef.current)
    const blank = drafting === undefined || richRuns(drafting).every((run) => run.text === '')
    // Enter or Backspace on the empty line ends the list; the line stays as text.
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
  // Only Results a save has stored can be linked, so only they ask for backlinks.
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
    {/* `arrangeable` is the reader's edit right here; a reader who cannot write gets no notice. */}
    {!arrangeable && presentationHeadings !== true ? (
      <p className="mb-3 text-sm text-muted-foreground">
        {taskFilter === undefined ? 'Writing is paused while this list is filtered or sorted.' : 'Clear filters to edit this page.'}
      </p>
    ) : null}
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
    <CanvasTaskProvider tasks={tasks} completed={completed} taskFilter={taskFilter} freeform={workView === 'freeform'} context={context} actions={actions} onAsk={onAsk}>
      {draftStyle === '' ? null : <style>{draftStyle}</style>}
      <ThreadLayer enabled={presentationHeadings !== true && workView === 'thread'} editor={editor} folderId={folderId} tasks={tasks} context={context} frozen={frozen}>
      <div
        ref={completedContainer}
        className={workView === 'freeform' && presentationHeadings !== true ? 'dana-freeform-completed min-w-0' : 'min-w-0'}
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
        settle={async (taskIds) => {
          changed(editor); await writer.drain()
          if (writer.state !== 'saved') return false
          for (const id of taskIds) trashing.current.add(id)
          return true
        }}
        footer={workView === 'freeform' && presentationHeadings !== true ? <FreeformCompleted editor={editor} container={completedContainer} completed={completed ?? noCompleted} context={context} {...(taskFilter === undefined ? {} : { filter: taskFilter })} /> : undefined}
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

// The "Earlier work" breaks this viewer expanded, for this session only. Never stored.
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
// Held outside ThreadLayer: a repeating task's tick remounts the editor between the
// tick and the stretch's move.
const threadMotion = new Map<string, {
  readonly stop: string | null
  readonly progress: ReadonlyMap<string, ProgressState>
  /** When this viewer last ticked, and the stretch then; cleared once the growth plays. */
  readonly tick: { readonly at: number; readonly before: ReadonlyMap<string, ProgressState> } | null
}>()
// The longest the growth is held (ms), for reduced motion and a not-yet-drawn editor.
const FILL_FOR = 2000

/**
 * The Work thread: the same document drawn on a rail through one style element keyed
 * by block id, so nothing is written into ProseMirror's DOM. "Earlier work" is a real
 * button over the rail, so drag, selection and undo are untouched.
 */
function ThreadLayer({ enabled, editor, folderId, tasks, context, frozen, children }: {
  readonly enabled: boolean
  readonly editor: CanvasEditor
  readonly folderId: string
  readonly tasks: readonly Card[]
  readonly context: Rows['context']
  readonly frozen: Frozen
  readonly children: ReactNode
}): React.JSX.Element {
  const [, bump] = useState(0)
  useEffect(() => enabled ? editor.onChange(() => { bump((value) => value + 1) }) : undefined, [editor, enabled])
  const shared = useMultiMemberFolderIds().has(folderId)
  const done = useFolderCompletedTasks(folderId, enabled)
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
  // The one motion (AC-1514): only a move that follows this viewer's own tick animates.
  // Compared after commit, so a discarded render changes nothing.
  const [grown, setGrown] = useState<{ readonly from: ReadonlyMap<string, ProgressState>; readonly at: number } | null>(null)
  const css = enabled ? threadStyle(model, new Set(elided.keys()), breaks, grown?.from ?? null) : ''
  const stop = [...model.progress].find(([, state]) => state === 'done-frontier')?.[0] ?? null
  useLayoutEffect(() => {
    if (!enabled) return
    const seen = threadMotion.get(folderId)
    const tick = seen?.tick ?? null
    threadMotion.set(folderId, { stop, progress: model.progress, tick })
    if (seen === undefined || seen.stop === stop || tick === null || performance.now() - tick.at >= TICK_ANSWERS_WITHIN) return
    // Always from the stretch at the tick: a repeating task moves the stop twice.
    setGrown({ from: tick.before, at: performance.now() })
  })
  useEffect(() => {
    if (grown === null) return undefined
    const timer = window.setTimeout(() => { setGrown(null) }, FILL_FOR)
    return () => { window.clearTimeout(timer) }
  }, [grown])
  // Only a tick of the frontier task arms the motion, so a collaborator's tick does not.
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
  // Listen on the window, before CanvasMarquee takes the press as a band selection.
  const host = useRef<HTMLDivElement>(null)
  const live = useRef({ breaks })
  live.current = { breaks }
  // Measured after every render and resize; set only when something moved.
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
  // A Doc draws no thread, but its tasks still show who has them.
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
      </div>
    </ThreadFactsProvider>
  )
}
