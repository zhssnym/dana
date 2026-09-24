/*
Trash, 9.11, at /app/trash.

**This file is wiring and the markup is `screens/trash-screen.tsx`**, over
`lib/trash.ts`.

**The two restores take two hooks and one address between them**, which is
the one thing this page knows that the screen does not. A folder goes to
7.13's own `POST /folders/:id/restore`; a task goes to `POST /tasks/:id/restore`,
which 7.6 owns and which forks on the row's state rather than duplicating,
so the task arm reuses this client's transition hook.

**Restore is offered on every row, not only on rows the viewer deleted.**
9.11 states it: "Anyone with access to the object may restore it, Trash is
scoped by access, not by who deleted." It is the server's rule to keep, and
AC-190 is where it is written down (no test since the 2026-09-20 cut). The page must
not be narrower than the rule.

**No capture anywhere on the page**, which 9.11 says in terms and which the
shell honours by the floating button's own rule; this file adds none.
*/
import { useRestoreDiscussion } from '../api/consultation.js'
import { useRestoreFacet, useRestoreFolder, useTransitionTask } from '../api/mutations.js'
import { TrashScreen } from '../screens/trash-screen.js'
import { showToast } from '../state/toasts.js'

export function TrashPage(): React.JSX.Element {
  const restoreFolder = useRestoreFolder()
  const restoreTask = useTransitionTask()
  const restoreFacet = useRestoreFacet()
  const restoreDiscussion = useRestoreDiscussion()

  return (
    <div className="min-h-full">
      <TrashScreen
        onRestore={(item) => {
          /* polish: places F10. The row vanished and nothing said where it
             went; the toast names the folder it went back to. */
          const said = (): void => {
            showToast(
              (item.kind === 'task' || item.kind === 'discussion') && item.from
                ? `Restored “${item.name}” to ${item.from}`
                : `Restored “${item.name}”`,
            )
          }
          if (item.kind === 'folder') restoreFolder.mutate(item.subject, { onSuccess: said })
          else if (item.kind === 'task') {
            restoreTask.mutate({ id: item.subject, event: 'restore' }, { onSuccess: said })
          }
          else if (item.kind === 'discussion') {
            restoreDiscussion.mutate(item.subject, { onSuccess: said })
          }
          else restoreFacet.mutate(item.subject, { onSuccess: said })
        }}
      />
    </div>
  )
}
