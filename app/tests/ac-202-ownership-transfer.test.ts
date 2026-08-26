/*
AC-202: given an owner and another member, when ownership is transferred to
that member, then owner_id changes and the previous owner may leave; the
default successor is the longest-standing member per 8.9.

AC-019 and AC-020 already hold the leave guards; this criterion adds the
explicit transfer act those guards were waiting for, DES-225's scenario 4.
The leave after the transfer is asserted through the same endpoint AC-018
covers, proving the two rules compose.

Spec: 7.16, 8.9, 5.3 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
  membershipUserIds,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-202 ownership moves, then the door opens', () => {
  test('transfer changes owner_id and the old owner may leave', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 's1 ac202 transfer')
    await addMemberOk(owner, folderId, member.id)

    const refused = await member.browser.json(
      `/folders/${folderId}/transfer-ownership`,
      'POST',
      { to: member.id },
    )
    expectStatus(refused, 403, 'only the owner transfers (spec 7.16)')

    const transferred = await owner.browser.json(
      `/folders/${folderId}/transfer-ownership`,
      'POST',
      { to: member.id },
    )
    expectStatus(transferred, 200, 'the owner hands over (spec 7.16)')
    const body = transferred.json() as { owner_id?: unknown }
    expect(body.owner_id, 'owner_id names the successor (spec 8.9)').toBe(
      member.id,
    )

    const leave = await owner.browser.json(
      `/folders/${folderId}/my-membership`,
      'DELETE',
    )
    expect(
      [200, 204].includes(leave.status),
      `the previous owner may now leave; answered ${String(leave.status)} (spec 5.3)`,
    ).toBe(true)
    const remaining = await membershipUserIds(app.db, folderId)
    expect(remaining, 'one member remains, the successor').toEqual([member.id])
  })
})
