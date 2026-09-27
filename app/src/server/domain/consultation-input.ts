/*
Structured input rounds (issue #321): "Ask for input" inside a Discussion.
The contract is `shared/consultation-input.ts`; storage is migration 0030.

## The refusal order

**404, then 422, then 403, then 409**, the facets order (routes/facets.ts):
the Discussion must exist in a Folder the viewer is a member of (else 404,
10.2), then the body must be well formed for the round's mode (422), then
`mayPerform` (403), then the row state -- a resolved or trashed Discussion, a
closed round, a second open round (409).

## Every decision runs under the Discussion's row lock

Each mutation opens one transaction, takes `FOR UPDATE` on the Discussion
row, and resolves access **inside it** (`accessOf(tx, ...)`), so:

- the preset and the creator binding a gate reads are the ones the write
  sees: a member downgraded below Can comment a moment ago cannot respond,
  and a creator downgraded loses stewardship at once (#321 "authorship alone
  does not preserve mutation power after an Access downgrade");
- the Discussion's own state (open/resolved/trashed) cannot change between
  the check and the write: resolving (U10's transaction) takes the same lock
  and closes the open round through `onDiscussionResolved`, so a response
  either lands before the resolve or is refused after it, never beside it.

Every write to a round's state happens under that lock too, which is why a
round's state is read without a lock of its own.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import {
  INPUT_OPTIONS_MIN,
  type ConcernValue,
  type InputCloseReason,
  type InputMode,
  type InputOption,
  type InputResponse,
  type InputRound,
  type InputRoundState,
  type OpenInputRoundBody,
  type PutInputResponseBody,
} from '../../shared/consultation-input.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { accessOf, mayPerform } from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'

export type InputOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not_found' }
  | { kind: 'invalid'; field: string; message: string }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'conflict'; message: string }

const notFound = { kind: 'not_found' } as const
const invalid = (field: string, message: string) =>
  ({ kind: 'invalid', field, message }) as const
const conflict = (message: string) => ({ kind: 'conflict', message }) as const

/* ------------------------------------------------------------------ *
 * Serialization
 * ------------------------------------------------------------------ */

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value)
}

function responseFromRow(row: Record<string, unknown>): InputResponse {
  return {
    user_id: String(row.user_id),
    option_id: nullableString(row.option_id),
    concern: nullableString(row.concern) as ConcernValue | null,
    body: nullableString(row.body),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  }
}

/**
 * The rounds of one Discussion (or one round of it), newest first, with
 * their options, every current response and the choose counts.
 *
 * It trusts its caller to have decided the viewer may read the Discussion:
 * it is reached only after `discussion.read`.
 */
async function roundsOf(
  executor: Executor,
  viewerId: string,
  discussionId: string,
  roundId?: string,
): Promise<InputRound[]> {
  const only = roundId === undefined ? sql`` : sql` AND id = ${roundId}::uuid`
  const rounds = await rowsOf(
    executor,
    sql`SELECT id, discussion_id, mode, prompt, state, created_by, created_at,
               close_reason, closed_by, closed_at
          FROM discussion_input_rounds
         WHERE discussion_id = ${discussionId}::uuid${only}
         ORDER BY created_at DESC, id DESC`,
  )
  if (rounds.length === 0) return []

  const scope = sql`(SELECT id FROM discussion_input_rounds
                      WHERE discussion_id = ${discussionId}::uuid${only})`
  const options = await rowsOf(
    executor,
    sql`SELECT id, round_id, label, position FROM discussion_input_options
         WHERE round_id IN ${scope}
         ORDER BY round_id, position`,
  )
  const responses = await rowsOf(
    executor,
    sql`SELECT round_id, user_id, option_id, concern, body, created_at, updated_at
          FROM discussion_input_responses
         WHERE round_id IN ${scope}
         ORDER BY created_at, id`,
  )

  return rounds.map((row): InputRound => {
    const id = String(row.id)
    const mode = String(row.mode) as InputMode
    const roundOptions: InputOption[] = options
      .filter((option) => String(option.round_id) === id)
      .map((option) => ({
        id: String(option.id),
        label: String(option.label),
        position: Number(option.position),
      }))
    const roundResponses = responses
      .filter((response) => String(response.round_id) === id)
      .map(responseFromRow)
    /* Plain counts and nothing derived from them: no winner, no ranking,
       no threshold (#321 test 8). */
    const choiceCounts =
      mode === 'choose'
        ? roundOptions.map((option) => ({
            option_id: option.id,
            count: roundResponses.filter((r) => r.option_id === option.id).length,
          }))
        : null
    return {
      id,
      discussion_id: String(row.discussion_id),
      mode,
      prompt: String(row.prompt),
      state: String(row.state) as InputRoundState,
      created_by: String(row.created_by),
      created_at: toIso(row.created_at),
      close_reason: nullableString(row.close_reason) as InputCloseReason | null,
      closed_by: nullableString(row.closed_by),
      closed_at: nullableIso(row.closed_at),
      options: roundOptions,
      responses: roundResponses,
      choice_counts: choiceCounts,
      my_response:
        roundResponses.find((response) => response.user_id === viewerId) ?? null,
    }
  })
}

