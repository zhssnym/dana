/*
Harness for the 7.23 settings-bundle criteria, the thin layer AC-119 to
AC-121 share.

**It replaces `settings-harness.ts`, which served the same three criteria
against `/me/settings` until issue #113 retired that endpoint on
2026-09-04.** The old file's decisions are kept because they were about how
to test a settings surface rather than about which one, and only its subject
moved.

**The shape and the defaults are restated here, not imported.** The standing
ruling is that this suite measures `app/src/shared/` and cannot borrow its
subject's definition of correct, so the eight keys below and every default
are transcribed from 7.23 and 4.10 rather than read from `shared/bundle.ts`.
A criterion that imported `DEFAULT_PINNED` would pass on the day somebody
edited it.

**The stored row is read beside the wire.** An endpoint that answers 200
without writing, or writes without answering, must fail on whichever half
lied, so the files assert both sides against the same expectation rather
than trusting either alone.

**And the three v1 booleans are still readable here**, through `storedFlags`,
because `pinned_views` is derived from them until somebody first writes a pin
list (4.19, 7.23). Nothing writes them any more — the endpoints that did are
gone — so a criterion that needs a particular v1 state seeds it in the table
directly, which is what AC-119's adversarial arm does.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { rows } from './helpers.js'

/** The eight 7.23 keys, sorted, and nothing else. */
export const BUNDLE_KEYS = [
  'arrangements',
  'calendar_zoom',
  'clock',
  'pinned_views',
  'row_density',
  'sidebar_order',
  'task_open',
  'theme',
] as const

/**
 * 9.1's fixed order, which is what a fresh account's pins derive to: the six
 * that follow from the 4.10 defaults `show_important` true, `show_all` true
 * and `show_done` false. Transcribed from 7.23, not imported.
 */
export const DEFAULT_PINS = [
  'desk',
  'today',
  'scheduled',
  'assignments',
  'important',
  'all',
] as const

/** The 4.10 column defaults for the six fields that have literal ones. */
export const BUNDLE_DEFAULTS = {
  theme: 'system',
  row_density: 'comfortable',
  clock: '12h',
  task_open: 'dialog',
  calendar_zoom: 'month',
  sidebar_order: [] as string[],
  arrangements: {} as Record<string, string>,
} as const

/** The whole of 7.23's shape clause, applied to one body. */
export function expectExactBundleShape(
  body: unknown,
  source: string,
): Record<string, unknown> {
  const record = body as Record<string, unknown>
  expect(
    Object.keys(record).sort(),
    `${source} must carry exactly the eight 7.23 fields`,
  ).toEqual([...BUNDLE_KEYS])
  return record
}

export function getBundle(actor: Actor): Promise<RawResponse> {
  return actor.browser.api('/settings')
}

/** GET /settings asserted: 200 and exactly the 7.23 shape. */
export async function readBundle(
  actor: Actor,
): Promise<Record<string, unknown>> {
  const response = await getBundle(actor)
  expect(
    response.status,
    `GET /settings must answer 200 with the bundle (spec 7.23); answered ${String(response.status)} with body: ${response.body.slice(0, 160)}`,
  ).toBe(200)
  return expectExactBundleShape(response.json(), 'GET /settings')
}

/** PATCH /settings, unjudged: the transport the refusals and the raced pair
 * use, where the response body is not the bundle. */
export function patchBundle(
  actor: Actor,
  body: unknown,
  options: { csrf?: 'auto' | 'omit' | string } = {},
): Promise<RawResponse> {
  return actor.browser.json('/settings', 'PATCH', body, options)
}

/*
PATCH /settings asserted, which is where 7.23's fresh-GET rule is judged,
once, for every sequential success in this package: the body is exactly the
eight fields and it equals what a fresh GET then answers.

Two callers stay on the unjudged transport above, each for a reason the rule
does not reach. A refusal answers the 7.0 envelope rather than the bundle.
And AC-120's raced pair cannot assert the fresh-GET half at all: each
response is the truth at its own commit, a GET after both reflects both, so
an equality there would be asserting a coincidence and would fail on correct
implementations.
*/
export async function patchBundleOk(
  actor: Actor,
  body: unknown,
  why: string,
): Promise<Record<string, unknown>> {
  const response = await patchBundle(actor, body)
  expect(
    response.status,
    `${why}; answered ${String(response.status)} with body: ${response.body.slice(0, 160)}`,
  ).toBe(200)
  const patched = expectExactBundleShape(response.json(), 'the PATCH /settings body')
  expect(
    patched,
    'PATCH /settings answers the GET /settings object, so its body must equal what a fresh GET then answers (spec 7.23)',
  ).toEqual(await readBundle(actor))
  return patched
}

/** The stored bundle columns, raw, so a wrong storage type fails visibly
 * rather than being coerced into agreement. */
export async function storedBundle(
  db: Db,
  userId: string,
): Promise<Record<string, unknown>> {
  const found = await rows(
    db,
    sql`SELECT theme, row_density, clock, task_open, calendar_zoom,
               pinned_views, sidebar_order, arrangements
        FROM user_settings WHERE user_id = ${userId}`,
  )
  const first = found[0]
  expect(
    first,
    'the user_settings row must exist for a provisioned user (INV-14)',
  ).toBeDefined()
  return first as Record<string, unknown>
}

/** The three v1 flags the pin derivation still reads (4.19, 7.23). */
export async function storedFlags(
  db: Db,
  userId: string,
): Promise<Record<string, unknown>> {
  const found = await rows(
    db,
    sql`SELECT show_important, show_all, show_done
        FROM user_settings WHERE user_id = ${userId}`,
  )
  return (found[0] ?? {}) as Record<string, unknown>
}

/** AC-117's envelope, asserted beside a status the way ac-118 does it. */
export function expectEnvelopedStatus(
  response: RawResponse,
  expected: number,
  source: string,
): void {
  expect(
    response.status,
    `${source} must answer ${String(expected)} (spec 7.0, 7.23); answered ${String(response.status)} with body: ${response.body.slice(0, 160)}`,
  ).toBe(expected)
  let body: unknown
  try {
    body = response.json()
  } catch {
    body = undefined
  }
  const error = (
    body as { error?: { code?: unknown; message?: unknown } } | undefined
  )?.error
  expect(
    typeof error?.code === 'string' &&
      error.code.length > 0 &&
      typeof error.message === 'string' &&
      error.message.length > 0,
    `${source} must carry the 7.0 envelope (AC-117)`,
  ).toBe(true)
}
