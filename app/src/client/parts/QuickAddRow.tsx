/*
The inline quick-add row of 9.1: "a single title input; enter saves
immediately with all other fields at that entry point's defaults; escape
clears."

Its accessible name is "Add a task", assigned by the 9.1 control table at the
P8 change control on 2026-08-11, and it is exact. Three of the eight names in
that table begin with "add", and the floating button beside this row on the
same page is "Add task"; the table's own paragraph says the two were chosen to
separate them. A label that reads loosely puts the collision straight back.

The entry-point defaults are the caller's, from 9.3's table, because a
quick-add row does not know which section it is in and 9.3 makes that the
whole difference between the two rows on a folder page: the Scheduled
section's opens with due date today and the Unscheduled section's with it
empty.

This row raises no error of its own. A failed write is 9.1's toast, which the
mutation cache raises for every write in the client (api/queryClient.ts), and
an offline write is the toast AC-091 asserts is the only one shown.
*/
import { useState } from 'react'

import { useCreateTask } from '../api/mutations.js'
import type { PostTasksBody } from '../../shared/tasks.js'

export interface QuickAddDefaults {
  readonly folder_id?: string
  readonly due_date?: string
  readonly important?: boolean
}

export function QuickAddRow({
  defaults,
}: {
  readonly defaults: QuickAddDefaults
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const create = useCreateTask()

  function save(): void {
    const trimmed = title.trim()
    if (trimmed === '') return
    // 7.0: POST creations are not idempotent and clients must disable double
    // submit. Clearing the field is what makes a second Enter a no-op above,
    // and the disabled input below is what makes it one while the first is in
    // flight.
    setTitle('')
    const body: PostTasksBody = { title: trimmed, ...defaults } as PostTasksBody
    create.mutate(body)
  }

  return (
    <input
      type="text"
      aria-label="Add a task"
      value={title}
      disabled={create.isPending}
      onChange={(event) => setTitle(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          save()
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setTitle('')
        }
      }}
    />
  )
}
