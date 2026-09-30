import { describe, expect, it } from 'vitest'

import type { PageBlock, PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'
import type { BoardTask } from '../components/task-board.js'
import { appendRootSection, sectionBoardColumns } from './work-board-model.js'

const section = (id: string, name: string, parent: string | null): PageBlock => ({
  id, kind: 'section', text: name, section_block_id: parent, position: 0,
} as PageBlock)
const task = (id: string, parent: string | null): TaskCard => ({ id, section_block_id: parent } as TaskCard)

describe('Work Board sections', () => {
  it('keeps H2 and H3 inside the root column, places tasks at their exact Section, and keeps loose tasks separate', () => {
    const page = {
      blocks: [section('h3', 'Detail', 'h2'), section('h1', 'Design', null), section('h2', 'Concept', 'h1'), { ...section('flat', 'Writing', null), kind: 'heading2' }],
      items: [{ kind: 'block', id: 'h1' }, { kind: 'block', id: 'h2' }, { kind: 'block', id: 'h3' }],
    } as PageView
    const columns = sectionBoardColumns(page, [task('root', 'h1'), task('nested', 'h2'), task('deep', 'h3'), task('loose', null)], (row) => ({ id: row.id, title: row.id } as BoardTask))
    expect(columns.map((column) => column.label)).toEqual(['Design', 'No section'])
    expect(columns[0]?.tasks.map((row) => row.id)).toEqual(['root'])
    expect(columns[0]?.children?.[0]?.label).toBe('Concept')
    expect(columns[0]?.children?.[0]?.tasks.map((row) => row.id)).toEqual(['nested'])
    expect(columns[0]?.children?.[0]?.children?.[0]?.label).toBe('Detail')
    expect(columns[0]?.children?.[0]?.children?.[0]?.tasks.map((row) => row.id)).toEqual(['deep'])
    expect(columns[1]?.tasks.map((row) => row.id)).toEqual(['loose'])
  })

  it('appends a root Section while keeping every Task and writing parent', () => {
    const page = {
      revision: 'current',
      blocks: [
        { ...section('root', 'Plan', null), list_parent_block_id: null },
        { id: 'child', kind: 'paragraph', section_block_id: 'root', list_parent_block_id: 'parent' },
        { id: 'parent', kind: 'paragraph', section_block_id: 'root', list_parent_block_id: null },
      ],
      task_placements: [{ id: 'task', section_block_id: 'root' }],
      items: [
        { kind: 'block', id: 'root' },
        { kind: 'block', id: 'parent' },
        { kind: 'block', id: 'child' },
        { kind: 'task', id: 'task' },
      ],
    } as PageView
    const transaction = appendRootSection(page, 'new-root', 'Next work')
    expect(transaction.base_revision).toBe('current')
    expect(transaction.operations[0]).toMatchObject({ op: 'put_block', id: 'new-root', block_kind: 'section', text: 'Next work' })
    expect(transaction.operations[1]).toEqual({ op: 'set_outline', items: [
      { kind: 'block', id: 'root', section_block_id: null, list_parent_block_id: null },
      { kind: 'block', id: 'parent', section_block_id: 'root', list_parent_block_id: null },
      { kind: 'block', id: 'child', section_block_id: 'root', list_parent_block_id: 'parent' },
      { kind: 'task', id: 'task', section_block_id: 'root', list_parent_block_id: null },
      { kind: 'block', id: 'new-root', section_block_id: null, list_parent_block_id: null },
    ] })
    expect(() => appendRootSection({ ...page, task_placements: undefined }, 'new-root', 'Next work')).toThrow('Reload')
  })
})
