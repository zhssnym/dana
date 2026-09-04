/*
The production fallback report of issue #80, driven directly.

A unit file rather than a criterion because the condition it describes cannot
be produced through the API: it is a property of how `main()` was configured,
and `main()` binds a port, migrates a database and starts the scheduler, so
nothing inside it can be asserted without booting a process. That is exactly
why the decision was extracted into one function — the boot then holds four
lines of wiring and no judgement.

What is asserted is the whole of the rule: it fires in production on the
embedded engine and nowhere else, it says the same words down both paths, and
those words survive the 10.5 logger's own field guard rather than being
replaced by "other".
*/
import { describe, expect, test } from 'vitest'

import { createSecurityLogger } from '../security/log.js'
import {
  DATABASE_FALLBACK_EVENT,
  DATABASE_FALLBACK_MESSAGE,
  reportDatabaseFallback,
} from './database-fallback.js'
import type { ErrorTracker, MessageContext } from './error-tracker.js'

interface Line {
  fields: Record<string, unknown>
  message: string
}

function recorder(): {
  lines: Line[]
  errors: Line[]
  log: ReturnType<typeof createSecurityLogger>
} {
  const lines: Line[] = []
  const errors: Line[] = []
  const log = createSecurityLogger({
    info: (fields, message) => lines.push({ fields, message }),
    warn: (fields, message) => lines.push({ fields, message }),
    error: (fields, message) => {
      lines.push({ fields, message })
      errors.push({ fields, message })
    },
  })
  return { lines, errors, log }
}

function tracking(): {
  messages: Array<{ message: string; context: MessageContext | undefined }>
  tracker: ErrorTracker
} {
  const messages: Array<{ message: string; context: MessageContext | undefined }> =
    []
  return {
    messages,
    tracker: {
      captureException: () => undefined,
      captureMessage: (message, context) => messages.push({ message, context }),
    },
  }
}

describe('reportDatabaseFallback', () => {
  test('a production boot on PGlite says so, once, at error level', () => {
    const { errors, lines, log } = recorder()
    const { tracker } = tracking()

    const fired = reportDatabaseFallback({
      kind: 'pglite',
      nodeEnv: 'production',
      log,
      tracker,
    })

    expect(fired).toBe(true)
    expect(lines, 'one line, not a burst').toHaveLength(1)
    expect(errors, 'and error level, because somebody has to act on it').toHaveLength(1)
    expect(errors[0]?.fields.event).toBe(DATABASE_FALLBACK_EVENT)
    expect(
      errors[0]?.fields.event,
      'its own event name, so alerting keys on it rather than on migrations_applied',
    ).not.toBe('migrations_applied')
    expect(errors[0]?.fields.database).toBe('pglite')
    expect(
      errors[0]?.fields.note,
      'the sentence reaches the log intact: 10.5’s field guard passes source prose and would answer "other" for anything else',
    ).toBe(DATABASE_FALLBACK_MESSAGE)
    expect(
      String(errors[0]?.fields.note),
      'and it says in plain words what is at stake',
    ).toContain('destroys every row')
  })

  test('and it reaches the tracker as a message, tagged with the same event', () => {
    const { log } = recorder()
    const { messages, tracker } = tracking()

    reportDatabaseFallback({
      kind: 'pglite',
      nodeEnv: 'production',
      log,
      tracker,
    })

    expect(messages).toHaveLength(1)
    expect(
      messages[0]?.message,
      'one sentence, written once, so the log and the alert cannot drift',
    ).toBe(DATABASE_FALLBACK_MESSAGE)
    expect(messages[0]?.context?.event).toBe(DATABASE_FALLBACK_EVENT)
  })

  test('production on Postgres is silent, and so is every other environment', () => {
    for (const [kind, nodeEnv] of [
      ['postgres', 'production'],
      ['pglite', 'development'],
      ['pglite', 'test'],
      ['pglite', undefined],
      ['postgres', undefined],
    ] as const) {
      const { lines, log } = recorder()
      const { messages, tracker } = tracking()
      const fired = reportDatabaseFallback({ kind, nodeEnv, log, tracker })
      const where = `${kind} on ${nodeEnv ?? 'no NODE_ENV'}`
      expect(fired, `${where} is not the condition`).toBe(false)
      expect(lines, `${where} logs nothing`).toHaveLength(0)
      expect(messages, `${where} alerts nobody`).toHaveLength(0)
    }
  })
})
