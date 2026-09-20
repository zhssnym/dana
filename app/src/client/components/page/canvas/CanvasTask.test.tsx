// @vitest-environment jsdom

/*
What a `danaTask` block draws, and it is four different things.

**Nothing in this repository named `CanvasTask` or `ResolvedTask` before this
file.** The component decides, for every Task block on a folder page, between a
row, a blank that occupies nothing, and a line saying the Task is gone — and
every one of those decisions lived in one nested ternary that no test in either
direction touched. Four edits were made to it while this file was written, to
find out what each case is worth, and each is named here with what went red:

- collapsing the ternary to `task === undefined || task.status === 'completed'
  ? null : …`, the plausible tidy-up, deletes "This Task is unavailable. Its
  place is preserved." from the product. One case, the last one below;
- reading "absent from the open list" as "draws nothing", which is what the
  first clause of that sentence tempts you into, loses the over-cap Task as
  well. Two cases;
- dropping the `data-canvas-task-blank` marker leaves the finished block as the
  6px hole this file was written beside. Two cases;
- handing `TaskRows` the wrong Task, `tasks={[]}`, takes both drawn cases.

Before this file, all four were green.

**The blank cases are asserted on the marker and not on the emptiness**, which
is the difference between this file and a weaker version of it. `null` alone
still leaves 6px of `.bn-block-content` padding in the middle of the writing —
measured at 6px on the running page — so "renders nothing" is not the property
worth pinning; "is marked, so that `canvas.css` can collapse it" is. The CSS
that reads `data-canvas-task-blank` is not exercised here, jsdom having no
layout, and the browser leg is where the height was measured.

**`TaskRows` is stubbed, deliberately.** The real one reaches `useMe`,
`useFolders`, four mutation hooks and the undo stack, and this component
decides nothing about any of them. What it does decide is *whether* a row is
drawn and *which* Task is handed to it, and the stub is what makes both
readable. `useTask` is stubbed because the by-id fallback is a network read
whose three states — pending, a Task, no Task — are three of the branches.
*/

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { RowContext } from '../../../parts/presenters.js'
import type { RowActions } from '../../../parts/useRowActions.js'
import type { TaskCard } from '../../../../shared/tasks.js'

const useTask = vi.hoisted(() => vi.fn())
const drawn = vi.hoisted(() => vi.fn<(tasks: readonly TaskCard[]) => void>())

vi.mock('../../../api/queries.js', () => ({ useTask }))
vi.mock('../../../pages/task-rows.js', () => ({
  TaskRows: ({ tasks }: { tasks: readonly TaskCard[] }) => {
    drawn(tasks)
    return <div data-testid="task-rows">{tasks.map((task) => task.title).join(', ')}</div>
  },
}))

import { CanvasTask, CanvasTaskProvider } from './CanvasTask.js'

/* Testing Library unmounts between tests only under `globals: true`, which
   this config does not set. See components/person-face.test.tsx. */
afterEach(() => {
  cleanup()
  useTask.mockReset()
  drawn.mockReset()
})

const LISTED = '00000000-0000-4000-8000-0000000000a1'
const FINISHED = '00000000-0000-4000-8000-0000000000a2'
const BEYOND_CAP = '00000000-0000-4000-8000-0000000000a3'
const GONE = '00000000-0000-4000-8000-0000000000a4'

/** Every field 7.0 gives a TaskCard, so a case fails on the thing it names. */
function card(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: LISTED,
    title: 'Send the venue deposit',
    status: 'pending',
    important: false,
    start_date: null,
    due_date: null,
    due_time: null,
    folder: { id: '00000000-0000-4000-8000-0000000000b1', name: 'Work', is_default: false },
    assignee: null,
    is_recurring: false,
    steps_done: 0,
    steps_total: 0,
    pulled: false,
    pending_invite_email: null,
    section_block_id: null,
    created_by: null,
    labels: { personal: [], folder: [] },
    created_at: '2026-08-01T09:00:00.000Z',
    updated_at: '2026-08-01T09:00:00.000Z',
    ...overrides,
  }
}

/* The page facts a row needs. Nothing below reads one, the row being stubbed;
   they are spelled out because the provider takes `TaskRows`' own prop types
   and a shape that drifts should fail the typecheck here. */
