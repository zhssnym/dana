/*
AC-023: given a member sets a personal label and color, then another
member's view of the folder shows no label change.

Label and color live on the membership row precisely so one member's
organizing never leaks into another's sidebar (4.4's rationale), and the
criterion is that independence, read through the my_label and my_color
fields of the 7.0 Folder object. Independence must hold in both directions
and through clearing, since both fields are nullable by contract. The 10.3
limits (label 1 to 40, color '#RRGGBB') answer 422 through the API rather
than surfacing as database errors, and a refused write changes nothing.

Spec: 4.4, 5.4, 7.0, 7.4, 10.3.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  folderInList,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'])

interface Stage {
  owner: Actor
  member: Actor
  stranger: Actor
  folderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, member, stranger] = await cast.of(app)
    if (owner === undefined || member === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'p2 ac023 labeled')
    await addMemberOk(owner, folderId, member.id)
    staged = { owner, member, stranger, folderId }
  }
  return staged
}

function setMyMembership(
  actor: Actor,
  folderId: string,
  body: unknown,
): ReturnType<Actor['browser']['json']> {
  return actor.browser.json(`/folders/${folderId}/my-membership`, 'PATCH', body)
}

async function storedLabel(
  folderId: string,
  userId: string,
): Promise<{ label: unknown; color: unknown }> {
  const found = await rows(
    app.db,
    sql`SELECT label, color FROM folder_members
        WHERE folder_id = ${folderId} AND user_id = ${userId}`,
  )
  const first = found[0]
  expect(first, 'the membership row must exist').toBeDefined()
  return { label: first?.label ?? null, color: first?.color ?? null }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-023: label and color are personal to the member who set them', () => {
  test('AC-023: a member sets their label and color, 200', async () => {
    const { member, folderId } = await stage()
    const response = await setMyMembership(member, folderId, {
      label: 'Deep work',
      color: '#AB12CD',
    })
    expectStatus(
      response,
      200,
      'PATCH /folders/:id/my-membership by any member must answer 200 (spec 7.4)',
    )
    const mine = await folderInList(member, folderId)
    expect(
      mine?.my_label,
      'the member reads their own label back (spec 7.0 Folder shape)',
    ).toBe('Deep work')
    expect(mine?.my_color).toBe('#AB12CD')
    // Ruled at the shape review into frozen 7.4: mutations answer what a
    // fresh GET would, here the Folder object with the writer's own label
    // and color already on it.
    expect(
      response.json(),
      'the my-membership PATCH body must equal the folder entry a fresh GET answers (7.4 as ruled at the shape review)',
    ).toEqual(mine)
  })

  test('AC-023: the other member sees no label change', async () => {
    const { owner, folderId } = await stage()
    const theirs = await folderInList(owner, folderId)
    expect(
      theirs?.my_label,
      'one member labeling must not appear in another member view (spec 4.4, AC-023)',
    ).toBeNull()
    expect(theirs?.my_color).toBeNull()
  })

  test('AC-023 adversarial: independence holds in the other direction too', async () => {
    const { owner, member, folderId } = await stage()
    const response = await setMyMembership(owner, folderId, {
      label: 'Home',
      color: '#00AA00',
    })
    expectStatus(response, 200, 'the owner sets their own row (spec 7.4)')
    const mine = await folderInList(member, folderId)
    expect(
      mine?.my_label,
      'the owner labeling must not disturb the member label (spec 4.4)',
    ).toBe('Deep work')
    expect(mine?.my_color).toBe('#AB12CD')
  })

  test('AC-023 adversarial: limit violations answer 422 and change nothing', async () => {
    const { member, folderId } = await stage()
    const refusals: readonly [unknown, string][] = [
      [{ label: '' }, 'an empty label is under the 1 to 40 range'],
      [{ label: 'x'.repeat(41) }, 'a 41-character label is over the range'],
      [{ label: 'ok', color: 'red' }, 'a named color is not #RRGGBB'],
      [{ label: 'ok', color: '#12345' }, 'five hex digits are not #RRGGBB'],
      [{ label: 'ok', color: '#GGHHII' }, 'non-hex digits are not #RRGGBB'],
      [{ label: 7, color: '#AB12CD' }, 'a wrong-typed label is a validation failure'],
    ]
    for (const [body, what] of refusals) {
      const response = await setMyMembership(member, folderId, body)
      expectStatus(response, 422, `${what} and must answer 422 (spec 10.3, 4.4, 7.0)`)
    }
    expect(
      await storedLabel(folderId, member.id),
      'every refused write must leave the stored values untouched (spec 10.3)',
    ).toEqual({ label: 'Deep work', color: '#AB12CD' })
  })

  test('AC-023: both fields clear to null', async () => {
    const { owner, member, folderId } = await stage()
    const response = await setMyMembership(member, folderId, {
      label: null,
      color: null,
    })
    expectStatus(
      response,
      200,
      'both fields are nullable by contract (spec 7.4: either nullable)',
    )
    const mine = await folderInList(member, folderId)
    expect(mine?.my_label).toBeNull()
    expect(mine?.my_color).toBeNull()
    const theirs = await folderInList(owner, folderId)
    expect(
      theirs?.my_label,
      'clearing one member row must not clear another (spec 4.4)',
    ).toBe('Home')
  })

  test('AC-023 adversarial: a stranger has no membership row to write, 404', async () => {
    const { stranger, folderId } = await stage()
    const response = await setMyMembership(stranger, folderId, {
      label: 'Intruding',
    })
    expectStatus(
      response,
      404,
      'an inaccessible folder reads as nonexistent (spec 7.0, 5.4, 10.2)',
    )
  })

  test('AC-023: invariants hold afterwards', async () => {
    const { owner, member, stranger, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [owner.id, member.id, stranger.id],
    )
  })
})
