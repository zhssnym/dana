import { useEffect, useRef, useState } from 'react'
import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from 'react'

import { TaskList } from '../components/task-row.js'
import type { TaskRowProps } from '../components/task-row.js'
import { PageMark } from '../components/page-head.js'
import { Button } from '../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { Input } from '../components/ui/input.js'
import {
  ChevronDown,
  Heading1,
  ImagePlus,
  ListTodo,
  Plus,
  Rocket,
  X,
} from '../lib/icons.js'
import { cn } from '../components/ui/utils.js'
import {
  linkedParts,
  linksIn,
  safeUrl,
  videoTarget,
} from './composer-research-content.js'
import type { VideoTarget } from './composer-research-content.js'
import folderCover from './composer-folder-cover.png'

interface ParagraphNode {
  readonly id: string
  readonly kind: 'paragraph'
  readonly text: string
  readonly sectionId: string | null
}

interface SectionNode {
  readonly id: string
  readonly kind: 'section'
  readonly title: string
}

interface ImageNode {
  readonly id: string
  readonly kind: 'image'
  readonly src: string
  readonly caption: string
  readonly local: boolean
  readonly sectionId: string | null
}

interface CanvasTask extends TaskRowProps {
  readonly id: string
}

interface TaskNode {
  readonly id: string
  readonly kind: 'task'
  readonly task: CanvasTask
  readonly sectionId: string | null
}

type CanvasNode = ParagraphNode | SectionNode | ImageNode | TaskNode
type DraftKind = 'section' | 'image'

interface DraftMode {
  readonly nodeId: string
  readonly kind: DraftKind
}

const OPENING_SECTION = 'next-actions'

const NARRATIVE_TASK: CanvasTask = {
  id: 'canvas-task-narrative',
  title: 'Confirm the launch narrative',
  folder: { name: 'Product launch', color: 'violet' },
  given: { folder: true },
  due: { label: 'Today' },
  important: true,
  assignee: { initials: 'IK', name: 'Imran' },
  detail: {
    notes: 'Keep the story concrete: what changes the first time somebody opens Dana?',
    steps: [
      { title: 'Review the opening sentence', done: true },
      { title: 'Choose one supporting example', done: false },
    ],
  },
}

const ASSETS_TASK: CanvasTask = {
  id: 'canvas-task-assets',
  title: 'Collect the final launch assets',
  folder: { name: 'Product launch', color: 'violet' },
  given: { folder: true },
  due: { label: 'Friday' },
  assignee: { initials: 'MK', name: 'Maya' },
}

const INITIAL_NODES: readonly CanvasNode[] = [
  {
    id: 'canvas-opening',
    kind: 'paragraph',
    text: 'Bring the launch story, the work, and the references together on one calm page.',
    sectionId: null,
  },
  { id: OPENING_SECTION, kind: 'section', title: 'Next actions' },
  {
    id: 'canvas-section-opening',
    kind: 'paragraph',
    text: 'Keep these concrete enough that anybody joining the project knows what to do next.',
    sectionId: OPENING_SECTION,
  },
  { id: NARRATIVE_TASK.id, kind: 'task', task: NARRATIVE_TASK, sectionId: OPENING_SECTION },
  { id: ASSETS_TASK.id, kind: 'task', task: ASSETS_TASK, sectionId: OPENING_SECTION },
]

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function textOf(element: HTMLElement): string {
  return element.innerText.replace(/\n$/u, '')
}

function caretOffset(element: HTMLElement): number {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return textOf(element).length
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer)) return textOf(element).length
  const before = range.cloneRange()
  before.selectNodeContents(element)
  before.setEnd(range.startContainer, range.startOffset)
  return before.toString().length
}

