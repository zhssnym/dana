// @vitest-environment jsdom
/* AC-420: the approved compose-first interaction is the production folder
 * canvas, including the collapsed-Section seam and #177 video treatment. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ComposeCanvas } from '../src/client/components/page/ComposeCanvas.js'
import type { PageBlock } from '../src/shared/pages.js'
import type { TaskCard } from '../src/shared/tasks.js'
import type { RowContext } from '../src/client/parts/presenters.js'
import type { RowActions } from '../src/client/parts/useRowActions.js'

afterEach(cleanup)

const FIRST = '00000000-0000-4000-8000-000000000001'
const CHILD = '00000000-0000-4000-8000-000000000002'
const SECOND = '00000000-0000-4000-8000-000000000003'

function renderCanvas(canvas: React.ReactNode): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={new QueryClient()}>{canvas}</QueryClientProvider>,
  )
}

function block(
  id: string,
  kind: PageBlock['kind'],
  text: string,
  sectionId: string | null,
): PageBlock {
  return {
    id,
    kind,
    position: 0,
    page_position: 'a0',
    section_block_id: sectionId,
    text,
    file_id: null,
    file_width: null,
    file_height: null,
    ref_folder_id: null,
    width_pct: null,
    updated_at: '2026-09-06T00:00:00.000Z',
  }
}

function task(id: string, title: string, sectionId: string | null): TaskCard {
  return {
    id,
    title,
    status: 'pending',
    important: false,
    due_date: null,
    due_time: null,
    folder: { id: '00000000-0000-4000-8000-000000000004', name: 'Folder', is_default: false },
    assignee: null,
    is_recurring: false,
    steps_done: 0,
    steps_total: 0,
    pulled: false,
    pending_invite_email: null,
    section_block_id: sectionId,
    created_by: null,
    created_at: '2026-09-06T00:00:00.000Z',
    updated_at: '2026-09-06T00:00:00.000Z',
  }
}

function writeEditor(editor: HTMLElement, text: string): void {
  editor.textContent = text
  fireEvent.input(editor)
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

describe('AC-420 production compose-first canvas', () => {
  test('prose-to-prose stays chrome-free while a boundary between native tasks owns a plus', () => {
    const paragraphA = block(FIRST, 'paragraph', 'First paragraph', null)
    const paragraphB = block(CHILD, 'paragraph', 'Second paragraph', null)
    const taskA = task('00000000-0000-4000-8000-000000000005', 'First task', null)
    const taskB = task('00000000-0000-4000-8000-000000000006', 'Second task', null)
    const view = renderCanvas(
      <ComposeCanvas
        blocks={[paragraphA, paragraphB]}
        items={[{ kind: 'block', id: paragraphA.id }, { kind: 'block', id: paragraphB.id }]}
        tasks={[]}
        folderId="00000000-0000-4000-8000-000000000004"
        context={{} as RowContext}
        actions={{} as RowActions}
        onAsk={() => {}}
        onAction={async () => ({ blocks: [], items: [] })}
      />,
    )

    const firstParagraph = document.querySelector<HTMLElement>(`[data-canvas-node-id="${paragraphA.id}"]`)
    expect(firstParagraph).not.toBeNull()
    expect(
      within(firstParagraph as HTMLElement).queryByRole('button', { name: 'Add between items' }),
      'two paragraphs already express a continuous writing boundary, so a plus there is repeated chrome',
    ).toBeNull()

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ComposeCanvas
          blocks={[]}
          items={[{ kind: 'task', id: taskA.id }, { kind: 'task', id: taskB.id }]}
          tasks={[taskA, taskB]}
          folderId="00000000-0000-4000-8000-000000000004"
          context={{ today: '2026-09-06', viewerId: null, folders: [] } as RowContext}
          actions={{} as RowActions}
          onAsk={() => {}}
          onAction={async () => ({ blocks: [], items: [] })}
        />
      </QueryClientProvider>,
    )

    const firstTask = document.querySelector<HTMLElement>(`[data-canvas-node-id="${taskA.id}"]`)
    expect(firstTask).not.toBeNull()
    expect(
      within(firstTask as HTMLElement).getByRole('button', { name: 'Add between items' }),
      'adjacent native rows need a structural insertion boundary for Section, Image, or Task',
    ).toBeDefined()
  })

  test('an empty page offers one explicit writing action and prose carries no plus', () => {
    renderCanvas(
      <ComposeCanvas
        blocks={[]}
        items={[]}
        tasks={[]}
        folderId="00000000-0000-4000-8000-000000000004"
        context={{} as RowContext}
        actions={{} as RowActions}
        onAsk={() => {}}
        onAction={async () => ({ blocks: [], items: [] })}
      />,
    )

    const starter = screen.getByRole('button', { name: 'Do or write something…' })
    fireEvent.click(starter)

    expect(screen.getByRole('textbox', { name: 'Page paragraph' })).toBeDefined()
    expect(
      screen.queryByRole('button', { name: /^(?:Add to page|Add between items)$/ }),
      'once prose is active, slash is its structural path; a persistent plus would put the repeated chrome back',
    ).toBeNull()
  })

  test('prose can be composed into the exact gap between two native task rows', async () => {
    const taskA = task('00000000-0000-4000-8000-000000000005', 'First task', null)
    const taskB = task('00000000-0000-4000-8000-000000000006', 'Second task', null)
    const onAction = vi.fn(async () => ({ blocks: [], items: [] }))
    renderCanvas(
      <ComposeCanvas
        blocks={[]}
        items={[{ kind: 'task', id: taskA.id }, { kind: 'task', id: taskB.id }]}
        tasks={[taskA, taskB]}
        folderId="00000000-0000-4000-8000-000000000004"
        context={{ today: '2026-09-06', viewerId: null, folders: [] } as RowContext}
        actions={{} as RowActions}
        onAsk={() => {}}
        onAction={onAction}
      />,
    )

    const firstTask = document.querySelector<HTMLElement>(`[data-canvas-node-id="${taskA.id}"]`)
    expect(firstTask).not.toBeNull()
    fireEvent.click(within(firstTask as HTMLElement).getByRole('button', { name: 'Write here' }))
    const editor = screen.getByRole('textbox', { name: 'Page paragraph' })
    writeEditor(editor, 'A note between tasks')
    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => expect(onAction).toHaveBeenCalledWith({
      action: 'insert_block',
      block_kind: 'paragraph',
      text: 'A note between tasks',
      section_block_id: null,
      after: { kind: 'task', id: taskA.id },
      before: { kind: 'task', id: taskB.id },
    }))
  })

  test('slash on active prose opens the three native structural choices', async () => {
    renderCanvas(
      <ComposeCanvas
        blocks={[]}
        items={[]}
        tasks={[]}
        folderId="00000000-0000-4000-8000-000000000004"
        context={{} as RowContext}
        actions={{} as RowActions}
        onAsk={() => {}}
        onAction={async () => ({ blocks: [], items: [] })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Do or write something…' }))
    const editor = screen.getByRole('textbox', { name: 'Page paragraph' })
    writeEditor(editor, '/')

    await waitFor(() => expect(screen.getByText('Add here')).toBeDefined())
    expect(screen.getByRole('menuitem', { name: /^Task/ })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: /^Section/ })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: /^Image/ })).toBeDefined()
  })

  test.each([
    ['Control', { ctrlKey: true }],
    ['Command', { metaKey: true }],
  ] as const)('%s plus Enter turns the active line into a real task at that gap', async (_name, modifier) => {
    const onAction = vi.fn(async () => ({ blocks: [], items: [] }))
    renderCanvas(
      <ComposeCanvas
        blocks={[]}
        items={[]}
        tasks={[]}
        folderId="00000000-0000-4000-8000-000000000004"
        context={{} as RowContext}
        actions={{} as RowActions}
        onAsk={() => {}}
        onAction={onAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Do or write something…' }))
    const editor = screen.getByRole('textbox', { name: 'Page paragraph' })
    writeEditor(editor, 'Ship the calm composer')
    fireEvent.keyDown(editor, { key: 'Enter', ...modifier })

    await waitFor(() => expect(onAction).toHaveBeenCalledWith({
      action: 'insert_task',
      title: 'Ship the calm composer',
      section_block_id: null,
      after: null,
      before: null,
    }))
  })

  test('Enter commits a paragraph while Shift+Enter remains a soft break in the same editor', async () => {
    const onAction = vi.fn(async () => ({ blocks: [], items: [] }))
    renderCanvas(
      <ComposeCanvas
        blocks={[]}
        items={[]}
        tasks={[]}
        folderId="00000000-0000-4000-8000-000000000004"
        context={{} as RowContext}
        actions={{} as RowActions}
        onAsk={() => {}}
        onAction={onAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Do or write something…' }))
    const editor = screen.getByRole('textbox', { name: 'Page paragraph' })
    writeEditor(editor, 'One composed thought')

    expect(
      fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true }),
      'Shift+Enter is left to the contenteditable as a soft break',
    ).toBe(true)
    expect(onAction).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Page paragraph' })).toBe(editor)

    expect(
      fireEvent.keyDown(editor, { key: 'Enter' }),
      'plain Enter is consumed by the canvas and becomes a durable paragraph boundary',
    ).toBe(false)
    await waitFor(() => expect(onAction).toHaveBeenCalledWith({
      action: 'insert_block',
      block_kind: 'paragraph',
      text: 'One composed thought',
      section_block_id: null,
      after: null,
      before: null,
    }))
  })

  test('the collapsed Section plus inserts after its complete hidden span into No section', async () => {
    const onAction = vi.fn(async () => ({ blocks: [], items: [] }))
    renderCanvas(
      <ComposeCanvas
        blocks={[
          block(FIRST, 'section', 'First', null),
          block(CHILD, 'paragraph', 'Hidden child', FIRST),
          block(SECOND, 'section', 'Second', null),
        ]}
        items={[
          { kind: 'block', id: FIRST },
          { kind: 'block', id: CHILD },
          { kind: 'block', id: SECOND },
        ]}
        tasks={[]}
        folderId="00000000-0000-4000-8000-000000000004"
        context={{} as RowContext}
        actions={{} as RowActions}
        onAsk={() => {}}
        onAction={onAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse section First' }))
    expect(screen.queryByText('Hidden child')).toBeNull()
    const first = screen.getByRole('heading', { name: 'First' }).closest('[data-canvas-node-id]')
    expect(first).not.toBeNull()
    fireEvent.click(within(first as HTMLElement).getByRole('button', { name: 'Add between items' }))
    await waitFor(() => expect(screen.getByText('Add to No section')).toBeDefined())
    fireEvent.click(screen.getByText('Task'))

    await waitFor(() => expect(onAction).toHaveBeenCalledWith({
      action: 'insert_task',
      title: 'New task',
      section_block_id: null,
      after: { kind: 'block', id: CHILD },
      before: { kind: 'block', id: SECOND },
    }))
  })

  test('links stay semantic while YouTube and Vimeo receive safe video previews', () => {
    const direct = block(FIRST, 'paragraph', 'Watch https://example.test/movie.mp4', null)
    const youtube = block(CHILD, 'paragraph', 'Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ', null)
    const vimeo = block(SECOND, 'paragraph', 'Review [the cut](https://vimeo.com/76979871)', null)
    renderCanvas(
      <ComposeCanvas
        blocks={[direct, youtube, vimeo]}
        items={[{ kind: 'block', id: FIRST }, { kind: 'block', id: CHILD }, { kind: 'block', id: SECOND }]}
        tasks={[]}
        folderId="00000000-0000-4000-8000-000000000004"
        context={{} as RowContext}
        actions={{} as RowActions}
        onAsk={() => {}}
        onAction={async () => ({ blocks: [], items: [] })}
      />,
    )
    const directLink = screen.getByRole('link', { name: 'https://example.test/movie.mp4' })
    expect(directLink.getAttribute('href')).toBe('https://example.test/movie.mp4')
    expect(directLink.getAttribute('target')).toBe('_blank')
    expect(directLink.getAttribute('rel')).toBe('noreferrer')
    const labelledLink = screen.getByRole('link', { name: 'the cut' })
    expect(labelledLink.getAttribute('href')).toBe('https://vimeo.com/76979871')
    expect(screen.getByTitle('YouTube video').getAttribute('src')).toContain('youtube-nocookie.com')
    expect(screen.getByTitle('Vimeo video').getAttribute('src')).toBe('https://player.vimeo.com/video/76979871')
    expect(document.querySelector('video')).toBeNull()

    labelledLink.addEventListener('click', (event) => { event.preventDefault() })
    fireEvent.click(labelledLink)
    expect(
      screen.queryByRole('textbox', { name: 'Page paragraph' }),
      'following a semantic link must not also turn its containing prose into an editor',
    ).toBeNull()
  })

  test('a selected sort replaces task slots inside each Section without moving page blocks', () => {
    const zulu = task('00000000-0000-4000-8000-000000000005', 'Zulu task', FIRST)
    const alpha = task('00000000-0000-4000-8000-000000000006', 'Alpha task', FIRST)
    renderCanvas(
      <ComposeCanvas
        blocks={[
          block(FIRST, 'section', 'First', null),
          block(CHILD, 'paragraph', 'A fixed note', FIRST),
        ]}
        items={[
          { kind: 'block', id: FIRST },
          { kind: 'task', id: zulu.id },
          { kind: 'block', id: CHILD },
          { kind: 'task', id: alpha.id },
        ]}
        sourceTasks={[zulu, alpha]}
        tasks={[alpha, zulu]}
        sortActive
        arrangeable={false}
        folderId="00000000-0000-4000-8000-000000000004"
        context={{ today: '2026-09-06', viewerId: null, folders: [] } as RowContext}
        actions={{} as RowActions}
        onAsk={() => {}}
        onAction={async () => ({ blocks: [], items: [] })}
      />,
    )
    expect(
      [...document.querySelectorAll<HTMLElement>('[data-canvas-node-id]')]
        .map((node) => node.dataset['canvasNodeId']),
    ).toEqual([FIRST, alpha.id, CHILD, zulu.id])
    expect(screen.getByText('A fixed note').closest('[draggable]')?.getAttribute('draggable')).toBe('false')
  })
})
