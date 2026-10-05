import { useEffect, useState } from "react"

import { useTaskWriter } from "../../tasks/task-writer.js"
import {
  stepCount,
  type ConceptStep,
  type ConceptTask,
} from "../../tasks/task-model.js"
import type { TaskRowProps } from "./types.js"

/* A word that names no unit ("Repeats") leaves the unit unknown, not weekly. */
const REPEAT_UNIT_OF: Record<string, ConceptTask["repeatUnit"]> = {
  Daily: "day",
  Weekly: "week",
  Monthly: "month",
  Yearly: "year",
}

function toConceptTask(props: TaskRowProps): ConceptTask {
  const total = props.steps?.total ?? 0
  const complete = props.steps?.complete ?? 0
  const steps: ConceptStep[] | undefined = props.steps
    ? Array.from({ length: total }, (_, index) => ({
        title: `Step ${index + 1}`,
        done: index < complete,
      }))
    : undefined

  return {
    id: props.id ?? props.title,
    title: props.title,
    done: props.status === "completed",
    abandoned: props.status === "abandoned",
    folder: props.folder,
    due: props.due,
    assignee: props.assignee,
    assignees: props.assignees,
    pulled: props.pulled,
    important: props.important,
    notes: props.notes,
    /* Invented from the count only as a fallback; `detail` below wins. */
    steps,
    ...(props.labels === undefined ? {} : { labels: props.labels }),
    recurrence: Boolean(props.recurrence),
    ...(REPEAT_UNIT_OF[props.recurrence ?? ""] === undefined
      ? {}
      : { repeatUnit: REPEAT_UNIT_OF[props.recurrence ?? ""] }),
    ...props.detail,
  }
}

/* Shared with the task surface, so a row and a full page hold the task the same way. */
export function useCardWiring(props: TaskRowProps) {
  const [edits, setEdits] = useState<Partial<ConceptTask>>({})
  /* The server's steps win once they arrive: they carry the ids `writeSteps` diffs by.
     Keyed on content, not identity, since every render passes a fresh array. */
  const serverSteps = JSON.stringify(props.steps ?? null)
  useEffect(() => {
    setEdits(({ steps: _dropped, ...rest }) => rest)
  }, [serverSteps])
  /* For a row with no `onPatch`; `onPatch` wins. */
  const writer = useTaskWriter()

  /* Local edits over props, so a re-render does not drop a typed note. */
  const task: ConceptTask = { ...toConceptTask(props), ...edits }
  const counts = stepCount(task)
  const steps = task.steps ?? []

  /* Every edit goes up, because a surface unmounts on close and would lose local
     edits. The local copy stays so an edit shows before its round trip. */
  function report(fields: Partial<ConceptTask>) {
    if (props.onPatch) props.onPatch(fields)
    else if (writer && props.id) writer(props.id, fields)
  }

  function patch(_id: string, fields: Partial<ConceptTask>) {
    setEdits((current) => ({ ...current, ...fields }))
    /* With `onToggleComplete`, the screen owns `done`: writing it here too would
       send a second transition (409) and skip the page's un-complete confirmation. */
    const owned = { ...fields }
    if (props.onToggleComplete !== undefined) delete owned.done
    /* Abandon is not stripped: nothing tells the screen about it, and Restore
       reaches the server only through here. */
    if (Object.keys(owned).length > 0) report(owned)
    if (fields.done !== undefined) props.onToggleComplete?.(fields.done)
  }

  /* Subtasks are written by the card's composer, not here. */
  const cardHandlers = {}

  return { task, patch, steps, counts, cardHandlers }
}
