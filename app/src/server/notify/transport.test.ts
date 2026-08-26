/*
The 11.8 half of the notification module: which environment sends, what a
template says, and what a send does with a provider that refuses.

Reworked at S19, when the templates became four and each grew a second part.
The copy asserted below is Imran's, at RFC 0005 change control item 32, and
nothing in this file may invent a word of it.

None of it is observable to the acceptance suite by construction. That suite
injects the 11.10 sink precisely so no message is ever transported, and 11.8
forbids real sending under test, so the transport, the gate in front of it and
the four template bodies have this file and the code review as their only
readers.

No test here reaches the network: fetch is stubbed in every case that
constructs a transport, and the gate itself is asserted against a composed
environment rather than the process one, so a machine that happens to carry a
provider key cannot turn a unit test into an email.
*/
import { afterEach, describe, expect, test, vi } from 'vitest'

import { createNotifier } from './index.js'
import type { NotifyLogger, OutboundMessage } from './index.js'
import { createResendTransport, resolveEmailTransport } from './resend.js'
import { renderMessage } from './templates.js'

const APP_ORIGIN = 'https://dana.example'

const FOLDER_ID = '22222222-2222-4222-8222-222222222222'

const payload = {
  taskId: '11111111-1111-4111-8111-111111111111',
  title: 'renew the passport',
  dueDate: '2026-08-20',
  dueTime: '09:00' as string | null,
  folderName: 'Travel',
}

const reminder: OutboundMessage = {
  template: 'reminder',
  to: 'assignee@reminder.test',
  reminder: payload,
}

function capturingLogger(): NotifyLogger & {
  calls: [Record<string, unknown>, string][]
} {
  const calls: [Record<string, unknown>, string][] = []
  return { calls, info: (fields, text) => calls.push([fields, text]) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the environment gate in front of the provider (spec 11.8)', () => {
  test('development and test send nothing, even with a key present', () => {
    const logger = capturingLogger()
    for (const NODE_ENV of ['test', 'development', undefined]) {
      const transport = resolveEmailTransport({
        logger,
        env: {
          NODE_ENV,
          RESEND_API_KEY: 'a-key-that-must-not-be-used',
          RESEND_FROM: 'noreply@dana.example',
          APP_ORIGIN,
        },
      })
      expect(
        transport,
        `11.8: the module logs instead of sending in development and tests, and NODE_ENV=${String(NODE_ENV)} is not production. The gate is positive so an unset variable fails closed`,
      ).toBeUndefined()
    }
    expect(
      logger.calls.length,
      'and a configured key outside production says so once per construction, because a developer who set it expects mail',
    ).toBe(3)
  })

  test('production without the variables logs instead of sending, and does not refuse to boot', () => {
    const logger = capturingLogger()
    const transport = resolveEmailTransport({
      logger,
      env: { NODE_ENV: 'production', APP_ORIGIN },
    })
    expect(transport).toBeUndefined()
    expect(
      String(logger.calls[0]?.[0].missing),
      'the line names what is missing: an unconfigured provider is a launch checklist item (10.7), not a crash',
    ).toBe('RESEND_API_KEY, RESEND_FROM')
  })

  test('production with all three answers a transport', () => {
    const transport = resolveEmailTransport({
      logger: capturingLogger(),
      env: {
        NODE_ENV: 'production',
        RESEND_API_KEY: 'a-key',
        RESEND_FROM: 'noreply@dana.example',
        APP_ORIGIN,
      },
    })
    expect(transport).toBeDefined()
  })
})

