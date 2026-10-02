// @vitest-environment jsdom
/*
Data loss (#512): picked writing and a Task deleted together. The writing is
saved, then the Task goes to Trash, which moves the page's revision. That move
used to remount the editor, so the writing's removal left ProseMirror's history
with it and Undo could never bring it back. The page answering with only the
trashed Task gone is this editor's own act: it stays, history and all.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { PageView } from '../../../../shared/pages.js'
import type { CanvasEditor } from './schema.js'

const state = vi.hoisted(() => ({
  surfaces: [] as { editor: CanvasEditor; settle?: (taskIds: readonly string[]) => Promise<boolean> }[],
  answer: null as unknown,
  sent: [] as unknown[],
}))

// The surface stands in for the view: it mounts the editor (ProseMirror edits
// need a view) and hands the test what FolderCanvas gave it.
vi.mock('./CanvasSurface.js', async () => {
  const { useEffect } = await import('react')
  return {
    CanvasSurface: (props: { editor: CanvasEditor; onChange: (editor: CanvasEditor) => void; settle?: (taskIds: readonly string[]) => Promise<boolean> }) => {
      state.surfaces.push(props)
      useEffect(() => {
        const host = document.body.appendChild(document.createElement('div'))
        props.editor.mount(host)
        const off = props.editor.onChange(() => { props.onChange(props.editor) })
        return () => { off(); props.editor.unmount(); host.remove() }
      }, [props.editor])
      return null
    },
  }
})
vi.mock('../../../api/http.js', () => ({
  mutateApi: (_schema: unknown, request: { body: unknown }) => { state.sent.push(request.body); return Promise.resolve(state.answer) },
  getPlain: () => Promise.reject(new Error('not here')),
  uploadFile: () => Promise.reject(new Error('not here')),
}))
vi.mock('../../../api/queries.js', () => ({
  useMultiMemberFolderIds: () => new Set(),
  useFolderCompletedTasks: () => ({ data: undefined }),
}))
vi.mock('../../../views/work-view.js', () => ({ useCurrentWorkView: () => ['freeform', () => {}] }))

import FolderCanvas from './FolderCanvas.js'

afterEach(() => { cleanup(); state.surfaces = []; state.sent = []; sessionStorage.clear() })

const FOLDER = '00000000-0000-4000-8000-000000000001'
const TEXT = '00000000-0000-4000-8000-000000000002'
const TASK = '00000000-0000-4000-8000-000000000003'
const OTHER = '00000000-0000-4000-8000-000000000004'
const row = (id: string, words: string) => ({
  id, kind: 'paragraph', position: 0, page_position: 'a', section_block_id: null, list_parent_block_id: null, checked: null,
  rich_content: { version: 1, runs: [{ text: words }] }, text: words, file_id: null, file_width: null, file_height: null, ref_folder_id: null,
  width_pct: null, updated_at: '2026-10-02T00:00:00.000Z',
})
const pageOf = (revision: string, blocks: ReturnType<typeof row>[], tasks: string[]): PageView => ({
  revision,
  blocks,
  items: [...blocks.map((block) => ({ kind: 'block', id: block.id })), ...tasks.map((id) => ({ kind: 'task', id }))],
  task_placements: tasks.map((id) => ({ id, section_block_id: null })),
}) as unknown as PageView
const card = { id: TASK, title: 'Break in the new boots' }

function draw(page: PageView): { redraw: (page: PageView) => void } {
  const client = new QueryClient()
  const tree = (current: PageView) => <QueryClientProvider client={client}>
    <FolderCanvas page={current} folderId={FOLDER} arrangeable tasks={[card] as never} context={{ today: '2026-10-02', viewerId: 'me' } as never} actions={{} as never} onAsk={() => {}} />
  </QueryClientProvider>
  const view = render(tree(page))
  return { redraw: (next) => { view.rerender(tree(next)) } }
}
const surface = () => state.surfaces.at(-1)!

describe('writing deleted with a Task', () => {
  test('the Task leaving the page keeps the editor, so Undo brings the writing back', async () => {
    const { redraw } = draw(pageOf('r1', [row(TEXT, 'The boots are new'), row(OTHER, 'Kept')], [TASK]))
    const { editor } = surface()
    expect(editor.getBlock(TASK)).toBeDefined()

    // The writing leaves; the save lands; then the Task is trashed and the page answers without it.
    act(() => { editor.removeBlocks([TEXT]) })
    state.answer = pageOf('r2', [row(OTHER, 'Kept')], [TASK])
    let saved = false
    await act(async () => { saved = await surface().settle!([TASK]) })
    expect(saved).toBe(true)
    await act(async () => { redraw(pageOf('r3', [row(OTHER, 'Kept')], [])) })

    expect(surface().editor).toBe(editor)
    expect(editor.getBlock(TASK)).toBeUndefined()
    act(() => { editor.undo() })
    expect(editor.getBlock(TEXT)).toBeDefined()
    // The writing comes back on the page's new revision, and the Task stays in Trash.
    await act(async () => { await surface().settle!([]) })
    const body = state.sent.at(-1) as { base_revision: string; operations: { op: string; id?: string }[] }
    expect(body.base_revision).toBe('r3')
    expect(body.operations.some((op) => op.op === 'put_block' && op.id === TEXT)).toBe(true)
  })

  test('any other change to the page still reloads the editor', async () => {
    const { redraw } = draw(pageOf('r1', [row(TEXT, 'The boots are new'), row(OTHER, 'Kept')], [TASK]))
    const { editor } = surface()
    act(() => { editor.removeBlocks([TEXT]) })
    state.answer = pageOf('r2', [row(OTHER, 'Kept')], [TASK])
    await act(async () => { await surface().settle!([TASK]) })
    // Someone else edited too: not only the Task left.
    await act(async () => { redraw(pageOf('r3', [row(OTHER, 'Kept, and changed')], [])) })
    expect(surface().editor).not.toBe(editor)
  })
})
