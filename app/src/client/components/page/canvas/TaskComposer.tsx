/*
The Task composer (#221, the Task half): the Task's authored content, written
in the same BlockNote host and saved by the same `CanvasWriter` as the Folder
canvas, against `GET/PUT /tasks/:id/document` (7.16's document transaction over
the Task's own blocks, `server/domain/task-document.ts`).

**Vocabulary.** What a Task document admits and this editor can draw:
paragraph, heading 1-3 (`heading1..3`, never a Main Section), bullet,
numbered, to-do (`checklist`, its tick stored), quote, callout, divider, code,
and image/file/audio/video from the Task's Folder.
The server refuses Task rows, Sections, folder references and nested list
items, so none is offered: there is no Task command, headings do not fold
content under them, and a block the person indents is written flat — its words
kept, its indent not. A to-do here is a note's checkbox, not a Step: it has no
assignee, no due date and no place in any list.

**Nothing typed is dropped.** Every change is mirrored to
`sessionStorage['dana-task-draft:<task>']` until the server acknowledges it. A
refused save (409 when the Task was edited elsewhere) keeps the editor and the
draft; "Load latest" re-opens on the server's copy and moves the draft to
`dana-task-recovered:<task>`, offered back with Download writing / Restore / Discard (Restore merges);
merging adds the draft's blocks to the latest copy and removes nothing, so
neither tab's writing is lost to a last write.

`tasks.notes` stays the server's plain-text projection for older clients; this
editor never writes it.
*/
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BlockNoteSchema, createHeadingBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from '@blocknote/core'
import type { PartialBlock } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/shadcn'
import {
  FilePanelController, FormattingToolbarController, SideMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import '@blocknote/shadcn/style.css'
import type { PageBlockKind, PageView } from '../../../../shared/pages.js'
import { getPageResponse } from '../../../../shared/pages.js'
import { ApiError, getPlain, mutateApi, uploadFile } from '../../../api/http.js'
import { Button } from '../../ui/button.js'
import { CanvasErrorBoundary } from './CanvasErrorBoundary.js'
import { CanvasFormattingToolbar } from './CanvasFormattingToolbar.js'
import { CanvasMarquee } from './CanvasMarquee.js'
import { CanvasFilePanel } from './CanvasFilePanel.js'
import type { CanvasMediaKind } from './CanvasFilePanel.js'
import { baselineOf, contentOf, richRuns } from './adapters.js'
import type { CanvasDocument, CanvasRecord } from './adapters.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { danaLinkInlineSpec } from '../../links/dana-link-chip.js'
import { MentionSuggestions, mentionInlineSpec } from './mentions.js'
import { CanvasSlashMenu, blockMenuTargets } from './slash-items.js'
import { CanvasWriter } from './saving.js'
import { NOT_SAVED, RecoveryNotice, SaveFailure } from './SaveFailure.js'
import { BlockMenuContext, BlockSideMenu, blockSidePosition, duplicateBlocks, pageTheme, turnBlocksInto } from './BlockSideMenu.js'
import type { BlockMenuModel } from './BlockSideMenu.js'
import { createCanvasCallout } from './CanvasCallout.js'
import { BlockSelectionStyle, useBlockAnchor, useBlockSelectionKeys } from './block-selection.js'
import './canvas.css'

export const taskSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: createHeadingBlockSpec({ levels: [1, 2, 3], defaultLevel: 1, allowToggleHeadings: false }),
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    quote: defaultBlockSpecs.quote,
    callout: createCanvasCallout(),
    divider: defaultBlockSpecs.divider,
    codeBlock: defaultBlockSpecs.codeBlock,
    image: defaultBlockSpecs.image,
    file: defaultBlockSpecs.file,
    audio: defaultBlockSpecs.audio,
    video: defaultBlockSpecs.video,
  },
  // Dana Link chips (#223): a Task document is a backlink source, and chips
  // are written back as href runs by `richRuns`, as on the Folder canvas.
  inlineContentSpecs: { ...defaultInlineContentSpecs, danaLink: danaLinkInlineSpec, mention: mentionInlineSpec },
  styleSpecs: { bold: defaultStyleSpecs.bold, italic: defaultStyleSpecs.italic },
})
type TaskBlock = typeof taskSchema.Block
type TaskInput = PartialBlock<typeof taskSchema.blockSchema, typeof taskSchema.inlineContentSchema, typeof taskSchema.styleSchema>

