/* The row's completion checkbox. */

import { COMPLETE_TASK, MARK_AS_NOT_DONE } from "../ui/copy.js"
import type { ConceptTask } from "../../tasks/task-model.js"
import { cn } from "../ui/utils.js"
import { CheckMark } from "../ui/checkbox.js"

/* --------------------------------------------------------------- pieces, */

export function Check({
  task,
  onToggle,
}: {
  task: ConceptTask
  onToggle: () => void
}) {
  const done = Boolean(task.done)

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      /*
      9.1's names table gives this control exactly two names: "Complete task"
      when open, "Mark as not done" when complete. Naming the task instead
      ("Complete {title}") would name the task rather than the act. The strings
      are `ui/copy.ts`'s, transcribed once for the whole client.
      */
      aria-label={done ? MARK_AS_NOT_DONE : COMPLETE_TASK}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className="flex size-[var(--control-height)] items-center justify-center rounded-sm"
    >
      <CheckMark checked={done} className={cn("active:scale-90", !done && "hover:border-muted-foreground", task.abandoned && !done && "opacity-60")} />
    </button>
  )
}
