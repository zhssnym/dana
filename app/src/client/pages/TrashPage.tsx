/*
Trash, 9.11, at /app/trash.

**This file is wiring and the markup is `screens/trash-screen.tsx`**, lifted
whole from `prototype-v2` at RFC 0004's S27 over `lib/trash.ts`; the screen's
header names its five seams and the lib's header names what it crosses. The
S9 and S17b page that stood here drew the same rows to 9.11 in its own
markup and retires with this row.

**The two restores take two hooks and one address between them**, which is
the one thing this page knows that the screen does not. A folder goes to
7.13's own `POST /folders/:id/restore`; a task goes to `POST /tasks/:id/restore`,
which frozen 7.6 already owned and which S3 forked on the row's state rather
than duplicating, so the task arm reuses the transition hook this client has
had since P5.

**Restore is offered on every row, not only on rows the viewer deleted.**
9.11 states it: "Anyone with access to the object may restore it, Trash is
scoped by access, not by who deleted." It is the server's rule to keep, and
AC-190 is where it is written down (no test since the 2026-09-20 cut). The page must
not be narrower than the rule.

**No capture anywhere on the page**, which 9.11 says in terms and which the
shell honours by the floating button's own rule; this file adds none.
*/
import { useRestoreFacet, useRestoreFolder, useTransitionTask } from '../api/mutations.js'
import { TrashScreen } from '../screens/trash-screen.js'
import { showToast } from '../state/toasts.js'

export function TrashPage(): React.JSX.Element {
  const restoreFolder = useRestoreFolder()
  const restoreTask = useTransitionTask()
  const restoreFacet = useRestoreFacet()

  return (
    <div className="min-h-full">
      <TrashScreen
        onRestore={(item) => {
          /* polish: places F10. The row vanished and nothing said where it
             went; the toast names the folder it went back to. */
          const said = (): void => {
            showToast(
              item.kind === 'task' && item.from
                ? `Restored "${item.name}" to ${item.from}`
                : `Restored "${item.name}"`,
            )
          }
          if (item.kind === 'folder') restoreFolder.mutate(item.subject, { onSuccess: said })
          else if (item.kind === 'task') {
            restoreTask.mutate({ id: item.subject, event: 'restore' }, { onSuccess: said })
          }
          else restoreFacet.mutate(item.subject, { onSuccess: said })
        }}
      />
    </div>
  )
}
