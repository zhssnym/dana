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
run one". The acts here are the ones whose whole behaviour is the same from a
row, a card, a tab and a board.

**Two seams.**

The address is the first. The prototype's `taskLink` builds `?task=<id>` on
the current URL; `lib/nav-links.ts` builds 9.1's `/app/tasks/:id` and is the
one place that decides where an object lives, so this asks it rather than
assembling a second answer.

The notice is the second. The prototype's `notice()` writes into its own undo
bar; this client's system toast is `state/toasts.ts`, which 9.1 distinguishes
by kind and `ToastRegion` renders, and its inverse is `shell/undo.ts`. Same
act, this client's channels.

**Plain functions rather than hooks, `lib/page-identity.ts`'s precedent.**
A row is drawn in a lab with no query client around it and in the app with
one; a plain function that reaches `queryClient()` when there is one and
`mutateApi` either way lets the same row supply the act in both. The cost is
that the mutation cache's own `onSuccess` never sees these writes, so each
invalidates by hand, the same filterless call that cache makes.

**Duplicate crossed at the loose-ends row (RFC 0005 change control item 58,
A).** This file used to record that frozen section 7 had no task duplicate;
S28a gave it one, `POST /tasks/:id/duplicate` (7.16, item 53(e)), and the
prototype's shell answers a duplicate by putting the copy beside the original
with a History line and an undo. Here the copy is the server's, the list
refetches around it, and the toast and the undo are the prototype's. "Make
this a folder…" is the same shape over `POST /folders` then `PATCH /tasks/:id`,
which is S23a's hold with one task in it (ledger L-007), and a step's move out
of its task is item 58's endpoint, B9's one-way promotion given an address
(ledger L-159).
*/

import { folder as folderSchema } from '../../shared/folders.js'
import { taskDetail } from '../../shared/tasks.js'
import { getPlain, mutateApi } from '../api/http.js'
import { queryClient, writeFailureMessage } from '../api/queryClient.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { showToast } from '../state/toasts.js'
import { folderLibrary } from './folder-library.js'
import { taskLink } from './nav-links.js'
import type { ConceptStep } from './task-model.js'

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

function settle(): void {
  void queryClient()?.invalidateQueries()
}

/**
 * Duplicate a task through 7.16, and say so.
 *
 * The copy lands wherever the list's own order puts it once the refetch has
 * run; the undo bar says it happened because a copy you cannot see is one you
 * assume did not happen, the prototype's own reason for putting it beside the
 * original, and the bar is the notice as it is for every act 9.1 gives an
 * inverse (a toast saying the same sentence would be the act said twice). The
 * undo is 7.6's soft delete of the copy, which is what the prototype's History
 * entry undoes.
 */