function placeCaretAtEnd(element: HTMLElement): void {
  const selection = window.getSelection()
  if (selection === null) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

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

function Video({ target }: { readonly target: VideoTarget }): React.JSX.Element | null {
  if (target.kind === 'direct') {
    return null
  }
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

function InsertMenu({
  open,
  section,
  onOpenChange,
  onCreateTask,
  onChoose,
}: {
  readonly open: boolean
  readonly section: string
  readonly onOpenChange: (open: boolean) => void
  readonly onCreateTask: () => void
  readonly onChoose: (kind: DraftKind) => void
}): React.JSX.Element {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Insert into page"
            className="rounded-full text-muted-foreground opacity-70 transition-opacity hover:opacity-100 data-[popup-open]:opacity-100"
          />
        }
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={2} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Add here</DropdownMenuLabel>
          <DropdownMenuItem
            className="items-start py-2"
            onClick={() => {
              onCreateTask()
            }}
          >
            <ListTodo className="mt-0.5 size-4" strokeWidth={1.75} aria-hidden="true" />
            <span>
              <span className="block font-medium">Task</span>
              <span className="block text-muted-foreground">Add to {section}</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="items-start py-2"
            onClick={() => {
              onChoose('section')
            }}
          >
            <Heading1 className="mt-0.5 size-4" strokeWidth={1.75} aria-hidden="true" />
            <span>
              <span className="block font-medium">Section</span>
              <span className="block text-muted-foreground">Begin a new part of the page</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="items-start py-2"
            onClick={() => {
              onChoose('image')
            }}
          >
            <ImagePlus className="mt-0.5 size-4" strokeWidth={1.75} aria-hidden="true" />
            <span>
              <span className="block font-medium">Image</span>
              <span className="block text-muted-foreground">Choose, paste, or drop</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ParagraphLine({
  node,
  active,
  menuOpen,
  section,
  onActivate,
  onDeactivate,
  onMenuChange,
  onCreateTask,
  onChoose,
  onCommit,
  onSplit,
  onPromoteToTask,
  onImage,
}: {
  readonly node: ParagraphNode
  readonly active: boolean
  readonly menuOpen: boolean
  readonly section: string
  readonly onActivate: () => void
  readonly onDeactivate: (text: string) => void
  readonly onMenuChange: (open: boolean) => void
  readonly onCreateTask: () => void
  readonly onChoose: (kind: DraftKind) => void
  readonly onCommit: (text: string) => void
  readonly onSplit: (before: string, after: string) => void
  readonly onPromoteToTask: (text: string) => void
  readonly onImage: (file: File) => void
}): React.JSX.Element {
  const line = useRef<HTMLDivElement | null>(null)
  const editor = useRef<HTMLDivElement | null>(null)
  const [empty, setEmpty] = useState(node.text === '')
  const video = linksIn(node.text).map(videoTarget).find((target) => target !== null) ?? null

  useEffect(() => {
    if (!active || editor.current === null) return
    const target = editor.current
    target.focus()
    placeCaretAtEnd(target)
  }, [active])

  function imageFromClipboard(event: ClipboardEvent<HTMLDivElement>): boolean {
    const plain = event.clipboardData.getData('text/plain').trim()
    const image = [...event.clipboardData.items]
      .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      ?.getAsFile()
    if (image === null || image === undefined || plain !== '') return false
    event.preventDefault()
    onImage(image)
    return true
  }

  function imageFromDrop(event: DragEvent<HTMLDivElement>): boolean {
    const image = [...event.dataTransfer.files].find((file) => file.type.startsWith('image/'))
    if (image === undefined) return false
    event.preventDefault()
    onImage(image)
    return true
  }

  return (
    <div ref={line} className="group/line relative -ml-8 flex items-start pl-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        {active ? (
          <InsertMenu
            open={menuOpen}
            section={section}
            onOpenChange={onMenuChange}
            onCreateTask={onCreateTask}
            onChoose={onChoose}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 py-1 transition-[padding] duration-150">
        {active ? (
          <div
            ref={editor}
            role="textbox"
            aria-label="Page paragraph"
            aria-multiline="true"
            aria-description="Control or Command plus Enter creates a task"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Do or write something…"
            onInput={(event) => {
              const text = textOf(event.currentTarget)
              setEmpty(text === '')
              if (text === '/') {
                event.currentTarget.textContent = ''
                setEmpty(true)
                onCommit('')
                onMenuChange(true)
                return
              }
            }}
            onBlur={(event) => {
              if (menuOpen) return
              if (line.current?.contains(event.relatedTarget as Node | null) === true) return
              const text = textOf(event.currentTarget)
              onCommit(text)
              onDeactivate(text)
            }}
            onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Escape') {
                event.preventDefault()
                onCommit(textOf(event.currentTarget))
                event.currentTarget.blur()
                return
              }
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                onPromoteToTask(textOf(event.currentTarget))
                return
              }
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              const text = textOf(event.currentTarget)
              const at = caretOffset(event.currentTarget)
              onSplit(text.slice(0, at), text.slice(at))
            }}
            onPaste={(event) => {
              imageFromClipboard(event)
            }}
            onDragOver={(event) => {
              if ([...event.dataTransfer.items].some((item) => item.type.startsWith('image/'))) {
                event.preventDefault()
              }
            }}
            onDrop={(event) => {
              imageFromDrop(event)
            }}
            className="min-h-6 min-w-0 max-w-2xl flex-1 whitespace-pre-wrap text-sm leading-6 text-foreground outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
          >
            {node.text}
          </div>
        ) : (
          <p
            className="max-w-2xl cursor-text whitespace-pre-wrap text-sm leading-6 text-foreground"
            onClick={(event: MouseEvent<HTMLParagraphElement>) => {
              if ((event.target as HTMLElement).closest('a') === null) onActivate()
            }}
          >
            {richText(node.text)}
          </p>
        )}
        {active ? (
          <span
            aria-hidden={!empty}
            className={cn(
              'pointer-events-none block overflow-hidden text-[11px] leading-4 text-muted-foreground/70 transition-[max-height,opacity,transform] duration-150',
              empty ? 'max-h-4 opacity-100' : 'max-h-0 -translate-y-1 opacity-0',
            )}
          >
            <kbd className="font-inherit">Ctrl/⌘ ↵</kbd>
            <span className="ml-2">Make this a task</span>
          </span>
        ) : null}
        {!active && video !== null ? <Video target={video} /> : null}
      </div>
    </div>
  )
}

