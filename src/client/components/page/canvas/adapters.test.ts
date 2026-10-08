// @vitest-environment jsdom
/*
Data loss: a file/audio/video block whose stored file was reclaimed (7.19) hydrates
with no url. The save used to read that as the upload placeholder and drop it,
so the next autosave deleted the block. It must survive untouched, and no
skipped media block may take its children with it.
*/
import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, test } from 'vitest'

import type { PageView } from '../../../../shared/pages.js'
import { documentOperation } from '../../../../shared/page-document.js'
import { CanvasHydrationError, canvasOperations, contentOf, dehydrateCanvas, documentOf, hydrateCanvas, richRuns } from './adapters.js'
import { canvasSchema } from './schema.js'
import type { CanvasBlock } from './schema.js'

const FILE = '11111111-1111-4111-8111-111111111111'
const TEXT = '22222222-2222-4222-8222-222222222222'
const row = (id: string, kind: string, extra: Record<string, unknown>) => ({
  id, kind, position: 0, page_position: 'a', section_block_id: null, list_parent_block_id: null, checked: null,
  rich_content: null, text: null, file_id: null, file_width: null, file_height: null, ref_folder_id: null,
  width_pct: null, updated_at: '2026-09-24T00:00:00.000Z', ...extra,
})

test('a formatted table keeps its cells, headers and widths across a page save', () => {
  const props = { backgroundColor: 'default', textColor: 'default', textAlignment: 'left' as const }
  const rich = { version: 1 as const, runs: [], table: {
    columnWidths: [160, null], headerRows: 1,
    rows: [
      { cells: [{ props, runs: [{ text: 'Name', bold: true }] }, { props, runs: [{ text: 'Link' }] }] },
      { cells: [{ props, runs: [{ text: 'Dana', italic: true }] }, { props, runs: [{ text: 'Open', href: '/app/folders/11111111-1111-4111-8111-111111111111' }] }] },
    ],
  } }
  const page = { revision: 'r', task_placements: [],
    blocks: [row(TEXT, 'table', { text: 'Name\tLink\nDana\tOpen', rich_content: rich })],
    items: [{ kind: 'block', id: TEXT }],
  } as unknown as PageView
  const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: hydrateCanvas(page, 600) as never })
  const after = dehydrateCanvas(editor.document, 600, new Map())
  expect(after.blocks[0]).toEqual(documentOf(page).blocks[0])
  expect(canvasOperations(documentOf(page), after).filter((op) => op.op !== 'set_outline')).toEqual([])
  expect(documentOperation.safeParse({ op: 'put_block', ...after.blocks[0] }).success).toBe(true)
})

test('a merged table cell keeps its span and colour across a page save', () => {
  const props = { backgroundColor: 'blue', textColor: 'default', textAlignment: 'center' as const }
  const rich = { version: 1 as const, runs: [], table: {
    columnWidths: [160, 160], rows: [
      { cells: [{ props: { ...props, colspan: 2 }, runs: [{ text: 'Schedule' }] }] },
      { cells: [{ props, runs: [{ text: 'Today' }] }, { props, runs: [{ text: 'Tomorrow' }] }] },
    ],
  } }
  const page = { revision: 'r', task_placements: [],
    blocks: [row(TEXT, 'table', { text: 'Schedule\nToday\tTomorrow', rich_content: rich })],
    items: [{ kind: 'block', id: TEXT }],
  } as unknown as PageView
  const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: hydrateCanvas(page, 600) as never })
  expect(dehydrateCanvas(editor.document, 600, new Map()).blocks[0]).toEqual(documentOf(page).blocks[0])
})

test('a Person block keeps only its member reference across a page save', () => {
  const memberId = '33333333-3333-4333-8333-333333333333'
  const page = {
    blocks: [row(TEXT, 'person', { text: memberId })],
    items: [{ kind: 'block', id: TEXT }],
  } as unknown as PageView
  const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: hydrateCanvas(page, 600) as never })
  const after = dehydrateCanvas(editor.document, 600, new Map())
  expect(after.blocks).toEqual(documentOf(page).blocks)
  expect(documentOperation.safeParse({ op: 'put_block', ...after.blocks[0] }).success).toBe(true)
  editor.updateBlock(TEXT, { props: { userId: '' } })
  expect(dehydrateCanvas(editor.document, 600, new Map()).blocks).toEqual([])
})

