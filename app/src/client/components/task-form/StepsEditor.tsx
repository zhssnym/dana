/*
9.3's steps editor: "text row, enter appends the next row, per-row check,
delete, and up or down reorder controls, cap notice at 50".

One editor, two storages, and the difference is 7.7's rather than this file's.
A task that does not exist yet has nowhere to put a step, so a create form
holds its steps in memory and posts them in 7.6's `steps` array; an edit form
writes each change through 7.7, which answers the affected TaskDetail because
a step is not a resource that contract shapes. So this component takes the
rows and four callbacks, and the form above decides which of the two the
callbacks are.

**The cap is a notice and a refusal together**, which is 9.3 read with 10.3.
At fifty rows the notice reads "Limit 50 steps" and the append control is
absent rather than inert: AC-043 makes a fifty-first step a 422, so an editor
that still offered to add one would be offering something the server refuses,
and one that silently did nothing would be the same defect with no words on
it. Below the cap the notice is absent, so it says something rather than
standing there permanently. The designer's own editor disables the row and
prints "50 step limit reached" instead; the copy is 9.3's and the absence is
AC-161's, so what is ported here is his composition and not those two.

The append control is named "Add step" by 9.1's control table, exactly. Three
of that table's eight names begin with "add" and the other two are on the same
pages as this one.

Ported to the designer's row treatment at P8R session R7: his hover-revealed
control cluster, his per-row check and his ordering, from
`src/components/task-form.tsx`. Each control names the step it acts on rather
than its position, which is his and is better than the ordinal this file used
before: a screen reader hearing "Move Buy milk up" is told which row moved, and
an ordinal is a number that changes the moment the move lands.
*/
import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

import { Button } from '../ui/button.js'
import { Checkbox } from '../ui/checkbox.js'
import { Input } from '../ui/input.js'
import { cn } from '../ui/utils.js'
import { ADD_STEP, STEP_CAP_NOTICE } from './copy.js'

/** 10.3's row: steps per task. */
export const STEP_CAP = 50

/** A row of the editor, whether it is stored yet or not. */
export interface EditorStep {
  /** The 4.6 row's id, or null for a step the create form is still holding. */
  readonly id: string | null
  readonly title: string
  readonly done: boolean
}

export interface StepsEditorProps {
  /** The id the "Steps" label points at, so 9.3's field name announces. */
  readonly inputId: string
  readonly steps: readonly EditorStep[]
  readonly onAppend: (title: string) => void
  readonly onToggle: (index: number) => void
  readonly onDelete: (index: number) => void
  readonly onMove: (index: number, to: number) => void
}

/** His resting treatment for a row's controls, transparent until hover. */
const REVEAL_ON_STEP_HOVER =
  'opacity-0 transition-opacity group-hover/step:opacity-100 group-focus-within/step:opacity-100 focus-visible:opacity-100'

export function StepsEditor({
  inputId,
  steps,
  onAppend,
  onToggle,
  onDelete,
  onMove,
}: StepsEditorProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const atCap = steps.length >= STEP_CAP

  function append(): void {
    const trimmed = draft.trim()
    if (trimmed === '' || atCap) return
    setDraft('')
    onAppend(trimmed)
  }

  return (
    <div>
      {steps.length === 0 ? null : (
        <div className="space-y-1 py-1">
          {steps.map((step, index) => (
            <div
              key={step.id ?? `draft-${String(index)}`}
              className="group/step flex min-h-[var(--task-form-property-row-height)] items-center gap-2 rounded-md px-2 hover:bg-[var(--color-graphite-50)]"
            >
              <Checkbox
                aria-label={`Complete step ${step.title}`}
                checked={step.done}
                onCheckedChange={() => {
                  onToggle(index)
                }}
                className="data-checked:border-[var(--color-graphite-700)] data-checked:bg-[var(--color-graphite-700)]"
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  step.done && 'text-muted-foreground line-through',
                )}
              >
                {step.title}
              </span>
              <div className={cn('flex shrink-0', REVEAL_ON_STEP_HOVER)}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  aria-label={`Move ${step.title} up`}
                  onClick={() => {
                    onMove(index, index - 1)
                  }}
                  className="size-8 hover:bg-[var(--color-graphite-100)]"
                >
                  <ArrowUp className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === steps.length - 1}
                  aria-label={`Move ${step.title} down`}
                  onClick={() => {
                    onMove(index, index + 1)
                  }}
                  className="size-8 hover:bg-[var(--color-graphite-100)]"
                >
                  <ArrowDown className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${step.title}`}
                  onClick={() => {
                    onDelete(index)
                  }}
                  className="size-8 text-muted-foreground hover:bg-[var(--color-danger-100)] hover:text-destructive"
                >
                  <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {atCap ? (
        <p className="px-2 pt-1 text-xs text-muted-foreground">{STEP_CAP_NOTICE}</p>
      ) : (
        <div className="flex items-center gap-1">
          <Input
            id={inputId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
            }}
            onKeyDown={(event) => {
              // 9.3: enter appends the next row. Prevented so the keystroke
              // does not also submit the form this editor sits inside.
              if (event.key !== 'Enter') return
              event.preventDefault()
              append()
            }}
            placeholder="Add a step"
            className="h-[var(--task-form-property-row-height)] border-0 bg-transparent px-2 text-sm shadow-none hover:bg-[var(--color-graphite-50)] focus-visible:border-transparent focus-visible:bg-card"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={append}
            className="h-[var(--task-form-property-row-height)] gap-1.5 px-2.5 text-xs text-muted-foreground hover:bg-[var(--color-graphite-100)] hover:text-foreground"
          >
            <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {ADD_STEP}
          </Button>
        </div>
      )}
    </div>
  )
}