const fileUrl = (id: string | null): string => id === null ? '' : `/api/v1/files/${id}`
const fileIdOf = (url: string): string | null => /(?:^|\/)api\/v1\/files\/([0-9a-f-]{36})$/i.exec(url)?.[1] ?? null
const draftKey = (taskId: string): string => `dana-task-draft:${taskId}`
const recoveredKey = (taskId: string): string => `dana-task-recovered:${taskId}`

/** The one error "Load latest" answers besides a failed save. */
const CHANGED_ELSEWHERE = 'This task was edited elsewhere. Your writing is kept here. Load the latest to continue; your writing will be offered back.'

export function hydrateTask(page: PageView, width: number): TaskInput[] {
  const records = new Map(page.blocks.map((block) => [block.id, block]))
  return page.items.flatMap((item): TaskInput[] => {
    const b = records.get(item.id)
    if (b === undefined || item.kind !== 'block') return []
    const content = contentOf(b.text, b.rich_content)
    const previewWidth = width * (b.width_pct ?? 100) / 100
    switch (b.kind) {
      case 'heading1': case 'heading2': case 'heading3':
        return [{ id: b.id, type: 'heading', props: { level: Number(b.kind.slice(-1)) as 1 | 2 | 3 }, content }]
      case 'bullet': return [{ id: b.id, type: 'bulletListItem', content }]
      case 'numbered': return [{ id: b.id, type: 'numberedListItem', content }]
      case 'checklist': return [{ id: b.id, type: 'checkListItem', props: { checked: b.checked === true }, content }]
      case 'quote': return [{ id: b.id, type: 'quote', content }]
      case 'callout': return [{ id: b.id, type: 'callout', content }]
      case 'divider': return [{ id: b.id, type: 'divider' }]
      case 'code': return [{ id: b.id, type: 'codeBlock', content: b.text ?? '' }]
      case 'image': return [{ id: b.id, type: 'image', props: { url: fileUrl(b.file_id), caption: b.text ?? '', previewWidth } }]
      case 'video': return [{ id: b.id, type: 'video', props: { url: fileUrl(b.file_id), caption: b.text ?? '', previewWidth } }]
      case 'audio': return [{ id: b.id, type: 'audio', props: { url: fileUrl(b.file_id), caption: b.text ?? '' } }]
      case 'file': return [{ id: b.id, type: 'file', props: { url: fileUrl(b.file_id), name: b.text || 'File' } }]
      default: return [{ id: b.id, type: 'paragraph', content }]
    }
  })
}

const KIND: Record<TaskBlock['type'], PageBlockKind> = {
  paragraph: 'paragraph', heading: 'heading1', bulletListItem: 'bullet', numberedListItem: 'numbered',
  checkListItem: 'checklist', quote: 'quote', callout: 'callout', divider: 'divider', codeBlock: 'code', image: 'image', file: 'file', audio: 'audio', video: 'video',
}

/** Flat by construction: a Task document refuses nesting, so an indented
 * block is written as the next sibling with every word it holds. */
export function dehydrateTask(blocks: readonly TaskBlock[], width: number): CanvasDocument {
  const result: CanvasDocument = { blocks: [], items: [] }
  const visit = (list: readonly TaskBlock[]): void => {
    for (const block of list) {
      const runs = richRuns(block as unknown as CanvasBlock)
      const text = runs.map((run) => run.text).join('')
      let record: CanvasRecord
      if (block.type === 'image' || block.type === 'video' || block.type === 'audio' || block.type === 'file') {
        const fileId = fileIdOf(block.props.url)
        if (block.props.url && fileId === null) throw new Error('Upload this file to Dana before saving. Links to files elsewhere are not supported.')
        const sized = block.type === 'image' || block.type === 'video'
        record = {
          id: block.id, block_kind: KIND[block.type],
          text: block.type === 'file' ? (block.props.caption || block.props.name || null) : block.props.caption,
          rich_content: null, file_id: fileId, ref_folder_id: null, checked: null,
          width_pct: sized ? Math.max(25, Math.min(100, Math.round(((block.props as { previewWidth?: number }).previewWidth || width) / width * 100))) : null,
        }
      } else if (block.type === 'divider') {
        record = { id: block.id, block_kind: 'divider', text: null, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null }
      } else {
        const kind: PageBlockKind = block.type === 'heading' ? `heading${block.props.level}` as PageBlockKind : KIND[block.type]
        const checked = block.type === 'checkListItem' ? block.props.checked : null
        record = { id: block.id, block_kind: kind, text, rich_content: kind === 'code' ? null : { version: 1, runs }, file_id: null, ref_folder_id: null, width_pct: null, checked }
      }
      result.blocks.push(record)
      result.items.push({ kind: 'block', id: block.id, section_block_id: null, list_parent_block_id: null })
      visit(block.children)
    }
  }
  visit(blocks)
  return result
}

