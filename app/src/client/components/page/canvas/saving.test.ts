import { describe, expect, test, vi } from 'vitest'
import { CanvasWriter } from './saving.js'
import type { CanvasDocument } from './adapters.js'
import type { PageView } from '../../../../shared/pages.js'

const empty: CanvasDocument = { blocks: [], items: [] }
const paragraph: CanvasDocument = { blocks: [{ id: 'block', block_kind: 'paragraph', text: 'Keep me', rich_content: { version: 1, runs: [{ text: 'Keep me', bold: true }] }, file_id: null, ref_folder_id: null, width_pct: null, checked: null }], items: [{ kind: 'block', id: 'block', section_block_id: null, list_parent_block_id: null }] }
const response: PageView = { blocks: [], items: [], revision: 'r2' }

describe('atomic canvas saving', () => {
  test('ambiguous retry retains the complete request and inserted identities', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue(response)
    const writer = new CanvasWriter(empty, 'r1', send, vi.fn(), vi.fn())
    writer.change(paragraph)
    await writer.flush()
    expect(writer.state).toBe('failed')
    const request = structuredClone(send.mock.calls[0]![0])
    writer.change({ ...paragraph, blocks: [{ ...paragraph.blocks[0]!, text: 'Later writing' }] })
    await writer.flush()
    expect(send).toHaveBeenCalledTimes(1)
    await writer.retry()
    expect(send.mock.calls[1]![0]).toEqual(request)
    expect(writer.acknowledged).toEqual(paragraph)
    expect(writer.latest.blocks[0]?.text).toBe('Later writing')
    expect(writer.state).toBe('changed')
  })
  test('typing during a save remains unsaved until a separate atomic request', async () => {
    let resolve!: (page: PageView) => void
    const send = vi.fn().mockImplementationOnce(() => new Promise<PageView>((done) => { resolve = done })).mockResolvedValue({ ...response, revision: 'r3' })
    const writer = new CanvasWriter(empty, 'r1', send, vi.fn(), vi.fn())
    writer.change(paragraph)
    const saving = writer.flush()
    writer.change({ ...paragraph, blocks: [{ ...paragraph.blocks[0]!, text: 'Newer' }] })
    resolve(response)
    await saving
    expect(writer.state).toBe('changed')
    await writer.flush()
    expect(send.mock.calls[1]![0].base_revision).toBe('r2')
    expect(send.mock.calls[1]![0].mutation_id).not.toBe(send.mock.calls[0]![0].mutation_id)
    expect(writer.state).toBe('saved')
  })
  test('a replay returning newer server state preserves draft and stops further writes', async () => {
    const committed = vi.fn()
    const writer = new CanvasWriter(empty, 'r1', async () => ({ ...response, revision: 'r3', mutation: { mutation_id: 'retry', committed_revision: 'r2', replayed: true, created_task_ids: [] } }), vi.fn(), committed)
    writer.change(paragraph)
    await writer.flush()
    expect(writer.state).toBe('failed')
    expect(writer.latest).toEqual(paragraph)
    expect(committed).not.toHaveBeenCalled()
  })
})
