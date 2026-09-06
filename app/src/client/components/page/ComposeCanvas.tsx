import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

import type { PageActionBody, PageBlock, PageItemRef, PageView } from '../../../shared/pages.js'
import type { TaskCard } from '../../../shared/tasks.js'
import { TaskRows, useTaskRowsSelection } from '../../pages/task-rows.js'
import type { RowContext } from '../../parts/presenters.js'
import type { RowActions } from '../../parts/useRowActions.js'
import { linkedParts, linksIn, videoTarget } from '../../pages/composer-research-content.js'
import { PageImage } from '../page-image.js'
import { reservedRatio } from '../../lib/page-images.js'
import { Button } from '../ui/button.js'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js'
import { Input } from '../ui/input.js'
import { ChevronDown, Heading1, ImagePlus, ListTodo, Plus, Trash2, X } from '../../lib/icons.js'
import { cn } from '../ui/utils.js'

type CanvasItem =
  | { kind: 'block'; id: string; block: PageBlock }
  | { kind: 'task'; id: string; task: TaskCard }

interface Draft {
  id: string
  kind: 'paragraph' | 'section' | 'image'
  sectionId: string | null
  after: PageItemRef | null
  before: PageItemRef | null
}

interface TaskDwell {
  sourceId: string
  targetId: string
  since: number
  armed: boolean
}

const TASK_FOLDER_DWELL_MS = 1_500

function richText(text: string): ReactNode {
  return linkedParts(text).map((part, index) => part.kind === 'text'
    ? part.value
    : (
        <a
          key={`${String(index)}-${part.href}`}
          href={part.href}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
        >
          {part.value}
        </a>
      ))
}

function EmbeddedVideo({ text }: { readonly text: string }): React.JSX.Element | null {
  const target = linksIn(text).map(videoTarget).find((entry) => entry !== null) ?? null
  if (target === null || target.kind === 'direct') return null
  return (
    <iframe
      src={target.src}
      title={target.kind === 'youtube' ? 'YouTube video' : 'Vimeo video'}
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      className="mt-3 aspect-video w-full rounded-lg bg-muted"
    />
  )
}

function refOf(item: CanvasItem | undefined): PageItemRef | null {
  return item === undefined ? null : { kind: item.kind, id: item.id }
}

