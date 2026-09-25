import { describe, expect, it } from 'vitest'
import type { PageBlock, PageView } from '../../../shared/pages.js'
import { applyEdit } from './document.js'

const block = (id: string, kind: string, section: string | null, text: string | null = id) =>
  ({ id, kind, position: 0, page_position: null, section_block_id: section, list_parent_block_id: null, checked: null, rich_content: null, text, file_id: null, ref_folder_id: null, width_pct: null }) as unknown as PageBlock

// intro · task A · noteA · section S · lead · task B · noteB · section T · task C
const page: PageView = {
  revision: 'r1',
  blocks: [block('intro', 'paragraph', null), block('noteA', 'paragraph', null), block('S', 'section', null, 'M1'), block('lead', 'paragraph', 'S'), block('noteB', 'paragraph', 'S'), block('T', 'section', null, 'M2')],
  items: [{ kind: 'block', id: 'intro' }, { kind: 'task', id: 'A' }, { kind: 'block', id: 'noteA' }, { kind: 'block', id: 'S' }, { kind: 'block', id: 'lead' }, { kind: 'task', id: 'B' }, { kind: 'block', id: 'noteB' }, { kind: 'block', id: 'T' }, { kind: 'task', id: 'C' }] as PageView['items'],
  task_placements: [{ id: 'A', section_block_id: null }, { id: 'B', section_block_id: 'S' }, { id: 'C', section_block_id: 'T' }],
}
const order = (items: readonly { id: string }[]) => items.map((item) => item.id)

describe('AC-1175 linear document', () => {
  it('adds a task at the end of its milestone, keeping every other item in order', () => {
    const { document, createTask } = applyEdit(page, { op: 'add_step', title: 'Go', section: 'S' })
    expect(order(document.items)).toEqual(['intro', 'A', 'noteA', 'S', 'lead', 'B', 'noteB', createTask!.id, 'T', 'C'])
    expect(document.items[7]).toMatchObject({ kind: 'task', section_block_id: 'S' })
    const last = applyEdit(page, { op: 'add_step', title: 'End', section: 'T' })
    expect(last.document.items.at(-1)).toMatchObject({ kind: 'task', id: last.createTask!.id, section_block_id: 'T' })
  })

  it('adds a task outside every milestone before the first one', () => {
    const { document, createTask } = applyEdit(page, { op: 'add_step', title: 'Loose', section: null })
    expect(order(document.items)).toEqual(['intro', 'A', 'noteA', createTask!.id, 'S', 'lead', 'B', 'noteB', 'T', 'C'])
    expect(document.items[3]!.section_block_id).toBeNull()
  })

  it('a new milestone is a section at the end, and a task can then join it', () => {
    const withMilestone = applyEdit(page, { op: 'add_milestone', name: ' M3 ' }).document
    const m3 = withMilestone.items.at(-1)!.id
    expect(withMilestone.blocks.find((b) => b.id === m3)).toMatchObject({ block_kind: 'section', text: 'M3' })
    const next: PageView = {
      ...page,
      blocks: [...page.blocks, block(m3, 'section', null, 'M3')],
      items: [...page.items, { kind: 'block', id: m3 }] as PageView['items'],
    }
    const { document, createTask } = applyEdit(next, { op: 'add_step', title: 'Go', section: m3 })
    expect(document.items.at(-1)).toMatchObject({ kind: 'task', id: createTask!.id, section_block_id: m3 })
  })
})
