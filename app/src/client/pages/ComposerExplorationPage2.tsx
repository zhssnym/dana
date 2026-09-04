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
import { Button } from '../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { Input } from '../components/ui/input.js'
import {
  CalendarDays,
  ChevronDown,
  Heading1,
  ImagePlus,
  Layers3,
  ListTodo,
  Plus,
  UserRound,
  X,
} from '../lib/icons.js'
import { showToast } from '../state/toasts.js'
import { cn } from '../components/ui/utils.js'
import {
  linkedParts,
  linksIn,
  safeUrl,
  videoTarget,
} from './composer-research-content.js'
import type { VideoTarget } from './composer-research-content.js'

interface ParagraphNode {
  readonly id: string
  readonly kind: 'paragraph'
  readonly text: string
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
}

interface TaskAreaNode {
  readonly id: string
  readonly kind: 'task-area'
  readonly sectionId: string
}

type CanvasNode = ParagraphNode | SectionNode | ImageNode | TaskAreaNode
type DraftKind = 'task' | 'section' | 'image'

interface DraftMode {
  readonly nodeId: string
  readonly kind: DraftKind
}

interface CanvasTask extends TaskRowProps {
  readonly id: string
}

const OPENING_SECTION = 'next-actions'

const INITIAL_NODES: readonly CanvasNode[] = [
  {
    id: 'canvas-opening',
    kind: 'paragraph',
    text: 'Bring the launch story, the work, and the references together on one calm page.',
  },
  { id: OPENING_SECTION, kind: 'section', title: 'Next actions' },
  {
    id: 'canvas-section-opening',
    kind: 'paragraph',
    text: 'Keep these concrete enough that anybody joining the project knows what to do next.',
  },
  { id: 'canvas-tasks', kind: 'task-area', sectionId: OPENING_SECTION },
  { id: 'canvas-empty', kind: 'paragraph', text: '' },
]

const INITIAL_TASKS: Readonly<Record<string, readonly CanvasTask[]>> = {
  [OPENING_SECTION]: [
    {
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
    },
    {
      id: 'canvas-task-assets',
      title: 'Collect the final launch assets',
      folder: { name: 'Product launch', color: 'violet' },
      given: { folder: true },
      due: { label: 'Friday' },
      assignee: { initials: 'MK', name: 'Maya' },
    },
  ],
}

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

