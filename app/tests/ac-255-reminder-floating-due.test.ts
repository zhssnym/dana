/*
AC-255: given a reminder for a task carrying a stored due date and a wall
time, then the email renders that stored date and that wall time and never the
word "Today", and it names the folder the task lives in; given a date-only
task, it renders the date and no time.

**Why "Today" is the assertion.** 4.4 stores a due as a floating date and an
optional wall time, and 8.1 has it read as the reader's own local time. A
server composing "Today" would have to decide whose today that is, and it
cannot: the process has a timezone, the sender has one, the assignee has one,
and only the last is the person reading. Item 32 records the reading so this
package does not re-decide it, and names the prototype's "Today, 2:00 PM" as
the fixture it is. The failure this criterion catches is a real one and it is
silent: an implementation that formatted the due against the server clock
would look right on the machine that wrote it and be wrong for every reader
in another zone, once a day, forever.

**The folder is asserted because the reminder body deliberately does not name
it.** Item 32: the body says "You set a reminder for this task" and names
neither the folder nor the due, both of which the context card carries, and
the prototype's "A reminder from your Travel folder" said the card's own line
twice. So the fact has to be somewhere and the criterion asserts that it is,
without asserting which sentence carries it.

**The date-only arm is the second case** because 8.6 fires a date-only
reminder at the reminder's own `time_of_day`, which is not the task's due time
and must never be printed as one. `transport.test.ts` has held that line for
the text template since P7; it holds for the HTML part too.

Spec: 4.4 (floating storage), 8.1 (read in the reader's local time), 8.6
(delivery and the two modes), 11.7, 11.8, 10.7; RFC 0005 change control item
32.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp, visibleText } from './auth-harness.js'
import type { AuthTestApp, OutboundEmail } from './auth-harness.js'
import { EmailCast, renderedOf } from './email-harness.js'
import { seedTask } from './folders-harness.js'
import {
  minutesAgo,
  runPass,
  seedReminderRow,
} from './reminders-harness.js'

let app: AuthTestApp
const cast = new EmailCast('due')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-255: a reminder renders the stored due, never a computed today', () => {
  test('AC-255: the stored date and wall time both reach the email', async () => {
    const staged = await cast.of(app)
    const parts = renderedOf(staged.reminder)
    for (const [where, body] of [
      ['HTML part', parts.html],
      ['text part', parts.text],
    ] as const) {
      expect(
        body,
        `4.4: the ${where} carries the due exactly as it is stored, ${staged.dueDate}`,
      ).toContain(staged.dueDate)
      expect(
        body,
        `4.4: and the wall time beside it, ${staged.dueTime}`,
      ).toContain(staged.dueTime)
    }
    expect(
      parts.subject,
      'item 32 fixes the subject as "Reminder: {task}", so the task is what a person sees before opening',
    ).toContain(staged.taskTitle)
  })

  test('AC-255: nothing renders as "Today"', async () => {
    const staged = await cast.of(app)
    const parts = renderedOf(staged.reminder)
    for (const [where, body] of [
      ['subject', parts.subject],
      ['HTML part', parts.html],
      ['text part', parts.text],
    ] as const) {
      expect(
        body,
        `8.1: a floating due reads as the reader's own local time, so the server cannot decide whose today it is and must not word the ${where} as one (item 32)`,
      ).not.toMatch(/\bToday\b/i)
      expect(
        body,
        `nor as any other relative wording, which has the same fault (${where})`,
      ).not.toMatch(/\bTomorrow\b|\bYesterday\b/i)
    }
  })

  test('AC-255: the reminder names the folder its task lives in', async () => {
    const staged = await cast.of(app)
    const parts = renderedOf(staged.reminder)
    expect(
      parts.html,
      "item 32: the context card's second line is \"In {folder}\", the half the heading has not said",
    ).toContain(staged.folderName)
    expect(
      parts.text,
      'and the text part says the same thing, 10.7 as amended making it an alternative rather than a stub',
    ).toContain(staged.folderName)
  })

  test('AC-255: a date-only task states a date and no time', async () => {
    const staged = await cast.of(app)
    const taskId = await seedTask(app.db, {
      folderId: staged.folderId,
      createdBy: staged.inviter.id,
      title: 'book the airport transfer',
      assigneeId: staged.inviter.id,
      dueDate: '2026-10-02',
      dueTime: null,
    })
    await seedReminderRow(app.db, {
      taskId,
      createdBy: staged.inviter.id,
      timeOfDay: '08:30',
      fireAt: minutesAgo(3),
    })
    const before = app.emails.sent().length
    await runPass(app)
    const delivered = app.emails
      .sent()
      .slice(before)
      .filter((email) => email.to === staged.reminderTo)
    expect(
      delivered.length,
      'the pass delivers the date-only reminder to its assignee (spec 8.6)',
    ).toBe(1)
    const parts = renderedOf(delivered[0] as OutboundEmail)
    expect(parts.text, '4.4: the stored date reaches the email').toContain(
      '2026-10-02',
    )
    expect(
      parts.text,
      "8.6: a date-only reminder fires at the reminder's own time_of_day, which is not a due time and must never be printed as one",
    ).not.toContain('08:30')
    expect(
      // The words a person reads rather than the markup: an inline style
      // carries numbers a raw match would trip over, and none is a time.
      visibleText(parts.html),
      'and the HTML part invents no time either',
    ).not.toMatch(/\d{1,2}:\d{2}/)
  })
})
