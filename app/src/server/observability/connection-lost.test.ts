/*
The lost-connection report of issue #174, driven directly.

A unit file rather than a criterion for the same reason `database-fallback.test.ts`
is one: the condition cannot be produced through the API. A pooled connection has
to die under a running server, which the acceptance suite has no way to arrange,
and the leg-level test that does arrange it (`tests/guards/guard-postgres-leg-connection-loss.test.ts`)
measures the seam rather than the boot's wiring of it.

What is asserted is the whole of the rule: one line and one message per lost
connection, at warn level, carrying the code and the driver's message and
nothing else, with the tag and the fingerprint built from a code this module
whitelists rather than from whatever the driver handed it.
*/
import { describe, expect, test } from 'vitest'

import { createSecurityLogger } from '../security/log.js'
import {
  DATABASE_CONNECTION_LOST_EVENT,
  DATABASE_CONNECTION_LOST_MESSAGE,
  connectionLostCode,
  reportConnectionLost,
} from './connection-lost.js'
import type { ErrorTracker, MessageContext } from './error-tracker.js'

interface Line {
  fields: Record<string, unknown>
  message: string
}

function recorder(): {
  lines: Line[]
  warnings: Line[]
  log: ReturnType<typeof createSecurityLogger>
} {
  const lines: Line[] = []
  const warnings: Line[] = []
  const log = createSecurityLogger({
    info: (fields, message) => lines.push({ fields, message }),
    warn: (fields, message) => {
      lines.push({ fields, message })
      warnings.push({ fields, message })
    },
    error: (fields, message) => lines.push({ fields, message }),
  })
  return { lines, warnings, log }
}

function tracking(): {
  messages: { message: string; context: MessageContext | undefined }[]
  tracker: ErrorTracker
} {
  const messages: { message: string; context: MessageContext | undefined }[] = []
  return {
    messages,
    tracker: {
      captureException: () => undefined,
      captureMessage: (message, context) => messages.push({ message, context }),
    },
  }
}

describe('reportConnectionLost', () => {
  test('one warn line and one message, carrying the code and the message', () => {
    const { lines, warnings, log } = recorder()
    const { messages, tracker } = tracking()

    reportConnectionLost({
      event: { code: 'ECONNRESET', message: 'read ECONNRESET' },
      log,
      tracker,
    })

    expect(lines, 'one line, not one per query that failed with it').toHaveLength(1)
    expect(warnings, 'warn: the pool recovers, and the request failed on its own path')
      .toHaveLength(1)
    expect(warnings[0]?.fields.event).toBe(DATABASE_CONNECTION_LOST_EVENT)
    expect(warnings[0]?.fields.reason).toBe('ECONNRESET')
    expect(
      warnings[0]?.fields.note,
      'the driver message survives the 10.5 field guard rather than becoming other',
    ).toBe('read ECONNRESET')

    expect(messages).toHaveLength(1)
    expect(messages[0]?.message).toContain(DATABASE_CONNECTION_LOST_MESSAGE)
    expect(messages[0]?.message).toContain('ECONNRESET')
    expect(messages[0]?.context?.level).toBe('warning')
    expect(messages[0]?.context?.tags).toEqual({
      event: DATABASE_CONNECTION_LOST_EVENT,
      code: 'ECONNRESET',
    })
    expect(
      messages[0]?.context?.fingerprint,
      'grouped by code so a hundred resets are one issue (11.12)',
    ).toEqual([DATABASE_CONNECTION_LOST_EVENT, 'ECONNRESET'])
  })

  test('a code the driver did not give, or gave in an open-ended shape, is unknown', () => {
    expect(connectionLostCode(undefined)).toBe('unknown')
    expect(connectionLostCode('57P01')).toBe('57P01')
    expect(connectionLostCode('read of "tasks" failed')).toBe('unknown')
    expect(connectionLostCode('x'.repeat(64))).toBe('unknown')
  })

  test('a message that is not plain words reaches the log as other, never as itself', () => {
    const { warnings, log } = recorder()
    const { messages, tracker } = tracking()

    reportConnectionLost({
      event: {
        code: undefined,
        message: 'Failed query: select * from tasks where title = $1 -- {"a":1}',
      },
      log,
      tracker,
    })

    expect(warnings[0]?.fields.note).toBe('other')
    expect(warnings[0]?.fields.reason).toBe('unknown')
    expect(messages[0]?.message).not.toContain('tasks')
  })
})