export function ComposeCanvas({
  blocks,
  items,
  tasks,
  folderId,
  context,
  actions,
  onAsk,
  onAction: sendAction,
  arrangeable = true,
}: {
  readonly blocks: readonly PageBlock[]
  readonly items: readonly PageItemRef[]
  readonly tasks: readonly TaskCard[]
  readonly folderId: string
  readonly context: RowContext
  readonly actions: RowActions
  readonly onAsk: Parameters<typeof TaskRows>[0]['onAsk']
  readonly onAction: (body: PageActionBody) => Promise<PageView>
  readonly arrangeable?: boolean
}): React.JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PageBlock | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [dragging, setDragging] = useState<PageItemRef | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null>(null)
  const taskDwell = useRef<TaskDwell | null>(null)
  const taskSelection = useTaskRowsSelection(tasks, actions, onAsk)
  const blockById = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks])
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  function fireAction(body: PageActionBody): void {
    /* The shared mutation cache already tells the person and the parent
       refetches the winning state. Fire-and-forget handlers consume the
       rejection after that visible handling, while ordered multi-write flows
       keep using sendAction so a failed first write stops the second. */
    void sendAction(body).catch(() => undefined)
  }
  const ordered = useMemo(
    () => items.flatMap((item): CanvasItem[] => {
      if (item.kind === 'block') {
        const block = blockById.get(item.id)
        return block === undefined ? [] : [{ kind: 'block', id: item.id, block }]
      }
      const task = taskById.get(item.id)
      return task === undefined ? [] : [{ kind: 'task', id: item.id, task }]
    }),
    [items, blockById, taskById],
  )

  function sectionLabel(sectionId: string | null): string {
    if (sectionId === null) return 'No section'
    return blockById.get(sectionId)?.text ?? 'No section'
  }

  function openDraft(index: number, openStructure: boolean, forcedSection?: string | null): void {
    const beforeItem = ordered[index - 1]
    const afterItem = ordered[index]
    const sectionId = forcedSection === undefined
      ? beforeItem?.kind === 'block' && beforeItem.block.kind === 'section'
        ? beforeItem.id
        : beforeItem?.kind === 'block'
          ? beforeItem.block.section_block_id
          : beforeItem?.kind === 'task'
            ? beforeItem.task.section_block_id
            : null
      : forcedSection
    setDraft({
      id: `draft-${Date.now().toString(36)}`,
      kind: 'paragraph',
      sectionId,
      after: refOf(beforeItem),
      before: refOf(afterItem),
    })
    setMenu(openStructure)
  }

  function afterSection(index: number, sectionId: string): number {
    let cursor = index + 1
    while (cursor < ordered.length) {
      const item = ordered[cursor]
      const owner = item?.kind === 'task'
        ? item.task.section_block_id
        : item?.block.section_block_id
      if (owner !== sectionId) break
      cursor += 1
    }
    return cursor
  }

  function hidden(item: CanvasItem): boolean {
    const owner = item.kind === 'task' ? item.task.section_block_id : item.block.section_block_id
    return owner !== null && collapsed.has(owner)
  }

  async function insertParagraph(text: string): Promise<PageView | null> {
    if (draft === null) return null
    const value = text.trim()
    if (value === '') {
      setDraft(null)
      setMenu(false)
      return null
    }
    const page = await sendAction({
      action: 'insert_block',
      block_kind: 'paragraph',
      text: value,
      section_block_id: draft.sectionId,
      after: draft.after,
      before: draft.before,
    })
    setDraft(null)
    setMenu(false)
    return page
  }

  async function insertTask(title: string): Promise<void> {
    if (draft === null) return
    await sendAction({
      action: 'insert_task',
      title: title.trim() === '' ? 'New task' : title.trim(),
      section_block_id: draft.sectionId,
      after: draft.after,
      before: draft.before,
    })
    setDraft(null)
    setMenu(false)
  }

  function insertionMenu(): React.JSX.Element | null {
    if (draft === null || !menu) return null
    return (
      <DropdownMenu open onOpenChange={(open) => { setMenu(open) }}>
        <DropdownMenuTrigger render={<span />} />
        <DropdownMenuContent align="start" sideOffset={2} className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Add here</DropdownMenuLabel>
            <DropdownMenuItem className="items-start py-2" onClick={() => { void insertTask('').catch(() => undefined) }}>
              <ListTodo className="mt-0.5 size-4" strokeWidth={1.75} aria-hidden="true" />
              <span><span className="block font-medium">Task</span><span className="block text-muted-foreground">Add to {sectionLabel(draft.sectionId)}</span></span>
            </DropdownMenuItem>
            <DropdownMenuItem className="items-start py-2" onClick={() => { setDraft({ ...draft, kind: 'section', sectionId: null }); setMenu(false) }}>
              <Heading1 className="mt-0.5 size-4" strokeWidth={1.75} aria-hidden="true" />
              <span><span className="block font-medium">Section</span><span className="block text-muted-foreground">Begin a new part of the page</span></span>
            </DropdownMenuItem>
            <DropdownMenuItem className="items-start py-2" onClick={() => { setDraft({ ...draft, kind: 'image' }); setMenu(false) }}>
              <ImagePlus className="mt-0.5 size-4" strokeWidth={1.75} aria-hidden="true" />
              <span><span className="block font-medium">Image</span><span className="block text-muted-foreground">Choose, paste, or drop</span></span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function draftNode(): React.JSX.Element | null {
    if (draft === null) return null
    if (draft.kind === 'section') {
      return (
        <Input
          autoFocus
          aria-label="Section name"
          placeholder="New section"
          className="h-auto border-0 bg-transparent px-0 py-1 text-base font-semibold shadow-none focus-visible:ring-0"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDraft(null)
            if (event.key !== 'Enter') return
            event.preventDefault()
            const title = event.currentTarget.value.trim()
            if (title === '') return
            void sendAction({
              action: 'insert_block', block_kind: 'section', text: title,
              section_block_id: null, after: draft.after, before: draft.before,
            }).then(() => { setDraft(null) }).catch(() => undefined)
          }}
        />
      )
    }
    if (draft.kind === 'image') {
      return (
        <div className="relative py-2">
          <Button variant="ghost" size="icon-sm" aria-label="Cancel image" className="absolute right-1 top-3 z-10" onClick={() => { setDraft(null) }}>
            <X className="size-3.5" aria-hidden="true" />
          </Button>
          <PageImage
            folderId={folderId}
            image={{ id: '', ratio: 16 / 9, caption: '' }}
            onChange={(image) => {
              if (image.id === '') return
              void sendAction({
                action: 'insert_block', block_kind: 'image', text: image.caption || null,
                file_id: image.id, width_pct: image.width ?? null,
                section_block_id: draft.sectionId, after: draft.after, before: draft.before,
              }).then(() => { setDraft(null) }).catch(() => undefined)
            }}
            onRemove={() => { setDraft(null) }}
          />
        </div>
      )
    }
    return (
      <ParagraphEditor
        initial=""
        autoFocus
        menu={insertionMenu()}
        onMenu={() => { setMenu(true) }}
        onCommit={(text) => { void insertParagraph(text).catch(() => undefined) }}
        onTask={(text) => { void insertTask(text).catch(() => undefined) }}
        onSplit={(before, after) => {
          const currentDraft = draft
          if (currentDraft === null) return
          if (before.trim() === '') return
          void insertParagraph(before).then((page) => {
            if (page === null || after.trim() === '') return
            const made = page.blocks.find(
              (block) => !blockById.has(block.id) && block.kind === 'paragraph' && block.text === before.trim(),
            )
            if (made === undefined) return
            return sendAction({
              action: 'insert_block', block_kind: 'paragraph', text: after.trim(),
              section_block_id: currentDraft.sectionId,
              after: { kind: 'block', id: made.id }, before: currentDraft.before,
            })
          }).catch(() => undefined)
        }}
      />
    )
  }

  function seam(index: number, forcedSection?: string | null): React.JSX.Element {
    const before = ordered[index - 1]
    const after = ordered[index]
    if (draft !== null && sameRef(draft.after, refOf(before)) && sameRef(draft.before, refOf(after))) {
      return draftNode() ?? <></>
    }
    return (
      <div className="group/seam relative h-0">
        <button type="button" aria-label="Insert into page" onClick={() => { openDraft(index, true, forcedSection) }} className={cn('absolute -top-3 left-[-2rem] z-30 flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none transition-opacity hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring', index === ordered.length ? 'opacity-70' : 'opacity-0 group-hover/seam:opacity-50 [@media(hover:none)]:opacity-60')}>
          <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Write here" onClick={() => { openDraft(index, false, forcedSection) }} className="absolute -top-3 z-20 h-6 w-full cursor-text rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
    )
  }

  function dropItemAt(moving: PageItemRef, index: number): void {
    const without = ordered.filter((item) => !sameRef(refOf(item), moving))
    const target = ordered[index]
    const targetIndex = target === undefined
      ? without.length
      : without.findIndex((item) => sameRef(refOf(item), refOf(target)))
    const before = without[targetIndex < 0 ? without.length : targetIndex]
    const after = without[(targetIndex < 0 ? without.length : targetIndex) - 1]
    let sectionId: string | null = null
    if (after?.kind === 'block' && after.block.kind === 'section') sectionId = after.id
    else if (after?.kind === 'block') sectionId = after.block.section_block_id
    else if (after?.kind === 'task') sectionId = after.task.section_block_id
    const movingBlock = moving.kind === 'block' ? blockById.get(moving.id) : undefined
    if (movingBlock?.kind === 'section') sectionId = null
    fireAction({
      action: 'move_item', item: moving, section_block_id: sectionId,
      after: refOf(after), before: refOf(before),
    })
    setDragging(null)
    setDropBefore(null)
  }

  function dropAt(index: number): void {
    if (dragging !== null) dropItemAt(dragging, index)
  }

  function taskUnderPoint(taskId: string, point: { x: number; y: number }): TaskCard | null {
    for (const candidate of ordered) {
      if (candidate.kind !== 'task' || candidate.id === taskId || hidden(candidate)) continue
      const node = document.querySelector<HTMLElement>(
        `[data-canvas-node-id="${CSS.escape(candidate.id)}"]`,
      )
      if (node === null) continue
      const rect = node.getBoundingClientRect()
      if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
        return candidate.task
      }
    }
    return null
  }

  function overTask(taskId: string, point: { x: number; y: number }): string | null {
    const target = taskUnderPoint(taskId, point)
    if (target === null) {
      taskDwell.current = null
      return null
    }
    const current = taskDwell.current
    if (current === null || current.sourceId !== taskId || current.targetId !== target.id) {
      taskDwell.current = { sourceId: taskId, targetId: target.id, since: performance.now(), armed: false }
      return null
    }
    if (!current.armed && performance.now() - current.since >= TASK_FOLDER_DWELL_MS) {
      current.armed = true
    }
    return current.armed ? 'Release to make a folder' : null
  }

  function dropTaskAt(taskId: string, point: { x: number; y: number }): boolean {
    const proposed = taskDwell.current
    const target = taskUnderPoint(taskId, point)
    taskDwell.current = null
    if (
      proposed?.armed === true &&
      proposed.sourceId === taskId &&
      target?.id === proposed.targetId
    ) {
      const source = taskById.get(taskId)
      if (source !== undefined) {
        taskSelection.proposeMerge([source.id, target.id], [source.title, target.title])
        return true
      }
    }
    if (!arrangeable) return false
    let index = ordered.length
    for (const [candidateIndex, candidate] of ordered.entries()) {
      if (hidden(candidate)) continue
      const node = document.querySelector<HTMLElement>(
        `[data-canvas-node-id="${CSS.escape(candidate.id)}"]`,
      )
      if (node !== null && point.y < node.getBoundingClientRect().top + node.offsetHeight / 2) {
        index = candidateIndex
        break
      }
    }
    dropItemAt({ kind: 'task', id: taskId }, index)
    return true
  }

  return (
    <div className="pl-8" data-compose-canvas>
      {taskSelection.chrome}
      {seam(0, null)}
      {ordered.map((item, index) => {
        if (hidden(item)) return null
        const marker = dropBefore === item.id ? <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-px z-20 h-0.5 rounded-full bg-primary" /> : null
        if (item.kind === 'task') {
          return (
            <div
              key={`task:${item.id}`}
              data-canvas-node-id={item.id}
              className="relative"
            >
              {marker}
              <TaskRows
                tasks={[item.task]}
                context={context}
                actions={actions}
                onAsk={onAsk}
                selection={taskSelection.selection}
                selectionChrome={false}
                onDropAt={dropTaskAt}
                onOver={overTask}
                onDragStateChange={(isDragging) => {
                  if (!isDragging) taskDwell.current = null
                }}
              />
              {seam(index + 1)}
            </div>
          )
        }
        const block = item.block
        if (block.kind === 'section') {
          const end = afterSection(index, block.id)
          const isCollapsed = collapsed.has(block.id)
          return (
            <div
              key={`block:${block.id}`}
              data-canvas-node-id={block.id}
              className="relative"
            >
              {marker}
              <div className="group/section -ml-5 flex items-center gap-1 pt-5">
                <button type="button" aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} section ${block.text ?? ''}`} aria-expanded={!isCollapsed} onClick={() => {
                  setCollapsed((current) => {
                    const next = new Set(current)
                    if (next.has(block.id)) next.delete(block.id); else next.add(block.id)
                    return next
                  })
                }} className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  <ChevronDown className={cn('size-4 transition-transform', isCollapsed && '-rotate-90')} strokeWidth={1.75} aria-hidden="true" />
                </button>
                {editing === block.id ? (
                  <Input autoFocus defaultValue={block.text ?? ''} aria-label="Section name" className="h-auto border-0 bg-transparent px-0 py-0 text-base font-semibold shadow-none focus-visible:ring-0" onBlur={(event) => {
                    setEditing(null)
                    const text = event.currentTarget.value.trim()
                    if (text !== '' && text !== block.text) fireAction({ action: 'update_block', block_id: block.id, updated_at: block.updated_at, text })
                  }} />
                ) : <h2 className="cursor-text text-base font-semibold leading-6" onClick={() => { setEditing(block.id) }}>{block.text}</h2>}
                <button
                  type="button"
                  aria-label={`Delete section ${block.text ?? ''}`}
                  title="Delete section"
                  onClick={() => { setDeleting(block) }}
                  className="relative z-30 text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground group-hover/section:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [@media(hover:none)]:opacity-60"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              {isCollapsed ? seam(end, null) : seam(index + 1, block.id)}
            </div>
          )
        }
        if (block.kind === 'image') {
          return (
            <div
              key={`block:${block.id}`}
              data-canvas-node-id={block.id}
              className="relative py-2"
              draggable={arrangeable}
              onDragStart={() => { if (arrangeable) setDragging({ kind: 'block', id: block.id }) }}
              onDragOver={(event) => { if (arrangeable) { event.preventDefault(); setDropBefore(block.id) } }}
              onDrop={(event) => { if (arrangeable) { event.preventDefault(); dropAt(index) } }}
              onDragEnd={() => { setDragging(null); setDropBefore(null) }}
            >
              {marker}
              <PageImage
                folderId={folderId}
                image={{ id: block.file_id ?? '', ratio: reservedRatio(block.file_width, block.file_height), caption: block.text ?? '', ...(block.width_pct === null ? {} : { width: block.width_pct }) }}
                onChange={(image) => { fireAction({ action: 'update_block', block_id: block.id, updated_at: block.updated_at, file_id: image.id || null, text: image.caption || null, width_pct: image.width ?? null }) }}
                onRemove={() => { fireAction({ action: 'delete_block', block_id: block.id, updated_at: block.updated_at }) }}
              />
              {seam(index + 1)}
            </div>
          )
        }
        return (
          <div
            key={`block:${block.id}`}
            data-canvas-node-id={block.id}
            className="relative"
            draggable={arrangeable && editing !== block.id}
            onDragStart={() => { if (arrangeable) setDragging({ kind: 'block', id: block.id }) }}
            onDragOver={(event) => { if (arrangeable) { event.preventDefault(); setDropBefore(block.id) } }}
            onDrop={(event) => { if (arrangeable) { event.preventDefault(); dropAt(index) } }}
            onDragEnd={() => { setDragging(null); setDropBefore(null) }}
          >
            {marker}
            {editing === block.id ? (
              <ParagraphEditor
                initial={block.text ?? ''}
                autoFocus
                onMenu={() => { openDraft(index + 1, true, block.section_block_id) }}
                onCommit={(text) => {
                  setEditing(null)
                  const value = text.trim()
                  if (value === '') fireAction({ action: 'delete_block', block_id: block.id, updated_at: block.updated_at })
                  else if (value !== block.text) fireAction({ action: 'update_block', block_id: block.id, updated_at: block.updated_at, text: value })
                }}
                onTask={() => { setEditing(null); fireAction({ action: 'convert_paragraph_to_task', block_id: block.id, updated_at: block.updated_at }) }}
                onSplit={(before, after) => {
                  setEditing(null)
                  const next = refOf(ordered[index + 1])
                  void sendAction({
                    action: 'update_block', block_id: block.id,
                    updated_at: block.updated_at, text: before.trim(),
                  }).then(() => {
                    if (after.trim() === '') {
                      setDraft({
                        id: `draft-${Date.now().toString(36)}`,
                        kind: 'paragraph', sectionId: block.section_block_id,
                        after: { kind: 'block', id: block.id }, before: next,
                      })
                      return undefined
                    }
                    return sendAction({
                      action: 'insert_block', block_kind: 'paragraph', text: after.trim(),
                      section_block_id: block.section_block_id,
                      after: { kind: 'block', id: block.id }, before: next,
                    })
                  }).catch(() => undefined)
                }}
              />
            ) : (
              <div className="py-1">
                <p className="max-w-2xl cursor-text whitespace-pre-wrap text-sm leading-6 text-foreground" onClick={(event) => { if ((event.target as HTMLElement).closest('a') === null) setEditing(block.id) }}>{richText(block.text ?? '')}</p>
                <EmbeddedVideo text={block.text ?? ''} />
              </div>
            )}
            {seam(index + 1)}
          </div>
        )
      })}
      {dragging === null ? null : <div onDragOver={(event) => { event.preventDefault(); setDropBefore(null) }} onDrop={(event) => { event.preventDefault(); dropAt(ordered.length) }} className="h-5"><span className={cn('block h-0.5 rounded-full', dropBefore === null && 'bg-primary')} /></div>}
      <Dialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete section “{deleting?.text ?? ''}”?</DialogTitle>
            <DialogDescription>
              {(() => {
                const count = deleting === null
                  ? 0
                  : tasks.filter((task) => task.section_block_id === deleting.id).length
                return count === 0
                  ? 'The heading goes; nothing else changes.'
                  : `The heading goes. ${count === 1 ? 'Its task stays' : `Its ${count} tasks stay`} in the folder and ${count === 1 ? 'moves' : 'move'} to No section.`
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep it</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting === null) return
                fireAction({
                  action: 'delete_block',
                  block_id: deleting.id,
                  updated_at: deleting.updated_at,
                })
                setDeleting(null)
              }}
            >
              Delete section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function sameRef(left: PageItemRef | null, right: PageItemRef | null): boolean {
  if (left === null || right === null) return left === right
  return left.kind === right.kind && left.id === right.id
}

function ParagraphEditor({
  initial,
  autoFocus,
  menu,
  onMenu,
  onCommit,
  onTask,
  onSplit,
}: {
  readonly initial: string
  readonly autoFocus: boolean
  readonly menu?: ReactNode
  readonly onMenu: () => void
  readonly onCommit: (text: string) => void
  readonly onTask: (text: string) => void
  readonly onSplit: (before: string, after: string) => void
}): React.JSX.Element {
  const editor = useRef<HTMLDivElement | null>(null)
  const keepForMenu = useRef(false)
  const [empty, setEmpty] = useState(initial === '')
  function text(): string { return editor.current?.innerText.replace(/\n$/u, '') ?? '' }
  return (
    <div className="group/line relative -ml-8 flex items-start">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        <Button variant="ghost" size="icon-sm" aria-label="Insert into page" onMouseDown={() => { keepForMenu.current = true }} onClick={onMenu} className="rounded-full text-muted-foreground opacity-70"><Plus className="size-4" aria-hidden="true" /></Button>
        {menu}
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div
          ref={editor}
          role="textbox"
          aria-label="Page paragraph"
          aria-multiline="true"
          aria-description="Control or Command plus Enter creates a task"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Do or write something…"
          autoFocus={autoFocus}
          onInput={(event) => {
            const value = event.currentTarget.innerText.replace(/\n$/u, '')
            setEmpty(value === '')
            if (value === '/') {
              event.currentTarget.textContent = ''
              setEmpty(true)
              keepForMenu.current = true
              onMenu()
            }
          }}
          onBlur={() => {
            if (keepForMenu.current) { keepForMenu.current = false; return }
            onCommit(text())
          }}
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onTask(text()); return }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              const value = text()
              const selection = window.getSelection()
              let at = value.length
              if (selection !== null && selection.rangeCount > 0 && editor.current !== null) {
                const range = selection.getRangeAt(0)
                if (editor.current.contains(range.startContainer)) {
                  const before = range.cloneRange()
                  before.selectNodeContents(editor.current)
                  before.setEnd(range.startContainer, range.startOffset)
                  at = before.toString().length
                }
              }
              onSplit(value.slice(0, at), value.slice(at))
              return
            }
            if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur() }
          }}
          className="min-h-6 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-foreground outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
        >{initial}</div>
        <span aria-hidden={!empty} className={cn('pointer-events-none block overflow-hidden text-[11px] leading-4 text-muted-foreground/70 transition-all', empty ? 'max-h-4 opacity-100' : 'max-h-0 opacity-0')}><kbd className="font-inherit">Ctrl/⌘ ↵</kbd><span className="ml-2">Make this a task</span></span>
      </div>
    </div>
  )
}
