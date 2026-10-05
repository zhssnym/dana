/*
AC-1508: the Focus group is the viewer's stored lists (Today, Upcoming and
Assigned by default, plus any list added from the "+"), less Assigned unless the
viewer is on a shared page. Upcoming's rows (tomorrow on, never Today's
groups) are the server's since GET /views/focus (server/views/focus.ts).
*/
import { describe, expect, test } from 'vitest'

import { DEFAULT_FOCUS_LISTS } from '../../shared/bundle.js'
import { focusRows } from './focus-lists.js'

describe('AC-1508 Focus lists', () => {
  test('AC-1508 a solo viewer sees the defaults less Assigned; a shared one also Assigned', () => {
    expect(focusRows(DEFAULT_FOCUS_LISTS, false).map((list) => list.name)).toEqual(['Today', 'Upcoming'])
    expect(focusRows(DEFAULT_FOCUS_LISTS, true).map((list) => list.name)).toEqual(['Today', 'Upcoming', 'Assigned'])
  })

  test('AC-1508 an added list is drawn in its stored place, and Assigned stays hidden when solo', () => {
    const stored = ['overdue', 'today', 'assignments', 'scheduled'] as const
    expect(focusRows(stored, false).map((list) => list.key)).toEqual(['overdue', 'today', 'scheduled'])
    expect(focusRows(stored, true).map((list) => list.key)).toEqual(['overdue', 'today', 'assignments', 'scheduled'])
  })
})