describe('reclaimed media survives autosave', () => {
  test.each(['file', 'audio', 'video'])('a reclaimed %s block is kept as-is', (kind) => {
    const page = {
      blocks: [
        row(FILE, kind, { file_reclaimed_at: '2026-09-20T00:00:00.000Z', width_pct: kind === 'video' ? 100 : null }),
        row(TEXT, 'paragraph', { text: 'after' }),
      ],
      items: [{ kind: 'block', id: FILE }, { kind: 'block', id: TEXT }],
    } as unknown as PageView
    const hydrated = hydrateCanvas(page, 600) as unknown as CanvasBlock[]
    expect((hydrated[0]?.props as { reclaimedAt?: string }).reclaimedAt).toBe('2026-09-20T00:00:00.000Z')
    const after = dehydrateCanvas(hydrated, 600, new Map())
    expect(after.items.map((item) => item.id)).toEqual([FILE, TEXT])
    const ops = canvasOperations(documentOf(page), after)
    expect(ops.filter((op) => op.op === 'delete_block')).toEqual([])
    expect(ops.filter((op) => op.op === 'put_block' && op.id === FILE)).toEqual([])
  })

  test('an unuploaded placeholder is skipped but its children are kept', () => {
    const blocks = [
      { id: FILE, type: 'file', props: { url: '', reclaimedAt: '', name: '', caption: '' }, content: undefined, children: [
        { id: TEXT, type: 'paragraph', props: {}, content: [{ type: 'text', text: 'child', styles: {} }], children: [] },
      ] },
    ] as unknown as CanvasBlock[]
    const after = dehydrateCanvas(blocks, 600, new Map())
    expect(after.items.map((item) => item.id)).toEqual([TEXT])
    expect(after.blocks.map((block) => block.id)).toEqual([TEXT])
  })
})

/* Wave 2 (W-D), data loss: a person mention is its own run, and text typed
   after it must not be folded into it (it would become part of the name and
   leave the paragraph). */
describe('a person mention round-trips as its own run', () => {
  test('text after a mention stays outside it', () => {
    const person = '33333333-3333-4333-8333-333333333333'
    const stored = { version: 1 as const, runs: [{ text: 'Over to ' }, { text: '@Bilal Khan', mention: { user_id: person } }, { text: ' today' }] }
    const content = contentOf('Over to @Bilal Khan today', stored)
    expect(Array.isArray(content) && content[1]).toEqual({ type: 'mention', props: { userId: person, label: '@Bilal Khan' } })
    expect(richRuns({ content } as unknown as CanvasBlock)).toEqual(stored.runs)
  })
})

