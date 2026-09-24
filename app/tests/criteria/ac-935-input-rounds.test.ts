/*
AC-935..AC-940: Consultation structured input rounds (issue #321).

- AC-935: who may read, open, close and respond, measured on the stored rows:
  a stranger is 404 everywhere and writes nothing; Can view reads and is
  refused (403) opening and responding; Can comment responds; the
  Discussion's creator with Can comment opens and closes (stewardship), a
  non-creator Can comment may not; a creator downgraded to Can view loses
  both at once; Can edit+ closes any round.
- AC-936: at most one open round per Discussion, held by the partial unique
  index `discussion_input_rounds_one_open_key` (SQLSTATE 23505 on that name)
  and answered 409 by the route; a new round opens once the first closes.
- AC-937: one current response per participant, stored as the mode's own
  columns: a choice changes in place and withdraws to no row; counts are
  plain per-option counts; a closed round freezes its responses (409, rows
  unchanged).
- AC-938: advice needs a non-blank body and concerns needs a reason for
  `concern`, at the route (422) and in the database
  (`discussion_input_responses_shape_check`, 23514); choose needs two or
  more options.
- AC-939: resolving the Discussion closes its open round in the same
  transaction (`onDiscussionResolved`), a resolved or trashed Discussion
  refuses opening and responding, and reopening reopens no round.
- AC-940: deleting a Discussion cascades to its rounds, options and
  responses.

Spec: 7.29, 4.33. Issue #321.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { InputRound } from '../../src/shared/consultation-input.js'
import { inTransaction } from '../../src/server/database.js'
import { onDiscussionResolved } from '../../src/server/domain/consultation-hooks.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  addMemberOk,
  Cast,
  connect,
  countRows,
  createFolder,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(
  ['owner', 'creator', 'commenter', 'viewer', 'stranger'],
  'ac935',
)
const folders: string[] = []

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  for (const id of folders) {
    await app.db.execute(sql`DELETE FROM folders WHERE id = ${id}::uuid`)
  }
  await cast.cleanup(app.db)
  await app.close()
})

interface World {
  owner: Actor
  creator: Actor
  commenter: Actor
  viewer: Actor
  stranger: Actor
  folderId: string
}

let world: World | undefined

async function worldOf(): Promise<World> {
  if (world !== undefined) return world
  const [owner, creator, commenter, viewer, stranger] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await createFolder(owner, 'ac935 input')
  folders.push(folderId)
  for (const [actor, access] of [
    [creator, 'can_comment'],
    [commenter, 'can_comment'],
    [viewer, 'can_view'],
  ] as const) {
    await connect(app.db, owner.id, actor.id)
    await addMemberOk(owner, folderId, actor.id, access)
  }
  world = { owner, creator, commenter, viewer, stranger, folderId }
  return world
}

async function makeDiscussion(folderId: string, createdBy: string): Promise<string> {
  const made = await rows(
    app.db,
    sql`INSERT INTO discussions (folder_id, title, created_by)
        VALUES (${folderId}::uuid, 'ac935 discussion', ${createdBy}::uuid)
        RETURNING id`,
  )
  return String(made[0]?.id)
}

async function openRound(
  actor: Actor,
  discussionId: string,
  body: Record<string, unknown>,
): Promise<InputRound> {
  const opened = await actor.browser.json(
    `/discussions/${discussionId}/input-rounds`,
    'POST',
    body,
  )
  expectStatus(opened, 201, 'the round opens (#321)')
  return opened.json() as InputRound
}

const respond = (actor: Actor, roundId: string, body: Record<string, unknown>) =>
  actor.browser.json(`/input-rounds/${roundId}/response`, 'PUT', body)

const responsesIn = (roundId: string) =>
  rows(
    app.db,
    sql`SELECT user_id, mode, option_id, concern, body
          FROM discussion_input_responses WHERE round_id = ${roundId}::uuid
         ORDER BY created_at`,
  )

const roundRow = async (roundId: string) =>
  (
    await rows(
      app.db,
      sql`SELECT state, close_reason, closed_by FROM discussion_input_rounds
           WHERE id = ${roundId}::uuid`,
    )
  )[0]

/** The server error's SQLSTATE and constraint, through drizzle's wrapper. */
function pgFacts(error: unknown): { code?: string; constraint?: string } {
  let current = error as { code?: string; constraint?: string; cause?: unknown } | undefined
  while (current !== undefined && current !== null) {
    if (typeof current.code === 'string') {
      return { code: current.code, constraint: current.constraint }
    }
    current = current.cause as typeof current
  }
  return {}
}

