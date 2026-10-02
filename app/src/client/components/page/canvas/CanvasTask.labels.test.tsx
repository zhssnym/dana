// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TaskCard } from '../../../../shared/tasks.js'
import type { RowContext } from '../../../parts/presenters.js'

vi.mock('../../../api/queries.js', () => ({
  useTask: () => ({ data: undefined, isError: false }),
  useTaskDependencies: () => ({ data: undefined }),
}))

import { CanvasTask, CanvasTaskProvider } from './CanvasTask.js'

afterEach(cleanup)

const task: TaskCard = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Ship labels',
  status: 'pending',
  important: false,
  start_date: null,
  start_time: null,
  due_date: null,
  due_time: null,
  folder: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Dana',
    is_default: false,
  },
  assignee: null,
  assignees: [],
  is_recurring: false,
  recurrence_rule: null,
  steps_done: 0,
  steps_total: 0,
  pulled: false,
  pending_invite_email: null,
  section_block_id: null,
  created_by: null,
  labels: {
    personal: [],
    folder: [{
      id: '00000000-0000-4000-8000-000000000003',
      scope: 'folder',
      name: 'enhancement',
      color: '#22C55E',
      archived: false,
      folder_id: '00000000-0000-4000-8000-000000000002',
    }],
  },
  blocked_by_count: 0,
  blocks_count: 0,
  created_at: '2026-10-02T00:00:00.000Z',
  updated_at: '2026-10-02T00:00:00.000Z',
}

const context: RowContext = {
  today: '2026-10-02',
  viewerId: null,
  folders: [],
}

const actions = {
  onOpenTask: vi.fn(),
  onToggleComplete: vi.fn(),
  onToggleImportant: vi.fn(),
  onRestore: vi.fn(),
  onDelete: vi.fn(),
} as unknown as Parameters<typeof CanvasTaskProvider>[0]['actions']

describe('Work task Labels', () => {
  it.each([
    ['Thread', false],
    ['Freeform', true],
  ] as const)('draws the applied Label in %s rows', (_name, freeform) => {
    render(
      <CanvasTaskProvider
        tasks={[task]}
        context={context}
        actions={actions}
        onAsk={vi.fn()}
        freeform={freeform}
      >
        <CanvasTask taskId={task.id} />
      </CanvasTaskProvider>,
    )

    const row = screen.getByRole('listitem')
    expect(within(row).getAllByText('enhancement').length).toBeGreaterThan(0)
  })
})
