/*
AC-346: given a Google subject Dana has never seen whose verified email
already belongs to a live account, when the callback runs, then sign-in is
refused with 9.2's claimed-email page, no session is established, no second
user row exists, and the existing account is untouched; given the address
released by that account's deletion, then a new subject takes it and
provisions normally; given a dot variant of a claimed Gmail address, then it
is a different address and provisions its own account, no normalisation
existing.

Issue #17, ruled by Imran on 2026-09-03: Dana never joins two accounts because
their addresses look alike, so the behaviour does not change and the
explanation is what was missing. Both halves are asserted, and the second is
the reason this criterion is not simply "refuse".

**The refusal is asserted as words, not as a status.** A callback that
answered 403 with a blank body would satisfy every assertion about failure and
would be the thing this criterion exists to replace: before today the person
was bounced to the landing page with `?signin=failed` and nothing else. So the
9.2 copy is compared exactly, against the words a reader would see, as AC-008
does for the other rejection page, and the support address is asserted to be a
reachable action rather than a sentence.

**The negative controls are the ones that make the guard worth having, and
the third of them is the only case that measures half of it.** The refusal is
written `!subjectKnown && addressClaimed`, and the two counts are read by one
query whose `theirs` half already carries `AND google_sub <> the subject`, so
a returning person's own row is excluded from `addressClaimed` anyway. That
means "the original account still signs in" below passes with the
`!subjectKnown` term deleted; it was written as a control and is not one, and
the whole file was green against that mutation on 2026-09-03. The term only
does work for **a returning subject whose address at Google has since changed
to one another live account holds**, which is the case built below, and it is
the case that matters most in the product: this refusal is the one dead end
Dana has, there being no password reset and no second factor, so a guard that
fired here would lock somebody out of their own account behind a page telling
them it belongs to someone else. And an implementation that reached for the
naive Gmail normalisation would merge the dotted variant into the existing
account, which is exactly what the ruling defers: the dot variant must
provision its own account, because Dana does no normalisation at all (10.1,
8.7).

**The same rule is read a second time in the callback and the two must
agree.** `provisionUser` refuses inside its transaction; the callback re-reads
the standing after any provisioning fault, because two brand-new subjects can
race one address and the loser's collision arrives as an ordinary unique
violation the first read could not see. The last case here drives that second
read with a fault injected into the zone sync, which runs after provisioning
has committed and inside the same `try`: a returning person in the state above
who meets an unrelated fault must be refused in the ordinary way rather than
told the address belongs to somebody else, which is a sentence that would be
false and unanswerable.

The deletion case is here because it is the one way an address legitimately
becomes free again: 8.10 step 7 scrubs the email and sets deleted_at, and
`users_email_active_idx` is partial on `deleted_at IS NULL`. A guard written
without that predicate would lock the address away for ever.

Spec: 10.1 (the rule and the deferral), 9.2 (the copy), 7.1, 8.10 step 7,
8.7 (matching is equality and nothing more), 11.6.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { SUPPORT_EMAIL } from '../src/shared/support.js'
import {
  attemptSignIn,
  cleanupAuthSubs,
  expectNoSession,
  rawRequest,
  signIn,
  startAuthTestApp,
  userForSub,
  usersForSub,
  visibleText,
} from './auth-harness.js'
import type { AuthTestApp, RawResponse, UserRow } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac346-${randomUUID()}.test`
const firstSub = `sub-first-${randomUUID()}`
const secondSub = `sub-second-${randomUUID()}`
const dottedSub = `sub-dotted-${randomUUID()}`
const doomedSub = `sub-doomed-${randomUUID()}`
const heirSub = `sub-heir-${randomUUID()}`
// The returning subject whose address at Google moves onto a live account,
// and the account it moves onto.
const movedSub = `sub-moved-${randomUUID()}`
const holderSub = `sub-holder-${randomUUID()}`
// The same shape again, for the case that faults the zone sync.
const strandedSub = `sub-stranded-${randomUUID()}`
const rivalSub = `sub-rival-${randomUUID()}`

// Two real zones, neither of them UTC and neither plausibly the machine's
// own, so a sync that runs is a sync that writes (8.1) and the injected
// fault below is reached.
const HOME_ZONE = 'Asia/Karachi'
const AWAY_ZONE = 'Pacific/Auckland'

// One suffix per run: the trigger below is created by name in a database
// that other files share on the Postgres leg (helpers.ts).
const faultTag = randomUUID().replace(/-/g, '')

// Section 9.2, verbatim. Copy in section 9 is normative.
const HEADING = 'This email already has an account'
const BODY =
  'An account already uses this email address, and Dana never joins two ' +
  'accounts together. Sign in with the Google account you used the first ' +
  `time. If that still does not get you in, write to ${SUPPORT_EMAIL} and a ` +
  'person will answer.'

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  // Dropped here as well as inline: a mid-file failure would otherwise
  // strand it, and on the shared-Postgres leg a stranded trigger on users
  // breaks every other file's zone sync (AC-005 records the same hazard).
  await dropZoneSyncFault()
  await cleanupAuthSubs(app.db, [
    firstSub,
    secondSub,
    dottedSub,
    doomedSub,
    heirSub,
    movedSub,
    holderSub,
    strandedSub,
    rivalSub,
  ])
  await app.close()
})

/*
A provisioning fault that is not the collision, injected the way AC-005
injects its own: a trigger, scoped by name to one row, that raises when the
zone sync writes.

It has to fire on the UPDATE rather than on an insert, because this file
needs the fault *after* `provisionUser` has committed. `syncTimezone` is the
callback's second database call and sits inside the same `try`, so a throw
there is a provisioning fault as far as the handler is concerned and is the
only one a returning subject can reach without a race. That is what makes the
callback's re-read run at all: `error instanceof EmailAlreadyClaimedError`
short-circuits the `||` for every other way of arriving here, so nothing else
in the suite executes the second read.
*/
async function installZoneSyncFault(sub: string): Promise<void> {
  await app.db.execute(
    sql.raw(`
      CREATE FUNCTION dana_ac346_fault_${faultTag}() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN
        IF OLD.google_sub = '${sub}' THEN
          RAISE EXCEPTION 'injected zone-sync fault';
        END IF;
        RETURN NEW;
      END
      $fn$;
    `),
  )
  await app.db.execute(
    sql.raw(`
      CREATE TRIGGER dana_ac346_fault_trg_${faultTag}
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION dana_ac346_fault_${faultTag}();
    `),
  )
}