async function refusal(run: () => Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await run()
  } catch (error) {
    return pgFacts(error)
  }
  throw new Error('the statement was expected to be refused')
}

describe('AC-935..AC-940 Consultation structured input rounds', () => {
  test('AC-935: authorization follows Folder Access and creator stewardship', async () => {
    const { owner, creator, commenter, viewer, stranger, folderId } = await worldOf()
    const discussionId = await makeDiscussion(folderId, creator.id)
    const roundsOfDiscussion = sql`SELECT count(*)::int AS n FROM discussion_input_rounds
                                    WHERE discussion_id = ${discussionId}::uuid`

    /* A stranger: 404 on the Discussion, and nothing written. */
    expectStatus(
      await stranger.browser.json(`/discussions/${discussionId}/input-rounds`, 'GET'),
      404,
      'a stranger reads nothing (10.2)',
    )
    expectStatus(
      await stranger.browser.json(`/discussions/${discussionId}/input-rounds`, 'POST', {
        mode: 'advice',
        prompt: 'stranger',
      }),
      404,
      'a stranger opens nothing (10.2)',
    )
    expect(await countRows(app.db, roundsOfDiscussion)).toBe(0)

    /* Can view reads and may not ask for input. */
    expectStatus(
      await viewer.browser.json(`/discussions/${discussionId}/input-rounds`, 'GET'),
      200,
      'Can view reads rounds (#321)',
    )
    expectStatus(
      await viewer.browser.json(`/discussions/${discussionId}/input-rounds`, 'POST', {
        mode: 'advice',
        prompt: 'viewer',
      }),
      403,
      'Can view may not open a round (#321)',
    )
    /* A Can-comment member who did not create the Discussion may not. */
    expectStatus(
      await commenter.browser.json(`/discussions/${discussionId}/input-rounds`, 'POST', {
        mode: 'advice',
        prompt: 'not the creator',
      }),
      403,
      "Can comment opens a round only in their own Discussion (#321)",
    )
    expect(await countRows(app.db, roundsOfDiscussion)).toBe(0)

    /* The creator with Can comment asks for input. */
    const round = await openRound(creator, discussionId, {
      mode: 'advice',
      prompt: 'What should we watch for?',
    })
    const stored = await rows(
      app.db,
      sql`SELECT mode, prompt, created_by, state FROM discussion_input_rounds
           WHERE id = ${round.id}::uuid`,
    )
    expect(stored[0]).toEqual({
      mode: 'advice',
      prompt: 'What should we watch for?',
      created_by: creator.id,
      state: 'open',
    })

    /* Responding: Can comment yes, Can view no, stranger 404. */
    expectStatus(
      await respond(commenter, round.id, { body: 'Mind the migration order.' }),
      200,
      'Can comment responds (#321)',
    )
    expectStatus(
      await respond(viewer, round.id, { body: 'viewer advice' }),
      403,
      'Can view may not respond (#321)',
    )
    expectStatus(
      await respond(stranger, round.id, { body: 'stranger advice' }),
      404,
      'a stranger may not respond (10.2)',
    )
    expectStatus(
      await stranger.browser.json(`/input-rounds/${round.id}`, 'GET'),
      404,
      'a stranger reads no round (10.2)',
    )
    expect(await responsesIn(round.id)).toEqual([
      {
        user_id: commenter.id,
        mode: 'advice',
        option_id: null,
        concern: null,
        body: 'Mind the migration order.',
      },
    ])

    /* A viewer reads the response, with its actor. */
    const read = await viewer.browser.json(`/input-rounds/${round.id}`, 'GET')
    expectStatus(read, 200, 'Can view reads the round (#321)')
    expect((read.json() as InputRound).responses.map((r) => r.user_id)).toEqual([
      commenter.id,
    ])

    /* A downgrade takes the creator's stewardship and the commenter's
       response power at once. */
    await app.db.execute(
      sql`UPDATE folder_members SET access = 'can_view'
           WHERE folder_id = ${folderId}::uuid
             AND user_id IN (${creator.id}::uuid, ${commenter.id}::uuid)`,
    )
    expectStatus(
      await creator.browser.json(`/input-rounds/${round.id}/close`, 'POST', {}),
      403,
      'a creator below Can comment loses stewardship (#321)',
    )
    expectStatus(
      await respond(commenter, round.id, { body: 'changed after downgrade' }),
      403,
      'Access downgrade removes response power (#321)',
    )
    expectStatus(
      await commenter.browser.json(`/input-rounds/${round.id}/response`, 'DELETE'),
      403,
      'Access downgrade removes withdraw power (#321)',
    )
    expect((await roundRow(round.id))?.state).toBe('open')
    expect((await responsesIn(round.id))[0]?.body).toBe('Mind the migration order.')

    /* Can edit+ closes any round; the owner holds Full control. */
    const closed = await owner.browser.json(`/input-rounds/${round.id}/close`, 'POST', {})
    expectStatus(closed, 200, 'Can edit+ closes a round (#321)')
    expect(await roundRow(round.id)).toEqual({
      state: 'closed',
      close_reason: 'closed',
      closed_by: owner.id,
    })

    await app.db.execute(
      sql`UPDATE folder_members SET access = 'can_comment'
           WHERE folder_id = ${folderId}::uuid
             AND user_id IN (${creator.id}::uuid, ${commenter.id}::uuid)`,
    )
  })

  test('AC-936: at most one open round per Discussion', async () => {
    const { owner, folderId } = await worldOf()
    const discussionId = await makeDiscussion(folderId, owner.id)
    const first = await openRound(owner, discussionId, { mode: 'advice', prompt: 'first' })

    expectStatus(
      await owner.browser.json(`/discussions/${discussionId}/input-rounds`, 'POST', {
        mode: 'concerns',
        prompt: 'second',
      }),
      409,
      'a second open round is refused (#321)',
    )
    const refused = await refusal(() =>
      app.db.execute(
        sql`INSERT INTO discussion_input_rounds (discussion_id, mode, prompt, created_by)
            VALUES (${discussionId}::uuid, 'advice', 'raw second', ${owner.id}::uuid)`,
      ),
    )
    expect(refused).toEqual({
      code: '23505',
      constraint: 'discussion_input_rounds_one_open_key',
    })

    expectStatus(
      await owner.browser.json(`/input-rounds/${first.id}/close`, 'POST', {}),
      200,
      'the first round closes',
    )
    expectStatus(
      await owner.browser.json(`/input-rounds/${first.id}/close`, 'POST', {}),
      409,
      'a closed round does not close again',
    )
    await openRound(owner, discussionId, { mode: 'concerns', prompt: 'second, later' })
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM discussion_input_rounds
             WHERE discussion_id = ${discussionId}::uuid AND state = 'open'`,
      ),
    ).toBe(1)
  })

  test('AC-937: one current choice, changed and withdrawn in place, frozen at close', async () => {
    const { owner, creator, commenter, folderId } = await worldOf()
    const discussionId = await makeDiscussion(folderId, owner.id)
    const round = await openRound(owner, discussionId, {
      mode: 'choose',
      prompt: 'Which week?',
      options: ['This week', 'Next week'],
    })
    const [thisWeek, nextWeek] = round.options as [
      InputRound['options'][number],
      InputRound['options'][number],
    ]
    expect(round.options.map((o) => o.label)).toEqual(['This week', 'Next week'])

    expectStatus(await respond(commenter, round.id, { option_id: thisWeek.id }), 200, 'chooses')
    expectStatus(await respond(commenter, round.id, { option_id: nextWeek.id }), 200, 'changes')
    const changed = await respond(creator, round.id, { option_id: nextWeek.id })
    expectStatus(changed, 200, 'a second participant chooses')
    expect(await responsesIn(round.id)).toEqual([
      { user_id: commenter.id, mode: 'choose', option_id: nextWeek.id, concern: null, body: null },
      { user_id: creator.id, mode: 'choose', option_id: nextWeek.id, concern: null, body: null },
    ])
    /* Plain counts; nothing on the round or the Discussion names a winner. */
    expect((changed.json() as InputRound).choice_counts).toEqual([
      { option_id: thisWeek.id, count: 0 },
      { option_id: nextWeek.id, count: 2 },
    ])
    const discussion = await rows(
      app.db,
      sql`SELECT state, current_outcome_id FROM discussions WHERE id = ${discussionId}::uuid`,
    )
    expect(discussion[0]).toEqual({ state: 'open', current_outcome_id: null })

    /* An option of another round is not this round's. */
    const other = await makeDiscussion(folderId, owner.id)
    const otherRound = await openRound(owner, other, {
      mode: 'choose',
      prompt: 'other',
      options: ['a', 'b'],
    })
    expectStatus(
      await respond(commenter, round.id, { option_id: otherRound.options[0]!.id }),
      422,
      "an option must be the round's own",
    )

    expectStatus(
      await commenter.browser.json(`/input-rounds/${round.id}/response`, 'DELETE'),
      204,
      'withdraws',
    )
    expect((await responsesIn(round.id)).map((r) => r.user_id)).toEqual([creator.id])

    expectStatus(
      await owner.browser.json(`/input-rounds/${round.id}/close`, 'POST', {}),
      200,
      'closes',
    )
    expectStatus(
      await respond(creator, round.id, { option_id: thisWeek.id }),
      409,
      'a closed round refuses a change',
    )
    expectStatus(
      await creator.browser.json(`/input-rounds/${round.id}/response`, 'DELETE'),
      409,
      'a closed round refuses a withdraw',
    )
    expectStatus(
      await respond(commenter, round.id, { option_id: thisWeek.id }),
      409,
      'a closed round refuses a new response',
    )
    expect(await responsesIn(round.id)).toEqual([
      { user_id: creator.id, mode: 'choose', option_id: nextWeek.id, concern: null, body: null },
    ])
  })

  test('AC-938: each mode holds its own shape, at the route and in the database', async () => {
    const { owner, commenter, folderId } = await worldOf()
    const discussionId = await makeDiscussion(folderId, owner.id)

    expectStatus(
      await owner.browser.json(`/discussions/${discussionId}/input-rounds`, 'POST', {
        mode: 'choose',
        prompt: 'one option',
        options: ['only'],
      }),
      422,
      'choose needs two or more options',
    )
    expectStatus(
      await owner.browser.json(`/discussions/${discussionId}/input-rounds`, 'POST', {
        mode: 'vote',
        prompt: 'not a mode',
      }),
      422,
      'mode is one of choose/advice/concerns',
    )

    const concerns = await openRound(owner, discussionId, {
      mode: 'concerns',
      prompt: 'Any objection?',
    })
    expectStatus(
      await respond(commenter, concerns.id, { concern: 'concern' }),
      422,
      'a concern needs a reason',
    )
    expectStatus(
      await respond(commenter, concerns.id, { concern: 'concern', body: '   ' }),
      422,
      'a blank reason is no reason',
    )
    expectStatus(
      await respond(commenter, concerns.id, { option_id: concerns.id }),
      422,
      'concerns has no options',
    )
    expect(await responsesIn(concerns.id)).toEqual([])
    expectStatus(
      await respond(commenter, concerns.id, { concern: 'concern', body: 'It deletes data.' }),
      200,
      'a concern with a reason',
    )
    expect(await responsesIn(concerns.id)).toEqual([
      {
        user_id: commenter.id,
        mode: 'concerns',
        option_id: null,
        concern: 'concern',
        body: 'It deletes data.',
      },
    ])
    expectStatus(
      await respond(commenter, concerns.id, { concern: 'no_concern' }),
      200,
      'revised to no concern',
    )
    expect((await responsesIn(concerns.id))[0]).toMatchObject({
      concern: 'no_concern',
      body: null,
    })

    const refused = await refusal(() =>
      app.db.execute(
        sql`UPDATE discussion_input_responses SET concern = 'concern', body = NULL
             WHERE round_id = ${concerns.id}::uuid`,
      ),
    )
    expect(refused).toEqual({
      code: '23514',
      constraint: 'discussion_input_responses_shape_check',
    })

    await owner.browser.json(`/input-rounds/${concerns.id}/close`, 'POST', {})
    const advice = await openRound(owner, discussionId, { mode: 'advice', prompt: 'Advice?' })
    expectStatus(await respond(commenter, advice.id, { body: '' }), 422, 'advice cannot be empty')
    expectStatus(
      await respond(commenter, advice.id, { body: 'x', concern: 'concern' }),
      422,
      'advice takes no concern',
    )
    expectStatus(await respond(commenter, advice.id, { body: 'Ship it small.' }), 200, 'advice')
    const read = (
      await commenter.browser.json(`/input-rounds/${advice.id}`, 'GET')
    ).json() as InputRound
    expect(read.choice_counts, 'advice is not tallied').toBeNull()
    expect(read.my_response?.body).toBe('Ship it small.')
  })

  test('AC-939: resolving closes the open round atomically; resolved and trashed Discussions refuse input; reopening reopens nothing', async () => {
    const { owner, commenter, folderId } = await worldOf()
    const discussionId = await makeDiscussion(folderId, owner.id)
    const round = await openRound(owner, discussionId, { mode: 'advice', prompt: 'Before we decide' })

    /* The resolve U10's route runs, in miniature: one transaction that
       writes the Outcome, resolves, and calls the hook. */
    await inTransaction(app.db, async (tx) => {
      await tx.execute(sql`SELECT id FROM discussions WHERE id = ${discussionId}::uuid FOR UPDATE`)
      const outcome = (await tx.execute(
        sql`INSERT INTO discussion_outcomes (discussion_id, statement, actor_id)
            VALUES (${discussionId}::uuid, 'Decided.', ${owner.id}::uuid) RETURNING id`,
      )) as unknown as { rows: { id: string }[] }
      await tx.execute(
        sql`UPDATE discussions SET state = 'resolved', resolved_at = now(),
                   resolved_by = ${owner.id}::uuid,
                   current_outcome_id = ${outcome.rows[0]!.id}::uuid
             WHERE id = ${discussionId}::uuid`,
      )
      await onDiscussionResolved(tx, discussionId)
    })
    expect(await roundRow(round.id)).toEqual({
      state: 'closed',
      close_reason: 'discussion_resolved',
      closed_by: null,
    })

    expectStatus(
      await owner.browser.json(`/discussions/${discussionId}/input-rounds`, 'POST', {
        mode: 'advice',
        prompt: 'after resolve',
      }),
      409,
      'a resolved Discussion opens no round (#321)',
    )
    expectStatus(
      await respond(commenter, round.id, { body: 'too late' }),
      409,
      'a resolved Discussion takes no response (#321)',
    )
    expect(await responsesIn(round.id)).toEqual([])

    /* Reopen, as U10's route does it: clear the resolution. */
    await app.db.execute(
      sql`UPDATE discussions SET state = 'open', resolved_at = NULL, current_outcome_id = NULL
           WHERE id = ${discussionId}::uuid`,
    )
    expect((await roundRow(round.id))?.state).toBe('closed')
    const next = await openRound(owner, discussionId, { mode: 'advice', prompt: 'after reopen' })
    expect(next.id).not.toBe(round.id)

    /* Trash refuses input too. */
    await app.db.execute(
      sql`UPDATE discussions SET trashed_at = now() WHERE id = ${discussionId}::uuid`,
    )
    expectStatus(
      await respond(commenter, next.id, { body: 'in trash' }),
      409,
      'a trashed Discussion takes no response',
    )
    expect(await responsesIn(next.id)).toEqual([])
  })

  test('AC-940: deleting a Discussion takes its rounds, options and responses', async () => {
    const { owner, commenter, folderId } = await worldOf()
    const discussionId = await makeDiscussion(folderId, owner.id)
    const round = await openRound(owner, discussionId, {
      mode: 'choose',
      prompt: 'doomed',
      options: ['a', 'b'],
    })
    expectStatus(
      await respond(commenter, round.id, { option_id: round.options[0]!.id }),
      200,
      'responds',
    )
    await app.db.execute(sql`DELETE FROM discussions WHERE id = ${discussionId}::uuid`)
    const left = await rows(
      app.db,
      sql`SELECT
            (SELECT count(*)::int FROM discussion_input_rounds WHERE id = ${round.id}::uuid) AS rounds,
            (SELECT count(*)::int FROM discussion_input_options WHERE round_id = ${round.id}::uuid) AS options,
            (SELECT count(*)::int FROM discussion_input_responses WHERE round_id = ${round.id}::uuid) AS responses`,
    )
    expect(left[0]).toEqual({ rounds: 0, options: 0, responses: 0 })
  })
})
