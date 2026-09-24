import { describe, expect, it } from 'vitest'
import type { PageBlock, PageView } from '../../../shared/pages.js'
import { applyEdit, segment } from './document.js'

const block = (id: string, kind: string, section: string | null, text: string | null = id) =>
  ({ id, kind, position: 0, page_position: null, section_block_id: section, list_parent_block_id: null, checked: null, rich_content: null, text, file_id: null, ref_folder_id: null, width_pct: null }) as unknown as PageBlock

// intro · task A · noteA · section S · lead · task B · noteB1 · noteB2
const page: PageView = {
  revision: 'r1',
  blocks: [block('intro', 'paragraph', null), block('noteA', 'paragraph', null), block('S', 'section', null, 'M1'), block('lead', 'paragraph', 'S'), block('noteB1', 'paragraph', 'S'), block('noteB2', 'paragraph', 'S')],
  items: [{ kind: 'block', id: 'intro' }, { kind: 'task', id: 'A' }, { kind: 'block', id: 'noteA' }, { kind: 'block', id: 'S' }, { kind: 'block', id: 'lead' }, { kind: 'task', id: 'B' }, { kind: 'block', id: 'noteB1' }, { kind: 'block', id: 'noteB2' }] as PageView['items'],
  task_placements: [{ id: 'A', section_block_id: null }, { id: 'B', section_block_id: 'S' }],
}
const ids = (list: readonly PageBlock[] | undefined) => list?.map((b) => b.id)

describe('AC-1175 linear document', () => {
  it('segments intro, milestone lead and step content', () => {
    const doc = segment(page)
    expect(ids(doc.intro)).toEqual(['intro'])
    expect(ids(doc.contentOf.get('A'))).toEqual(['noteA'])
    expect(ids(doc.leadOf.get('S'))).toEqual(['lead'])
    expect(ids(doc.contentOf.get('B'))).toEqual(['noteB1', 'noteB2'])
  })

  it('adds a note after a step’s last note, in its section, keeping every block', () => {
    const { document } = applyEdit(page, { op: 'add_block', after: 'B', block: { kind: 'text', text: 'hi' } })
    const added = document.items.at(-1)!
    expect(document.items.map((i) => i.id).slice(0, -1)).toEqual(page.items.map((i) => i.id))
    expect(added.section_block_id).toBe('S')
    expect(document.blocks.find((b) => b.id === added.id)).toMatchObject({ block_kind: 'paragraph', text: 'hi' })
    const mid = applyEdit(page, { op: 'add_block', after: 'A', block: { kind: 'text', text: 'x' } }).document.items
    expect(mid[3]!.section_block_id).toBeNull()
    expect(mid[4]!.id).toBe('S')
  })

  it('a step after a new milestone joins it', () => {
    const withMilestone = applyEdit(page, { op: 'add_milestone', name: ' M2 ' }).document
    const m2 = withMilestone.items.at(-1)!.id
    const next: PageView = {
      ...page,
      blocks: [...page.blocks, block(m2, 'section', null, 'M2')],
      items: [...page.items, { kind: 'block', id: m2 }] as PageView['items'],
    }
    const { document, createTask } = applyEdit(next, { op: 'add_step', title: 'Go' })
    expect(document.items.at(-1)).toMatchObject({ kind: 'task', id: createTask!.id, section_block_id: m2 })
  })

  it('remove_block deletes only that block', async () => {
    const { canvasOperations, documentOf } = await import('../../components/page/canvas/adapters.js')
    const ops = canvasOperations(documentOf(page), applyEdit(page, { op: 'remove_block', id: 'noteB1' }).document)
    expect(ops.filter((op) => op.op === 'delete_block')).toEqual([{ op: 'delete_block', id: 'noteB1' }])
    expect(ops.filter((op) => op.op === 'put_block')).toEqual([])
  })
})
