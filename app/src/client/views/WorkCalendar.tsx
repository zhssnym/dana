import type { TaskCard } from '../../shared/tasks.js'
import { useCreateTask } from '../api/mutations.js'
import { PlannedCalendar } from '../components/calendar/index.js'
import type { RowContext } from '../parts/presenters.js'
import { taskFilterActive, type TaskFilter } from './filter.js'

/** The shared calendar, scoped to this Work's canonical Tasks and filter. */
export default function WorkCalendar({ folderId, tasks, filter, context, canCreate }: {
  readonly folderId: string
  readonly tasks: readonly TaskCard[]
  readonly filter: TaskFilter
  readonly context: RowContext
  readonly canCreate: boolean
}): React.JSX.Element {
  const create = useCreateTask()
  return <PlannedCalendar
    folderId={folderId}
    filter={filter}
    filterTasks={tasks}
    filterToday={context.today}
    {...(canCreate && !taskFilterActive(filter) ? { onCreate: (title: string, date: string) => {
      create.mutate({ title, folder_id: folderId, due_date: date })
    } } : {})}
  />
}
