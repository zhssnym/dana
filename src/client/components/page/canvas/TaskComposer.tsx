// The task body editor, saved by the shared `CanvasWriter` to `/tasks/:id/document`.
// The server refuses task rows, sections and folder references, so none is offered.
// Access: `edit` writes; `tick` is read-only with live checkboxes; `read` is read-only.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BlockNoteSchema, createExtension, createHeadingBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from '@blocknote/core'
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
import { baselineOf, contentOf, richRuns, tableContentOf, tableRichOf } from './adapters.js'
import type { CanvasDocument, CanvasRecord } from './adapters.js'
import { tablePlainText } from '../../../../shared/rich-content.js'
import type { CanvasBlock, CanvasEditor } from './schema.js'
import { canvasSchema, canvasTableOptions, openByDefault, toggleClosed } from './schema.js'
import { danaLinkInlineSpec } from '../../links/dana-link-chip.js'
import { MentionSuggestions, mentionInlineSpec } from './mentions.js'
import { CanvasSlashMenu, blockMenuTargets } from './slash-items.js'
import { CanvasWriter } from './saving.js'
import { NOT_SAVED, RecoveryNotice, SaveFailure } from './SaveFailure.js'
import { BlockMenuContext, BlockSideMenu, blockSidePosition, duplicateBlocks, pageTheme, turnBlocksInto } from './BlockSideMenu.js'
import type { BlockMenuModel } from './BlockSideMenu.js'
import { createCanvasCallout } from './CanvasCallout.js'
import { queryKeys } from '../../../api/keys.js'
import { BlockSelectionStyle, useBlockAnchor, useBlockSelectionKeys } from './block-selection.js'
import { simulateNest } from './turn-into.js'
import type { TreeBlock } from './turn-into.js'
import { validateCanvasOutline } from './outline.js'
import './canvas.css'