const context: RowContext = { today: '2026-08-01', viewerId: null, folders: [] }
const actions: RowActions = {
  onToggleComplete: vi.fn(), onToggleImportant: vi.fn(), onRestore: vi.fn(),
  onRemoveFromMyDay: vi.fn(), onAbandon: vi.fn(), onOpenTask: vi.fn(),
  onDelete: vi.fn(), onDeleteMany: vi.fn(), onMoveToColumn: vi.fn(),
  starTooltipMode: 'inward',
}

/** What the by-id read answers: pending, or settled with a Task or without one. */
function answers(state: { data?: TaskCard; isPending: boolean }): void {
  useTask.mockReturnValue({ data: state.data, isPending: state.isPending })
}

function draw(taskId: string, open: readonly TaskCard[]): void {
  render(
    <CanvasTaskProvider tasks={open} context={context} actions={actions} onAsk={() => {}}>
      <CanvasTask taskId={taskId} />
    </CanvasTaskProvider>,
  )
}

/** The block itself, which keeps its `page_position` whatever it draws. */
function block(taskId: string): HTMLElement {
  const element = document.querySelector(`[data-canvas-task-id="${taskId}"]`)
  expect(element, `the block for ${taskId} keeps its place in the document`).not.toBeNull()
  return element as HTMLElement
}

describe('a Task block draws its open row, its blank place, or the line saying it is gone', () => {
  test('a Task in the open list is drawn as its row', () => {
    answers({ isPending: false })
    draw(LISTED, [card()])

    expect(screen.getByTestId('task-rows').textContent).toBe('Send the venue deposit')
    expect(drawn.mock.calls[0]?.[0].map((task) => task.id)).toEqual([LISTED])
    /* And no by-id read is made for a Task the page already holds. */
    expect(useTask).toHaveBeenCalledWith(null)
    expect(block(LISTED).hasAttribute('data-canvas-task-blank')).toBe(false)
  })

  test('a Task that has left the open list and resolves completed draws nothing and is marked blank', () => {
    answers({ data: card({ id: FINISHED, title: 'Book the hall', status: 'completed' }), isPending: false })
    draw(FINISHED, [])

    /* 9.6 puts the finished pile in Done, so the body draws no second copy. */
    expect(screen.queryByTestId('task-rows')).toBeNull()
    expect(drawn).not.toHaveBeenCalled()
    expect(screen.queryByText('Book the hall')).toBeNull()
    /* And the block takes no room, which `null` on its own does not give:
       canvas.css reads this attribute to collapse BlockNote's block padding. */
    expect(block(FINISHED).hasAttribute('data-canvas-task-blank')).toBe(true)
    expect(block(FINISHED).getAttribute('aria-hidden')).toBe('true')
  })

  test('the block keeps its place and takes no room while the by-id read is still out', () => {
    answers({ isPending: true })
    draw(FINISHED, [])

    expect(screen.queryByTestId('task-rows')).toBeNull()
    /* Not "This Task is unavailable": an answer that has not arrived is not an
       absence, and the answer is usually "this one belongs to Done". */
    expect(screen.queryByRole('status')).toBeNull()
    expect(block(FINISHED).hasAttribute('data-canvas-task-blank')).toBe(true)
  })

  test('a Task past Q7 row cap is open, is absent from the page list, and is still drawn', () => {
    answers({ data: card({ id: BEYOND_CAP, title: 'Confirm the caterer' }), isPending: false })
    draw(BEYOND_CAP, [])

    expect(screen.getByTestId('task-rows').textContent).toBe('Confirm the caterer')
    expect(useTask).toHaveBeenCalledWith(BEYOND_CAP)
    expect(block(BEYOND_CAP).hasAttribute('data-canvas-task-blank')).toBe(false)
  })

  test('a Task gone since this document was hydrated says so, and the block keeps its place', () => {
    answers({ isPending: false })
    draw(GONE, [])

    expect(screen.getByRole('status').textContent).toBe('This Task is unavailable. Its place is preserved.')
    expect(screen.queryByTestId('task-rows')).toBeNull()
    /* Drawn rather than collapsed: there is no Done entry to find this one in,
       so this line is the only account the page gives of the gap. */
    expect(block(GONE).hasAttribute('data-canvas-task-blank')).toBe(false)
  })

  test('a Task block outside the provider says the same thing rather than throwing', () => {
    answers({ isPending: false })
    render(<CanvasTask taskId={GONE} />)

    expect(screen.getByRole('status').textContent).toBe('This Task is unavailable. Its place is preserved.')
  })
})
