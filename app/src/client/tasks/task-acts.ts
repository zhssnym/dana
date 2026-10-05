/*
 * Task acts that behave the same from a row, card, tab or board. `lib/object-acts.ts` declares which exist.
 * Plain functions, not hooks, so a row works without a query client; each therefore invalidates by hand.
 */

import { taskDetail } from '../../shared/tasks.js'
import { mutateApi, requestTimezone } from '../api/http.js'
import { queryClient, writeFailureMessage } from '../api/queryClient.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { showToast } from '../state/toasts.js'
import { taskLink } from '../lib/nav-links.js'

/** Silent, and a refused clipboard write is swallowed: an error toast about a copy is noise. */
export function copyTaskLink(taskId: string): void {
  void navigator.clipboard?.writeText(taskLink(taskId)).catch(() => {})
}

function settle(): void {
  void queryClient()?.invalidateQueries()
}

/** The undo bar is the notice; its undo soft-deletes the copy. */
export function duplicateTask(taskId: string, title: string): void {
  /* tz: the copy re-anchors a spent due date on the viewer's today; without it the server refuses. */
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