/*
Wave 2 (0038): any block nests under a writing block on every home, and a
presentation heading may fold (a toggle heading). Each shape survives a
reload, and opening a page untouched writes nothing.
*/
describe('nesting and toggle headings survive save and reload', () => {
  const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const text = (id: string, kind: string, words: string, extra: Record<string, unknown> = {}) =>
    row(id, kind, { text: words, rich_content: { version: 1, runs: [{ text: words }] }, ...extra })
  const pageOf = (blocks: ReturnType<typeof row>[]): PageView => ({
    revision: 'r', task_placements: [], blocks, items: blocks.map((block) => ({ kind: 'block', id: block.id })),
  }) as unknown as PageView
  const reopen = (page: PageView) => {
    const editor = BlockNoteEditor.create({ schema: canvasSchema, initialContent: hydrateCanvas(page, 600) as never })
    return { editor, after: dehydrateCanvas(editor.document as CanvasBlock[], 600, new Map()) }
  }
  const parents = (after: ReturnType<typeof dehydrateCanvas>) => Object.fromEntries(after.items.map((item) => [item.id, item.list_parent_block_id]))

  test('a paragraph nested under a paragraph', () => {
    const page = pageOf([text(uuid(1), 'paragraph', 'parent'), text(uuid(2), 'paragraph', 'child', { list_parent_block_id: uuid(1) })])
    const { editor, after } = reopen(page)
    expect(editor.document[0]?.children.map((child) => child.id)).toEqual([uuid(2)])
    expect(parents(after)).toEqual({ [uuid(1)]: null, [uuid(2)]: uuid(1) })
    expect(canvasOperations(documentOf(page), after).filter((op) => op.op !== 'set_outline')).toEqual([])
  })

  test('a quote under a heading on a document page', () => {
    const page = pageOf([text(uuid(1), 'heading2', 'Plan'), text(uuid(2), 'quote', 'said', { list_parent_block_id: uuid(1) })])
    const { editor, after } = reopen(page)
    expect(editor.document[0]?.props).toMatchObject({ level: 2, isToggleable: false })
    expect(editor.document[0]?.children[0]?.type).toBe('quote')
    expect(parents(after)).toEqual({ [uuid(1)]: null, [uuid(2)]: uuid(1) })
    expect(after.blocks.map((block) => [block.block_kind, block.toggleable])).toEqual([['heading2', null], ['quote', null]])
    expect(canvasOperations(documentOf(page), after).filter((op) => op.op !== 'set_outline')).toEqual([])
  })

  test('a toggle heading with children, which is never read as a Section', () => {
    const page = pageOf([
      text(uuid(1), 'heading1', 'Folded', { toggleable: true }),
      text(uuid(2), 'paragraph', 'inside', { list_parent_block_id: uuid(1) }),
      row(uuid(3), 'image', { list_parent_block_id: uuid(1), text: '' }),
      text(uuid(4), 'bullet', 'deeper', { list_parent_block_id: uuid(2) }),
    ])
    const { editor, after } = reopen(page)
    expect(editor.document[0]?.props).toMatchObject({ level: 1, isToggleable: true, presentation: true })
    expect(after.blocks[0]).toMatchObject({ block_kind: 'heading1', toggleable: true })
    expect(parents(after)).toEqual({ [uuid(1)]: null, [uuid(2)]: uuid(1), [uuid(3)]: uuid(1), [uuid(4)]: uuid(2) })
    expect(after.items.every((item) => item.section_block_id === null)).toBe(true)
    const ops = canvasOperations(documentOf(page), after)
    expect(ops.filter((op) => op.op === 'put_block' && op.id !== uuid(3))).toEqual([])
  })

  test('a block nested in a Work Section keeps the Section and names its block parent', () => {
    const page = pageOf([
      text(uuid(1), 'section', 'Work'),
      text(uuid(2), 'paragraph', 'note', { section_block_id: uuid(1) }),
      text(uuid(3), 'code', 'x', { section_block_id: uuid(1), list_parent_block_id: uuid(2), rich_content: null }),
    ])
    const { after } = reopen(page)
    expect(after.items.map((item) => [item.id, item.section_block_id, item.list_parent_block_id])).toEqual([
      [uuid(1), null, null], [uuid(2), uuid(1), null], [uuid(3), uuid(1), uuid(2)],
    ])
  })

  test('a block nested under a kind that holds nothing does not open', () => {
    const page = pageOf([row(uuid(1), 'code', { text: 'x' }), text(uuid(2), 'paragraph', 'child', { list_parent_block_id: uuid(1) })])
    expect(() => hydrateCanvas(page, 600)).toThrow(CanvasHydrationError)
  })
})