describe('the Resend transport', () => {
  test('posts one rendered message and carries the key in the header alone', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init })
      return Promise.resolve(new Response(null, { status: 200 }))
    })

    await createResendTransport({
      apiKey: 'a-key',
      from: 'noreply@dana.example',
      appOrigin: APP_ORIGIN,
    }).send(reminder)

    expect(calls.length).toBe(1)
    const call = calls[0]
    expect(call?.url).toBe('https://api.resend.com/emails')
    expect(call?.init.method).toBe('POST')
    const body = JSON.parse(String(call?.init.body)) as Record<string, unknown>
    expect(body.from).toBe('noreply@dana.example')
    expect(body.to).toEqual(['assignee@reminder.test'])
    expect(String(body.subject)).toContain('renew the passport')
    expect(
      String(body.text),
      '10.7: one action link per template',
    ).toContain(`${APP_ORIGIN}/app`)
    expect(
      JSON.stringify(body).includes('a-key'),
      'the credential rides the authorization header and nothing else',
    ).toBe(false)
  })

  test('a refusal throws with the status and without the address', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        // A provider body echoes the address it refused, which is why none of
        // it reaches the error (10.5).
        new Response(JSON.stringify({ message: 'assignee@reminder.test is invalid' }), {
          status: 422,
        }),
      ),
    )
    const transport = createResendTransport({
      apiKey: 'a-key',
      from: 'noreply@dana.example',
      appOrigin: APP_ORIGIN,
    })

    await expect(transport.send(reminder)).rejects.toThrow(/422/)
    await expect(transport.send(reminder)).rejects.not.toThrow(
      /assignee@reminder\.test/,
    )
  })
})

describe('the four templates (spec 10.7, 11.8)', () => {
  test('a reminder names its task, its due moment, its folder, and one link', () => {
    const rendered = renderMessage(reminder, { appOrigin: APP_ORIGIN })
    expect(rendered.subject).toBe('Reminder: renew the passport')
    expect(rendered.text).toContain('2026-08-20 at 09:00')
    expect(rendered.text).toContain('In Travel')
    expect(rendered.text).toContain(`${APP_ORIGIN}/app/tasks/${payload.taskId}`)
    expect(
      rendered.html,
      '10.7 as amended: an HTML part beside the text one, and a whole document',
    ).toMatch(/^<!doctype html>/)
  })

  test('a date-only task has no time to state and states none', () => {
    const rendered = renderMessage(
      { ...reminder, reminder: { ...payload, dueTime: null } },
      { appOrigin: APP_ORIGIN },
    )
    expect(rendered.text).toContain('2026-08-20')
    expect(
      rendered.text,
      '8.6 date-only arm fires at the reminder own time_of_day, which is not the task due time and must not be printed as one',
    ).not.toContain(' at ')
  })

  test('a reminder with no payload refuses to render rather than sending a blank', () => {
    // The union of ./index.ts makes this unconstructable in TypeScript, which
    // is the guard that matters and the one this package added. The cast is
    // what a JavaScript caller could still do, and the answer must still be a
    // throw rather than a body about nothing.
    expect(() =>
      renderMessage(
        { template: 'reminder', to: 'nobody@reminder.test' } as OutboundMessage,
        { appOrigin: APP_ORIGIN },
      ),
    ).toThrow()
  })

  test('each of the four renders both parts, one link, and item 32 words', () => {
    const cases: { message: OutboundMessage; subject: string; href: string }[] = [
      {
        message: {
          template: 'invite_folder',
          to: 'invitee@invite.test',
          folderInvite: {
            inviterName: 'Hassan',
            folderId: FOLDER_ID,
            folderName: 'Travel',
          },
        },
        subject: 'Hassan invited you to Travel on Dana',
        href: `${APP_ORIGIN}/app`,
      },
      {
        message: {
          template: 'invite_connection',
          to: 'invitee@invite.test',
          connectionInvite: { inviterName: 'Hassan' },
        },
        subject: 'Hassan wants to connect on Dana',
        href: `${APP_ORIGIN}/app`,
      },
      {
        message: {
          template: 'share_grant',
          to: 'member@share.test',
          shareGrant: {
            inviterName: 'Hassan',
            folderId: FOLDER_ID,
            folderName: 'Travel',
          },
        },
        subject: 'Hassan shared Travel with you on Dana',
        href: `${APP_ORIGIN}/app/folders/${FOLDER_ID}`,
      },
      {
        message: reminder,
        subject: 'Reminder: renew the passport',
        href: `${APP_ORIGIN}/app/tasks/${payload.taskId}`,
      },
    ]

    for (const one of cases) {
      const rendered = renderMessage(one.message, { appOrigin: APP_ORIGIN })
      expect(rendered.subject, 'item 32 rules every subject').toBe(one.subject)
      expect(
        rendered.html.match(/href="/g) ?? [],
        '10.7: one action link each, in the HTML part',
      ).toHaveLength(1)
      expect(rendered.html, 'and it lands where item 32 sends it').toContain(
        `href="${one.href}"`,
      )
      expect(
        rendered.text,
        '10.7 as amended: the text part carries the same one link',
      ).toContain(one.href)
    }
  })

  test('the orientation footer rides the invitations alone', () => {
    const orientation = 'no password to create'
    const invitations: OutboundMessage[] = [
      {
        template: 'invite_folder',
        to: 'invitee@invite.test',
        folderInvite: {
          inviterName: 'Hassan',
          folderId: FOLDER_ID,
          folderName: 'Travel',
        },
      },
      {
        template: 'invite_connection',
        to: 'invitee@invite.test',
        connectionInvite: { inviterName: 'Hassan' },
      },
    ]
    for (const message of invitations) {
      const rendered = renderMessage(message, { appOrigin: APP_ORIGIN })
      expect(rendered.text).toContain(orientation)
      expect(rendered.text).not.toContain('Sent by Dana')
    }
    const grant = renderMessage(
      {
        template: 'share_grant',
        to: 'member@share.test',
        shareGrant: {
          inviterName: 'Hassan',
          folderId: FOLDER_ID,
          folderName: 'Travel',
        },
      },
      { appOrigin: APP_ORIGIN },
    )
    expect(
      grant.text,
      'item 32: a share grant reaches an existing connection, where the orientation line is filler',
    ).not.toContain(orientation)
    expect(grant.text).toContain('Sent by Dana')
  })

  test('a scrubbed display_name falls back to "Someone", once, in one place', () => {
    const rendered = renderMessage(
      {
        template: 'share_grant',
        to: 'member@share.test',
        shareGrant: {
          inviterName: null,
          folderId: FOLDER_ID,
          folderName: 'Travel',
        },
      },
      { appOrigin: APP_ORIGIN },
    )
    expect(
      rendered.subject,
      'item 32: "Someone" survives as the fallback, 8.10 being able to scrub an account between the act and the send',
    ).toBe('Someone shared Travel with you on Dana')
  })

  test('a value a person typed cannot become markup', () => {
    const rendered = renderMessage(
      {
        ...reminder,
        reminder: { ...payload, title: '<script>alert(1)</script>' },
      },
      { appOrigin: APP_ORIGIN },
    )
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).toContain('&lt;script&gt;')
    expect(rendered.text, 'the text part carries it raw, being text').toContain(
      '<script>',
    )
  })
})

