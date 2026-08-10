/*
AC-059: given an invite addressed to the inviter's own email, then 422.

The refusal is V-INV's second validation, and its place in the order is part
of what this file pins: 8.7 writes the validations "in order", own email
before any folder question, so an invite that is both self-addressed and
aimed at a default folder answers the 422 of the earlier check, never the
409 of the later one. An implementation that checks the folder first passes
a single-assertion version of this criterion and still violates the order
the section states.

Self-addressing is judged after lowercasing, because V-INV lowercases before
it compares and 4.1 stores the account email lowercased already: a case
variant of your own address is still your own address, and matching is
case-insensitive equality per 8.7. The refusal must also be a refusal in
full: no invite row, no membership, no email through the sink.

Spec: 7.5 (V-INV by reference), 8.7 (the validation order, lowercasing,
case-insensitive matching), 10.3 (email syntax, 422 with the field named),
7.0 (the envelope).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  countRows,
  defaultFolderOf,
  expectFolderInvariants,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { postInvite } from './sharing-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter'], 'p5')

async function inviter(): Promise<Actor> {
  const [actor] = await cast.of(app)
  if (actor === undefined) throw new Error('cast must produce the inviter')
  return actor
}

async function inviteCountOf(actorId: string): Promise<number> {
  return countRows(
    app.db,
    sql`SELECT count(*)::int AS n FROM invites WHERE inviter_id = ${actorId}`,
  )
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-059: an invite to your own email is refused', () => {
  test('AC-059: the bare self-invite answers 422 and creates nothing', async () => {
    const actor = await inviter()
    app.emails.clear()
    const response = await postInvite(actor, { email: actor.email })
    expectStatus(
      response,
      422,
      'V-INV rejects the inviter\'s own email with 422 (spec 7.5, 8.7)',
    )
    expect(
      await inviteCountOf(actor.id),
      'the refusal creates no invite row (spec 8.7)',
    ).toBe(0)
    expect(
      app.emails.sent().length,
      'and sends nothing: one email rides a created invite, and none was created (spec 7.5)',
    ).toBe(0)
  })

  test('AC-059 adversarial: a case variant of your own address is still your own', async () => {
    const actor = await inviter()
    const response = await postInvite(actor, {
      email: actor.email.toUpperCase(),
    })
    expectStatus(
      response,
      422,
      'V-INV lowercases before comparing, and matching is case-insensitive equality (spec 8.7, 10.3)',
    )
    expect(
      await inviteCountOf(actor.id),
      'the case variant created nothing either',
    ).toBe(0)
  })

  test('AC-059 adversarial: own email outranks the folder checks in V-INV\'s order', async () => {
    const actor = await inviter()
    // The folder attached is the one whose own refusal would be 409: a
    // self-invite to the default folder answers the earlier check's 422,
    // because 8.7 writes the validations in order.
    const response = await postInvite(actor, {
      email: actor.email,
      folder_id: await defaultFolderOf(app.db, actor.id),
    })
    expectStatus(
      response,
      422,
      'V-INV checks own-email before the folder, so the default folder\'s 409 is never reached (spec 8.7 "in order")',
    )
  })

  test('AC-059 adversarial: a syntactically invalid email answers 422', async () => {
    const actor = await inviter()
    const response = await postInvite(actor, { email: 'not-an-address' })
    expectStatus(
      response,
      422,
      'V-INV\'s first validation: syntactically valid per 10.3, else 422 with the field named',
    )
    const body = response.json() as {
      error?: { code?: unknown; message?: unknown }
    }
    expect(
      typeof body.error?.code === 'string' && body.error.code.length > 0,
      'a 4xx carries the 7.0 envelope (AC-117)',
    ).toBe(true)
    expect(
      String(body.error?.message).toLowerCase(),
      '10.3 names the failing field',
    ).toContain('email')
  })

  test('AC-059: invariants hold afterwards', async () => {
    const actor = await inviter()
    await expectFolderInvariants(
      app.db,
      [await defaultFolderOf(app.db, actor.id)],
      [actor.id],
    )
  })
})
