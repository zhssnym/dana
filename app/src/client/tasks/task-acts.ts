/*
The acts a task supports, performed.

An act belongs to the object, so the moment it lives inside one screen the next
screen either goes without it or writes a second copy that drifts. A task's menu
is drawn in a row, in a card, in a dialog, in a tab and on a board.

The sibling of `lib/object-acts.ts`, which declares *what* a task offers and in
what order, and this, which performs the ones that are the same act wherever
they are pressed. That split is `object-acts.ts`'s own: it "owns the vocabulary"
and "owns no behaviour at all, because only a surface knows how to run one". The
acts here are the ones whose whole behaviour is the same from a row, a card, a
tab and a board.

**The address** comes from `lib/nav-links.ts`, which builds 9.1's
`/app/tasks/:id` and is the one place that decides where an object lives.

**The notice** is `state/toasts.ts`, which 9.1 distinguishes by kind and
`ToastRegion` renders, and its inverse is `shell/undo.ts`.

**Plain functions rather than hooks, `lib/page-identity.ts`'s precedent.** A row
is drawn in a lab with no query client around it and in the app with one; a
plain function that reaches `queryClient()` when there is one and `mutateApi`
either way lets the same row supply the act in both. The cost is that the
mutation cache's own `onSuccess` never sees these writes, so each invalidates by
hand, the same filterless call that cache makes.

**Duplicate** is `POST /tasks/:id/duplicate` (7.16): the copy is the server's,
the list refetches around it, and a toast and an undo follow. "Make this a
folder…" is the same shape over `POST /folders` then `PATCH /tasks/:id`, which
is the hold with one task in it.
*/

import { taskDetail } from '../../shared/tasks.js'
import { mutateApi, requestTimezone } from '../api/http.js'
import { queryClient, writeFailureMessage } from '../api/queryClient.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { showToast } from '../state/toasts.js'
import { taskLink } from '../lib/nav-links.js'

/**
 * Copy a task's address, silently: a copy is not an event worth a notice.
 *
 * The clipboard write is fire and forget and its rejection is swallowed. A
 * browser refuses it when the document is not focused, which is a state the
 * person is already looking at, and an error toast about a copy that did not
 * happen is a second thing to dismiss.
 */
export function copyTaskLink(taskId: string): void {
  void navigator.clipboard?.writeText(taskLink(taskId)).catch(() => {})
}

function settle(): void {
  void queryClient()?.invalidateQueries()
}

/**
 * Duplicate a task through 7.16, and say so.
 *
 * The copy lands wherever the list's own order puts it once the refetch has
 * run; the undo bar says it happened because a copy you cannot see is one you
 * assume did not happen, and the bar is the notice as it is for every act 9.1
 * gives an inverse (a toast saying the same sentence would be the act said
 * twice). The undo is 7.6's soft delete of the copy.
 */
export function duplicateTask(taskId: string, title: string): void {
  /* tz because the copy re-anchors a spent due date on today, and today is
     the viewer's day rather than the database's (8.1, issue #76): without it
     the endpoint refuses a copy that would move a date. */
  void mutateApi(taskDetail, {
    method: 'POST',
    path: `/tasks/${taskId}/duplicate`,
    params: { tz: requestTimezone() },
  })
    .then((copy) => {
      settle()
      pushUndo(undoLabel('Duplicated', title), () => {
        void mutateApi(null, { method: 'DELETE', path: `/tasks/${copy.id}` }).then(settle)
      })
    })
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}
