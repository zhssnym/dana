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
standing there permanently.

The append control is named "Add step" by 9.1's control table, exactly. Three
of that table's eight names begin with "add" and the other two are on the same
pages as this one.
*/
import { useState } from 'react'

import { Button, IconButton } from '../ui/index.js'
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
  readonly steps: readonly EditorStep[]
  readonly onAppend: (title: string) => void
  readonly onToggle: (index: number) => void
  readonly onDelete: (index: number) => void
  readonly onMove: (index: number, to: number) => void
}

export function StepsEditor({
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
    <div aria-label="Steps">
      <ul>
        {steps.map((step, index) => (
          <li key={step.id ?? `draft-${String(index)}`}>
            <input
              type="checkbox"
              aria-label={`Step ${String(index + 1)} done`}
              checked={step.done}
              onChange={() => onToggle(index)}
            />
            <span>{step.title}</span>
            <IconButton
              label={`Move step ${String(index + 1)} up`}
              glyph="↑"
              onClick={() => onMove(index, index - 1)}
            />
            <IconButton
              label={`Move step ${String(index + 1)} down`}
              glyph="↓"
              onClick={() => onMove(index, index + 1)}
            />
            <IconButton
              label={`Delete step ${String(index + 1)}`}
              glyph="×"
              onClick={() => onDelete(index)}
            />
          </li>
        ))}
      </ul>

      {atCap ? (
        <p>{STEP_CAP_NOTICE}</p>
      ) : (
        <>
          <input
            type="text"
            aria-label="Next step"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // 9.3: enter appends the next row. Prevented so the keystroke
              // does not also reach whatever is listening above this editor.
              if (event.key !== 'Enter') return
              event.preventDefault()
              append()
            }}
          />
          <Button onClick={append}>{ADD_STEP}</Button>
        </>
      )}
    </div>
  )
}