/*
Wave 2, pages in pages: a `page` block is its sub-page's reference and
nothing else. Opened untouched it writes nothing; one `/page` placed is
created with the document (`create_page`, never `put_block`); one removed
moves its page to Trash in the same transaction; and one put back under its
old id is a `put_block`, which restores the page in place.
*/
describe('sub-page blocks', () => {
  const BLOCK = '44444444-4444-4444-8444-444444444444'
  const CHILD = '55555555-5555-4555-8555-555555555555'
  const page = {
    revision: 'r', task_placements: [],
    blocks: [row(BLOCK, 'page', { ref_folder_id: CHILD }), row(TEXT, 'paragraph', { text: 'after', rich_content: { version: 1, runs: [{ text: 'after' }] } })],
    items: [{ kind: 'block', id: BLOCK }, { kind: 'block', id: TEXT }],
  } as unknown as PageView
  const reopen = (blocks: CanvasBlock[]) => dehydrateCanvas(blocks, 600, new Map())
  const drawn = () => BlockNoteEditor.create({ schema: canvasSchema, initialContent: hydrateCanvas(page, 600) as never }).document as CanvasBlock[]

  test('an untouched page block is byte-stable and sends nothing', () => {
    const blocks = drawn()
    expect(blocks[0]).toMatchObject({ id: BLOCK, type: 'danaPage', props: { folderId: CHILD } })
    const after = reopen(blocks)
    expect(after.blocks[0]).toEqual(documentOf(page).blocks[0])
    expect(JSON.stringify(after.blocks[0])).toBe(JSON.stringify(documentOf(page).blocks[0]))
    expect(canvasOperations(documentOf(page), after).filter((op) => op.op !== 'set_outline')).toEqual([])
  })

  test('a removed page block moves its page to Trash in the same transaction', () => {
    const blocks = drawn().filter((block) => block.id !== BLOCK)
    const ops = canvasOperations(documentOf(page), reopen(blocks))
    expect(ops.filter((op) => op.op !== 'set_outline')).toEqual([{ op: 'delete_block', id: BLOCK }, { op: 'trash_page', folder_id: CHILD }])
  })

  test('a page block put back after its trash restores it with put_block', () => {
    const without = { blocks: documentOf(page).blocks.filter((block) => block.id !== BLOCK), items: documentOf(page).items.filter((item) => item.id !== BLOCK) }
    const ops = canvasOperations(without, reopen(drawn()))
    expect(ops.filter((op) => op.op !== 'set_outline')).toEqual([{ op: 'put_block', ...documentOf(page).blocks[0] }])
  })
})

/*
Step 8: a page that became its own project leaves a `folder_ref` with no text
where its `page` block was. It draws as a page row, saves back unchanged, and
removing it removes the reference only: it never trashes the other project.
*/
describe('a page of another project', () => {
  const BLOCK = '66666666-6666-4666-8666-666666666666'
  const OTHER = '77777777-7777-4777-8777-777777777777'
  const page = {
    revision: 'r', task_placements: [],
    blocks: [row(BLOCK, 'folder_ref', { ref_folder_id: OTHER }), row(TEXT, 'paragraph', { text: 'after', rich_content: { version: 1, runs: [{ text: 'after' }] } })],
    items: [{ kind: 'block', id: BLOCK }, { kind: 'block', id: TEXT }],
  } as unknown as PageView
  const drawn = () => BlockNoteEditor.create({ schema: canvasSchema, initialContent: hydrateCanvas(page, 600) as never }).document as CanvasBlock[]

  test('draws as a page row and an untouched one sends nothing', () => {
    const blocks = drawn()
    expect(blocks[0]).toMatchObject({ id: BLOCK, type: 'danaPageRef', props: { folderId: OTHER } })
    const after = dehydrateCanvas(blocks, 600, new Map())
    expect(after.blocks[0]).toEqual(documentOf(page).blocks[0])
    expect(canvasOperations(documentOf(page), after).filter((op) => op.op !== 'set_outline')).toEqual([])
  })

  test('removing it deletes the reference and trashes nothing', () => {
    const blocks = drawn().filter((block) => block.id !== BLOCK)
    const ops = canvasOperations(documentOf(page), dehydrateCanvas(blocks, 600, new Map()))
    expect(ops.filter((op) => op.op !== 'set_outline')).toEqual([{ op: 'delete_block', id: BLOCK }])
  })
})