describe('what decides where a message goes (spec 11.10, then 11.8)', () => {
  test('an injected sink wins over a configured transport', async () => {
    const delivered: OutboundMessage[] = []
    const transported: OutboundMessage[] = []
    const notifier = createNotifier({
      sink: { send: (message) => void delivered.push(message) },
      transport: {
        send: (message) => {
          transported.push(message)
          return Promise.resolve()
        },
      },
      logger: capturingLogger(),
    })

    await notifier.send(reminder)
    expect(
      delivered,
      '11.10: when the sink is present the module delivers to it instead, which is what keeps a test from sending mail even in a process configured to send',
    ).toEqual([reminder])
    expect(transported).toEqual([])
  })

  test('with no sink the transport sends, and with neither it logs', async () => {
    const transported: OutboundMessage[] = []
    await createNotifier({
      transport: {
        send: (message) => {
          transported.push(message)
          return Promise.resolve()
        },
      },
      logger: capturingLogger(),
    }).send(reminder)
    expect(transported).toEqual([reminder])

    const logger = capturingLogger()
    await createNotifier({ logger }).send(reminder)
    expect(logger.calls.length).toBe(1)
    expect(
      JSON.stringify(logger.calls).includes(reminder.to),
      '10.5 the address reaches no log line in any configuration',
    ).toBe(false)
  })
})
