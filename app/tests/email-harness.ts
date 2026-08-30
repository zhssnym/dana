/*
The four transactional emails, staged once and read four ways.

**Why a harness rather than four files each staging their own.** Every
criterion S19 adds is about what an email says, and none of them is about how
it came to be sent: the folder invitation of 7.5, the bare connection
invitation beside it, the share grant of 7.4 and the reminder the 11.7 pass
delivers all have to exist before any of the six can assert a word. Staging
them once per file, from one cast, keeps each criterion a page of assertions
instead of a page of setup, and keeps the fixtures identical across files so a
difference between two criteria is a difference in what they assert.

**What the 11.10 sink gives a criterion, and what it does not.** The sink
records a message: its template, its recipient, and the payload keys the
notify module chose (11.10 fixes the first two and leaves the rest to that
module). It does not record a rendered body, because nothing renders one under
test: 11.8 forbids sending, so the transport that would call renderMessage is
never constructed. So a criterion that asserts what an email says renders the
observed message itself, through the same function the provider transport
calls, and asserts against that. What that proves is exactly the pair worth
proving: that the call site handed over a payload carrying the person and the
folder, and that the template turns that payload into the ruled words.

**Read structurally, deliberately.** renderedOf reads subject, text and html
off an unknown record rather than off `RenderedEmail`, and it survives a throw.
These criteria are written red, before the module grows its second part and its
fourth template, and a criteria file that could not compile until the
implementation landed would be no use as the thing the implementation is
measured against. The cost is one cast at one seam; the benefit is that every
red here is an assertion failing with its own sentence rather than a type error
or a TypeError from a switch that has not learned the template name yet.

**The copy is RFC 0005 change control item 32 and nothing else.** Imran ruled
the subjects, headings, bodies, context lines, action labels and destinations
there on 2026-08-25; `transactional-email-screen.tsx` is the treatment and its
strings are fixtures written before the ruling. Where the two differ this file
follows item 32, which is the same instruction the implementing personas have.

Spec: 10.7 (HTML with a required text/plain alternative, one action link
each), 11.8 (the four templates), 11.10 (the sink), 8.6 and 11.7 (the pass
that delivers the reminder), 5.2, 5.3, 7.4, 7.5 (the four call sites).
*/
import { randomUUID } from 'node:crypto'

import { expect } from 'vitest'

import type { Db } from '../db/client.js'
import type { OutboundMessage } from '../src/server/notify/index.js'
import { renderMessage } from '../src/server/notify/templates.js'
import { userForSub } from './auth-harness.js'
import type { AuthTestApp, OutboundEmail, UserRow } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  seedTask,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { minutesAgo, runPass, seedReminderRow } from './reminders-harness.js'
import { createInviteOk, freshEmail } from './sharing-harness.js'

/**
 * The deployment origin every action link is built from. A test process sends
 * nothing, so no real origin is involved; what a criterion asserts is that the
 * link is this origin plus the path item 32 rules for that template.
 */
export const APP_ORIGIN = 'https://dana.s19.test'

/** The three paths item 32's four destinations resolve to. Both invitations
 * land on 10.6's start URL, because 9.8's invite gate deliberately has no
 * path of its own: it renders in place of the application over whatever /app
 * route is beneath it whenever Q12 is non-empty (RFC 0005 change control
 * item 34). */
export const startUrl = `${APP_ORIGIN}/app`
export const folderUrl = (id: string): string => `${APP_ORIGIN}/app/folders/${id}`
export const taskUrl = (id: string): string => `${APP_ORIGIN}/app/tasks/${id}`

/** The orientation footer of item 32, verbatim, and the line it replaces on
 * the two invitations. The em dash is the owner's ruled copy rather than this
 * repository's prose, where protocol section 7 forbids one. */
export const ORIENTATION_FOOTER =
  "Dana keeps a project's tasks, notes and people on one page. You'll sign in with Google — there's no password to create."

export interface RenderedParts {
  subject: string
  text: string
  html: string
}

