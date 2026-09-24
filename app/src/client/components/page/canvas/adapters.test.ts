/*
Data loss: a file/audio/video block whose stored file was reclaimed (7.19) hydrates
with no url. The save used to read that as the upload placeholder and drop it,
so the next autosave deleted the block. It must survive untouched, and no
skipped media block may take its children with it.
*/
import { describe, expect, test } from 'vitest'

import type { PageView } from '../../../../shared/pages.js'
import { canvasOperations, contentOf, dehydrateCanvas, documentOf, hydrateCanvas, richRuns } from './adapters.js'
import type { CanvasBlock } from './schema.js'

const FILE = '11111111-1111-4111-8111-111111111111'
const TEXT = '22222222-2222-4222-8222-222222222222'
const row = (id: string, kind: string, extra: Record<string, unknown>) => ({
  id, kind, position: 0, page_position: 'a', section_block_id: null, list_parent_block_id: null, checked: null,
  rich_content: null, text: null, file_id: null, file_width: null, file_height: null, ref_folder_id: null,
  width_pct: null, updated_at: '2026-09-24T00:00:00.000Z', ...extra,
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
