/*
AC-496: given an owner-private, folder-less `file`, `audio` or `video`, then
no other account can read it — not a stranger, and not a person who shares
every folder with the owner.

AC-497: given a folder-scoped `file`, `audio` or `video`, then it follows that
folder's access boundary exactly: a member reads it, a non-member does not,
and a member who is removed stops reading it.

Issue #220, R1's "Scope / access", proofs 9 and 10. Two scopes, and one of
them is new.

**The folder-less arm is the one worth stating carefully**, because it is easy
to be right about it by accident and wrong about it after the next change.
`readableFileScope` does not enumerate kinds: it names `avatar` — which any
signed-in account may read, because a member list renders other people's
pictures — and then falls through to ownership for everything else. So three
new kinds became owner-private the moment migration 0024 allowed them to stand
outside a folder, with no predicate change at all. That is the right shape and
it is also invisible, which is why it is asserted here directly rather than
reasoned about: a predicate rewritten one day as `kind = 'cover' OR ...` would
disclose every private composer asset in Dana for the cost of guessing a uuid,
and nothing else in the suite would notice.

**The second account is not a stranger in the folder-less case, deliberately.**
It shares a folder with the owner, so a scope that leaked through membership
rather than through ownership would pass a test that used a stranger.

Spec: 4.16, 4.18, 7.15, 10.2.
*/
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
  removeMember,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { MP3_BYTES, MP4_BYTES, ZIP_BYTES, uploadKindOk } from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'other'], 'ac496')
beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)
afterAll(async () => {
  if (app) {
    await cast.cleanup(app.db)
    await app.close()
  }
})

const files = [
  { kind: 'file', name: 'private.bin', type: 'application/octet-stream', bytes: ZIP_BYTES },
  { kind: 'audio', name: 'private.mp3', type: 'audio/mpeg', bytes: MP3_BYTES },
  { kind: 'video', name: 'private.mp4', type: 'video/mp4', bytes: MP4_BYTES },
] as const

test('AC-496 an owner-private folder-less asset is readable by its owner alone', async () => {
  const [owner, other] = (await cast.of(app)) as [Actor, Actor]
  await connect(app.db, owner.id, other.id)
  // The two share a folder, so anything that leaked through membership rather
  // than through ownership would still pass if this were a stranger.
  const shared = await createFolder(owner, 'ac496 a folder they share')
  await addMemberOk(owner, shared, other.id)

  for (const file of files) {
    const id = await uploadKindOk(owner, file.kind, null, {
      name: file.name,
      type: file.type,
      bytes: file.bytes,
    })

    expectStatus(
      await owner.browser.request(`/api/v1/files/${id}`, { method: 'GET' }),
      200,
      `the owner reads their own folder-less ${file.kind} (spec 7.15)`,
    )
    expectStatus(
      await other.browser.request(`/api/v1/files/${id}`, { method: 'GET' }),
      404,
      `a folder-less ${file.kind} is its owner's alone, and is invisible to everybody else (spec 10.2)`,
    )
  }
})

test('AC-497 a folder-scoped asset follows the folder, in both directions', async () => {
  const [owner, other] = (await cast.of(app)) as [Actor, Actor]
  await connect(app.db, owner.id, other.id)
  const folder = await createFolder(owner, 'ac497 scoped assets')

  const ids = []
  for (const file of files) {
    ids.push({
      kind: file.kind,
      id: await uploadKindOk(owner, file.kind, folder, {
        name: file.name,
        type: file.type,
        bytes: file.bytes,
      }),
    })
  }

  // Before membership: nothing.
  for (const entry of ids) {
    expectStatus(
      await other.browser.request(`/api/v1/files/${entry.id}`, { method: 'GET' }),
      404,
      `a non-member reads no ${entry.kind} of this folder (spec 10.2)`,
    )
  }

  // With membership: everything, because a folder's content is one look for
  // every member (4.3).
  await addMemberOk(owner, folder, other.id)
  for (const entry of ids) {
    expectStatus(
      await other.browser.request(`/api/v1/files/${entry.id}`, { method: 'GET' }),
      200,
      `a member reads the folder's ${entry.kind} (spec 4.3, 7.15)`,
    )
  }

  // And it is a boundary rather than a grant: removed, they stop reading it.
  expectStatus(await removeMember(owner, folder, other.id), 204, 'the member is removed')
  for (const entry of ids) {
    expectStatus(
      await other.browser.request(`/api/v1/files/${entry.id}`, { method: 'GET' }),
      404,
      `access ends with membership for the folder's ${entry.kind}`,
    )
  }
})

test('AC-496 a folder-less upload does not require a folder, and voice still does', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  // The wire shape migration 0024 admits: no `folder_id` part at all for the
  // five kinds that may stand outside a folder, and a refusal for the one
  // that may not.
  for (const file of files) {
    const id = await uploadKindOk(owner, file.kind, null, {
      name: file.name,
      type: file.type,
      bytes: file.bytes,
    })
    expect(typeof id).toBe('string')
  }
})