/*
The rendered message, read off whatever renderMessage answers.

Nothing here narrows to RenderedEmail: that interface carries no html part
until this package's Platform commit lands, and a criterion that named the
field would fail to compile rather than fail to pass. A throw is folded into
empty parts for the same reason, since the switch inside renderMessage is
exhaustive over three template names and meets a fourth before the split
lands.
*/
export function renderedOf(email: OutboundEmail): RenderedParts {
  let answered: unknown
  try {
    answered = renderMessage(email.raw as OutboundMessage, {
      appOrigin: APP_ORIGIN,
    })
  } catch {
    answered = undefined
  }
  const record =
    typeof answered === 'object' && answered !== null
      ? (answered as Record<string, unknown>)
      : {}
  const part = (key: string): string =>
    typeof record[key] === 'string' ? (record[key] as string) : ''
  return { subject: part('subject'), text: part('text'), html: part('html') }
}

/** Every href the HTML part carries, in order. 10.7 allows exactly one. */
export function linksIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? '')
}

/** Every absolute URL the text part carries. The same rule applies to it:
 * 10.7's amended sentence makes the text part say the same thing and carry
 * the same one link, not a stub beside a richer HTML part. */
export function urlsIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"']+/g)].map((match) => match[0])
}

export interface StagedEmails {
  /** The two signed-in actors, so a file needing a fifth send of its own
   * (the 7.5 conversion, a 5.2 resend) makes it from the same fixture. */
  inviter: Actor
  colleague: Actor
  /** The two parked invite rows, addressable by 5.2's transition endpoints. */
  folderInviteId: string
  connectionInviteId: string
  /** The inviter's stored display_name, which is what item 32's {inviter}
   * placeholder resolves to. */
  inviterName: string
  inviterEmail: string
  folderId: string
  folderName: string
  taskId: string
  taskTitle: string
  dueDate: string
  dueTime: string
  /** The addresses each message went to, so a criterion can assert the
   * recipient as well as the words. */
  folderInviteTo: string
  connectionInviteTo: string
  shareGrantTo: string
  reminderTo: string
  folderInvite: OutboundEmail
  connectionInvite: OutboundEmail
  shareGrant: OutboundEmail
  reminder: OutboundEmail
  /** The four in a fixed order, for the criteria that assert a rule over all
   * of them rather than a sentence in one. */
  all: readonly OutboundEmail[]
}

function only(
  candidates: readonly OutboundEmail[],
  why: string,
): OutboundEmail {
  expect(candidates.length, why).toBe(1)
  return candidates[0] as OutboundEmail
}

/*
One cast, one folder, one task, and one of each message.

The order matters in one place and only one: the reminder pass runs last, so
the three route-driven sends are already in the sink when it does and a
criterion reading the sink sees a stable set. Everything else is independent.

The invite budget of 10.4 is respected the way every file in the 7.5 range
respects it: the inviter issues two POST /invites calls, well inside the five
per minute AC-101 asserts.
*/
export class EmailCast {
  private readonly cast: Cast
  private staged: StagedEmails | undefined

  constructor(private readonly slug: string) {
    this.cast = new Cast(['inviter', 'colleague'], `s19-${slug}`)
  }

