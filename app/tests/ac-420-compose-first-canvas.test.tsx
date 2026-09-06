// @vitest-environment jsdom
/* AC-420: the approved compose-first interaction is the production folder
 * canvas, including the collapsed-Section seam and #177 video treatment. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ComposeCanvas } from '../src/client/components/page/ComposeCanvas.js'
import type { PageBlock } from '../src/shared/pages.js'
import type { RowContext } from '../src/client/parts/presenters.js'
import type { RowActions } from '../src/client/parts/useRowActions.js'

afterEach(cleanup)

const FIRST = '00000000-0000-4000-8000-000000000001'
const CHILD = '00000000-0000-4000-8000-000000000002'
const SECOND = '00000000-0000-4000-8000-000000000003'

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

describe('AC-420 production compose-first canvas', () => {
  test('the collapsed Section plus inserts after its complete hidden span into No section', async () => {
    const onAction = vi.fn(async () => ({ blocks: [], items: [] }))
    render(
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
    fireEvent.click(within(first as HTMLElement).getByRole('button', { name: 'Insert into page' }))
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

  test('only YouTube/Vimeo embed; direct media stays the ordinary external link', () => {
    const direct = block(FIRST, 'paragraph', 'Watch https://example.test/movie.mp4', null)
    const youtube = block(CHILD, 'paragraph', 'Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ', null)
    render(
      <ComposeCanvas
        blocks={[direct, youtube]}
        items={[{ kind: 'block', id: FIRST }, { kind: 'block', id: CHILD }]}
        tasks={[]}
        folderId="00000000-0000-4000-8000-000000000004"
        context={{} as RowContext}
        actions={{} as RowActions}
        onAsk={() => {}}
        onAction={async () => ({ blocks: [], items: [] })}
      />,
    )
    expect(document.querySelector('video')).toBeNull()
    expect(screen.getByRole('link', { name: 'https://example.test/movie.mp4' })).toBeDefined()
    expect(screen.getByTitle('YouTube video').getAttribute('src')).toContain('youtube-nocookie.com')
  })
})
