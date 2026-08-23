/*
The one way an edit gets out of a card, wherever that card is.

Imran, 2026-08-22: "A sidebar view of a task row does not carry the edits (in
steps, notes, links, and attachments) which are added in inline view of it…
dialog, sidebar, inline, and maybe more are just views of the same task row,
so the data inside them should be the same and updated simultaneously."

He is exactly right about the model, and the code was one prop short of it.
`useCardWiring` has reported every edit upward since F4 — but only to whoever
passed it `onPatch`, and only two callers ever did: the floating surface and
the task tab. Every *inline* row on every screen had no write path at all, so
a note typed into an expanded row lived in that row's local state and was
never anywhere else. Open the same task in the sidebar and you were looking at
a second copy that had never heard of it.

**Why a context, when this repository keeps refusing them.** `row-density` and
`time-format` are module stores precisely because a provider around everything
that reads them is a provider around the application. This is the opposite
shape: it is not a value read in fifty places, it is *one function* owned by
the one component that already wraps every screen. Threading it as a prop
would mean touching twenty-four list call sites in eleven files and hoping the
twenty-fifth remembers — which is the fault DES-154 exists to name. A screen
written next year gets this without knowing it exists.

**A row still wins if it is given a handler.** `onPatch` on the row overrides
this, because a lab or a preview may have its own idea of where an edit goes,
or none at all. Absent both, edits stay local exactly as they did — which is
the right answer for a surface with nothing behind it.
*/

import { createContext, useContext, type ReactNode } from "react"

import type { ConceptTask } from "@/lib/task-model"

export type TaskPatch = (taskId: string, fields: Partial<ConceptTask>) => void

const TaskWriterContext = createContext<TaskPatch | null>(null)

export function TaskWriter({
  patch,
  children,
}: {
  patch: TaskPatch
  children: ReactNode
}) {
  return <TaskWriterContext value={patch}>{children}</TaskWriterContext>
}

export function useTaskWriter(): TaskPatch | null {
  return useContext(TaskWriterContext)
}