function SectionDraft({
  initial,
  onSave,
  onCancel,
}: {
  readonly initial: string
  readonly onSave: (title: string) => void
  readonly onCancel: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState(initial)
  return (
    <div className="-ml-8 flex min-h-10 items-center">
      <div className="w-8 shrink-0" />
      <Input
        autoFocus
        value={title}
        aria-label="Section name"
        placeholder="Section name"
        onChange={(event) => {
          setTitle(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter') {
            event.preventDefault()
            if (title.trim() !== '') onSave(title.trim())
          } else if (event.key === 'Escape') {
            event.preventDefault()
            if (title.trim() === '') onCancel()
            else event.currentTarget.blur()
          }
        }}
        className="h-auto border-0 bg-transparent px-0 py-1 text-base font-semibold leading-6 shadow-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 md:text-base"
      />
    </div>
  )
}

function ImageDraft({
  onImage,
  onCancel,
}: {
  readonly onImage: (file: File | string) => void
  readonly onCancel: () => void
}): React.JSX.Element {
  const [url, setUrl] = useState('')
  const picker = useRef<HTMLInputElement | null>(null)

  function choose(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (file !== undefined) onImage(file)
  }

  return (
    <div
      className="my-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5"
      onDragOver={(event) => {
        if ([...event.dataTransfer.items].some((item) => item.type.startsWith('image/'))) {
          event.preventDefault()
        }
      }}
      onDrop={(event) => {
        const file = [...event.dataTransfer.files].find((entry) => entry.type.startsWith('image/'))
        if (file === undefined) return
        event.preventDefault()
        onImage(file)
      }}
    >
      <div className="flex items-center gap-2">
        <ImagePlus className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <p className="flex-1 text-sm font-medium text-foreground">Add an image</p>
        <Button variant="ghost" size="icon-sm" aria-label="Cancel image" onClick={onCancel}>
          <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            picker.current?.click()
          }}
        >
          Choose image
        </Button>
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const parsed = safeUrl(url.trim())
            if (parsed !== null) onImage(parsed.toString())
          }}
        >
          <Input
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
            }}
            placeholder="or paste an image URL"
            aria-label="Image URL"
          />
          <Button type="submit" variant="ghost" size="sm">Add</Button>
        </form>
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-label="Choose image file"
        className="sr-only"
        onChange={choose}
      />
    </div>
  )
}