/**
 * The recovered draft merged into the current document with nothing from
 * either side removed: a draft block the document already holds unchanged is
 * skipped, one it holds differently is added as a copy right after it, and one
 * it does not hold goes after the draft block before it. So a conflict never
 * costs the other tab's edit or this one's.
 */
export function mergeDraft(current: readonly TaskBlock[], draft: readonly TaskBlock[]): TaskInput[] {
  const flat = (blocks: readonly TaskBlock[]): TaskBlock[] => blocks.flatMap((block) => [{ ...block, children: [] }, ...flat(block.children)])
  const out: TaskBlock[] = flat(current)
  const stored = new Map(out.map((block) => [block.id, JSON.stringify(block)]))
  let at = -1
  for (const block of flat(draft)) {
    const index = out.findIndex((candidate) => candidate.id === block.id)
    if (index >= 0 && stored.get(block.id) === JSON.stringify(block)) { at = index; continue }
    const position = index >= 0 ? index + 1 : at + 1
    out.splice(position, 0, index >= 0 ? { ...block, id: crypto.randomUUID() } : block)
    at = position
  }
  return out as TaskInput[]
}

function download(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function readStorage(key: string): string | null {
  try { return sessionStorage.getItem(key) } catch { return null }
}
function writeStorage(key: string, value: string | null): void {
  try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value) } catch { /* storage is optional */ }
}

export default function TaskComposer({ taskId, folderId, notes }: {
  readonly taskId: string
  readonly folderId: string | null
  /** The plain-text projection, shown while the document loads or if it cannot. */
  readonly notes: string | null
}): React.JSX.Element {
  const key = useMemo(() => ['tasks', taskId, 'document'] as const, [taskId])
  const query = useQuery({ queryKey: key, queryFn: () => getPlain(getPageResponse, `/tasks/${taskId}/document`) })
  const [checkpoint, setCheckpoint] = useState<{ page: PageView; epoch: number } | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => { setWidth(host.current?.clientWidth || 480) }, [])
  const page = checkpoint?.page ?? query.data
  return <div ref={host} className="min-w-0" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}
    /* Escape while writing leaves the writing and nothing else (BlockNote's own
       menus close first); a second Escape, with nothing focused, closes the card. */
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.stopPropagation()
      if (window.document.activeElement instanceof HTMLElement) window.document.activeElement.blur()
    }}>
    {page === undefined || width === null
      ? <div className="text-[length:var(--text-meta-size)] leading-5 text-section-foreground">
          {notes ? <p className="whitespace-pre-wrap">{notes}</p> : null}
          <p role="status" className={query.isError ? 'text-muted-foreground' : 'sr-only'}>
            {query.isError ? <>Couldn't open this task's writing. <Button variant="ghost" onClick={() => { void query.refetch() }}>Try again</Button></> : 'Loading writing…'}
          </p>
        </div>
      : <CanvasErrorBoundary>
          <TaskSession key={`${taskId}:${checkpoint?.epoch ?? 0}`} taskId={taskId} folderId={folderId} initialPage={page} latest={query.data ?? page} width={width}
            onCheckpoint={(next) => setCheckpoint((old) => ({ page: next, epoch: (old?.epoch ?? 0) + 1 }))} />
        </CanvasErrorBoundary>}
  </div>
}