async function dropZoneSyncFault(): Promise<void> {
  await app.db.execute(
    sql.raw(`DROP TRIGGER IF EXISTS dana_ac346_fault_trg_${faultTag} ON users`),
  )
  await app.db.execute(
    sql.raw(`DROP FUNCTION IF EXISTS dana_ac346_fault_${faultTag}()`),
  )
}

/**
 * The refusal as the person meets it: either the page itself, or one
 * same-origin redirect to it. AC-008's shape, for the same reason: 9.2 says
 * the callback renders it, and rendering it after a redirect is the same
 * product behaviour.
 */
async function refusalPage(callback: RawResponse): Promise<RawResponse> {
  if (callback.contentType.includes('text/html')) return callback
  expect(
    callback.location,
    'the refusal neither rendered a page nor redirected to one (spec 9.2)',
  ).not.toBeNull()
  const target = new URL(callback.location ?? '', app.origin)
  expect(
    target.origin,
    'the refusal redirected off the application origin',
  ).toBe(app.origin)
  return rawRequest(target)
}

describe('AC-346: a second Google account on a claimed email', () => {
  test('AC-346: it is refused, explained, and nothing is created', async () => {
    const claimed = `taken@${domain}`
    app.stub.nextIdentity({
      sub: firstSub,
      email: claimed,
      email_verified: true,
      name: 'First Arrival',
    })
    await signIn(app)
    const before = await userForSub(app.db, firstSub)
    expect(before, 'the first account must exist before the collision').toBeDefined()

    app.stub.nextIdentity({
      sub: secondSub,
      email: claimed,
      email_verified: true,
      name: 'Second Google Account',
    })
    const { callback } = await attemptSignIn(app)

    expectNoSession(callback, 'the email already belongs to another account')
    expect(
      await usersForSub(app.db, secondSub),
      'a refused sign-in created a second user row (spec 10.1)',
    ).toHaveLength(0)
    expect(
      await userForSub(app.db, firstSub),
      'the refused sign-in touched the account that holds the address (spec 10.1)',
    ).toEqual(before as UserRow)

    const page = await refusalPage(callback)
    const text = visibleText(page.body)
    expect(
      text,
      `the 9.2 claimed-email heading is missing; the person was told only that sign-in failed: ${text}`,
    ).toContain(HEADING)
    expect(text, 'the 9.2 body copy is missing or reworded').toContain(BODY)

    const links = [
      ...page.body.matchAll(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi),
    ]
    const support = links.find((link) =>
      (link[1] ?? '').startsWith(`mailto:${SUPPORT_EMAIL}`),
    )
    expect(
      support,
      `the ruling asks the page to point at support; found ${JSON.stringify(links.map((link) => link[1]))}`,
    ).toBeDefined()
    const back = links.find((link) => visibleText(link[2] ?? '') === 'Back to Dana')
    expect(back, 'and 9.2 gives it a way back to the landing page').toBeDefined()
    expect(
      new URL(back?.[1] ?? '', app.origin).pathname,
      'which returns to the landing page (spec 9.2)',
    ).toBe('/')
  })

  test('AC-346 negative control: the original account still signs in', async () => {
    // A guard that refused any address already in the users table would
    // refuse every returning login, and the case above cannot tell the two
    // apart. This one can.
    app.stub.nextIdentity({
      sub: firstSub,
      email: `taken@${domain}`,
      email_verified: true,
      name: 'First Arrival',
    })
    const { session } = await signIn(app)
    expect(
      session.value,
      'the account that holds the address goes on signing in (spec 7.1)',
    ).not.toBe('')
    expect(
      await usersForSub(app.db, firstSub),
      'and it is still one account, adopted rather than created again (spec 7.1, INV-2)',
    ).toHaveLength(1)
  })

  test('AC-346 negative control: a returning subject whose address moved onto a live account still signs in', async () => {
    /*
    The case the control above cannot construct, and the only one the
    `!subjectKnown` half of the guard decides. `emailStanding`'s `theirs`
    count already carries `AND google_sub <> the subject`, so a returning
    login on an unchanged address is never "claimed" whatever the guard says.
    It takes a second live account holding the address the subject now
    presents, which is what happens when somebody changes the address on
    their Google account: Dana never rewrites a stored email for a subject it
    already knows (7.1), so the two drift apart and one can drift onto
    somebody else's.

    Refusing here would be the product's one unrecoverable failure. There is
    no password reset and no second factor, so the person would be locked out
    of their own account behind a page telling them it belongs to someone
    else, and the page's own advice, sign in with the account you used the
    first time, is the thing they just did.
    */
    const holderAddress = `holder@${domain}`
    app.stub.nextIdentity({
      sub: holderSub,
      email: holderAddress,
      email_verified: true,
      name: 'Address Holder',
    })
    await signIn(app)
    const holderBefore = await userForSub(app.db, holderSub)
    expect(holderBefore, 'the address needs a live holder for this case').toBeDefined()

    const ownAddress = `moved@${domain}`
    app.stub.nextIdentity({
      sub: movedSub,
      email: ownAddress,
      email_verified: true,
      name: 'Moved Person',
    })
    await signIn(app)
    const before = await userForSub(app.db, movedSub)
    expect(
      before?.email,
      'the returning subject starts on an address of its own',
    ).toBe(ownAddress)

    // Google now reports the other account's address for the same subject.
    app.stub.nextIdentity({
      sub: movedSub,
      email: holderAddress,
      email_verified: true,
      name: 'Moved Person',
    })
    const { browser, session } = await signIn(app)
    expect(
      session.value,
      'a subject Dana already knows signs in whatever address Google now reports for it (spec 7.1, 10.1)',
    ).not.toBe('')

    const me = await browser.json('/me', 'GET')
    expect(me.status, 'the session reads its own account').toBe(200)
    expect(
      (me.json() as { user?: { id?: unknown } }).user?.id,
      'and it is their own account rather than the one that holds the address: refusing is not the only way to hand somebody the wrong account (Imran’s ruling on issue #17)',
    ).toBe(before?.id)

    expect(
      await usersForSub(app.db, movedSub),
      'still one row, adopted rather than created again (spec 7.1, INV-2)',
    ).toHaveLength(1)
    expect(
      (await userForSub(app.db, movedSub))?.email,
      'and the stored email is not rewritten by a returning login, which is why the two can drift apart at all (spec 7.1)',
    ).toBe(ownAddress)
    expect(
      await userForSub(app.db, holderSub),
      'the account that holds the address is untouched by the other subject signing in',
    ).toEqual(holderBefore as UserRow)
  })

  test('AC-346: a returning subject meeting an unrelated fault is refused in the ordinary way', async () => {
    /*
    The callback reads the standing a second time after any provisioning
    fault, and that read has to answer the same question `provisionUser`
    asked. A re-read that looked at `addressClaimed` alone would tell the
    person above, in the one state where the two counts disagree, that their
    address belongs to somebody else, for a fault that has nothing to do with
    their address.

    It is a wrong sentence on a path that was already failing rather than a
    new failure, which is why the assertion is about which refusal arrives
    and not about whether one does. Two halves of one rule written two ways
    is how one of them is later "corrected" to match the wrong one.

    This is also the only case in the suite that executes the second read at
    all: every other route into the handler's catch carries
    `EmailAlreadyClaimedError`, which short-circuits the `||` before the
    re-read is reached.
    */
    const rivalAddress = `rival@${domain}`
    app.stub.nextIdentity({
      sub: rivalSub,
      email: rivalAddress,
      email_verified: true,
      name: 'Rival Holder',
    })
    await signIn(app)

    app.stub.nextIdentity({
      sub: strandedSub,
      email: `stranded@${domain}`,
      email_verified: true,
      name: 'Stranded Person',
    })
    await signIn(app, { tz: HOME_ZONE })

    await installZoneSyncFault(strandedSub)
    try {
      // The same subject, now reporting the rival's address and a different
      // zone: provisioning adopts and commits, and syncTimezone raises.
      app.stub.nextIdentity({
        sub: strandedSub,
        email: rivalAddress,
        email_verified: true,
        name: 'Stranded Person',
      })
      const { callback } = await attemptSignIn(app, { tz: AWAY_ZONE })

      expectNoSession(callback, 'provisioning faulted after the transaction committed')
      const page = await refusalPage(callback)
      expect(
        visibleText(page.body),
        'a returning subject was told the address belongs to another account for a fault that was not about the address (spec 10.1, 9.2)',
      ).not.toContain(HEADING)
      expect(
        new URL(callback.location ?? '', app.origin).pathname,
        'the ordinary refusal is the landing page with 9.1’s marker, not a page section 9 wrote for a different reason',
      ).toBe('/')
    } finally {
      await dropZoneSyncFault()
    }

    // And the fault took nothing with it that would matter next time: the
    // account is still there and still its own.
    expect(
      await usersForSub(app.db, strandedSub),
      'the failed sign-in left the account it adopted alone (spec 7.1)',
    ).toHaveLength(1)
  })

  test('AC-346: a Gmail dot variant is a different address and provisions', async () => {
    // 8.7 and 10.1: matching is equality and nothing more, and the dotted
    // question is deferred rather than answered by normalisation. An
    // implementation that stripped dots would refuse this sign-in, or worse,
    // hand this person the other account.
    const [local, host] = `dotted@${domain}`.split('@') as [string, string]
    const variant = `${local.slice(0, 3)}.${local.slice(3)}@${host}`

    app.stub.nextIdentity({
      sub: doomedSub,
      email: `${local}@${host}`,
      email_verified: true,
      name: 'Undotted Person',
    })
    await signIn(app)

    app.stub.nextIdentity({
      sub: dottedSub,
      email: variant,
      email_verified: true,
      name: 'Dotted Person',
    })
    const { session } = await signIn(app)
    expect(
      session.value,
      'the dot variant is a different address and gets its own account (spec 10.1, 8.7)',
    ).not.toBe('')
    const dotted = await usersForSub(app.db, dottedSub)
    expect(dotted, 'exactly one account for the dotted subject').toHaveLength(1)
    expect(
      String(dotted[0]?.id),
      'and it is not the undotted person’s account: nothing was joined (Imran’s ruling on issue #17)',
    ).not.toBe(String((await userForSub(app.db, doomedSub))?.id))
  })

  test('AC-346: an address released by account deletion is claimable again', async () => {
    const released = `released@${domain}`
    app.stub.nextIdentity({
      sub: heirSub,
      email: released,
      email_verified: true,
      name: 'Temporary Holder',
    })
    const holder = await signIn(app)
    const deletion = await holder.browser.json('/me', 'DELETE', {
      confirm: 'DELETE',
    })
    expect(
      deletion.status,
      `the account deletes with the literal confirm (spec 7.1); answered ${String(deletion.status)}`,
    ).toBe(204)

    // 8.10 step 7 nulls the email and stamps deleted_at, and
    // users_email_active_idx is partial on deleted_at IS NULL, so the address
    // is free. A collision guard written without that predicate would hold it
    // for ever.
    const fresh = `sub-heir-again-${randomUUID()}`
    app.stub.nextIdentity({
      sub: fresh,
      email: released,
      email_verified: true,
      name: 'New Holder',
    })
    const { session } = await signIn(app)
    expect(
      session.value,
      'a deleted account releases its address (spec 8.10 step 7, 10.1)',
    ).not.toBe('')
    await cleanupAuthSubs(app.db, [fresh])
  })
})
