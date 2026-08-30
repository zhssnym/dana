import express from 'express'
import { describe, expect, test } from 'vitest'

import { createApp } from '../index.js'
import { createNotifier, notifierOf } from './index.js'
import type { NotifyLogger, OutboundMessage } from './index.js'

const RECIPIENT = 'observer@notify.test'

/* A share grant with its payload, since S19 closed the type: a message can
no longer be constructed without what its own template renders from, which is
the compiler holding the property the templates used to apologise for. */
const message: OutboundMessage = {
  template: 'share_grant',
  to: RECIPIENT,
  shareGrant: {
    inviterName: 'Hassan',
    folderId: "33333333-3333-4333-8333-333333333333",
    folderName: 'Travel',
  },
}

function capturingLogger(): NotifyLogger & {
  calls: [Record<string, unknown>, string][]
} {
  const calls: [Record<string, unknown>, string][] = []
  return {
    calls,
    info(fields, text) {
      calls.push([fields, text])
    },
  }
}

describe('createNotifier with a sink (11.10: delivery replaces logging)', () => {
  test('delivers the message to the sink and resolves after it settles', async () => {
    const delivered: OutboundMessage[] = []
    let release: (() => void) | undefined
    const sink = {
      send(sent: OutboundMessage): Promise<void> {
        delivered.push(sent)
        return new Promise<void>((resolve) => {
          release = resolve
        })
      },
    }
    const logger = capturingLogger()
    const notifier = createNotifier({ sink, logger })

    let settled = false
    const pending = notifier.send(message).then(() => {
      settled = true
    })
    expect(delivered, 'the sink receives the message itself').toEqual([message])
    expect(settled, 'send awaits the sink').toBe(false)
    expect(release).toBeDefined()
    release?.()
    await pending
    expect(settled).toBe(true)
    expect(logger.calls, 'delivery must not also log').toEqual([])
  })

  test('a sink failure propagates to the caller', async () => {
    const sink = {
      send(): Promise<void> {
        return Promise.reject(new Error('sink refused'))
      },
    }
    const notifier = createNotifier({ sink, logger: capturingLogger() })
    await expect(notifier.send(message)).rejects.toThrow('sink refused')
  })
})

describe('createNotifier without a sink (11.8: log, never send)', () => {
  test('suppresses into one log line carrying only the template', async () => {
    const logger = capturingLogger()
    const notifier = createNotifier({ logger })
    await notifier.send(message)
    expect(logger.calls).toHaveLength(1)
    const [fields] = logger.calls[0] ?? [{}, '']
    expect(
      fields,
      'exactly the template field, nothing else, crosses to the logger (10.5)',
    ).toEqual({ template: 'share_grant' })
  })

  test('the recipient address reaches the logger nowhere (10.5)', async () => {
    const logger = capturingLogger()
    const notifier = createNotifier({ logger })
    await notifier.send(message)
    expect(
      JSON.stringify(logger.calls).includes(RECIPIENT),
      'no field or message text may carry the address',
    ).toBe(false)
  })
})

describe('the createApp seam (11.10: options.notifications)', () => {
  test('createApp forwards the injected sink to the module', async () => {
    const delivered: OutboundMessage[] = []
    const app = createApp({
      notifications: {
        send(sent: OutboundMessage): void {
          delivered.push(sent)
        },
      },
    })
    await notifierOf(app).send(message)
    expect(
      delivered,
      'a message sent through the attached notifier reaches the sink',
    ).toEqual([message])
  })

  test('an application built without the option still carries a notifier', () => {
    // Send is not exercised here: without a sink it would log through the
    // boot logger, and the suppression behavior is proven above with an
    // injected one. This asserts only that the seam attaches in both
    // configurations, so the call sites never need to care.
    const notifier = notifierOf(createApp({}))
    expect(typeof notifier.send).toBe('function')
  })

  test('notifierOf refuses an application createApp did not build', () => {
    expect(() => notifierOf(express())).toThrow(
      'this application carries no notifier',
    )
  })
})