/* ------------------------------------------------------------------ *
 * The Discussion under its lock
 * ------------------------------------------------------------------ */

interface DiscussionFacts {
  id: string
  folderId: string
  createdBy: string
  state: 'open' | 'resolved'
  trashed: boolean
  facts: FolderActorFacts
}

/**
 * The Discussion and the viewer's facts in its Folder, or null for "no such
 * Discussion, or not a member of its Folder" -- one answer, 404 (10.2).
 * `accessOf` also answers null for a Folder in Trash.
 */
async function discussionFor(
  tx: Executor,
  viewerId: string,
  discussionId: string,
  lock: boolean,
): Promise<DiscussionFacts | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT id, folder_id, created_by, state, trashed_at
          FROM discussions WHERE id = ${discussionId}::uuid
          ${lock ? sql`FOR UPDATE` : sql``}`,
  )
  const row = found[0]
  if (row === undefined) return null
  const folderId = String(row.folder_id)
  const facts = await accessOf(tx, viewerId, folderId)
  if (facts === null) return null
  return {
    id: String(row.id),
    folderId,
    createdBy: String(row.created_by),
    state: String(row.state) === 'resolved' ? 'resolved' : 'open',
    trashed: row.trashed_at !== null && row.trashed_at !== undefined,
    facts,
  }
}

/** The Discussion a round belongs to, read without a lock: a round never
 * moves between Discussions, so this is only the key to lock by. */
async function discussionOfRound(
  executor: Executor,
  roundId: string,
): Promise<string | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT discussion_id FROM discussion_input_rounds WHERE id = ${roundId}::uuid`,
  )
  const row = found[0]
  return row === undefined ? null : String(row.discussion_id)
}

/** 409 for a Discussion that no longer takes input: resolved (#321 "round
 * creation/response mutation is refused on a resolved Discussion") or in
 * Trash. */
function closedToInput(discussion: DiscussionFacts) {
  if (discussion.trashed) return conflict('This discussion is in Trash.')
  if (discussion.state === 'resolved') return conflict('This discussion is resolved.')
  return null
}

async function touch(tx: Executor, discussionId: string): Promise<void> {
  await rowsOf(
    tx,
    sql`UPDATE discussions SET last_activity_at = now()
         WHERE id = ${discussionId}::uuid`,
  )
}