// A toggle heading opens by default and keeps its fold; Enter at the end of an open
// one starts its first child.
const stockHeading = createHeadingBlockSpec({ levels: [1, 2, 3], defaultLevel: 1, allowToggleHeadings: true })
const taskHeading = {
  ...stockHeading,
  extensions: [...(stockHeading.extensions ?? []), createExtension({
    key: 'task-toggle-heading-enter',
    keyboardShortcuts: {
      Enter: ({ editor }) => {
        const { selection } = editor.prosemirrorState
        const block = editor.getTextCursorPosition().block
        if (block.type !== 'heading' || block.props.isToggleable !== true || toggleClosed(block.id) || !selection.empty || selection.$from.parentOffset !== selection.$from.parent.content.size) return false
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
    ...stockHeading.config,
    propSchema: { ...stockHeading.config.propSchema, presentation: { default: false } },
  },
  implementation: {
    ...stockHeading.implementation,
    render: (function (block, editor) {
      return openByDefault(block.id, () => stockHeading.implementation.render.call(this, block, editor))
    }) as typeof stockHeading.implementation.render,
  },
}

// In tick mode the boxes stay live on a read-only editor and report to the session.
const tickHandlers = new WeakMap<object, (blockId: string, checked: boolean, box: HTMLInputElement) => void>()
const stockCheck = defaultBlockSpecs.checkListItem
const taskCheck = {
  ...stockCheck,
  implementation: {
    ...stockCheck.implementation,
    render: (function (block, editor) {
      const drawn = stockCheck.implementation.render.call(this, block, editor)
      const box = (drawn.dom as DocumentFragment | HTMLElement).querySelector('input[type="checkbox"]')
      if (box instanceof HTMLInputElement && tickHandlers.has(editor)) {
        box.disabled = false
        box.addEventListener('change', () => { tickHandlers.get(editor)?.(block.id, box.checked, box) })
      }
      return drawn
    }) as typeof stockCheck.implementation.render,
  },
}

export const taskSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: taskHeading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: taskCheck,
    toggleListItem: canvasSchema.blockSpecs.toggleListItem,
    quote: defaultBlockSpecs.quote,
    callout: createCanvasCallout(),
    divider: defaultBlockSpecs.divider,
    codeBlock: defaultBlockSpecs.codeBlock,
    diagram: canvasSchema.blockSpecs.diagram,
    table: canvasSchema.blockSpecs.table,
    // The page canvas's media blocks, filled through the same `CanvasFilePanel`.
    image: canvasSchema.blockSpecs.image,
    file: canvasSchema.blockSpecs.file,
    audio: canvasSchema.blockSpecs.audio,
    video: canvasSchema.blockSpecs.video,
  },
  // Dana Link chips, written back as href runs by `richRuns`.
  inlineContentSpecs: { ...defaultInlineContentSpecs, danaLink: danaLinkInlineSpec, mention: mentionInlineSpec },
  styleSpecs: { bold: defaultStyleSpecs.bold, italic: defaultStyleSpecs.italic },
})
type TaskBlock = typeof taskSchema.Block
type TaskInput = PartialBlock<typeof taskSchema.blockSchema, typeof taskSchema.inlineContentSchema, typeof taskSchema.styleSchema>

const fileUrl = (id: string | null): string => id === null ? '' : `/api/v1/files/${id}`
const fileIdOf = (url: string): string | null => /(?:^|\/)api\/v1\/files\/([0-9a-f-]{36})$/i.exec(url)?.[1] ?? null
const draftKey = (taskId: string): string => `dana-task-draft:${taskId}`
const recoveredKey = (taskId: string): string => `dana-task-recovered:${taskId}`

const CHANGED_ELSEWHERE = 'This task was edited elsewhere. Your writing is kept here. Load the latest to continue; your writing will be offered back.'

export function hydrateTask(page: PageView, width: number): TaskInput[] {
  const records = new Map(page.blocks.map((block) => [block.id, block]))
  const nodes = new Map<string, TaskInput>()
  const root: TaskInput[] = []
  for (const item of page.items) {
    const b = records.get(item.id)
    if (b === undefined || item.kind !== 'block') continue
    const node = { ...drawTask(b, width), children: [] as TaskInput[] } as TaskInput
    nodes.set(b.id, node)
    // A parent precedes its children; one that cannot be found keeps the block at the
    // root rather than losing it.
    const parent = b.list_parent_block_id === null ? undefined : nodes.get(b.list_parent_block_id)
    if (parent === undefined) root.push(node)
    else parent.children!.push(node)
  }
  return root
}

function drawTask(b: PageView['blocks'][number], width: number): TaskInput {
  const content = contentOf(b.text, b.rich_content)
  const previewWidth = width * (b.width_pct ?? 100) / 100
  const toggle = b.toggleable === true
  switch (b.kind) {
    case 'heading1': case 'heading2': case 'heading3':
      return { id: b.id, type: 'heading', props: { level: Number(b.kind.slice(-1)) as 1 | 2 | 3, isToggleable: toggle, presentation: toggle }, content }
    case 'bullet': return { id: b.id, type: 'bulletListItem', content }
    case 'numbered': return { id: b.id, type: 'numberedListItem', content }
    case 'checklist': return { id: b.id, type: 'checkListItem', props: { checked: b.checked === true }, content }
    case 'toggle': return { id: b.id, type: 'toggleListItem', content }
    case 'quote': return { id: b.id, type: 'quote', content }
    case 'callout': return { id: b.id, type: 'callout', content }
    case 'divider': return { id: b.id, type: 'divider' }
    case 'code': return { id: b.id, type: 'codeBlock', content: b.text ?? '' }
    case 'diagram': return { id: b.id, type: 'diagram', props: { source: b.text ?? '' } }
    case 'table': return { id: b.id, type: 'table', content: tableContentOf(b.rich_content) }
    case 'image': return { id: b.id, type: 'image', props: { url: fileUrl(b.file_id), caption: b.text ?? '', previewWidth } }
    case 'video': return { id: b.id, type: 'video', props: { url: fileUrl(b.file_id), caption: '', previewWidth } }
    case 'audio': return { id: b.id, type: 'audio', props: { url: fileUrl(b.file_id), caption: '' } }
    case 'file': return { id: b.id, type: 'file', props: { url: fileUrl(b.file_id), name: b.file_name ?? 'File' } }
    default: return { id: b.id, type: 'paragraph', content }
  }
}

const KIND: Record<TaskBlock['type'], PageBlockKind> = {
  paragraph: 'paragraph', heading: 'heading1', bulletListItem: 'bullet', numberedListItem: 'numbered',
  checkListItem: 'checklist', toggleListItem: 'toggle', quote: 'quote', callout: 'callout', divider: 'divider', codeBlock: 'code', diagram: 'diagram', table: 'table', image: 'image', file: 'file', audio: 'audio', video: 'video',
}

/** What may hold nested blocks (the server's `NEST_PARENT_KINDS`). */
const NEST_PARENTS: ReadonlySet<string> = new Set(['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem', 'quote', 'callout'])

/** Children of a block that holds nothing (code, divider, media) are written beside it. */
export function dehydrateTask(blocks: readonly TaskBlock[], width: number): CanvasDocument {
  const result: CanvasDocument = { blocks: [], items: [] }
  const visit = (list: readonly TaskBlock[], parent: string | null): void => {
    for (const block of list) {
      const runs = richRuns(block as unknown as CanvasBlock)
      const text = runs.map((run) => run.text).join('')
      let record: CanvasRecord
      // An empty file, audio or video block is only the picker's placeholder; the server
      // refuses it, so it is not written until a file uploads.
      if ((block.type === 'video' || block.type === 'audio' || block.type === 'file') && block.props.url === '') {
        visit(block.children, parent)
        continue
      }
      if (block.type === 'image' || block.type === 'video' || block.type === 'audio' || block.type === 'file') {
        const fileId = fileIdOf(block.props.url)
        if (block.props.url && fileId === null) throw new Error('Upload this file to Dana before saving. Links to files elsewhere are not supported.')
        const sized = block.type === 'image' || block.type === 'video'
        record = {
          id: block.id, block_kind: KIND[block.type],
          text: block.type === 'image' ? block.props.caption : null,
          rich_content: null, file_id: fileId, ref_folder_id: null, checked: null,
          width_pct: sized ? Math.max(25, Math.min(100, Math.round(((block.props as { previewWidth?: number }).previewWidth || width) / width * 100))) : null,
          toggleable: null,
        }
      } else if (block.type === 'divider') {
        record = { id: block.id, block_kind: 'divider', text: null, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null, toggleable: null }
      } else if (block.type === 'diagram') {
        record = { id: block.id, block_kind: 'diagram', text: block.props.source, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null, toggleable: null }
      } else if (block.type === 'table') {
        const table = tableRichOf(block as unknown as CanvasBlock)
        record = { id: block.id, block_kind: 'table', text: tablePlainText(table.table), rich_content: table, file_id: null, ref_folder_id: null, width_pct: null, checked: null, toggleable: null }
      } else {
        const kind: PageBlockKind = block.type === 'heading' ? `heading${block.props.level}` as PageBlockKind : KIND[block.type]
        const checked = block.type === 'checkListItem' ? block.props.checked : null
        record = { id: block.id, block_kind: kind, text, rich_content: kind === 'code' ? null : { version: 1, runs }, file_id: null, ref_folder_id: null, width_pct: null, checked, toggleable: block.type === 'heading' && block.props.isToggleable === true ? true : null }
      }
      result.blocks.push(record)
      result.items.push({ kind: 'block', id: block.id, section_block_id: null, list_parent_block_id: parent })
      visit(block.children, NEST_PARENTS.has(block.type) ? block.id : parent)
    }
  }
  visit(blocks, null)
  return result
}

/**
 * Merge a recovered draft without removing anything: a changed block is added as a
 * copy after its current version, a new one after its draft neighbour.
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

/** Every heading here is a presentation heading, so the outline never reads a Section. */
function asPresentation(blocks: readonly TreeBlock[]): TreeBlock[] {
  return blocks.map((block) => ({ ...block, props: block.type === 'heading' ? { ...block.props, isToggleable: false } : block.props, children: asPresentation(block.children) }))
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

// The page's one hint, shown on an empty Work tab unfocused too.
const PLACEHOLDER = "Press '/' for commands"

export type TaskBodyAccess = 'edit' | 'tick' | 'read'

export default function TaskComposer({ taskId, folderId, notes, access = 'edit', onBlockedBy }: {
  readonly taskId: string
  readonly folderId: string | null
  readonly access?: TaskBodyAccess
  readonly onBlockedBy?: () => void
  /** Shown while the document loads, or if it cannot. */
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
    // Escape while writing only leaves the writing; a second Escape closes the card.
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.stopPropagation()
      if (window.document.activeElement instanceof HTMLElement) window.document.activeElement.blur()
    }}>
    {page === undefined || width === null
      ? <div className="text-[length:var(--text-meta-size)] leading-5 text-foreground">
          {notes ? <p className="whitespace-pre-wrap">{notes}</p> : null}
          <p role="status" className={query.isError ? 'text-muted-foreground' : 'sr-only'}>
            {query.isError ? <>Couldn't open this task's writing. <Button variant="ghost" onClick={() => { void query.refetch() }}>Try again</Button></> : 'Loading writing…'}
          </p>
        </div>
      : <CanvasErrorBoundary>
          <TaskSession key={`${taskId}:${access}:${checkpoint?.epoch ?? 0}`} taskId={taskId} folderId={folderId} access={access} onBlockedBy={onBlockedBy} initialPage={page} latest={query.data ?? page} width={width}
            onCheckpoint={(next) => setCheckpoint((old) => ({ page: next, epoch: (old?.epoch ?? 0) + 1 }))} />
        </CanvasErrorBoundary>}
  </div>
}

function TaskSession({ taskId, folderId, access, onBlockedBy, initialPage, latest, width, onCheckpoint }: {
  readonly taskId: string
  readonly folderId: string | null
  readonly access: TaskBodyAccess
  readonly onBlockedBy: (() => void) | undefined
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
    tables: canvasTableOptions,
    dictionary: { ...en, placeholders: { ...en.placeholders, emptyDocument: PLACEHOLDER, default: PLACEHOLDER } },
    initialContent: initial.length ? initial : [{ id: crypto.randomUUID(), type: 'paragraph', content: '' }],
    uploadFile: folderId === null ? undefined : async (file, blockId) => {
      const type = blockId === undefined ? undefined : editorRef.current?.getBlock(blockId)?.type
      const kind: CanvasMediaKind = type === 'audio' || type === 'video' || type === 'file' ? type : 'image'
      return { props: await upload(kind, folderId, file) }
    },
  })
  editorRef.current = editor
  // Tick mode writes one `put_block` with the stored outline, then reopens on the
  // answer. Set during render so the boxes drawn at mount find it.
  if (access === 'tick') {
    tickHandlers.set(editor, (blockId, checked, box) => {
      const stored = latest.blocks.find((block) => block.id === blockId)
      if (stored === undefined || latest.revision === undefined) return
      const byId = new Map(latest.blocks.map((block) => [block.id, block]))
      void mutateApi(getPageResponse, {
        method: 'PUT',
        path: `/tasks/${taskId}/document`,
        body: {
          action: 'document_transaction',
          mutation_id: crypto.randomUUID(),
          base_revision: latest.revision,
          operations: [
            {
              op: 'put_block', id: stored.id, block_kind: 'checklist', text: stored.text,
              rich_content: stored.rich_content, file_id: stored.file_id, ref_folder_id: null,
              width_pct: stored.width_pct, checked, toggleable: null,
            },
            {
              op: 'set_outline',
              items: latest.items.map((item) => ({
                kind: 'block' as const, id: item.id, section_block_id: null,
                list_parent_block_id: byId.get(item.id)?.list_parent_block_id ?? null,
              })),
            },
          ],
        },
      }).then((next) => {
        queryClient.setQueryData(['tasks', taskId, 'document'], next)
        void queryClient.invalidateQueries({ queryKey: ['tasks', taskId] })
        // The tick records "completed the subtask" in the task's history.
        void queryClient.invalidateQueries({ queryKey: queryKeys.events(`task:${taskId}`) })
        onCheckpoint(next)
      }, (failure: unknown) => {
        box.checked = !checked
        setError(failure instanceof Error ? failure.message : NOT_SAVED)
      })
    })
  }
  const menu = useMemo<BlockMenuModel>(() => ({
    targets: (block) => blockMenuTargets(editor as unknown as CanvasEditor, block),
    // A task's headings are presentation headings (`false`).
    turnInto: (ids, target) => { turnBlocksInto(editor, ids, target, false) },
    canDuplicate: () => true,
    duplicate: (ids) => { duplicateBlocks(editor, ids) },
    syncedCopies: latest.synced_copies,
    removal: (_block, ids) => ({ label: 'Delete', run: () => { editor.removeBlocks([...ids]) } }),
  }), [editor, latest.synced_copies])
  const selectionActions = useMemo(() => ({ remove: (ids: readonly string[]) => { editor.removeBlocks([...ids]) }, duplicate: menu.duplicate }), [editor, menu])
  useBlockSelectionKeys(editor, selectionActions)
  useBlockAnchor(editor, true)
  const scope = `dana-canvas-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  // Tab nests only where the task document can store the shape; code keeps its own Tab.
  function onKeyDownCapture(event: React.KeyboardEvent): void {
    if (event.key !== 'Tab' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
    if (!editor.prosemirrorState.selection.empty || editor.domElement === undefined || !editor.domElement.contains(event.target as Node)) return
    const block = editor.getTextCursorPosition().block
    if (block.type === 'codeBlock') return
    const next = simulateNest(editor.document as unknown as TreeBlock[], block.id)
    if (next === null || validateCanvasOutline(asPresentation(next)) !== null) { event.preventDefault(); event.stopPropagation() }
  }
  // `/Blocked by` writes nothing; remove the line it was typed on unless it is the only one.
  function dropSlashLine(): void {
    const block = editor.getTextCursorPosition().block
    const empty = block.type === 'paragraph' && Array.isArray(block.content) && block.content.length === 0 && block.children.length === 0
    if (empty && editor.document.length > 1) editor.removeBlocks([block.id])
  }
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
      (next) => {
        queryClient.setQueryData(['tasks', taskId, 'document'], next)
        // The write records "edited the description" in history.
        void queryClient.invalidateQueries({ queryKey: queryKeys.events(`task:${taskId}`) })
      },
    )
    return created
  })

  // Move an earlier session's draft aside and offer it back, unless the server already
  // holds it.
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
      // Not sendable (an outside link): the writing still goes to the draft.
      writeStorage(draftKey(taskId), JSON.stringify({ taskId, revision: writer.revision, blocks: editor.document }))
      setError(failure instanceof Error ? failure.message : 'Could not prepare this edit for saving.')
    }
  }
  async function loadLatest(): Promise<void> {
    // The remount moves the stored draft to the recovered slot and offers it back.
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
    <div onKeyDownCapture={onKeyDownCapture} className={`dana-writing-canvas dana-task-composer ${scope} min-w-0`} style={{ '--dana-canvas-placeholder': JSON.stringify(PLACEHOLDER) } as React.CSSProperties}>
      <BlockNoteView editor={editor} theme={pageTheme()} editable={access === 'edit'}
        formattingToolbar={false} slashMenu={false} sideMenu={false} filePanel={false} tableHandles={true} onChange={changed} aria-label="Task writing">
        <FormattingToolbarController formattingToolbar={CanvasFormattingToolbar} />
        {folderId === null ? null : <FilePanelController filePanel={(props) => <CanvasFilePanel {...props} onUpload={(kind: CanvasMediaKind, file: File) => upload(kind, folderId, file)} />} />}
        <SideMenuController sideMenu={BlockSideMenu} floatingUIOptions={blockSidePosition} />
        <CanvasSlashMenu editor={editor as unknown as CanvasEditor} context={{ surface: 'task', media: folderId !== null, ...(onBlockedBy === undefined ? {} : { onCreateBlocker: () => { dropSlashLine(); onBlockedBy() } }) }} />
        <MentionSuggestions editor={editor as unknown as CanvasEditor} folderId={folderId} />
        <CanvasMarquee />
      </BlockNoteView>
      <div aria-hidden="true" className="dana-canvas-tail" onMouseDown={writeBelow} />
    </div>
    </BlockMenuContext.Provider>
    <SaveFailure
      message={error || (writer.state === 'failed' ? NOT_SAVED : null)}
      onRetry={!error && writer.state === 'failed' && !conflict && writer.pending ? () => { void writer.retry() } : undefined}
      onLoadLatest={writer.state === 'failed' || error === CHANGED_ELSEWHERE ? () => { void loadLatest() } : undefined}
    />
  </>
}
