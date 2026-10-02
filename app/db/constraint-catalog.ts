export * from './constraint-catalog-core.js'

import { constraintCatalog as baseCatalog } from './constraint-catalog-core.js'
import type { ExpectedTable } from './constraint-catalog-core.js'

/** Issue #497 retires discussions.task_id and moves the edge contract to
 * discussion_tasks. Keep the catalog mechanically derived from the preceding
 * catalog while replacing exactly the constraints/indexes that migration
 * 0066 removes and adding the new relation table. */
const discussions: ExpectedTable = {
  ...baseCatalog.discussions,
  foreignKeys: baseCatalog.discussions.foreignKeys.filter(
    (entry) => entry.name !== 'discussions_task_id_fkey',
  ),
  indexes: baseCatalog.discussions.indexes.filter(
    (entry) => entry.name !== 'discussions_one_live_per_task_key',
  ),
}

const discussionTasks: ExpectedTable = {
  primaryKey: {
    name: 'discussion_tasks_pkey',
    columns: ['discussion_id', 'task_id'],
  },
  uniques: [],
  checks: [],
  foreignKeys: [
    {
      name: 'discussion_tasks_discussion_id_fkey',
      columns: ['discussion_id'],
      references: { table: 'discussions', columns: ['id'] },
      onDelete: 'cascade',
    },
    {
      name: 'discussion_tasks_task_id_fkey',
      columns: ['task_id'],
      references: { table: 'tasks', columns: ['id'] },
      onDelete: 'cascade',
    },
  ],
  indexes: [
    {
      name: 'discussion_tasks_task_id_idx',
      unique: false,
      columns: ['task_id'],
      partial: false,
    },
  ],
}

export const constraintCatalog: Record<string, ExpectedTable> = {
  ...baseCatalog,
  discussions,
  discussion_tasks: discussionTasks,
}
