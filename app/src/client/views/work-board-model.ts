import type { DocumentTransaction, PageView } from '../../shared/pages.js'
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
  const loose: BoardColumn = { key: 'no-section', label: 'No section', tasks: [], quiet: true, revealEmptyOnDrag: roots.length > 0 }
  for (const task of rows) (nodes.get(task.section_block_id ?? '') ?? loose).tasks.push(card(task))
  roots.push(loose)
  return roots
}

/** Append an H1 without rewriting any existing Work placement. */
export function appendRootSection(page: PageView, id: string, title: string): DocumentTransaction {
  return appendSection(page, id, title, null)
}

/** Add a root, H2 or H3 at the end of its parent's subtree in the Work outline. */
export function appendSection(page: PageView, id: string, title: string, parentId: string | null): DocumentTransaction {
  if (!page.revision || page.task_placements === undefined) throw new Error('Reload the page before adding a Section.')
  const blocks = new Map(page.blocks.map((block) => [block.id, block]))
  const sections = new Map(page.blocks.filter((block) => block.kind === 'section').map((block) => [block.id, block]))
  const tasks = new Map(page.task_placements.map((task) => [task.id, task]))
  if (parentId !== null) {
    let depth = 0
    let at: string | null = parentId
    while (at !== null) {
      const parent = sections.get(at)
      if (parent === undefined || ++depth > 2) throw new Error('This Section cannot hold another Section.')
      at = parent.section_block_id
    }
  }
  const items = page.items.map((item) => {
    if (item.kind === 'task') {
      const task = tasks.get(item.id)
      if (task === undefined) throw new Error('Reload the page before adding a Section.')
      return { ...item, section_block_id: task.section_block_id, list_parent_block_id: null }
    }
    const block = blocks.get(item.id)
    if (block === undefined) throw new Error('Reload the page before adding a Section.')
    return { ...item, section_block_id: block.section_block_id, list_parent_block_id: block.list_parent_block_id }
  })
  let insertAt = items.length
  if (parentId !== null) {
    insertAt = items.findIndex((item) => item.kind === 'block' && item.id === parentId)
    if (insertAt < 0) throw new Error('Reload the page before adding a Section.')
    const inside = (item: typeof items[number]): boolean => {
      let at: string | null = item.kind === 'block' && sections.has(item.id) ? item.id : item.section_block_id
      while (at !== null) {
        if (at === parentId) return true
        at = sections.get(at)?.section_block_id ?? null
      }
      return false
    }
    while (insertAt + 1 < items.length && inside(items[insertAt + 1]!)) insertAt += 1
    insertAt += 1
  }
  items.splice(insertAt, 0, { kind: 'block', id, section_block_id: parentId, list_parent_block_id: null })
  return {
    action: 'document_transaction',
    mutation_id: crypto.randomUUID(),
    base_revision: page.revision,
    operations: [
      { op: 'put_block', id, block_kind: 'section', text: title, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null },
      { op: 'set_outline', items },
    ],
  }
}
