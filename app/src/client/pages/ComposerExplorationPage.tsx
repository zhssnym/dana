import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react'

import { TaskList } from '../components/task-row.js'
import type { TaskRowProps } from '../components/task-row.js'
import { Button } from '../components/ui/button.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { InlineTextarea } from '../components/ui/inline-field.js'
import { Input } from '../components/ui/input.js'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '../components/ui/popover.js'
import {
  AlignLeft,
  ChevronDown,
  Heading1,
  ImagePlus,
  Link2,
  ListTodo,
  Plus,
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

type ComposerKind = 'paragraph' | 'task' | 'section' | 'image'

interface ParagraphBlock {
  readonly id: string
  readonly kind: 'paragraph'
  readonly text: string
}

interface ImageBlock {
  readonly id: string
  readonly kind: 'image'
  readonly src: string
  readonly caption: string
  readonly local: boolean
}

type PageBlock = ParagraphBlock | ImageBlock

interface PrototypeTask extends TaskRowProps {
  readonly id: string
}

interface PageGroup {
  readonly id: string
  readonly title: string | null
  readonly blocks: readonly PageBlock[]
  readonly tasks: readonly PrototypeTask[]
}

const INITIAL_GROUPS: readonly PageGroup[] = [
  {
    id: 'opening',
    title: null,
    blocks: [
      {
        id: 'opening-note',
        kind: 'paragraph',
        text: 'Bring the launch story, the work, and the references together on one calm page.',
      },
    ],
    tasks: [],
  },
  {
    id: 'next-actions',
    title: 'Next actions',
    blocks: [
      {
        id: 'next-actions-note',
        kind: 'paragraph',
        text: 'Keep these concrete enough that anybody joining the project knows what to do next.',
      },
    ],
    tasks: [
      {
        id: 'prototype-task-narrative',
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
        id: 'prototype-task-assets',
        title: 'Collect the final launch assets',
        folder: { name: 'Product launch', color: 'violet' },
        given: { folder: true },
        due: { label: 'Friday' },
        assignee: { initials: 'MK', name: 'Maya' },
      },
    ],
  },
]

function idFor(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function linkedText(text: string): ReactNode {
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

function VideoEmbed({ target }: { readonly target: VideoTarget }): React.JSX.Element {
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

function Paragraph({ block }: { readonly block: ParagraphBlock }): React.JSX.Element {
  const video = linksIn(block.text).map(videoTarget).find((target) => target !== null) ?? null
  return (
    <div className="group/paragraph py-1">
      <p className="max-w-2xl whitespace-pre-wrap text-sm leading-6 text-foreground">
        {linkedText(block.text)}
      </p>
      {video === null ? null : <VideoEmbed target={video} />}
    </div>
  )
}

function Picture({ block }: { readonly block: ImageBlock }): React.JSX.Element {
  return (
    <figure className="py-2">
      <img src={block.src} alt={block.caption} className="max-h-[32rem] w-auto max-w-full rounded-lg object-contain" />
      {block.caption === '' ? null : (
        <figcaption className="mt-1.5 text-xs text-muted-foreground">{block.caption}</figcaption>
      )}
    </figure>
  )
}

const COMPOSER_OPTIONS: readonly {
  kind: Exclude<ComposerKind, 'paragraph'>
  label: string
  description: string
  cue: string
  icon: typeof ListTodo
}[] = [
  {
    kind: 'task',
    label: 'Task',
    description: 'Make the current words actionable',
    cue: '- [ ]',
    icon: ListTodo,
  },
  {
    kind: 'section',
    label: 'Section',
    description: 'Start a named part of the page',
    cue: '#',
    icon: Heading1,
  },
  {
    kind: 'image',
    label: 'Image',
    description: 'Upload, paste, or link an image',
    cue: '/image',
    icon: ImagePlus,
  },
]

function ComposerMenu({
  open,
  onOpenChange,
  onChoose,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onChoose: (kind: Exclude<ComposerKind, 'paragraph'>) => void
}): React.JSX.Element {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Add task, section, or image"
            className="rounded-full text-muted-foreground"
          />
        }
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Add to this page</DropdownMenuLabel>
          {COMPOSER_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <DropdownMenuItem
                key={option.kind}
                className="items-start py-2"
                onClick={() => {
                  onChoose(option.kind)
                }}
              >
                <Icon className="mt-0.5 size-4" strokeWidth={1.75} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-muted-foreground">{option.description}</span>
                </span>
                <kbd className="mt-0.5 font-mono text-muted-foreground">{option.cue}</kbd>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LinkControl({
  selection,
  onInsert,
}: {
  readonly selection: string
  readonly onInsert: (label: string, href: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('')
  const titleId = useId()

  function insert(): void {
    const parsed = safeUrl(href.trim())
    if (parsed === null) return
    const label = selection.trim() === '' ? parsed.hostname.replace(/^www\./u, '') : selection.trim()
    onInsert(label, parsed.toString())
    setHref('')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Insert link" className="text-muted-foreground" />
        }
      >
        <Link2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-72" aria-labelledby={titleId}>
        <PopoverTitle id={titleId}>{selection.trim() === '' ? 'Insert link' : `Link “${selection.trim()}”`}</PopoverTitle>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            insert()
          }}
        >
          <Input
            autoFocus
            value={href}
            onChange={(event) => {
              setHref(event.target.value)
            }}
            placeholder="https://…"
            aria-label="Link URL"
          />
          <Button type="submit" size="sm">Add</Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function ComposerLine({
  onParagraph,
  onTask,
  onSection,
  onImage,
}: {
  readonly onParagraph: (text: string) => void
  readonly onTask: (title: string) => void
  readonly onSection: (title: string) => void
  readonly onImage: (src: string, caption: string, local: boolean) => void
}): React.JSX.Element {
  const [kind, setKind] = useState<ComposerKind>('paragraph')
  const [value, setValue] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const field = useRef<HTMLTextAreaElement | null>(null)
  const file = useRef<HTMLInputElement | null>(null)

  const selected = value.slice(selection.start, selection.end)
  const placeholder =
    kind === 'task'
      ? 'What needs doing?'
      : kind === 'section'
        ? 'Section name'
        : kind === 'image'
          ? 'Paste an image URL…'
          : 'Do something…'

  function choose(next: Exclude<ComposerKind, 'paragraph'>): void {
    setMenuOpen(false)
    if (next === 'task' && value.trim() !== '') {
      onTask(value.trim())
      setValue('')
      setKind('paragraph')
      return
    }
    if (next === 'section' && value.trim() !== '') {
      onSection(value.trim())
      setValue('')
      setKind('paragraph')
      return
    }
    setKind(next)
    requestAnimationFrame(() => {
      field.current?.focus()
    })
  }

  function submit(): void {
    const next = value.trim()
    if (next === '') return
    if (kind === 'task') onTask(next)
    else if (kind === 'section') onSection(next)
    else if (kind === 'image') {
      const parsed = safeUrl(next)
      if (parsed === null) return
      onImage(parsed.toString(), '', false)
    } else onParagraph(next)
    setValue('')
    setKind('paragraph')
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Escape' && (kind !== 'paragraph' || menuOpen)) {
      event.preventDefault()
      setKind('paragraph')
      setMenuOpen(false)
      return
    }
    if (event.key === ' ' && value === '- [ ]') {
      event.preventDefault()
      setValue('')
      setKind('task')
      return
    }
    if (event.key === ' ' && value === '#') {
      event.preventDefault()
      setValue('')
      setKind('section')
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  function insertLink(label: string, href: string): void {
    const before = value.slice(0, selection.start)
    const after = value.slice(selection.end)
    const markdown = `[${label}](${href})`
    const next = `${before}${markdown}${after}`
    setValue(next)
    const cursor = before.length + markdown.length
    requestAnimationFrame(() => {
      field.current?.focus()
      field.current?.setSelectionRange(cursor, cursor)
    })
  }

  function pickFile(event: ChangeEvent<HTMLInputElement>): void {
    const chosen = event.target.files?.[0]
    if (chosen === undefined) return
    onImage(URL.createObjectURL(chosen), chosen.name.replace(/\.[^.]+$/u, ''), true)
    event.target.value = ''
    setValue('')
    setKind('paragraph')
  }

  return (
    <div className="group/composer relative mt-1 flex min-h-10 items-start gap-1 py-1">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        <ComposerMenu open={menuOpen} onOpenChange={setMenuOpen} onChoose={choose} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-8 items-start gap-1">
          {kind === 'paragraph' ? null : (
            <span className="mt-1.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {kind === 'task' ? 'Task' : kind === 'section' ? 'Section' : 'Image'}
              <button
                type="button"
                aria-label={`Cancel ${kind}`}
                onClick={() => {
                  setKind('paragraph')
                  field.current?.focus()
                }}
                className="rounded-full outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </span>
          )}
          <InlineTextarea
            ref={field}
            rows={1}
            value={value}
            aria-label={kind === 'paragraph' ? 'Write on this page' : placeholder}
            placeholder={placeholder}
            onFocus={() => {
              setFocused(true)
            }}
            onBlur={() => {
              setFocused(false)
            }}
            onChange={(event) => {
              const next = event.target.value
              if (kind === 'paragraph' && next === '/') {
                setValue('')
                setMenuOpen(true)
                return
              }
              setValue(next)
              setSelection({ start: event.target.selectionStart, end: event.target.selectionEnd })
            }}
            onSelect={(event) => {
              setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })
            }}
            onKeyDown={keyDown}
            className={cn(
              'min-h-8 py-1.5 text-sm leading-5',
              kind === 'section' && 'font-semibold',
            )}
          />
          {kind === 'paragraph' ? (
            <span
              className={cn(
                'transition-opacity focus-within:opacity-100',
                focused || value !== '' ? 'opacity-100' : 'opacity-0 group-hover/composer:opacity-100',
              )}
            >
              <LinkControl selection={selected} onInsert={insertLink} />
            </span>
          ) : null}
          {kind === 'image' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-muted-foreground"
              onClick={() => {
                file.current?.click()
              }}
            >
              <ImagePlus className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Choose
            </Button>
          ) : null}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-label="Upload image"
          className="sr-only"
          onChange={pickFile}
        />
        <div
          className={cn(
            'flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground transition-opacity',
            focused || kind !== 'paragraph' || menuOpen ? 'opacity-100' : 'opacity-0 group-hover/composer:opacity-100',
          )}
          aria-live="polite"
        >
          {kind === 'paragraph' ? (
            <>
              <span><kbd className="font-mono">Enter</kbd> new paragraph</span>
              <span><kbd className="font-mono">Shift Enter</kbd> line break</span>
              <span><kbd className="font-mono">- [ ]</kbd> task</span>
              <span><kbd className="font-mono">#</kbd> section</span>
              <span><kbd className="font-mono">/</kbd> insert</span>
            </>
          ) : (
            <>
              <span><kbd className="font-mono">Enter</kbd> add {kind}</span>
              <span><kbd className="font-mono">Esc</kbd> paragraph</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Group({
  group,
  onTasksChange,
}: {
  readonly group: PageGroup
  readonly onTasksChange: (tasks: readonly PrototypeTask[]) => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const visible = group.title === null || !collapsed
  const opening = group.blocks[0]?.kind === 'paragraph' ? group.blocks[0] : null
  const following = opening === null ? group.blocks : group.blocks.slice(1)

  return (
    <section className="group/section">
      {group.title === null ? null : (
        <div className="flex items-center gap-1.5 pt-5">
          <button
            type="button"
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} section ${group.title}`}
            aria-expanded={!collapsed}
            onClick={() => {
              setCollapsed(!collapsed)
            }}
            className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn('size-4 transition-transform', collapsed && '-rotate-90')}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
          <h2 className="text-base font-semibold leading-6 text-foreground">{group.title}</h2>
        </div>
      )}
      {visible ? (
        <div className={cn(group.title === null ? '' : 'pl-5')}>
          {opening === null ? null : <Paragraph block={opening} />}
          {group.tasks.length === 0 ? null : (
            <TaskList
              tasks={[...group.tasks]}
              given={{ folder: true }}
              className="mt-1"
              onTaskOpen={() => {
                /* Local prototype ids deliberately never reach the API. The
                   row's own inline chevron and every list gesture remain real. */
              }}
              onTaskToggleComplete={(id, complete) => {
                onTasksChange(group.tasks.map((task) => task.id === id
                  ? { ...task, status: complete ? 'completed' : 'pending' }
                  : task))
              }}
              onTaskToggleImportant={(id) => {
                onTasksChange(group.tasks.map((task) => task.id === id
                  ? { ...task, important: !task.important }
                  : task))
              }}
              onTaskDelete={(id) => {
                onTasksChange(group.tasks.filter((task) => task.id !== id))
              }}
            />
          )}
          {following.map((block) =>
            block.kind === 'paragraph'
              ? <Paragraph key={block.id} block={block} />
              : <Picture key={block.id} block={block} />,
          )}
        </div>
      ) : null}
    </section>
  )
}

export function ComposerExplorationPage(): React.JSX.Element {
  const [groups, setGroups] = useState<readonly PageGroup[]>(INITIAL_GROUPS)
  const createdUrls = useRef<string[]>([])
  const active = groups.at(-1)?.id ?? 'opening'

  useEffect(() => () => {
    for (const url of createdUrls.current) URL.revokeObjectURL(url)
  }, [])

  function updateGroup(id: string, update: (group: PageGroup) => PageGroup): void {
    setGroups((current) => current.map((group) => group.id === id ? update(group) : group))
  }

  function addBlock(block: PageBlock): void {
    updateGroup(active, (group) => ({ ...group, blocks: [...group.blocks, block] }))
  }

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <header className="pt-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <AlignLeft className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Writing-first study · frontend only
        </div>
        <h1 className="mt-2 text-2xl font-semibold leading-8 text-foreground">Product launch</h1>
        <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">
          A page should feel like somewhere to think, with structure available the moment it becomes useful.
        </p>
      </header>

      <div className="mt-7">
        {groups.map((group) => (
          <Group
            key={group.id}
            group={group}
            onTasksChange={(tasks) => {
              updateGroup(group.id, (current) => ({ ...current, tasks }))
            }}
          />
        ))}

        <ComposerLine
          onParagraph={(text) => {
            addBlock({ id: idFor('paragraph'), kind: 'paragraph', text })
          }}
          onTask={(title) => {
            updateGroup(active, (group) => ({
              ...group,
              tasks: [
                ...group.tasks,
                {
                  id: idFor('task'),
                  title,
                  folder: { name: 'Product launch', color: 'violet' },
                  given: { folder: true },
                  assignee: { initials: 'IK', name: 'Imran' },
                },
              ],
            }))
          }}
          onSection={(title) => {
            setGroups((current) => [
              ...current,
              { id: idFor('section'), title, blocks: [], tasks: [] },
            ])
          }}
          onImage={(src, caption, local) => {
            if (local) createdUrls.current.push(src)
            addBlock({ id: idFor('image'), kind: 'image', src, caption, local })
          }}
        />
      </div>

      <aside className="mt-10 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <ListTodo className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <p>
          Task rows are Dana’s current component, including inline expansion and list gestures. This study changes
          only how prose becomes structured content; no API, schema, or saved page data is touched.
        </p>
      </aside>
    </div>
  )
}

/**
 * A development-only bridge into the real authenticated shell.
 *
 * A session belongs to an origin, so a local Vite origin cannot reuse the
 * account the reviewer already has in Dana. The existing development-login
 * endpoint exists for exactly this browser-proof path. Nothing here is
 * reachable or bundled in production; after it succeeds, every pixel around
 * the study is the application's actual shell.
 */
export function ComposerStudyGate(): React.JSX.Element {
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
