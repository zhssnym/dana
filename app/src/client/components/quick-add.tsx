/*
9.1's inline quick-add, a disclosure: collapsed it is a single control,
activating it reveals a focused text box, enter saves at the page's
entry-point defaults, and escape clears the box and returns the control to
collapsed.

**One name across two states, and it is 9.1's.** The collapsed control was
labelled "Add task" and the text box "Task title for Inbox", which is two
names for one affordance and one of them collides outright with the floating
add button of the same section. 9.1's control table fixes "Add a task" for
"the inline quick-add, collapsed and expanded alike", and its own paragraph
gives the reason the two differ by an article: "Add task" was chosen to
separate the floating button from the quick-add beneath it on the same page.
AC-166 addresses both states by that name, exactly.

**The escalation control is "Open full form"**, a fixed string from 9.1's
names table, never interpolated with the folder. A name in that table is a fixed string, and what tells two instances of one control
apart is 9.1's region rule, the quick-add on a Tasks group being addressed
inside the region that group names. A name carrying the folder does that job
twice and does it where a test cannot know the string before it reads the
fixture. The name is still deliberately not "More options": 9.3 spends that
on the task form's expander, and the form is a dialog over the page, so both
controls are in one document whenever the escalation is used.

`onAdd` and `onOpenFullForm` are callbacks. This component reads nothing,
which is the rule for everything in this directory.
*/
import { useEffect, useRef, useState } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'

import { Button } from './ui/button.js'
import { ADD_A_TASK, OPEN_FULL_FORM } from './ui/copy.js'
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
  /* polish: taskrow F3. Carries whatever was typed, so the full form opens
     on it rather than on a blank title beside the words left behind. */
  onOpenFullForm: (title: string) => void
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
              /* polish: taskrow F7. One rule for Escape and for clicking away:
                 an empty box collapses, a box with words in it keeps them.
                 Escape used to throw the words away while a click kept them. */
              event.preventDefault()
              event.stopPropagation()
              if (title.trim() === '') {
                setTitle('')
                setError('')
                setOpen(false)
              } else {
                event.currentTarget.blur()
              }
            }
          }}
          onBlur={(event) => {
            /* Focus moving to "Open full form" beside it is not leaving. */
            const within = event.currentTarget.parentElement?.contains(
              event.relatedTarget as Node | null,
            )
            if (!within && title.trim() === '') {
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
                // 9.1's names table: a fixed string, the region the quick-add
                // sits in being what separates two instances of it.
                aria-label={OPEN_FULL_FORM}
                onClick={() => {
                  onOpenFullForm(title.trim())
                  setTitle('')
                  setError('')
                  setOpen(false)
                }}
              >
                <SlidersHorizontal
                  className="size-4"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Button>
            }
          />
          <TooltipContent>{OPEN_FULL_FORM}</TooltipContent>
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
