/*
given one person's shelf, when another person asks for it by id,
then every 7.16 shelf route answers 404 and nothing about it is disclosed.

**Why this criterion exists.** `shelfView` scopes on user_id and every shelf
handler runs through it; this notices if that stops being true. Nothing
structural checks authorization — `ac-236-structural-guard-sweep.test.ts`
fails a route missing a session or CSRF check, and a GET that answers
anything but 401 without one, but a route that takes a session and then reads whatever id
it is handed passes the whole suite. The `accessOf`-shaped gates are all
hand-written, and a hand-written gate needs a behavioural case behind it.

So this reads the whole 7.16 shelf surface from a second account: the
identity, the page, the page write, the patch and the delete. 404 and never
403, on 7.0's rule and 10.2's: a shelf the viewer cannot see reads as
nonexistent, because 403 tells a stranger the id was real. Shelves are
private by construction (4.18, DES-195/196) so there is no membership to
resolve and no case where the answer is anything else.

The read half is asserted twice over, on the status and on the body: a 404
whose body carried the shelf's name would be a leak with the right code on
it.

Spec: 4.18, 7.0, 7.16, 10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'])

const SHELF_NAME = 'ac366 private shelf'

interface Stage {
  owner: Actor
  stranger: Actor
  shelfId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, stranger] = await cast.of(app)
    if (owner === undefined || stranger === undefined) {
      throw new Error('cast must produce two actors')
    }
    const made = await owner.browser.json('/shelves', 'POST', { name: SHELF_NAME })
    expectStatus(made, 201, 'the owner creates a shelf (spec 7.16)')
    staged = {
      owner,
      stranger,
      shelfId: String((made.json() as { id?: unknown }).id),
    }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('a shelf is private by construction', () => {
  test('the owner reads their own shelf and its page', async () => {
    const { owner, shelfId } = await stage()
    const identity = await owner.browser.json(`/shelves/${shelfId}`, 'GET')
    expectStatus(identity, 200, 'the owner reads the shelf (spec 7.16)')
    expect(
      (identity.json() as { name?: unknown }).name,
      'the shelf answers its own name, which is what the page head draws (spec 4.18)',
    ).toBe(SHELF_NAME)
    const page = await owner.browser.json(`/shelves/${shelfId}/page`, 'GET')
    expectStatus(page, 200, 'the owner reads the shelf page (spec 7.16)')
    expect(
      (page.json() as { blocks?: unknown }).blocks,
      'a shelf with nothing on it answers an empty block list rather than a 404 (spec 4.17)',
    ).toEqual([])
  })

  test('every shelf route refuses another person by id, 404', async () => {
    const { stranger, shelfId } = await stage()
    const attempts: readonly [string, string, unknown][] = [
      [`/shelves/${shelfId}`, 'GET', undefined],
      [`/shelves/${shelfId}/page`, 'GET', undefined],
      [`/shelves/${shelfId}/page`, 'PUT', { blocks: [] }],
      [`/shelves/${shelfId}`, 'PATCH', { name: 'ac366 taken over' }],
      [`/shelves/${shelfId}`, 'DELETE', undefined],
    ]
    for (const [path, method, body] of attempts) {
      const response = await stranger.browser.json(path, method, body)
      expectStatus(
        response,
        404,
        `${method} ${path} by a person who does not own the shelf must read as ` +
          'nonexistent, never 403 (spec 7.0, 10.2, 4.18)',
      )
      expect(
        response.body,
        `${method} ${path} must disclose nothing about a shelf it refuses (spec 10.2)`,
      ).not.toContain(SHELF_NAME)
    }
  })

  test('the refusals changed nothing', async () => {
    const { owner, shelfId } = await stage()
    const identity = await owner.browser.json(`/shelves/${shelfId}`, 'GET')
    expectStatus(identity, 200, 'the shelf survives every refused write (spec 10.2)')
    expect(
      (identity.json() as { name?: unknown }).name,
      'a refused PATCH must not have renamed it (spec 10.2)',
    ).toBe(SHELF_NAME)
  })
})
