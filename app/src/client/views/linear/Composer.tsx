/*
One input for adding to the line: plain typing + Enter adds the first kind;
"/" on an empty draft opens a small menu of kinds. Image opens the file picker
at once; the others switch the input into that mode until Enter or Esc.
*/
import { useId, useRef, useState } from 'react'
import {
  Image as ImageIcon,
  Link2,
  ListChecks,
  ListTodo,
  Heading1,
  Plus,
  Type,
  type LucideIcon,
} from '../../lib/icons.js'
import { cn } from '../../components/ui/utils.js'

export type ComposerKind = 'step' | 'text' | 'subtask' | 'link' | 'image' | 'milestone'

const KINDS: Record<ComposerKind, { label: string; icon: LucideIcon; placeholder: string }> = {
  step: { label: 'Task', icon: ListTodo, placeholder: 'Task title' },
  text: { label: 'Text', icon: Type, placeholder: 'Write a note' },
  subtask: { label: 'Subtask', icon: ListChecks, placeholder: 'Subtask' },
  link: { label: 'Link', icon: Link2, placeholder: 'Paste a link' },
  image: { label: 'Image', icon: ImageIcon, placeholder: '' },
  milestone: { label: 'Section', icon: Heading1, placeholder: 'Section name' },
}

type TextKind = Exclude<ComposerKind, 'image'>

export function Composer(props: {
  /** The kinds "/" offers, in order; the first is what plain typing + Enter adds. */
  readonly kinds: readonly ComposerKind[]
  readonly placeholder: string
  readonly label: string
  readonly onSubmit: (kind: TextKind, text: string) => void
  readonly onImage: (file: File) => void
  readonly variant: 'line' | 'card'
  readonly line?: React.ReactNode
}): React.JSX.Element {
  const id = useId()
  const listId = `${id}-kinds`
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<TextKind | null>(null)
  const [active, setActive] = useState(0)

  const defaultKind = (props.kinds.find((k) => k !== 'image') ?? 'step') as TextKind
  const menuOpen = mode === null && draft.startsWith('/') && !draft.includes(' ')
  const query = menuOpen ? draft.slice(1).toLowerCase() : ''
  const options = menuOpen
    ? props.kinds.filter((k) => KINDS[k].label.toLowerCase().startsWith(query))
    : []
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0))
  const showMenu = menuOpen && options.length > 0

  function pick(kind: ComposerKind): void {
    setDraft('')
    setActive(0)
    if (kind === 'image') {
      fileRef.current?.click()
      return
    }
    setMode(kind === defaultKind ? null : kind)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) return
    if (showMenu) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((activeIndex + 1) % options.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((activeIndex - 1 + options.length) % options.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const kind = options[activeIndex]
        if (kind) pick(kind)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setDraft('')
        setActive(0)
        return
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const text = draft.trim()
      if (text === '') return
      const kind = mode ?? defaultKind
      props.onSubmit(kind, text)
      setDraft('')
      if (kind !== 'subtask' && kind !== 'step') setMode(null)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (mode !== null) {
        setMode(null)
        setDraft('')
        return
      }
      setDraft('')
      event.currentTarget.blur()
    } else if (event.key === 'Backspace' && draft === '' && mode !== null) {
      event.preventDefault()
      setMode(null)
    }
  }

  const input = (
    <div className="relative flex min-w-0 flex-1 items-center gap-1.5">
      {mode !== null && (
        <span className="shrink-0 text-xs text-muted-foreground">{KINDS[mode].label}</span>
      )}
      <input
        type="text"
        role="combobox"
        aria-label={props.label}
        aria-expanded={showMenu}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showMenu ? `${listId}-${options[activeIndex]}` : undefined}
        value={draft}
        placeholder={mode === null ? props.placeholder : KINDS[mode].placeholder}
        onChange={(event) => {
          setDraft(event.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (menuOpen) setDraft('')
        }}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground',
          props.variant === 'line' ? 'h-7 rounded-sm px-1.5' : 'h-full',
        )}
      />
      {showMenu && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Add"
          className="absolute left-0 top-full z-50 mt-1 min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {options.map((kind, index) => {
            const { label, icon: Icon } = KINDS[kind]
            const selected = index === activeIndex
            return (
              <li
                key={kind}
                id={`${listId}-${kind}`}
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => {
                  event.preventDefault()
                  pick(kind)
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex min-h-7 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-sm',
                  selected && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                  <Icon className="size-[var(--icon-size-compact)]" />
                </span>
                <span className="min-w-0 flex-1 truncate">{label}</span>
              </li>
            )
          })}
        </ul>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) props.onImage(file)
          event.target.value = ''
        }}
      />
    </div>
  )

  if (props.variant === 'card') {
    return (
      <div className="relative flex h-[var(--control-height)] items-center rounded-md border border-border bg-background px-2">
        {input}
      </div>
    )
  }

  return (
    <div className="group/new relative flex h-8 items-center gap-2 pr-2">
      {props.line}
      <span aria-hidden className="relative flex size-6 shrink-0 items-center justify-center">
        <span
          className={cn(
            'flex size-4 items-center justify-center rounded-full border border-dashed border-quiet-foreground/60 bg-background text-quiet-foreground',
            'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none',
            'group-focus-within/new:border-solid group-focus-within/new:border-primary group-focus-within/new:text-primary',
          )}
        >
          <Plus className="size-2.5" strokeWidth={2.5} />
        </span>
      </span>
      {input}
    </div>
  )
}
