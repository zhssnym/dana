/*
The acts a task supports, performed.

The sibling of `lib/folder-acts`, and it exists for the same reason: an act
belongs to the object, so the moment it lives inside one screen the next screen
either goes without it or writes a second copy that drifts. A task's menu is
drawn in a row, in a card, in a dialog, in a tab and on a board.
*/

import {
  PROTOTYPE_DUPLICATE_EVENT,
  type DuplicateRequest,
} from "@/lib/folder-acts"
import { taskLink } from "@/lib/folder-duplicate"
import { notice } from "@/lib/undo"

export function copyTaskLink(taskId: string, title: string) {
  void navigator.clipboard?.writeText(taskLink(taskId)).catch(() => {})
  /* Named, unlike the folder's, because you copy a folder's link from its own
     page and a task's from a list of twenty — "Link copied" there does not say
     which. */
  notice(`Link to “${title}” copied`)
}

/* Says what happened; the shell answers, because only it can hold the copy. */
export function duplicateTaskById(taskId: string) {
  window.dispatchEvent(
    new CustomEvent(PROTOTYPE_DUPLICATE_EVENT, {
      detail: { kind: "task", subject: taskId } satisfies DuplicateRequest,
    }),
  )
}
