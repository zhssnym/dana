import { describe, expect, test } from 'vitest'

import { createSecurityLogger } from './log.js'
import type { LogSink } from './log.js'

function recordingSink(lines: unknown[]): LogSink {
  const push =
    (level: 'info' | 'warn' | 'error') =>
    (fields: Record<string, unknown>, message: string): void => {
      lines.push({ level, fields, message })
    }
  return { info: push('info'), warn: push('warn'), error: push('error') }
}

describe('AC-103 logging privacy', () => {
  test('the policy never emits content carried by an arbitrary error', () => {
    const forbidden = [
      'private task title',
      'private task note',
      'private step title',
      'invitee@example.test',
      'oauth-token-value',
      'session-cookie-value',
    ]
    const lines: unknown[] = []
    const logger = createSecurityLogger(recordingSink(lines))

    logger.authEvent('sign_in_failed', { reason: forbidden.join(' ') })
    logger.reminderEvent('reminder_send_failed', {
      taskId: '00000000-0000-4000-8000-000000000001',
      reason: forbidden.join(' '),
    })
    logger.requestError({
      method: 'POST',
      path: '/api/v1/tasks/:id',
      status: 500,
      error: new Error(forbidden.join(' ')),
    })
    logger.operation('info', 'notification_configuration', {
      template: forbidden.join(' '),
      database: forbidden.join(' '),
      missing: forbidden.join(' '),
    })
    logger.unknownRequestFields({
      route: forbidden.join(' '),
      fields: forbidden,
    })

    const emitted = JSON.stringify(lines)
    for (const secret of forbidden) expect(emitted).not.toContain(secret)
    expect(emitted).toContain('request_failed')
  })

  test('a failed reminder is emitted at error level', () => {
    const lines: unknown[] = []
    const logger = createSecurityLogger(recordingSink(lines))
    logger.reminderEvent('reminder_send_failed', {
      taskId: '00000000-0000-4000-8000-000000000001',
      reason: 'TypeError',
    })
    expect(lines).toEqual([
      {
        level: 'error',
        fields: {
          event: 'reminder_send_failed',
          task_id: '00000000-0000-4000-8000-000000000001',
          reason: 'TypeError',
        },
        message: 'reminder',
      },
    ])
  })
})

/*
Issue #104's line, whose two fields are both caller-influenced: a route label
this application builds out of `req.baseUrl`, which is concrete rather than a
template, and key names the caller chose outright. 10.5's promise is that the
logger has no parameter user content can reach, so the whitelists are asserted
here rather than trusted to `parseBody`'s care.
*/
describe('unknown request fields (10.5, issue #104)', () => {
  test('warn level, with the route and the key names and nothing else', () => {
    const lines: unknown[] = []
    createSecurityLogger(recordingSink(lines)).unknownRequestFields({
      route: 'PATCH /api/v1/folders/:id',
      fields: ['colour', 'colour', 'cover_file_id'],
    })
    expect(lines).toEqual([
      {
        level: 'warn',
        fields: {
          event: 'unknown_request_fields',
          route: 'PATCH /api/v1/folders/:id',
          fields: ['colour', 'cover_file_id'],
          count: 2,
        },
        message: 'unknown request fields',
      },
    ])
  })

  test('a route label carrying a row id is refused rather than repaired', () => {
    /* Every router in this application is mounted at a literal path today, so
       this cannot fire; it is the guard for the day one is mounted under a
       parameterised one, when `req.baseUrl` would carry a concrete uuid. */
    const lines: { fields: Record<string, unknown> }[] = []
    const logger = createSecurityLogger(recordingSink(lines as unknown[]))
    logger.unknownRequestFields({
      route: 'GET /api/v1/tasks/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/steps',
      fields: ['x'],
    })
    logger.unknownRequestFields({ route: 'NOT A ROUTE AT ALL', fields: ['x'] })
    expect(lines.map((line) => line.fields['route'])).toEqual(['other', 'other'])
  })
})
