/*
AC-1480: the Focus group is Today and Upcoming, plus Assigned only on a shared
page; Upcoming starts tomorrow and never repeats Today's groups.
*/
import { describe, expect, test } from 'vitest'

import type { TaskCard } from '../../shared/tasks.js'
import { focusRows, upcomingRows } from './focus-lists.js'

const TODAY = '2026-09-24'

function task(id: string, due: string | null, start: string | null = null, pulled = false): TaskCard {
  return { id, status: 'pending', due_date: due, start_date: start, due_time: null, pulled } as unknown as TaskCard
}

describe('AC-1480 Focus lists', () => {
  test('AC-1480 a solo viewer sees exactly Today and Upcoming; a shared one also Assigned', () => {
    expect(focusRows(false).map((list) => list.name)).toEqual(['Today', 'Upcoming'])
    expect(focusRows(true).map((list) => list.name)).toEqual(['Today', 'Upcoming', 'Assigned'])
  })

  test('AC-1480 Upcoming keeps tomorrow on and drops late, started, due-today and pulled work', () => {
    const rows = [
      task('late', '2026-09-20'),
      task('started', '2026-09-30', '2026-09-22'),
      task('today', TODAY),
      task('tomorrow', '2026-09-25'),
      task('later', '2026-11-02'),
      task('starts-later', null, '2026-09-27'),
      task('pulled-later', '2026-11-20', null, true),
    ]
    expect(upcomingRows(rows, TODAY).map((row) => row.id)).toEqual(['tomorrow', 'later', 'starts-later'])
  })
})
