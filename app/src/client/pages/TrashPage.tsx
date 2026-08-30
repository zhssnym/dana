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
scoped by access, not by who deleted." The server enforces it (AC-190), and
the page must not be narrower than the rule.

**No capture anywhere on the page**, which 9.11 says in terms and which the
shell honours by the floating button's own rule; this file adds none.
*/
import { useRestoreFolder, useTransitionTask } from '../api/mutations.js'
import { TrashScreen } from '../screens/trash-screen.js'

export function TrashPage(): React.JSX.Element {
  const restoreFolder = useRestoreFolder()
  const restoreTask = useTransitionTask()

  return (
    <div className="min-h-full">
      <TrashScreen
        onRestore={(item) => {
          if (item.kind === 'folder') restoreFolder.mutate(item.subject)
          else if (item.kind === 'task') restoreTask.mutate({ id: item.subject, event: 'restore' })
        }}
      />
    </div>
  )
}
