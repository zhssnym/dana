/*
The acts a task supports, performed.

`docs/design/prototype-v2/src/lib/task-acts.ts`, read at `7d2064c`. Its own
header gives the reason it exists and the reason survives the port whole: "an
act belongs to the object, so the moment it lives inside one screen the next
screen either goes without it or writes a second copy that drifts. A task's
menu is drawn in a row, in a card, in a dialog, in a tab and on a board."

The sibling of `lib/object-acts.ts`, which declares *what* a task offers and
in what order, and this, which performs the ones that are the same act
wherever they are pressed. That split is `object-acts.ts`'s own: it "owns the
vocabulary" and "owns no behaviour at all, because only a surface knows how to
run one". Copy link is the exception that proves it, being the one task act
whose whole behaviour is the same from a row, a card, a tab and a board.

**Two seams.**

The address is the first. The prototype's `taskLink` builds `?task=<id>` on
the current URL; `lib/nav-links.ts` builds 9.1's `/app/tasks/:id` and is the
one place that decides where an object lives, so this asks it rather than
assembling a second answer. That was worth doing on its own: three surfaces in
this client were spelling a folder's address inline before this file existed.

The notice is the second. The prototype's `notice()` writes into its own undo
bar; this client's system toast is `state/toasts.ts`, which 9.1 distinguishes
by kind and `ToastRegion` renders. Same act, this client's channel.

**`duplicateTaskById` deliberately does not cross, and the gap is routed
rather than papered over.** The prototype dispatches a window event and its
shell answers, "because only it can hold the copy". This client has no copy to
hold: 9.3 names Duplicate in a task's More actions and frozen section 7 has no
`POST /tasks/:id/duplicate`, only 7.16's folder duplicate. Composing one here
out of `POST /tasks` plus the step routes would be a rule with no section
behind it, and 9.6's duplicate paragraph shows how much rule there is to get
wrong, "spent due dates re-anchor on today and future ones keep". So the act
stays declared in `object-acts.ts` and unsupplied, which is that file's own
safety property working as designed: "an act with no handler does not appear",
so no menu offers a Duplicate that does nothing. The escalation is in the
session report and in section 13.
*/

import { showToast } from '../state/toasts.js'
import { taskLink } from './nav-links.js'

/**
 * Copy a task's address, and say so.
 *
 * The notice is named, unlike a folder's, and the prototype's reason for that
 * is the right one: "you copy a folder's link from its own page and a task's
 * from a list of twenty. Link copied there does not say which."
 *
 * The clipboard write is fire and forget and its rejection is swallowed. A
 * browser refuses it when the document is not focused, which is a state the
 * person is already looking at, and an error toast about a copy that did not
 * happen is a second thing to dismiss.
 */
export function copyTaskLink(taskId: string, title: string): void {
  void navigator.clipboard?.writeText(taskLink(taskId)).catch(() => {})
  showToast(`Link to "${title}" copied`)
}
