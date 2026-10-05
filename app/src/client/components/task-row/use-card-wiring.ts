/* The card's wiring: props into a task, local edits, and the write path. */

import { useEffect, useState } from "react"

import { useTaskWriter } from "../../tasks/task-writer.js"
import {
  stepCount,
  type ConceptStep,
  type ConceptTask,
} from "../../tasks/task-model.js"
import type { TaskRowProps } from "./types.js"

/* The shell's flat props into the shape the row and the card actually speak.
   Steps arrive as a count, because a count is all the shell ever stored; they
   are expanded into items so the card can show a real list, and the count in
   the row stays derived from those items so the two can never disagree. */
/* The presenter's frequency word back to the card's unit. A word that names
   none ("Repeats") leaves the unit unknown rather than guessing weekly. */
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
    /* Invented from the count, and only as a fallback: a lab fixture that
       says "2 of 5" has no titles to give. Anything the shell owns arrives
       through `detail` below and wins, so a real task keeps its real steps. */
    steps,
    ...(props.labels === undefined ? {} : { labels: props.labels }),
    recurrence: Boolean(props.recurrence),
    ...(REPEAT_UNIT_OF[props.recurrence ?? ""] === undefined
      ? {}
      : { repeatUnit: REPEAT_UNIT_OF[props.recurrence ?? ""] }),
    ...props.detail,
  }
}

/* The card's wiring, extracted so the task surface can hold the same task the
   row holds, one edits layer, one patch, one set of step handlers, whether the
   card sits under a row or fills a page. A surface that re-implemented any of
   this would be a second artifact wearing the first one's clothes. */
export function useCardWiring(props: TaskRowProps) {
  const [edits, setEdits] = useState<Partial<ConceptTask>>({})
  /*
  The server's steps win once they arrive. Local edits sit over the props for as
  long as the card is looked at, which is right for a title or a note and wrong
  for the one field whose server copy carries something the local copy cannot:
  7.7's ids, which `writeSteps` diffs by. Keyed on the list's content rather
  than its identity, because every render hands the card a fresh array and
  clearing on identity would drop a tick before its write had landed.
  */
  const serverSteps = JSON.stringify(props.steps ?? null)
  useEffect(() => {
    setEdits(({ steps: _dropped, ...rest }) => rest)
  }, [serverSteps])
  /* The shell's write path, reaching a row that nobody handed one to, see
     `tasks/task-writer`. A row given `onPatch` still wins. */
  const writer = useTaskWriter()

  /* Props first, local edits over the top. A completion made from the screen
     still reaches the row; a note typed into the card is not thrown away when
     the screen re-renders for some unrelated reason. */
  const task: ConceptTask = { ...toConceptTask(props), ...edits }
  const counts = stepCount(task)
  const steps = task.steps ?? []

  /*
  **Every edit is reported upward, not just completion.**

  Inside an inline row local state would be invisible, the row stays mounted, so
  the local copy *is* the task for as long as anyone is looking at it. A surface
  mounts per open and unmounts on close, so edits held only locally there would
  be discarded the instant it closed.

  `onPatch` is the one write path out. A screen that supplies it owns the task;
  one that does not keeps local-only behaviour, which is right for a lab or a
  preview with nowhere to write to.
  */
  /*
  Out to whoever owns the task: the handler if there is one, the shell's
  writer otherwise, and nowhere if there is neither.

  The local copy is still kept, and deliberately, an edit has to appear
  before it has travelled anywhere, or every keystroke would wait on a
  round trip through the screen above.
  */
  function report(fields: Partial<ConceptTask>) {
    if (props.onPatch) props.onPatch(fields)
    else if (writer && props.id) writer(props.id, fields)
  }

  function patch(_id: string, fields: Partial<ConceptTask>) {
    setEdits((current) => ({ ...current, ...fields }))
    /*
    **A status the screen owns is told to the screen and not also written from
    here.**

    Both ends are the API: `report` reaches `tasks/task-writer.tsx`, which turns
    `done` into 7.6's transition, and `onToggleComplete` reaches the page's own
    action, which does the same. Doing both would send two transitions for one
    press, and the second would answer 409.

    **Worse than the duplicate would be which one wins.** 9.5 puts a
    confirmation in front of un-completing a task that generated a successor,
    and the page is where that confirmation lives, because the page is what
    knows it is Done. The writer's transition does not wait for it, so the
    confirmation would be asked after the act it gates. AC-162: a declined
    un-complete leaves the completed row completed.

    So where a screen supplies the handler, the screen owns the act. A surface
    supplies none of these, so the writer carries them there.
    */
    const owned = { ...fields }
    if (props.onToggleComplete !== undefined) delete owned.done
    /*
    **Abandon is not stripped, and the asymmetry is the point.** A screen is
    *told* about a completion, `onToggleComplete` above, so a screen that
    supplies that handler writes the transition itself and this must not.
    Nothing tells a screen about an abandon: `onAbandon` is the overflow
    menu's own item, raised from the menu and never from this patch, and
    `onRestore` is the trailing control's, which reaches the server only
    through here. Stripping it left the Restore control drawing, pressing and
    doing nothing, which AC-097 caught within one run.
    */
    if (Object.keys(owned).length > 0) report(owned)
    /* Completion is the screen's fact rather than the row's, so it is told. */
    if (fields.done !== undefined) props.onToggleComplete?.(fields.done)
  }

  /* The card's subtasks are the checklist of its body, written by its
     composer; nothing here writes them. */
  const cardHandlers = {}

  return { task, patch, steps, counts, cardHandlers }
}