function Video({ target }: { readonly target: VideoTarget }): React.JSX.Element {
  if (target.kind === 'direct') {
    return (
      <video controls preload="metadata" className="mt-3 aspect-video w-full rounded-lg bg-muted">
        <source src={target.src} />
      </video>
    )
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
  empty,
  section,
  onOpenChange,
  onChoose,
}: {
  readonly open: boolean
  readonly empty: boolean
  readonly section: string
  readonly onOpenChange: (open: boolean) => void
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
            className={cn(
              'rounded-full text-muted-foreground transition-opacity',
              empty
                ? 'opacity-70 hover:opacity-100'
                : 'opacity-0 group-hover/line:opacity-70 group-focus-within/line:opacity-70 data-[popup-open]:opacity-100 [@media(hover:none)]:opacity-60',
            )}
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
              onChoose('task')
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
  autoFocus,
  onActivate,
  onDeactivate,
  onMenuChange,
  onChoose,
  onCommit,
  onSplit,
  onBackspaceEmpty,
  onImage,
}: {
  readonly node: ParagraphNode
  readonly active: boolean
  readonly menuOpen: boolean
  readonly section: string
  readonly autoFocus: boolean
  readonly onActivate: () => void
  readonly onDeactivate: () => void
  readonly onMenuChange: (open: boolean) => void
  readonly onChoose: (kind: DraftKind) => void
  readonly onCommit: (text: string) => void
  readonly onSplit: (before: string, after: string) => void
  readonly onBackspaceEmpty: () => void
  readonly onImage: (file: File) => void
}): React.JSX.Element {
  const editor = useRef<HTMLDivElement | null>(null)
  const didAutoFocus = useRef(false)
  const video = linksIn(node.text).map(videoTarget).find((target) => target !== null) ?? null

  useEffect(() => {
    if (!active || editor.current === null) return
    const target = editor.current
    target.focus()
    placeCaretAtEnd(target)
  }, [active])

  useEffect(() => {
    if (
      !autoFocus ||
      didAutoFocus.current ||
      !window.matchMedia('(pointer: fine)').matches
    ) return
    didAutoFocus.current = true
    onActivate()
  }, [autoFocus, onActivate])

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
    <div className="group/line relative -ml-8 flex min-h-8 items-start pl-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        <InsertMenu
          open={menuOpen}
          empty={node.text === ''}
          section={section}
          onOpenChange={onMenuChange}
          onChoose={onChoose}
        />
      </div>
      <div className="min-w-0 flex-1 py-1">
        {active ? (
          <div
            ref={editor}
            role="textbox"
            aria-label="Page paragraph"
            aria-multiline="true"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Do something…"
            onInput={(event) => {
              if (textOf(event.currentTarget) !== '/') return
              event.currentTarget.textContent = ''
              onCommit('')
              onMenuChange(true)
            }}
            onBlur={(event) => {
              onCommit(textOf(event.currentTarget))
              onDeactivate()
            }}
            onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Escape') {
                event.preventDefault()
                onCommit(textOf(event.currentTarget))
                event.currentTarget.blur()
                return
              }
              if (event.key === 'Backspace' && textOf(event.currentTarget) === '') {
                event.preventDefault()
                onBackspaceEmpty()
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
            className="min-h-6 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-foreground outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
          >
            {node.text}
          </div>
        ) : (
          <p
            className="min-h-6 max-w-2xl cursor-text whitespace-pre-wrap text-sm leading-6 text-foreground"
            onClick={(event: MouseEvent<HTMLParagraphElement>) => {
              if ((event.target as HTMLElement).closest('a') === null) onActivate()
            }}
          >
            {node.text === '' ? <span className="text-muted-foreground">Do something…</span> : richText(node.text)}
          </p>
        )}
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

function TaskCapture({
  section,
  onCreate,
  onCancel,
}: {
  readonly section: string
  readonly onCreate: (task: { title: string; due: string | null; assignee: string | null }) => void
  readonly onCancel: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState<string | null>(null)
  const [assignee, setAssignee] = useState<string | null>('Imran')
  const input = useRef<HTMLInputElement | null>(null)

  function submit(): void {
    const next = title.trim()
    if (next === '') return
    onCreate({ title: next, due, assignee })
    setTitle('')
    requestAnimationFrame(() => {
      input.current?.focus()
    })
  }

  return (
    <div className="flex min-h-10 items-start">
      <div className="flex h-9 w-8 shrink-0 items-center justify-center">
        <span className="size-4 rounded border border-input" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-9 items-center gap-1">
          <Input
            ref={input}
            autoFocus
            value={title}
            aria-label={`Add task to ${section}`}
            placeholder="Task title…"
            maxLength={300}
            onChange={(event) => {
              setTitle(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                if (title.trim() === '') onCancel()
                else event.currentTarget.blur()
              }
            }}
            className="h-9 border-0 bg-transparent px-0 text-sm shadow-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 md:text-sm"
          />
          {title === '' ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Return to writing"
              className="text-muted-foreground"
              onClick={onCancel}
            >
              <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1 pb-1">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="xs" className="text-muted-foreground" />}>
              <CalendarDays className="size-3" strokeWidth={1.75} aria-hidden="true" />
              {due ?? 'Due'}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {['Today', 'Tomorrow', 'Friday'].map((value) => (
                <DropdownMenuItem key={value} onClick={() => { setDue(value) }}>{value}</DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setDue(null) }}>No date</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="xs" className="text-muted-foreground" />}>
              <UserRound className="size-3" strokeWidth={1.75} aria-hidden="true" />
              {assignee ?? 'Unassigned'}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {['Imran', 'Maya'].map((value) => (
                <DropdownMenuItem key={value} onClick={() => { setAssignee(value) }}>{value}</DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setAssignee(null) }}>Unassigned</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="inline-flex h-5 items-center gap-1 px-2 text-xs text-muted-foreground">
            <Layers3 className="size-3" strokeWidth={1.75} aria-hidden="true" />
            {section}
          </span>
        </div>
      </div>
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

export function ComposerExplorationPage2(): React.JSX.Element {
  const [nodes, setNodes] = useState<readonly CanvasNode[]>(INITIAL_NODES)
  const [tasks, setTasks] = useState<Readonly<Record<string, readonly CanvasTask[]>>>(INITIAL_TASKS)
  const [active, setActive] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [mode, setMode] = useState<DraftMode | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const localUrls = useRef<string[]>([])
  const finalParagraph = nodes.at(-1)

  useEffect(() => () => {
    for (const url of localUrls.current) URL.revokeObjectURL(url)
  }, [])

  function sectionAt(index: number): { id: string; label: string } {
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const candidate = nodes[cursor]
      if (candidate?.kind === 'section') return { id: candidate.id, label: candidate.title }
    }
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
    const draft = { id: makeId('draft'), kind: 'paragraph' as const, text: '' }
    insertAfter(node.id, [draft])
    setMode({ nodeId: draft.id, kind })
    setActive(null)
  }

  function addImage(nodeId: string, source: File | string): void {
    const local = source instanceof File
    const src = local ? URL.createObjectURL(source) : source
    if (local) localUrls.current.push(src)
    const caption = local ? source.name.replace(/\.[^.]+$/u, '') : ''
    const next = { id: makeId('paragraph'), kind: 'paragraph' as const, text: '' }
    replaceNode(nodeId, { id: nodeId, kind: 'image', src, caption, local })
    insertAfter(nodeId, [next])
    setMode(null)
    focusSoon(next.id)
  }

  function ensureTaskArea(sectionId: string, afterId: string): void {
    if (nodes.some((node) => node.kind === 'task-area' && node.sectionId === sectionId)) return
    insertAfter(afterId, [{ id: makeId('tasks'), kind: 'task-area', sectionId }])
  }

  function hiddenByCollapsedSection(index: number): boolean {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = nodes[cursor]
      if (candidate?.kind === 'section') return collapsed.has(candidate.id)
    }
    return false
  }

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <header className="pt-2">
        <h1 className="text-2xl font-semibold leading-8 text-foreground">Product launch</h1>
        <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">
          A clear story, a coordinated release, and no loose ends.
        </p>
      </header>

      <div className="mt-7 pl-8">
        {nodes.map((node, index) => {
          if (node.kind !== 'section' && hiddenByCollapsedSection(index)) return null
          if (node.kind === 'section') {
            return (
              <SectionHeading
                key={node.id}
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
            )
          }
          if (node.kind === 'image') return <Picture key={node.id} node={node} />
          if (node.kind === 'task-area') {
            const rows = tasks[node.sectionId] ?? []
            return rows.length === 0 ? null : (
              <TaskList
                key={node.id}
                tasks={[...rows]}
                given={{ folder: true }}
                className="my-1"
                onTaskOpen={() => {}}
                onTaskToggleComplete={(id, complete) => {
                  setTasks((current) => ({
                    ...current,
                    [node.sectionId]: rows.map((task) => task.id === id
                      ? { ...task, status: complete ? 'completed' : 'pending' }
                      : task),
                  }))
                }}
                onTaskToggleImportant={(id) => {
                  setTasks((current) => ({
                    ...current,
                    [node.sectionId]: rows.map((task) => task.id === id
                      ? { ...task, important: !task.important }
                      : task),
                  }))
                }}
                onTaskDelete={(id) => {
                  setTasks((current) => ({
                    ...current,
                    [node.sectionId]: rows.filter((task) => task.id !== id),
                  }))
                }}
              />
            )
          }

          const context = sectionAt(index)
          if (mode?.nodeId === node.id && mode.kind === 'task') {
            return (
              <TaskCapture
                key={node.id}
                section={context.label}
                onCreate={(draft) => {
                  const id = makeId('task')
                  const assignee = draft.assignee === null
                    ? undefined
                    : { initials: draft.assignee === 'Maya' ? 'MK' : 'IK', name: draft.assignee }
                  const task: CanvasTask = {
                    id,
                    title: draft.title,
                    folder: { name: 'Product launch', color: 'violet' },
                    given: { folder: true },
                    ...(draft.due === null ? {} : { due: { label: draft.due } }),
                    ...(assignee === undefined ? { unassigned: true } : { assignee }),
                  }
                  setTasks((current) => ({
                    ...current,
                    [context.id]: [...(current[context.id] ?? []), task],
                  }))
                  ensureTaskArea(context.id, node.id)
                  showToast(`Task added to ${context.label}`)
                }}
                onCancel={() => {
                  setMode(null)
                  focusSoon(node.id)
                }}
              />
            )
          }
          if (mode?.nodeId === node.id && mode.kind === 'section') {
            return (
              <SectionDraft
                key={node.id}
                initial={node.text}
                onSave={(title) => {
                  const paragraph = { id: makeId('paragraph'), kind: 'paragraph' as const, text: '' }
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
            )
          }
          if (mode?.nodeId === node.id && mode.kind === 'image') {
            return (
              <ImageDraft
                key={node.id}
                onImage={(source) => {
                  addImage(node.id, source)
                }}
                onCancel={() => {
                  setMode(null)
                  focusSoon(node.id)
                }}
              />
            )
          }
          return (
            <ParagraphLine
              key={node.id}
              node={node}
              active={active === node.id}
              menuOpen={menu === node.id}
              section={context.label}
              autoFocus={node.id === finalParagraph?.id && node.text === '' && active === null && mode === null}
              onActivate={() => {
                setActive(node.id)
              }}
              onDeactivate={() => {
                setActive((current) => current === node.id ? null : current)
              }}
              onMenuChange={(open) => {
                setMenu(open ? node.id : null)
              }}
              onChoose={(kind) => {
                begin(node, kind)
              }}
              onCommit={(text) => {
                replaceNode(node.id, { ...node, text })
              }}
              onSplit={(before, after) => {
                const next = { id: makeId('paragraph'), kind: 'paragraph' as const, text: after }
                replaceNode(node.id, { ...node, text: before })
                insertAfter(node.id, [next])
                focusSoon(next.id)
              }}
              onBackspaceEmpty={() => {
                const previous = nodes[index - 1]
                if (previous?.kind !== 'paragraph') return
                setNodes((current) => current.filter((candidate) => candidate.id !== node.id))
                focusSoon(previous.id)
              }}
              onImage={(file) => {
                addImage(node.id, file)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

export function ComposerStudyGate2(): React.JSX.Element {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    async function enter(): Promise<void> {
      try {
        const current = await fetch('/api/v1/me')
        if (!current.ok) {
          const made = await fetch(
            '/api/v1/auth/dev-login?sub=composer-study&email=composer-study%40dev.local&name=Composer%20Study&timezone=America%2FEdmonton&sample=true',
            { method: 'POST' },
          )
          if (!made.ok) throw new Error('Development sign-in failed')
        }
        window.location.replace('/app/labs/composer-2')
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
