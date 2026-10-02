export * from './constraint-catalog-core.js'

import { constraintCatalog as baseCatalog } from './constraint-catalog-core.js'
import type { ExpectedTable } from './constraint-catalog-core.js'

/** Issue #497 retires discussions.task_id and moves the edge contract to
 * discussion_tasks. Keep the catalog mechanically derived from the preceding
 * catalog while replacing exactly the constraints/indexes that migration
 * 0066 removes and adding the new relation table. */
const baseDiscussions = baseCatalog.discussions
if (baseDiscussions === undefined) {
  throw new Error('constraint-catalog-core.ts no longer lists discussions')
}
const discussions: ExpectedTable = {
  ...baseDiscussions,
  foreignKeys: baseDiscussions.foreignKeys.filter(
    (entry) => entry.name !== 'discussions_task_id_fkey',
  ),
  indexes: baseDiscussions.indexes.filter(
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

/** Issue #488 adds the explicit whole-block facet relation. Inline facet
 * references remain rich-content Dana Links; this table is the persisted
 * source for media/file blocks and whole-block connections. */
const pageBlockFacets: ExpectedTable = {
  primaryKey: {
    name: 'page_block_facets_pkey',
    columns: ['block_id', 'facet_id'],
  },
  uniques: [],
  checks: [],
  foreignKeys: [
    {
      name: 'page_block_facets_block_id_fkey',
      columns: ['block_id'],
      references: { table: 'page_blocks', columns: ['id'] },
      onDelete: 'cascade',
    },
    {
      name: 'page_block_facets_facet_id_fkey',
      columns: ['facet_id'],
      references: { table: 'folders', columns: ['id'] },
      onDelete: 'cascade',
    },
  ],
  indexes: [
    {
      name: 'page_block_facets_facet_id_block_id_idx',
      unique: false,
      columns: ['facet_id', 'block_id'],
      partial: false,
    },
  ],
}

export const constraintCatalog: Record<string, ExpectedTable> = {
  ...baseCatalog,
  discussions,
  discussion_tasks: discussionTasks,
  page_block_facets: pageBlockFacets,
}
