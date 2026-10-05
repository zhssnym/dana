// A Work tab's tools at the end of the tab row: the Task filter and Board's grouping.
import { TaskFilterControl } from '../../views/TaskFilterControl.js'
import type { TaskFilterLabel, TaskFilterPerson } from '../../views/TaskFilterControl.js'
import type { TaskFilter } from '../../views/filter.js'
import type { WorkView } from '../../views/work-view.js'
import { BoardGroupControl } from '../../views/WorkBoard.js'
import type { WorkGroup } from '../../views/WorkBoard.js'

export function FolderWorkTools({
  taskFilter,
  setTaskFilter,
  people,
  labels,
  today,
  workView,
  boardGroup,
  setBoardGroup,
}: {
  readonly taskFilter: TaskFilter
  readonly setTaskFilter: (next: TaskFilter) => void
  readonly people: readonly TaskFilterPerson[]
  readonly labels: readonly TaskFilterLabel[]
  readonly today: string
  readonly workView: WorkView
  readonly boardGroup: WorkGroup
  readonly setBoardGroup: (next: WorkGroup) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <TaskFilterControl
        filter={taskFilter}
        onChange={setTaskFilter}
        people={people}
        labels={labels}
        today={today}
      />
      {workView === 'board' ? <BoardGroupControl group={boardGroup} onChange={setBoardGroup} /> : null}
    </div>
  )
}
