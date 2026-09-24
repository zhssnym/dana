/*
The inline "New task" row at the end of a list: the one way to create a task
from a list (the redesign's control map).

Always an input, drawn as a row in the checkbox column so it lines up with the
rows above it. Enter creates and keeps focus for the next; Escape leaves.
Pressing N or C anywhere on the page, when not typing, focuses the first one
on screen (`useNewTaskShortcut`, installed once however many are mounted).
*/
import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'

import { cn } from './ui/utils.js'

export const NEW_TASK = 'New task'

/** On a phone there is no `N`, so a list's row stays pinned to the bottom of
    the screen while the list scrolls: always one thumb away, never hunted for. */
export const NEW_TASK_ROW_PHONE = 'max-md:sticky max-md:bottom-0 max-md:z-10 max-md:bg-background'

export function QuickAdd({
  label = NEW_TASK,
  onAdd,
  className,
}: {
  label?: string
  onAdd: (title: string) => void
  className?: string
}) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  useNewTaskShortcut()

  function submit() {
    const next = title.trim()
    if (!next) return
    if (next.length > 300) {
      setError('Too long: limit 300 characters')
      return
    }
    onAdd(next)
    setTitle('')
    setError('')
  }

  return (
    <div className={className}>
      <label className="grid h-[var(--row-height)] w-full cursor-text grid-cols-[var(--control-height)_minmax(0,1fr)] items-center rounded-sm text-sm focus-within:bg-muted hover:bg-muted">
        <span className="flex items-center justify-center text-muted-foreground" aria-hidden="true">
          <Plus className="size-4" strokeWidth={1.75} />
        </span>
        <input
          data-new-task=""
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (error) setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.blur()
            }
          }}
          placeholder={label}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          className={cn(
            'h-full min-w-0 bg-transparent pr-2 text-sm text-foreground outline-none',
            'placeholder:text-muted-foreground',
          )}
        />
      </label>
      {error ? (
        <p className="mt-1 pl-8 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

let installed = 0

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') !== null
}

function onKey(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.repeat) return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key.toLowerCase()
  if (key !== 'n' && key !== 'c') return
  if (isTyping(event.target)) return
  /* An open dialog or menu owns the keyboard. */
  if (document.querySelector('[aria-modal="true"], [role="alertdialog"], [role="menu"], [role="listbox"]') !== null) return
  if (focusNewTaskRow()) event.preventDefault()
}

/** Focuses the first "New task" row on screen; false when the page has none.
    The N / C shortcut lands here. */
export function focusNewTaskRow(): boolean {
  const field = [...document.querySelectorAll<HTMLInputElement>('input[data-new-task]')].find(
    (candidate) => candidate.offsetParent !== null,
  )
  if (field === undefined) return false
  field.scrollIntoView({ block: 'center' })
  field.focus()
  return true
}

/** The page-wide N / C shortcut, live while at least one new-task row is mounted. */
export function useNewTaskShortcut(): void {
  useEffect(() => {
    if (installed === 0) window.addEventListener('keydown', onKey)
    installed += 1
    return () => {
      installed -= 1
      if (installed === 0) window.removeEventListener('keydown', onKey)
    }
  }, [])
}