function SectionHeading({
  node,
  collapsed,
  onToggle,
}: {
  readonly node: SectionNode
  readonly collapsed: boolean
  readonly onToggle: () => void
}): React.JSX.Element {
  return (
    <div className="-ml-5 flex items-center gap-1 pt-5">
      <button
        type="button"
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} section ${node.title}`}
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown
          className={cn('size-4 transition-transform', collapsed && '-rotate-90')}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      <h2 className="text-base font-semibold leading-6 text-foreground">{node.title}</h2>
    </div>
  )
}

function Picture({ node }: { readonly node: ImageNode }): React.JSX.Element {
  return (
    <figure className="py-2">
      <img src={node.src} alt={node.caption} className="max-h-[32rem] w-auto max-w-full rounded-lg object-contain" />
      {node.caption === '' ? null : (
        <figcaption className="mt-1.5 text-xs text-muted-foreground">{node.caption}</figcaption>
      )}
    </figure>
  )
}

function CanvasTaskRow({
  node,
  autoEdit,
  onAutoEditDone,
  onUpdate,
  onDelete,
  onDropAt,
  onOver,
  onDragStateChange,
}: {
  readonly node: TaskNode
  readonly autoEdit: boolean
  readonly onAutoEditDone: () => void
  readonly onUpdate: (task: CanvasTask) => void
  readonly onDelete: () => void
  readonly onDropAt: (taskId: string, point: { x: number; y: number }) => boolean
  readonly onOver: (taskId: string, point: { x: number; y: number }) => string | null
  readonly onDragStateChange: (dragging: boolean) => void
}): React.JSX.Element {
  const surface = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!autoEdit) return
    const frame = requestAnimationFrame(() => {
      const title = surface.current?.querySelector<HTMLElement>('button[data-drag-through]')
      title?.click()
      onAutoEditDone()
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [autoEdit, onAutoEditDone])

  return (
    <div ref={surface}>
      <TaskList
        tasks={[node.task]}
        given={{ folder: true }}
        reorderable={false}
        className="my-0.5"
        onDropAt={onDropAt}
        onOver={onOver}
        onDragStateChange={onDragStateChange}
        onTaskOpen={() => {}}
        onTaskToggleComplete={(_id, complete) => {
          onUpdate({ ...node.task, status: complete ? 'completed' : 'pending' })
        }}
        onTaskToggleImportant={() => {
          onUpdate({ ...node.task, important: !node.task.important })
        }}
        onTaskDelete={onDelete}
      />
    </div>
  )
}

function InsertionSeam({
  onWrite,
  onStructure,
}: {
  readonly onWrite: () => void
  readonly onStructure: () => void
}): React.JSX.Element {
  return (
    /* The hit target overlaps the ordinary content gap. Its wrapper has no
       height, so a writable position never changes the page's rhythm until
       somebody activates it. The plus is a sibling of the writing target:
       choosing structure must not also start prose. */
    <div className="group/seam relative h-0">
      <button
        type="button"
        aria-label="Insert into page"
        onClick={onStructure}
        className="absolute -top-3 left-[-2rem] z-30 flex size-6 items-center justify-center rounded-full text-muted-foreground opacity-0 outline-none transition-[opacity,background-color] group-hover/seam:opacity-50 hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Write here"
        onClick={onWrite}
        className="absolute -top-3 z-20 h-6 w-full cursor-text rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  )
}

export function ComposerExplorationPage(): React.JSX.Element {
  const [nodes, setNodes] = useState<readonly CanvasNode[]>(INITIAL_NODES)
  const [active, setActive] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [mode, setMode] = useState<DraftMode | null>(null)
  const [autoEditTask, setAutoEditTask] = useState<string | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null>(null)
  const [draggingTask, setDraggingTask] = useState(false)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const canvas = useRef<HTMLDivElement | null>(null)
  const localUrls = useRef<string[]>([])
  const taskNodes = nodes.filter((node): node is TaskNode => node.kind === 'task')
  const completedTasks = taskNodes.filter((node) => node.task.status === 'completed').length

  useEffect(() => () => {
    for (const url of localUrls.current) URL.revokeObjectURL(url)
  }, [])

  function sectionOf(node: ParagraphNode): { id: string; label: string } {
    const section = nodes.find((candidate) => candidate.kind === 'section' && candidate.id === node.sectionId)
    if (section?.kind === 'section') return { id: section.id, label: section.title }
    return { id: 'loose', label: 'No section' }
  }

  function replaceNode(id: string, replacement: CanvasNode): void {
    setNodes((current) => current.map((node) => node.id === id ? replacement : node))
  }

  function insertAfter(id: string, additions: readonly CanvasNode[]): void {
    setNodes((current) => {
      const index = current.findIndex((node) => node.id === id)
      if (index < 0) return current
      return [...current.slice(0, index + 1), ...additions, ...current.slice(index + 1)]
    })
  }

  function focusSoon(id: string): void {
    requestAnimationFrame(() => {
      setActive(id)
    })
  }

  function begin(node: ParagraphNode, kind: DraftKind): void {
    setMenu(null)
    if (node.text === '') {
      setMode({ nodeId: node.id, kind })
      setActive(null)
      return
    }
    const draft = {
      id: makeId('draft'),
      kind: 'paragraph' as const,
      text: '',
      sectionId: node.sectionId,
    }
    insertAfter(node.id, [draft])
    setMode({ nodeId: draft.id, kind })
    setActive(null)
  }

  function taskFrom(title: string): CanvasTask {
    return {
      id: makeId('task'),
      title,
      folder: { name: 'Product launch', color: 'violet' },
      given: { folder: true },
      assignee: { initials: 'IK', name: 'Imran' },
    }
  }

  function createTaskAt(node: ParagraphNode, title: string): void {
    const task = taskFrom(title.trim() === '' ? 'New task' : title.trim())
    const taskNode: TaskNode = { id: task.id, kind: 'task', task, sectionId: node.sectionId }
    setNodes((current) => current.map((candidate) => candidate.id === node.id ? taskNode : candidate))
    setActive(null)
    setMenu(null)
    setMode(null)
    if (title.trim() === '') setAutoEditTask(task.id)
  }

  function removeParagraph(id: string): void {
    setNodes((current) => current.filter((node) => node.id !== id))
    setActive(null)
    setMenu(null)
  }

  function insertWritingAt(index: number, openMenu = false, sectionId = sectionIdAtSeam(index)): void {
    const paragraph: ParagraphNode = {
      id: makeId('paragraph'),
      kind: 'paragraph',
      text: '',
      sectionId,
    }
    setNodes((current) => [
      ...current.slice(0, index),
      paragraph,
      ...current.slice(index),
    ])
    setMode(null)
    setActive(paragraph.id)
    setMenu(openMenu ? paragraph.id : null)
  }

  function addImage(nodeId: string, source: File | string): void {
    const local = source instanceof File
    const src = local ? URL.createObjectURL(source) : source
    if (local) localUrls.current.push(src)
    const caption = local ? source.name.replace(/\.[^.]+$/u, '') : ''
    const sourceNode = nodes.find((node) => node.id === nodeId)
    const sectionId = sourceNode?.kind === 'paragraph' ? sourceNode.sectionId : null
    const next = {
      id: makeId('paragraph'),
      kind: 'paragraph' as const,
      text: '',
      sectionId,
    }
    replaceNode(nodeId, { id: nodeId, kind: 'image', src, caption, local, sectionId })
    insertAfter(nodeId, [next])
    setMode(null)
    focusSoon(next.id)
  }

  function placementAt(taskId: string, point: { x: number; y: number }): string | null {
    const elements = [...(canvas.current?.querySelectorAll<HTMLElement>('[data-canvas-node-id]') ?? [])]
      .filter((element) => element.dataset.canvasNodeId !== taskId)
    const next = elements.find((element) => point.y < element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2)
    return next?.dataset.canvasNodeId ?? null
  }

  function moveTask(taskId: string, point: { x: number; y: number }): boolean {
    const beforeId = placementAt(taskId, point)
    setNodes((current) => {
      const task = current.find((node) => node.id === taskId)
      if (task?.kind !== 'task') return current
      const without = current.filter((node) => node.id !== taskId)
      if (beforeId === null) {
        const last = without.at(-1)
        if (last?.kind === 'paragraph' && last.text === '') {
          return [...without.slice(0, -1), task, last]
        }
        return [...without, task]
      }
      const at = without.findIndex((node) => node.id === beforeId)
      if (at < 0) return current
      return [...without.slice(0, at), task, ...without.slice(at)]
    })
    setDropBefore(null)
    return true
  }

  function hiddenByCollapsedSection(node: Exclude<CanvasNode, SectionNode>): boolean {
    return node.sectionId !== null && collapsed.has(node.sectionId)
  }

  function sectionIdAtSeam(index: number): string | null {
    const before = nodes[index - 1]
    if (before?.kind === 'section') return before.id
    return before?.sectionId ?? null
  }

  function afterSection(index: number): number {
    let cursor = index + 1
    while (cursor < nodes.length && nodes[cursor]?.kind !== 'section') cursor += 1
    return cursor
  }

  function seamAt(index: number, sectionId = sectionIdAtSeam(index)): React.JSX.Element {
    const before = nodes[index - 1]
    const after = nodes[index]
    const occupied = active ?? mode?.nodeId ?? null
    if (before?.id === occupied || after?.id === occupied) return <></>
    return (
      <InsertionSeam
        onWrite={() => {
          insertWritingAt(index, false, sectionId)
        }}
        onStructure={() => {
          insertWritingAt(index, true, sectionId)
        }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <div
        className="relative -mt-4 h-32 bg-cover bg-center md:-mt-6"
        style={{
          marginInline: 'calc(50% - 50cqw)',
          backgroundImage: `url('${folderCover}')`,
          backgroundPosition: 'center 58%',
        }}
        role="img"
        aria-label="Calm launch workspace cover"
      >
        <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/15 to-transparent" aria-hidden="true" />
      </div>
      <header className="group/head">
        <PageMark
          icon={Rocket}
          hasCover
          color="var(--color-primary)"
          aria-label="Product launch folder icon"
        />
        <div className="mt-1.5 flex items-baseline gap-3">
          <h1 className="min-w-0 truncate text-2xl font-semibold leading-8 text-foreground">Product launch</h1>
          <span className="shrink-0 text-xs leading-4 tabular-nums text-muted-foreground">
            {completedTasks} of {taskNodes.length} done
          </span>
        </div>
        <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">
          A clear story, a coordinated release, and every decision in one place.
        </p>
      </header>

      <div ref={canvas} className="mt-7 pl-8">
        {seamAt(0)}
        {nodes.map((node, index) => {
          if (node.kind !== 'section' && hiddenByCollapsedSection(node)) return null
          const marker = dropBefore === node.id ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -top-px z-20 h-0.5 rounded-full bg-primary"
            />
          ) : null
          if (node.kind === 'section') {
            return (
              <div key={node.id} data-canvas-node-id={node.id} className="relative">
                {marker}
                <SectionHeading
                  node={node}
                  collapsed={collapsed.has(node.id)}
                  onToggle={() => {
                    setCollapsed((current) => {
                      const next = new Set(current)
                      if (next.has(node.id)) next.delete(node.id)
                      else next.add(node.id)
                      return next
                    })
                  }}
                />
                {collapsed.has(node.id)
                  ? seamAt(afterSection(index), null)
                  : seamAt(index + 1, node.id)}
              </div>
            )
          }
          if (node.kind === 'image') {
            return (
              <div key={node.id} data-canvas-node-id={node.id} className="relative">
                {marker}
                <Picture node={node} />
                {seamAt(index + 1)}
              </div>
            )
          }
          if (node.kind === 'task') {
            return (
              <div key={node.id} data-canvas-node-id={node.id} className="relative">
                {marker}
                <CanvasTaskRow
                  node={node}
                  autoEdit={autoEditTask === node.id}
                  onAutoEditDone={() => {
                    setAutoEditTask((current) => current === node.id ? null : current)
                  }}
                  onUpdate={(task) => {
                    replaceNode(node.id, { ...node, task })
                  }}
                  onDelete={() => {
                    setNodes((current) => current.filter((candidate) => candidate.id !== node.id))
                  }}
                  onDropAt={moveTask}
                  onOver={(taskId, point) => {
                    const before = placementAt(taskId, point)
                    setDropBefore((current) => current === before ? current : before)
                    return 'Place between page elements'
                  }}
                  onDragStateChange={(dragging) => {
                    setDraggingTask(dragging)
                    if (!dragging) setDropBefore(null)
                  }}
                />
                {seamAt(index + 1)}
              </div>
            )
          }

          const context = sectionOf(node)
          if (mode?.nodeId === node.id && mode.kind === 'section') {
            return (
              <div key={node.id} data-canvas-node-id={node.id} className="relative">
                {marker}
                <SectionDraft
                  initial={node.text}
                  onSave={(title) => {
                    const paragraph = {
                      id: makeId('paragraph'),
                      kind: 'paragraph' as const,
                      text: '',
                      sectionId: node.id,
                    }
                    replaceNode(node.id, { id: node.id, kind: 'section', title })
                    insertAfter(node.id, [paragraph])
                    setMode(null)
                    focusSoon(paragraph.id)
                  }}
                  onCancel={() => {
                    setMode(null)
                    focusSoon(node.id)
                  }}
                />
                {seamAt(index + 1)}
              </div>
            )
          }
          if (mode?.nodeId === node.id && mode.kind === 'image') {
            return (
              <div key={node.id} data-canvas-node-id={node.id} className="relative">
                {marker}
                <ImageDraft
                  onImage={(source) => {
                    addImage(node.id, source)
                  }}
                  onCancel={() => {
                    setMode(null)
                    focusSoon(node.id)
                  }}
                />
                {seamAt(index + 1)}
              </div>
            )
          }
          return (
            <div key={node.id} data-canvas-node-id={node.id} className="relative">
              {marker}
              <ParagraphLine
                node={node}
                active={active === node.id}
                menuOpen={menu === node.id}
                section={context.label}
                onActivate={() => {
                  setActive(node.id)
                }}
                onDeactivate={(text) => {
                  setActive((current) => current === node.id ? null : current)
                  if (text === '') removeParagraph(node.id)
                }}
                onMenuChange={(open) => {
                  setMenu(open ? node.id : null)
                }}
                onCreateTask={() => {
                  createTaskAt(node, '')
                }}
                onChoose={(kind) => {
                  begin(node, kind)
                }}
                onCommit={(text) => {
                  replaceNode(node.id, { ...node, text })
                }}
                onSplit={(before, after) => {
                  if (before === '' && after === '') return
                  const next = {
                    id: makeId('paragraph'),
                    kind: 'paragraph' as const,
                    text: after,
                    sectionId: node.sectionId,
                  }
                  replaceNode(node.id, { ...node, text: before })
                  insertAfter(node.id, [next])
                  focusSoon(next.id)
                }}
                onPromoteToTask={(text) => {
                  createTaskAt(node, text)
                }}
                onImage={(file) => {
                  addImage(node.id, file)
                }}
              />
              {seamAt(index + 1)}
            </div>
          )
        })}
        {draggingTask && dropBefore === null ? (
          <div aria-hidden="true" className="mt-1 h-0.5 rounded-full bg-primary" />
        ) : null}
      </div>
    </div>
  )
}

export function ComposerStudyGate(): React.JSX.Element {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    async function enter(): Promise<void> {
      try {
        // eslint-disable-next-line no-restricted-syntax -- the study's development gate runs before any session exists: this GET only asks whether one does, takes no tz, and a 401 is a fine answer (#72's rule, its one reasoned exception beside lib/viewer.ts)
        const current = await fetch('/api/v1/me')
        if (!current.ok) {
          // eslint-disable-next-line no-restricted-syntax -- the development sign-in door: no session yet, so there is no CSRF header to add, and the route takes no tz (#72)
          const made = await fetch(
            '/api/v1/auth/dev-login?sub=composer-study&email=composer-study%40dev.local&name=Composer%20Study&timezone=America%2FEdmonton&sample=true',
            { method: 'POST' },
          )
          if (!made.ok) throw new Error('Development sign-in failed')
        }
        window.location.replace('/app/labs/composer')
      } catch {
        if (alive) setFailed(true)
      }
    }
    void enter()
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          {failed ? 'Could not open the local study.' : 'Opening Dana…'}
        </p>
        {failed ? (
          <p className="mt-1 text-xs text-muted-foreground">Check that the local API is running, then reload.</p>
        ) : null}
      </div>
    </main>
  )
}
