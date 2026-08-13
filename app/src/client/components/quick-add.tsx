/*
The designer's `src/components/quick-add.tsx`, ported at P8R session R3.

9.1's inline quick-add, which that section made a disclosure at the RFC 0002
change control on 2026-08-13: collapsed it is a single control, activating it
reveals a focused text box, enter saves at the page's entry-point defaults,
and escape clears the box and returns the control to collapsed. His component
already had all four; what it did not have was the name.

**One name across two states, and it is 9.1's.** The collapsed control was
labelled "Add task" and the text box "Task title for Inbox", which is two
names for one affordance and one of them collides outright with the floating
add button of the same section. 9.1's control table fixes "Add a task" for
"the inline quick-add, collapsed and expanded alike", and its own paragraph
gives the reason the two differ by an article: "Add task" was chosen to
separate the floating button from the quick-add beneath it on the same page.
AC-166 addresses both states by that name, exactly.

The escalation control keeps his description, "Open full task form for
{folder}". 9.1 describes it and names it nowhere, so inventing a string here
would be the unrecorded deviation this package's own RFC lists as its most
likely failure. It is deliberately not "More options": 9.3 spends that name
on the task form's expander, and the form is a dialog over the page, so both
controls are in one document whenever the escalation is used.

`onAdd` and `onOpenFullForm` are callbacks. This component reads nothing,
which is the rule for everything in this directory.
*/
import { useEffect, useRef, useState } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'

import { Button } from './ui/button.js'
import { ADD_A_TASK } from './ui/copy.js'
import { Input } from './ui/input.js'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.js'

export function QuickAdd({
  folderName,
  label = ADD_A_TASK,
  onAdd,
  onOpenFullForm,
}: {
  folderName: string
  label?: string
  onAdd: (title: string) => void
  onOpenFullForm: () => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function submit() {
    const nextTitle = title.trim()
    if (!nextTitle) return
    if (nextTitle.length > 300) {
      setError('Too long: limit 300 characters')
      return
    }

    onAdd(nextTitle)
    setTitle('')
    setError('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        className="h-[var(--control-height)] w-full justify-start gap-2 px-2 text-sm font-normal text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {label}
      </Button>
    )
  }

  return (
    <div>
      <div className="flex min-h-[var(--control-height)] items-center gap-1 rounded-md bg-[var(--color-graphite-50)] px-2 focus-within:ring-2 focus-within:ring-ring/30">
        <Plus
          className="size-4 shrink-0 text-[var(--color-graphite-500)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
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
              setTitle('')
              setError('')
              setOpen(false)
            }
          }}
          className="h-[var(--control-height)] border-0 bg-transparent px-1 text-sm shadow-none placeholder:text-[var(--color-graphite-400)] focus-visible:border-transparent focus-visible:ring-0 md:text-sm"
          placeholder={`${label} to ${folderName}`}
          // 9.1's control table, one name across both states of the
          // disclosure. The folder it adds into is the section it sits in,
          // which is how 9.1's sections rule tells two quick-adds apart.
          aria-label={label}
          aria-invalid={error ? true : undefined}
        />
        <span className="shrink-0 px-1 text-[11px] text-[var(--color-graphite-400)]">
          Enter to add
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]"
                aria-label={`Open full task form for ${folderName}`}
                onClick={onOpenFullForm}
              >
                <SlidersHorizontal
                  className="size-4"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Button>
            }
          />
          <TooltipContent>Open full task form</TooltipContent>
        </Tooltip>
      </div>
      {error ? (
        <p className="mt-1 px-7 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