/** SQLSTATE 23505 on the named index, never the server's prose. */
function violates(error: unknown, constraint: string): boolean {
  const e = error as { code?: unknown; constraint?: unknown; cause?: unknown } | null
  if (e === null || typeof e !== 'object') return false
  if (e.code === '23505' && e.constraint === constraint) return true
  return e.cause !== undefined && violates(e.cause, constraint)
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export async function listInputRounds(
  db: Db,
  viewerId: string,
  discussionId: string,
): Promise<InputOutcome<InputRound[]>> {
  const discussion = await discussionFor(db, viewerId, discussionId, false)
  if (discussion === null) return notFound
  const decision = mayPerform(discussion.facts, 'discussion.read')
  if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
  return { kind: 'ok', value: await roundsOf(db, viewerId, discussionId) }
}

export async function getInputRound(
  db: Db,
  viewerId: string,
  roundId: string,
): Promise<InputOutcome<InputRound>> {
  const discussionId = await discussionOfRound(db, roundId)
  if (discussionId === null) return notFound
  const discussion = await discussionFor(db, viewerId, discussionId, false)
  if (discussion === null) return notFound
  const decision = mayPerform(discussion.facts, 'discussion.read')
  if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
  const [round] = await roundsOf(db, viewerId, discussionId, roundId)
  return round === undefined ? notFound : { kind: 'ok', value: round }
}

/* ------------------------------------------------------------------ *
 * Open and close
 * ------------------------------------------------------------------ */

export async function openInputRound(
  db: Db,
  viewerId: string,
  discussionId: string,
  input: OpenInputRoundBody,
): Promise<InputOutcome<InputRound>> {
  return inTransaction(db, async (tx) => {
    const discussion = await discussionFor(tx, viewerId, discussionId, true)
    if (discussion === null) return notFound

    const labels = input.options ?? []
    if (input.mode === 'choose') {
      if (labels.length < INPUT_OPTIONS_MIN) {
        return invalid('options', 'a choose round needs two or more options')
      }
      const distinct = new Set(labels.map((label) => label.toLocaleLowerCase()))
      if (distinct.size !== labels.length) {
        return invalid('options', 'options must be distinct')
      }
    } else if (input.options !== undefined) {
      return invalid('options', 'only a choose round has options')
    }

    const decision = mayPerform(discussion.facts, 'input_round.open', {
      creatorId: discussion.createdBy,
    })
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }

    const closed = closedToInput(discussion)
    if (closed !== null) return closed

    /* The read under the lock answers the ordinary case; the partial unique
       index is the guarantee, and is caught by its name. */
    const open = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM discussion_input_rounds
           WHERE discussion_id = ${discussionId}::uuid AND state = 'open'`,
    )
    if (open.length > 0) {
      return conflict('This discussion already has an open input round.')
    }
    let inserted
    try {
      inserted = await rowsOf(
        tx,
        sql`INSERT INTO discussion_input_rounds
              (discussion_id, mode, prompt, created_by)
            VALUES (${discussionId}::uuid, ${input.mode}, ${input.prompt},
                    ${viewerId}::uuid)
            RETURNING id`,
      )
    } catch (error) {
      if (violates(error, 'discussion_input_rounds_one_open_key')) {
        return conflict('This discussion already has an open input round.')
      }
      throw error
    }
    const roundId = String(inserted[0]?.id)
    for (const [position, label] of labels.entries()) {
      await rowsOf(
        tx,
        sql`INSERT INTO discussion_input_options (round_id, label, position)
            VALUES (${roundId}::uuid, ${label}, ${position})`,
      )
    }
    await touch(tx, discussionId)
    const [round] = await roundsOf(tx, viewerId, discussionId, roundId)
    return round === undefined ? notFound : { kind: 'ok', value: round }
  })
}

export async function closeInputRound(
  db: Db,
  viewerId: string,
  roundId: string,
): Promise<InputOutcome<InputRound>> {
  const discussionId = await discussionOfRound(db, roundId)
  if (discussionId === null) return notFound
  return inTransaction(db, async (tx) => {
    const discussion = await discussionFor(tx, viewerId, discussionId, true)
    if (discussion === null) return notFound

    const decision = mayPerform(discussion.facts, 'input_round.close', {
      creatorId: discussion.createdBy,
    })
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }

    if (discussion.trashed) return conflict('This discussion is in Trash.')
    const updated = await rowsOf(
      tx,
      sql`UPDATE discussion_input_rounds
             SET state = 'closed', close_reason = 'closed',
                 closed_by = ${viewerId}::uuid, closed_at = now()
           WHERE id = ${roundId}::uuid AND state = 'open'
           RETURNING id`,
    )
    if (updated.length === 0) return conflict('This input round is closed.')
    await touch(tx, discussionId)
    const [round] = await roundsOf(tx, viewerId, discussionId, roundId)
    return round === undefined ? notFound : { kind: 'ok', value: round }
  })
}

/* ------------------------------------------------------------------ *
 * One's own response
 * ------------------------------------------------------------------ */

interface LockedRound {
  mode: InputMode
  state: InputRoundState
}

async function roundIn(
  tx: Executor,
  discussionId: string,
  roundId: string,
): Promise<LockedRound | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT mode, state FROM discussion_input_rounds
         WHERE id = ${roundId}::uuid AND discussion_id = ${discussionId}::uuid`,
  )
  const row = found[0]
  if (row === undefined) return null
  return {
    mode: String(row.mode) as InputMode,
    state: String(row.state) === 'open' ? 'open' : 'closed',
  }
}

interface ResponseShape {
  optionId: string | null
  concern: ConcernValue | null
  body: string | null
}

/** The mode's own fields and no others, or the field to name in the 422.
 * The database's `discussion_input_responses_shape_check` says the same. */
async function shapeFor(
  tx: Executor,
  roundId: string,
  mode: InputMode,
  input: PutInputResponseBody,
): Promise<ResponseShape | { field: string; message: string }> {
  const text = input.body === undefined ? null : input.body.trim()
  const blank = text === null || text.length === 0
  if (mode === 'choose') {
    if (input.concern !== undefined) return { field: 'concern', message: 'a choose round takes an option' }
    if (input.body !== undefined) return { field: 'body', message: 'a choose round takes an option' }
    if (input.option_id === undefined) return { field: 'option_id', message: 'choose one option' }
    const option = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM discussion_input_options
           WHERE id = ${input.option_id}::uuid AND round_id = ${roundId}::uuid`,
    )
    if (option.length === 0) {
      return { field: 'option_id', message: 'must name an option of this round' }
    }
    return { optionId: input.option_id, concern: null, body: null }
  }
  if (input.option_id !== undefined) {
    return { field: 'option_id', message: 'only a choose round has options' }
  }
  if (mode === 'advice') {
    if (input.concern !== undefined) return { field: 'concern', message: 'an advice round takes advice' }
    if (blank) return { field: 'body', message: 'advice cannot be empty' }
    return { optionId: null, concern: null, body: text }
  }
  if (input.concern === undefined) {
    return { field: 'concern', message: 'answer no_concern or concern' }
  }
  if (input.concern === 'concern' && blank) {
    return { field: 'body', message: 'a concern needs a reason' }
  }
  return { optionId: null, concern: input.concern, body: blank ? null : text }
}

export async function putInputResponse(
  db: Db,
  viewerId: string,
  roundId: string,
  input: PutInputResponseBody,
): Promise<InputOutcome<InputRound>> {
  const discussionId = await discussionOfRound(db, roundId)
  if (discussionId === null) return notFound
  return inTransaction(db, async (tx) => {
    const discussion = await discussionFor(tx, viewerId, discussionId, true)
    if (discussion === null) return notFound
    const round = await roundIn(tx, discussionId, roundId)
    if (round === null) return notFound

    const shape = await shapeFor(tx, roundId, round.mode, input)
    if ('field' in shape) return invalid(shape.field, shape.message)

    const decision = mayPerform(discussion.facts, 'input_round.respond')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }

    const closed = closedToInput(discussion)
    if (closed !== null) return closed
    if (round.state !== 'open') return conflict('This input round is closed.')

    await rowsOf(
      tx,
      sql`INSERT INTO discussion_input_responses
            (round_id, mode, user_id, option_id, concern, body)
          VALUES (${roundId}::uuid, ${round.mode}, ${viewerId}::uuid,
                  ${shape.optionId}::uuid, ${shape.concern}, ${shape.body})
          ON CONFLICT ON CONSTRAINT discussion_input_responses_round_id_user_id_key
          DO UPDATE SET option_id = EXCLUDED.option_id,
                        concern = EXCLUDED.concern,
                        body = EXCLUDED.body,
                        updated_at = now()`,
    )
    await touch(tx, discussionId)
    const [read] = await roundsOf(tx, viewerId, discussionId, roundId)
    return read === undefined ? notFound : { kind: 'ok', value: read }
  })
}

/** Withdraw one's own response while the round is open. Withdrawing a
 * response one never gave is the same success: the result is the same. */
export async function withdrawInputResponse(
  db: Db,
  viewerId: string,
  roundId: string,
): Promise<InputOutcome<null>> {
  const discussionId = await discussionOfRound(db, roundId)
  if (discussionId === null) return notFound
  return inTransaction(db, async (tx) => {
    const discussion = await discussionFor(tx, viewerId, discussionId, true)
    if (discussion === null) return notFound
    const round = await roundIn(tx, discussionId, roundId)
    if (round === null) return notFound

    const decision = mayPerform(discussion.facts, 'input_round.respond')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }

    const closed = closedToInput(discussion)
    if (closed !== null) return closed
    if (round.state !== 'open') return conflict('This input round is closed.')

    const deleted = await rowsOf(
      tx,
      sql`DELETE FROM discussion_input_responses
           WHERE round_id = ${roundId}::uuid AND user_id = ${viewerId}::uuid
           RETURNING id`,
    )
    if (deleted.length > 0) await touch(tx, discussionId)
    return { kind: 'ok', value: null }
  })
}
