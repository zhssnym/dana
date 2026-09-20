// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { PageBlock } from '../../../shared/pages.js'
import { BlocksEditor } from './BlocksEditor.js'

afterEach(cleanup)

function paragraph(id: string, position: number, text: string): PageBlock {
  return {
    id,
    kind: 'paragraph',
    list_parent_block_id: null,
    checked: null,
    position,
    page_position: null,
    section_block_id: null,
    text,
    file_id: null,
    file_width: null,
    file_height: null,
    ref_folder_id: null,
    width_pct: null,
    updated_at: '2026-09-04T12:00:00.000Z',
  }
}

describe('BlocksEditor writing-first composer', () => {
  test('writes a paragraph without choosing a block type first', () => {
    const put = vi.fn()
    render(<BlocksEditor blocks={[]} onPut={put} />)

    const editor = screen.getByRole('textbox', { name: 'Write something' })
    fireEvent.change(editor, { target: { value: 'A launch note' } })
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(put).toHaveBeenCalledWith([
      { kind: 'paragraph', position: 0, text: 'A launch note' },
    ])
  })

  test('continues writing after the paragraph that just landed', async () => {
    const put = vi.fn()
    const view = render(<BlocksEditor blocks={[]} onPut={put} />)

    const editor = screen.getByRole('textbox', { name: 'Write something' })
    fireEvent.change(editor, { target: { value: 'First thought' } })
    fireEvent.keyDown(editor, { key: 'Enter' })

    view.rerender(
      <BlocksEditor
        blocks={[paragraph('11111111-1111-4111-8111-111111111111', 0, 'First thought')]}
        onPut={put}
      />,
    )

    await waitFor(() => {
      const writingLines = screen.getAllByRole('textbox', { name: 'Write something' })
      expect(document.activeElement).toBe(writingLines.at(-1))
    })
  })

  test('slash and plus expose only Dana native insert choices', async () => {
    render(
      <BlocksEditor
        blocks={[]}
        onPut={vi.fn()}
        onCreateTask={vi.fn(async () => true)}
        folderId="11111111-1111-4111-8111-111111111111"
      />,
    )

    const editor = screen.getByRole('textbox', { name: 'Write something' })
    fireEvent.keyDown(editor, { key: '/' })

    await waitFor(() => expect(screen.getByText('Task')).toBeDefined())
    expect(screen.getByText('Section')).toBeDefined()
    expect(screen.getByText('Image')).toBeDefined()
    expect(screen.queryByText('Database')).toBeNull()
  })

  test('Control or Command plus Enter creates a task from the uncommitted line', async () => {
    const createTask = vi.fn(async () => true)
    render(<BlocksEditor blocks={[]} onPut={vi.fn()} onCreateTask={createTask} />)

    const editor = screen.getByRole('textbox', { name: 'Write something' })
    fireEvent.change(editor, { target: { value: 'Ship the release' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(createTask).toHaveBeenCalledWith('Ship the release', null))
  })

  test('Enter in stored prose splits it in one whole-page write', () => {
    const put = vi.fn()
    const stored = paragraph('11111111-1111-4111-8111-111111111111', 0, 'One two')
    render(<BlocksEditor blocks={[stored]} onPut={put} />)

    fireEvent.click(screen.getByText('One two'))
    const editor = screen.getByRole('textbox', { name: 'Paragraph' }) as HTMLTextAreaElement
    editor.setSelectionRange(3, 3)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(put).toHaveBeenCalledWith([
      expect.objectContaining({ id: stored.id, position: 0, text: 'One' }),
      { kind: 'paragraph', position: 1, text: 'two' },
    ])
  })

  test('the existing sortable engine reorders page blocks with the keyboard', () => {
    const put = vi.fn()
    const first = paragraph('11111111-1111-4111-8111-111111111111', 0, 'First')
    const second = paragraph('22222222-2222-4222-8222-222222222222', 1, 'Second')
    render(<BlocksEditor blocks={[first, second]} onPut={put} />)

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Reorder paragraph' })[0]!, {
      key: 'ArrowDown',
    })

    expect(put).toHaveBeenCalledWith([
      expect.objectContaining({ id: second.id, position: 0 }),
      expect.objectContaining({ id: first.id, position: 1 }),
    ])
  })
})