export function duplicateTask(taskId: string, title: string): void {
  void mutateApi(taskDetail, { method: 'POST', path: `/tasks/${taskId}/duplicate` })
    .then((copy) => {
      settle()
      pushUndo(undoLabel('Duplicated', title), () => {
        void mutateApi(null, { method: 'DELETE', path: `/tasks/${copy.id}` }).then(settle)
      })
    })
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

/**
 * "Make this a folder…": a folder named after the task, and the task moved
 * into it, S23a's hold with one task in it (`pages/task-rows.tsx`'s
 * `onMerge`). The undo moves the task back and leaves the folder, exactly as
 * the hold's does: the folder is a thing the person now has, not a side
 * effect to unwind.
 *
 * The task is read first, for the folder the undo returns it to: a row on a
 * folder page draws no folder chip (DES-183) and so holds no folder id, and
 * one read is cheaper than a prop threaded through every list.
 *
 * **The folder is made in one request**, for the reason `api/mutations.ts`
 * gives at `useCreateFolder`: this act is the hold with one task in it, the
 * same composition AC-279 counts on the wire, and a default description
 * cannot be written without a second call while frozen 7.4's create body is
 * `{ name }` alone.
 */
export function makeFolderOfTask(taskId: string, title: string): void {
  const folderName = title.slice(0, 100)
  void getPlain(taskDetail, `/tasks/${taskId}`)
    .then((task) =>
      mutateApi(folderSchema, {
        method: 'POST',
        path: '/folders',
        body: { name: folderName },
      }).then((made) =>
        mutateApi(null, {
          method: 'PATCH',
          path: `/tasks/${taskId}`,
          body: { folder_id: made.id },
        }).then(() => {
          settle()
          showToast(`Moved "${title}" to "${made.name}"`)
          pushUndo(undoLabel('Moved', title), () => {
            void mutateApi(null, {
              method: 'PATCH',
              path: `/tasks/${taskId}`,
              body: { folder_id: task.folder.id },
            }).then(settle)
          })
        }),
      ),
    )
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

/** Where the card's step menu can send steps: the prototype's own two. */
export type StepDestination =
  | { kind: 'new-task' }
  | { kind: 'folder'; name: string; color: string }

/**
 * Steps out of their task, one verb and the destination decides the level
 * (DES-106, the prototype's `moveStepsTo`).
 *
 * Into a folder each step becomes a task of its own: item 58's
 * `POST /tasks/:id/steps/:stepId/promote`, which lands the task in the
 * parent's folder and section, then 7.6's PATCH carries it on when the chosen
 * folder is another. Into a new task they stay steps: 7.6's create takes the
 * titles and 7.7's delete removes the originals. The new task is named "New
 * task" on purpose, the prototype's reason being that every row renames in
 * place, and it starts loose in the parent's folder.
 *
 * Only steps carrying 7.7's id can move; a step typed into the card and not
 * yet written has none and is skipped rather than invented.
 */
export function moveStepsOut(
  taskId: string,
  folderId: string,
  steps: readonly ConceptStep[],
  indices: readonly number[],
  destination: StepDestination,
): void {
  const chosen = indices
    .map((index) => steps[index])
    .filter((step): step is ConceptStep & { id: string } => step?.id !== undefined)
  if (chosen.length === 0) return

  if (destination.kind === 'new-task') {
    void mutateApi(taskDetail, {
      method: 'POST',
      path: '/tasks',
      body: { title: 'New task', folder_id: folderId, steps: chosen.map((step) => step.title) },
    })
      .then((made) =>
        Promise.all(
          chosen.map((step) => mutateApi(null, { method: 'DELETE', path: `/steps/${step.id}` })),
        ).then(() => {
          settle()
          showToast(`Moved ${plural(chosen.length, 'step')} to "${made.title}"`)
        }),
      )
      .catch((error: unknown) => showToast(writeFailureMessage(error)))
    return
  }

  const target = folderLibrary().find((entry) => entry.name === destination.name)
  void Promise.all(
    chosen.map((step) =>
      mutateApi(taskDetail, {
        method: 'POST',
        path: `/tasks/${taskId}/steps/${step.id}/promote`,
      }).then((made) =>
        target === undefined || target.id === folderId
          ? undefined
          : mutateApi(null, {
              method: 'PATCH',
              path: `/tasks/${made.id}`,
              body: { folder_id: target.id },
            }),
      ),
    ),
  )
    .then(() => {
      settle()
      const where = target?.name ?? destination.name
      showToast(
        chosen.length === 1
          ? `"${chosen[0]?.title ?? ''}" is now a task in "${where}"`
          : `${chosen.length} steps are now tasks in "${where}"`,
      )
    })
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * The card's step list, written as the 7.7 calls that would produce it.
 *
 * `lib/task-writer.tsx` has said since S22 that steps "need a diff against
 * the task's current list rather than a field copy, which is the card's own
 * act and lands with the card"; the card landed at S23 and nothing wrote
 * them, so a step ticked in an open card was ticked until the next refetch
 * and never after (found at the loose-ends row, item 58). The current list
 * is read through 7.6's GET rather than off a cache, so a card open for a
 * while diffs against the truth: a step with 7.7's id is patched where its
 * title, box or place changed, one without is added, one the list no longer
 * names is deleted, and the refetch afterwards hands the card the ids.
 */
export function writeSteps(taskId: string, next: readonly ConceptStep[]): void {
  void getPlain(taskDetail, `/tasks/${taskId}`)
    .then((current) => {
      const before = new Map(current.steps.map((step) => [step.id, step]))
      const kept = new Set(next.map((step) => step.id).filter((id) => id !== undefined))
      /*
      polish: taskcard F1 and F4. A step the card added and then renamed or
      ticked before the refetch handed it an id arrives here without one,
      while the server already holds it. Diffing by id alone deleted the
      server's copy and posted the renamed one, so a rename read as "removed
      a step, added a step" in the history and the two writes raced the
      refetch. An id-less step standing at the same position as a server
      step nobody kept is that step, so it is patched rather than replaced.
      */
      const paired = new Map<number, (typeof current.steps)[number]>()
      current.steps.forEach((step, index) => {
        if (kept.has(step.id)) return
        const candidate = next[index]
        if (candidate !== undefined && candidate.id === undefined) paired.set(index, step)
      })
      const writes: Promise<unknown>[] = []
      for (const step of current.steps) {
        if (!kept.has(step.id) && ![...paired.values()].includes(step)) {
          writes.push(mutateApi(null, { method: 'DELETE', path: `/steps/${step.id}` }))
        }
      }
      next.forEach((step, index) => {
        const position = index + 1
        const twin = step.id === undefined ? paired.get(index) : undefined
        if (twin !== undefined) {
          const body: Record<string, unknown> = {}
          if (twin.title !== step.title) body['title'] = step.title
          if (twin.done !== step.done) body['done'] = step.done
          if (Object.keys(body).length === 0) return
          writes.push(mutateApi(taskDetail, { method: 'PATCH', path: `/steps/${twin.id}`, body }))
          return
        }
        if (step.id === undefined) {
          writes.push(
            mutateApi(taskDetail, {
              method: 'POST',
              path: `/tasks/${taskId}/steps`,
              body: { title: step.title, position },
            }),
          )
          return
        }
        const was = before.get(step.id)
        if (was === undefined) return
        const body: Record<string, unknown> = {}
        if (was.title !== step.title) body['title'] = step.title
        if (was.done !== step.done) body['done'] = step.done
        if (was.position !== position) body['position'] = position
        if (Object.keys(body).length === 0) return
        writes.push(mutateApi(taskDetail, { method: 'PATCH', path: `/steps/${step.id}`, body }))
      })
      return Promise.all(writes)
    })
    .then(settle)
    .catch((error: unknown) => showToast(writeFailureMessage(error)))
}
