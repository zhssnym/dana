import { describe, expect, it } from 'vitest'

import {
  START_AFTER_DUE,
  START_TIME_AFTER_DUE_TIME,
  clampScheduleResize,
  scheduleOrderError,
} from './task-schedule-picker.js'

describe('Task Schedule endpoint rules', () => {
  it('keeps direct resize on the correct side of the opposite endpoint', () => {
    expect(clampScheduleResize('start', '2026-10-20', null, '2026-10-12')).toBe('2026-10-12')
    expect(clampScheduleResize('due', '2026-10-01', '2026-10-05', null)).toBe('2026-10-05')
    expect(clampScheduleResize('start', '2026-10-01', null, '2026-10-12')).toBe('2026-10-01')
    expect(clampScheduleResize('due', '2026-10-20', '2026-10-05', null)).toBe('2026-10-20')
  })

  it('validates date and same-day time order without inventing missing times', () => {
    expect(scheduleOrderError('2026-10-12', '2026-10-05', null, null)).toBe(START_AFTER_DUE)
    expect(scheduleOrderError('2026-10-05', '2026-10-05', '17:00', '09:00')).toBe(
      START_TIME_AFTER_DUE_TIME,
    )
    expect(scheduleOrderError('2026-10-05', '2026-10-05', '17:00', null)).toBeNull()
    expect(scheduleOrderError('2026-10-05', '2026-10-06', '23:00', '01:00')).toBeNull()
  })
})
