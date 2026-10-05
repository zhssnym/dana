// The people and labels the folder page's Task filter offers, and what it allows.
import { useMemo } from 'react'

import type { useLabels } from '../../api/labels.js'
import type { FolderGates } from '../../lib/folder-authority.js'
import type { TaskFilterLabel, TaskFilterPerson } from '../../views/TaskFilterControl.js'
import { taskFilterActive } from '../../views/filter.js'
import type { TaskFilter } from '../../views/filter.js'
import type { FolderMember, PageKind } from '../../../shared/folders.js'
import type { TaskCard } from '../../../shared/tasks.js'

export function useTaskFilterOptions({
  members,
  filterRows,
  labels,
  taskFilter,
  kind,
  gates,
}: {
  readonly members: readonly FolderMember[]
  readonly filterRows: readonly TaskCard[]
  readonly labels: ReturnType<typeof useLabels>['data']
  readonly taskFilter: TaskFilter
  readonly kind: PageKind | null
  readonly gates: FolderGates | null
}): {
  readonly filterPeople: TaskFilterPerson[]
  readonly filterLabels: TaskFilterLabel[]
  readonly filteringTasks: boolean
  readonly canCreateInFilter: boolean
} {
  const filterPeople = useMemo(() => {
    const people = new Map<string, string>()
    for (const member of members) {
      people.set(member.user.id, member.user.display_name ?? 'Deleted user')
    }
    for (const task of filterRows) {
      if (task.assignee !== null && !people.has(task.assignee.id)) {
        people.set(task.assignee.id, task.assignee.display_name ?? 'Deleted user')
      }
    }
    return [...people].map(([personId, name]) => ({ id: personId, name }))
  }, [members, filterRows])
  const filterLabels = labels?.rows.map((label) => ({
    id: label.id, name: label.name, color: label.color, archived: label.archived,
  })) ?? []
  const filteringTasks = kind === 'work' && taskFilterActive(taskFilter)
  const filteredLabel = labels?.rows.find((label) => label.id === taskFilter.label)
  const canCreateInFilter = taskFilter.label === null ||
    (filteredLabel?.archived === false && (filteredLabel.scope === 'personal' || gates?.applyLabel === true))
  return { filterPeople, filterLabels, filteringTasks, canCreateInFilter }
}