  async of(app: AuthTestApp): Promise<StagedEmails> {
    if (this.staged !== undefined) return this.staged
    const [inviter, colleague] = await this.cast.of(app)
    if (inviter === undefined || colleague === undefined) {
      throw new Error('the email cast must produce two actors')
    }

    const row = await userForSub(app.db, inviter.sub)
    const inviterName = (row as UserRow).display_name
    expect(
      inviterName,
      'the inviter must hold a display_name, which is what item 32 renders as {inviter} (spec 7.1)',
    ).toBeTruthy()

    const folderName = `Travel ${randomUUID().slice(0, 8)}`
    const folderId = await createFolder(inviter, folderName)

    const folderInviteTo = freshEmail(`s19-${this.slug}-folder`)
    const folderInviteRow = await createInviteOk(
      inviter,
      { email: folderInviteTo, folder_id: folderId },
      'a folder invitation to an address no account holds parks an invite and mails it (spec 5.2, 7.5)',
    )

    const connectionInviteTo = freshEmail(`s19-${this.slug}-connection`)
    const connectionInviteRow = await createInviteOk(
      inviter,
      { email: connectionInviteTo },
      'a bare invitation carries no folder_id, which is the other half of 7.5 and the other template',
    )

    await connect(app.db, inviter.id, colleague.id)
    // The 7.4 member add, which is one of the share grant's two call sites.
    await addMemberOk(inviter, folderId, colleague.id)

    const taskTitle = 'confirm the final guest count'
    const dueDate = '2026-09-14'
    const dueTime = '14:00'
    const taskId = await seedTask(app.db, {
      folderId,
      createdBy: inviter.id,
      title: taskTitle,
      assigneeId: inviter.id,
      dueDate,
      dueTime,
    })
    await seedReminderRow(app.db, {
      taskId,
      createdBy: inviter.id,
      timeOfDay: '09:00',
      // Inside 8.6's six hour stale window, so the pass delivers rather than
      // skipping; the arithmetic that produces a real fire_at is AC-083's.
      fireAt: minutesAgo(5),
    })
    await runPass(app)

    const sent = app.emails.sent()
    const to = (address: string): readonly OutboundEmail[] =>
      sent.filter((email) => email.to === address)

    this.staged = {
      inviter,
      colleague,
      folderInviteId: folderInviteRow.id,
      connectionInviteId: connectionInviteRow.id,
      inviterName: String(inviterName),
      inviterEmail: inviter.email,
      folderId,
      folderName,
      taskId,
      taskTitle,
      dueDate,
      dueTime,
      folderInviteTo,
      connectionInviteTo,
      shareGrantTo: colleague.email,
      reminderTo: inviter.email,
      folderInvite: only(
        to(folderInviteTo),
        'the folder invitation must have produced exactly one message (spec 5.2, 11.8)',
      ),
      connectionInvite: only(
        to(connectionInviteTo),
        'the connection invitation must have produced exactly one message (spec 5.2, 11.8)',
      ),
      shareGrant: only(
        to(colleague.email),
        'the member add must have produced exactly one share grant (spec 5.3, 11.8)',
      ),
      reminder: only(
        to(inviter.email),
        'the pass must have delivered exactly one reminder to the assignee (spec 8.6, 11.7)',
      ),
      all: [],
    }
    this.staged.all = [
      this.staged.folderInvite,
      this.staged.connectionInvite,
      this.staged.shareGrant,
      this.staged.reminder,
    ]
    return this.staged
  }

  cleanup(db: Db): Promise<void> {
    return this.cast.cleanup(db)
  }
}

/**
 * One more reminder, delivered, for a case that needs a task the staged
 * fixture does not carry: a date-only due, or a title made of the characters
 * a person is free to type and an email client must not be free to run.
 *
 * The pass is 8.6's and polls every due row, so the answer is filtered to the
 * one assignee this fixture owns, which is `reminderEmailsFor`'s own reasoning
 * applied to a single address.
 */
export async function deliverReminder(
  app: AuthTestApp,
  staged: StagedEmails,
  options: { title: string; dueDate?: string; dueTime?: string | null },
): Promise<OutboundEmail> {
  const taskId = await seedTask(app.db, {
    folderId: staged.folderId,
    createdBy: staged.inviter.id,
    title: options.title,
    assigneeId: staged.inviter.id,
    dueDate: options.dueDate ?? '2026-10-02',
    dueTime: options.dueTime === undefined ? '17:45' : options.dueTime,
  })
  await seedReminderRow(app.db, {
    taskId,
    createdBy: staged.inviter.id,
    timeOfDay: '08:30',
    fireAt: minutesAgo(3),
  })
  const before = app.emails.sent().length
  await runPass(app)
  return only(
    app.emails
      .sent()
      .slice(before)
      .filter((email) => email.to === staged.reminderTo),
    'the pass must deliver exactly one reminder to this fixture assignee (spec 8.6, 11.7)',
  )
}
