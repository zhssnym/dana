import type { PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'
import type { BoardColumn, BoardTask } from '../components/task-board.js'

/** Work's stored Section parents define the Board tree; presentation headings do not. */
export function sectionBoardColumns(page: PageView, rows: readonly TaskCard[], card: (task: TaskCard) => BoardTask): BoardColumn[] {
  const rank = new Map(page.items.map((item, index) => [item.id, index]))
  const sections = page.blocks.filter((block) => block.kind === 'section')
    .sort((a, b) => (rank.get(a.id) ?? a.position) - (rank.get(b.id) ?? b.position))
  const nodes = new Map(sections.map((section) => [section.id, {
    key: section.id,
    label: section.text || 'Untitled section',
    tasks: [] as BoardTask[],
    children: [] as BoardColumn[],
  }]))
  const roots: BoardColumn[] = []
  for (const section of sections) {
    const node = nodes.get(section.id)!
    const parent = section.section_block_id === null ? undefined : nodes.get(section.section_block_id)
    if (parent === undefined) roots.push(node)
    else parent.children.push(node)
  }
  const loose: BoardColumn = { key: 'no-section', label: 'No section', tasks: [], quiet: true }
  for (const task of rows) (nodes.get(task.section_block_id ?? '') ?? loose).tasks.push(card(task))
  if (loose.tasks.length > 0 || roots.length === 0) roots.push(loose)
  return roots
}
