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
