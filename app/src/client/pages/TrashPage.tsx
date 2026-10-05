/*
 * Trash: wiring; the markup is `screens/trash-screen.tsx`. Restore is offered on every row (spec 9.11). A task
 * restores through the transition hook (POST /tasks/:id/restore).
 */
import { useRestoreDiscussion } from '../api/consultation.js'
import { useRestoreFolder, useTransitionTask } from '../api/mutations.js'
import { TrashScreen } from '../screens/trash-screen.js'
import { showToast } from '../state/toasts.js'

export function TrashPage(): React.JSX.Element {
  const restoreFolder = useRestoreFolder()
  const restoreTask = useTransitionTask()
  const restoreDiscussion = useRestoreDiscussion()

  return (
    <div className="min-h-full">
      <TrashScreen
        onRestore={(item) => {
          /* The row vanishes, so the toast names the folder it went back to. */
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
          else restoreDiscussion.mutate(item.subject, { onSuccess: said })
        }}
      />
    </div>
  )
}
