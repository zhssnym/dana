/*
AC-1460: a task's timeline says what happened in the order it happened, and a
dropped task is never read as done (M4, the one task page).

The page draws its status mark, its Status row and each state event from
`taskState` and the timeline's `state` act. A dropped (stored `abandoned`)
task drawn with the done check would tell the reader work was finished that
was given up.
*/
import { describe, expect, test } from 'vitest'

import type { EventLine } from '../../../../shared/events.js'
import { taskState } from './state.js'
import { buildTimeline } from './timeline.js'

const ACTOR = '00000000-0000-4000-8000-000000000001'
const TASK = '00000000-0000-4000-8000-0000000000aa'

function line(id: number, verb: EventLine['verb'], at: string, detail: string | null = null): EventLine {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    actor_id: ACTOR,
    verb,
    subject_kind: 'task',
    subject_id: TASK,
    subject_name: 'Book the van',
    folder_id: null,
    detail,
    created_at: at,
  }
}

describe('AC-1460 the task timeline', () => {
  test('a dropped task is dropped, never done', () => {
    expect(taskState({ status: 'abandoned' })).toBe('dropped')
    expect(taskState({ status: 'completed' })).toBe('done')
    expect(taskState({ status: 'pending' })).toBe('open')
  })

  test('done, reopened and dropped read in order, each as itself', () => {
    const entries = buildTimeline({
      events: [
        line(3, 'abandoned', '2026-09-20T10:03:00.000Z'),
        line(1, 'completed', '2026-09-20T10:01:00.000Z'),
        line(2, 'reopened', '2026-09-20T10:02:00.000Z'),
      ],
      comments: [],
      dependsOn: [],
      blocks: [],
      nameOf: () => 'Maya',
    })
    expect(entries.map((entry) => (entry.kind === 'event' && entry.act.t === 'state' ? entry.act.state : null))).toEqual([
      'done',
      'open',
      'dropped',
    ])
  })
})