function TaskSession({ taskId, folderId, initialPage, latest, width, onCheckpoint }: {
  readonly taskId: string
  readonly folderId: string | null
  readonly initialPage: PageView
  /** The query row, which follows the server; the editor's content comes from `initialPage`. */
  readonly latest: PageView
  readonly width: number
  readonly onCheckpoint: (page: PageView) => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const [, render] = useState(0)
  const [error, setError] = useState('')
  const [recovered, setRecovered] = useState<string | null>(null)
  const initial = useMemo(() => hydrateTask(initialPage, width), [initialPage, width])
  const editorRef = useRef<typeof taskSchema.BlockNoteEditor | null>(null)
  async function upload(kind: CanvasMediaKind, folder: string, file: File): Promise<{ url: string; name: string }> {
    try {
      const uploaded = await uploadFile(kind, folder, file)
      return { url: `/api/v1/files/${uploaded.id}`, name: file.name }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The file could not be uploaded. Try again.')
      throw failure
    }
  }
  const editor = useCreateBlockNote({
    schema: taskSchema,
    /* One quiet line where the work is written (the Work tab), and nothing on later empty lines. */
    dictionary: { ...en, placeholders: { ...en.placeholders, emptyDocument: 'Write, or type /', default: '' } },
    initialContent: initial.length ? initial : [{ id: crypto.randomUUID(), type: 'paragraph', content: '' }],
    uploadFile: folderId === null ? undefined : async (file, blockId) => {
      const type = blockId === undefined ? undefined : editorRef.current?.getBlock(blockId)?.type
      const kind: CanvasMediaKind = type === 'audio' || type === 'video' || type === 'file' ? type : 'image'
      return { props: await upload(kind, folderId, file) }
    },
  })
  editorRef.current = editor
  // The same gutter and block menu as the Folder canvas (`BlockSideMenu`).
  const menu = useMemo<BlockMenuModel>(() => ({
    targets: (block) => blockMenuTargets(editor as unknown as CanvasEditor, block),
    turnInto: (ids, target) => { turnBlocksInto(editor, ids, target, undefined) },
    canDuplicate: () => true,
    duplicate: (ids) => { duplicateBlocks(editor, ids) },
    removal: (_block, ids) => ({ label: 'Delete', run: () => { editor.removeBlocks([...ids]) } }),
  }), [editor])
  const selectionActions = useMemo(() => ({ remove: (ids: readonly string[]) => { editor.removeBlocks([...ids]) }, duplicate: menu.duplicate }), [editor, menu])
  useBlockSelectionKeys(editor, selectionActions)
  useBlockAnchor(editor, true)
  const scope = `dana-canvas-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  function writeBelow(event: React.MouseEvent): void {
    if (event.button !== 0) return
    event.preventDefault()
    const last = editor.document.at(-1)
    if (last === undefined) return
    const empty = last.type === 'paragraph' && Array.isArray(last.content) && last.content.length === 0 && last.children.length === 0
    const target = empty ? last : editor.insertBlocks([{ type: 'paragraph' }], last, 'after')[0]
    if (target === undefined) return
    editor.setTextCursorPosition(target, 'end')
    editor.focus()
  }
  const [writer] = useState(() => {
    const first = initial.length ? baselineOf(initialPage, dehydrateTask(editor.document, width)) : { blocks: [], items: [] }
    const created: CanvasWriter = new CanvasWriter(first, initialPage.revision!,
      (body) => mutateApi(getPageResponse, { method: 'PUT', path: `/tasks/${taskId}/document`, body }),
      () => {
        render((value) => value + 1)
        writeStorage(draftKey(taskId), created.state === 'saved' ? null : JSON.stringify({ taskId, revision: created.revision, blocks: editor.document }))
      },
      (next) => { queryClient.setQueryData(['tasks', taskId, 'document'], next) },
    )
    return created
  })

  /* A draft left by an earlier session (a failed save, a closed tab, a
     conflict's "Load latest") is moved aside and offered back, unless it says
     nothing the server does not already hold. */
  useEffect(() => {
    const draft = readStorage(draftKey(taskId))
    writeStorage(draftKey(taskId), null)
    let held = readStorage(recoveredKey(taskId))
    if (draft !== null) {
      try {
        const blocks = (JSON.parse(draft) as { blocks: TaskBlock[] }).blocks
        const settled = JSON.stringify(dehydrateTask(blocks, width)) === JSON.stringify(writer.acknowledged)
        if (!settled) held = draft
      } catch { held = draft }
    }
    writeStorage(recoveredKey(taskId), held)
    setRecovered(held)
  }, [taskId, writer, width])
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
  // Closing the card inside the autosave delay, or mid-save, still saves.
  useEffect(() => () => { void writer.drain() }, [writer])
  useEffect(() => {
    if (!latest.revision || latest.revision === writer.revision || writer.state === 'saving') return
    if (writer.state === 'saved') onCheckpoint(latest)
    else setError(CHANGED_ELSEWHERE)
  }, [latest, writer, writer.state, onCheckpoint])

  function changed(): void {
    try {
      writer.change(dehydrateTask(editor.document, width))
      setError('')
    } catch (failure) {
      // Not sendable (an embedded outside link): the writing still goes to the draft.
      writeStorage(draftKey(taskId), JSON.stringify({ taskId, revision: writer.revision, blocks: editor.document }))
      setError(failure instanceof Error ? failure.message : 'Could not prepare this edit for saving.')
    }
  }
  async function loadLatest(): Promise<void> {
    // The draft is already in storage (every unsaved state writes it); the
    // remount moves it to the recovered slot and offers it back.
    writeStorage(draftKey(taskId), JSON.stringify({ taskId, revision: writer.revision, blocks: editor.document }))
    try {
      const next = await getPlain(getPageResponse, `/tasks/${taskId}/document`)
      queryClient.setQueryData(['tasks', taskId, 'document'], next)
      onCheckpoint(next)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load the latest writing.') }
  }
  function restore(): void {
    try {
      const blocks = (JSON.parse(recovered ?? '{}') as { blocks?: TaskBlock[] }).blocks ?? []
      if (blocks.length) editor.replaceBlocks(editor.document, mergeDraft(editor.document, blocks))
      writeStorage(recoveredKey(taskId), null)
      setRecovered(null)
    } catch { setError('This draft could not be restored. Download it to keep the writing.') }
  }

  const conflict = writer.error instanceof ApiError && writer.error.status === 409
  return <>
    {recovered !== null ? <RecoveryNotice
      onDownload={() => { download(`dana-task-writing-${taskId}.json`, recovered) }}
      onRestore={restore}
      onDiscard={() => { writeStorage(recoveredKey(taskId), null); setRecovered(null) }}
    /> : null}
    <BlockMenuContext.Provider value={menu}>
    <BlockSelectionStyle editor={editor} scope={scope} />
    <div className={`dana-writing-canvas dana-task-composer ${scope} min-w-0`}>
      <BlockNoteView editor={editor} theme={pageTheme()}
        formattingToolbar={false} slashMenu={false} sideMenu={false} filePanel={false} onChange={changed} aria-label="Task writing">
        <FormattingToolbarController formattingToolbar={CanvasFormattingToolbar} />
        {folderId === null ? null : <FilePanelController filePanel={(props) => <CanvasFilePanel {...props} onUpload={(kind: CanvasMediaKind, file: File) => upload(kind, folderId, file)} />} />}
        <SideMenuController sideMenu={BlockSideMenu} floatingUIOptions={blockSidePosition} />
        <CanvasSlashMenu editor={editor as unknown as CanvasEditor} context={{ surface: 'task', media: folderId !== null }} />
        <MentionSuggestions editor={editor as unknown as CanvasEditor} folderId={folderId} />
        <CanvasMarquee />
      </BlockNoteView>
      <div aria-hidden="true" className="dana-canvas-tail dana-canvas-tail-short" onMouseDown={writeBelow} />
    </div>
    </BlockMenuContext.Provider>
    <SaveFailure
      message={error || (writer.state === 'failed' ? NOT_SAVED : null)}
      onRetry={!error && writer.state === 'failed' && !conflict && writer.pending ? () => { void writer.retry() } : undefined}
      onLoadLatest={writer.state === 'failed' || error === CHANGED_ELSEWHERE ? () => { void loadLatest() } : undefined}
    />
  </>
}
