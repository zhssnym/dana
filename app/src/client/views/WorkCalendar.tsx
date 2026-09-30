import type { TaskCard } from '../../shared/tasks.js'
import { useCreateTask } from '../api/mutations.js'
import { PlannedCalendar } from '../components/calendar/index.js'
import { ConfirmDialog, TaskRows, useConfirm } from '../pages/task-rows.js'
import type { RowContext } from '../parts/presenters.js'
import { isScheduled } from '../parts/schedule.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PlaceGroup } from './usePlace.js'
import { taskFilterActive, taskMatchesFilter, type TaskFilter } from './filter.js'

/** The shared calendar, scoped to this Work's canonical Tasks and filter. */
export default function WorkCalendar({ folderId, tasks, filter, context, canCreate }: {
  readonly folderId: string
  readonly tasks: readonly TaskCard[]
  readonly filter: TaskFilter
  readonly context: RowContext
  readonly canCreate: boolean
}): React.JSX.Element {
  const create = useCreateTask()
  const actions = useRowActions()
  const confirm = useConfirm()
  const undated = tasks.filter((task) => !isScheduled(task) && taskMatchesFilter(task, filter, context.today))

  return <>
    <PlannedCalendar
      folderId={folderId}
      filter={filter}
      filterTasks={tasks}
      filterToday={context.today}
      {...(canCreate && !taskFilterActive(filter) ? { onCreate: (title: string, date: string) => {
        create.mutate({ title, folder_id: folderId, due_date: date })
      } } : {})}
    />
    {undated.length === 0 ? null : <div className="mt-6 border-t border-border pt-4">
      <PlaceGroup name="Undated" heading="Undated">
        <TaskRows tasks={undated} context={context} actions={actions} onAsk={confirm.ask} />
      </PlaceGroup>
    </div>}
    <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
  </>
}
