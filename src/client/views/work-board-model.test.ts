import { describe, expect, it } from 'vitest'

import type { PageBlock, PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'
import type { BoardTask } from '../components/task-board.js'
import { appendRootSection, appendSection, reorderRootSection, sectionBoardColumns } from './work-board-model.js'

const section = (id: string, name: string, parent: string | null): PageBlock => ({
  id, kind: 'section', text: name, section_block_id: parent, list_parent_block_id: null, position: 0,
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
    expect(sectionBoardColumns(page, [task('root', 'h1')], (row) => ({ id: row.id, title: row.id } as BoardTask)).at(-1))
      .toMatchObject({ key: 'no-section', tasks: [], revealEmptyOnDrag: true })
    expect(sectionBoardColumns({ blocks: [], items: [] } as unknown as PageView, [], (row) => ({ id: row.id, title: row.id } as BoardTask)))
      .toMatchObject([{ key: 'no-section', revealEmptyOnDrag: false }])
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

  it('places H2 and H3 after their parent content and before the next sibling', () => {
    const page = {
      revision: 'current',
      blocks: [section('h1', 'First', null), section('h2', 'Inner', 'h1'), section('h3', 'Detail', 'h2'), section('next', 'Second', null)],
      task_placements: [{ id: 'task', section_block_id: 'h2' }],
      items: [
        { kind: 'block', id: 'h1' }, { kind: 'block', id: 'h2' }, { kind: 'block', id: 'h3' },
        { kind: 'task', id: 'task' }, { kind: 'block', id: 'next' },
      ],
    } as PageView
    const h2 = appendSection(page, 'new-h2', 'Last under First', 'h1').operations[1]
    expect(h2).toMatchObject({ op: 'set_outline', items: [
      { id: 'h1' }, { id: 'h2' }, { id: 'h3' }, { id: 'task' },
      { id: 'new-h2', section_block_id: 'h1' }, { id: 'next' },
    ] })
    const h3 = appendSection(page, 'new-h3', 'Last under Inner', 'h2').operations[1]
    expect(h3).toMatchObject({ op: 'set_outline', items: [
      { id: 'h1' }, { id: 'h2' }, { id: 'h3' }, { id: 'task' },
      { id: 'new-h3', section_block_id: 'h2' }, { id: 'next' },
    ] })
    expect(() => appendSection(page, 'too-deep', 'No', 'h3')).toThrow('cannot hold')
  })

  it('reorders a root Section as one span with its nested Sections, Tasks and content', () => {
    const page = {
      revision: 'current',
      blocks: [
        section('a', 'A', null),
        { id: 'a-note', kind: 'paragraph', section_block_id: 'a', list_parent_block_id: null },
        section('a2', 'A child', 'a'),
        section('b', 'B', null),
        { id: 'b-note', kind: 'paragraph', section_block_id: 'b', list_parent_block_id: null },
      ],
      task_placements: [
        { id: 'a-task', section_block_id: 'a2' },
        { id: 'b-task', section_block_id: 'b' },
        { id: 'loose', section_block_id: null },
      ],
      items: [
        { kind: 'block', id: 'a' },
        { kind: 'block', id: 'a-note' },
        { kind: 'block', id: 'a2' },
        { kind: 'task', id: 'a-task' },
        { kind: 'block', id: 'b' },
        { kind: 'block', id: 'b-note' },
        { kind: 'task', id: 'b-task' },
        { kind: 'task', id: 'loose' },
      ],
    } as PageView

    const forward = reorderRootSection(page, 'a', 'b').operations[0]
    expect(forward).toMatchObject({ op: 'set_outline', items: [
      { id: 'b' }, { id: 'b-note' }, { id: 'b-task' },
      { id: 'a' }, { id: 'a-note' }, { id: 'a2' }, { id: 'a-task' },
      { id: 'loose', section_block_id: null },
    ] })

    const backwardPage = {
      ...page,
      items: (forward as Extract<typeof forward, { op: 'set_outline' }>).items,
    } as PageView
    const backward = reorderRootSection(backwardPage, 'a', 'b').operations[0]
    expect(backward).toMatchObject({ op: 'set_outline', items: [
      { id: 'a' }, { id: 'a-note' }, { id: 'a2' }, { id: 'a-task' },
      { id: 'b' }, { id: 'b-note' }, { id: 'b-task' },
      { id: 'loose', section_block_id: null },
    ] })
    expect(() => reorderRootSection(page, 'a2', 'b')).toThrow('root Sections')
  })
})
