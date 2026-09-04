/*
AC-398: given a file stored in a shared folder, when a member who is neither
the uploader nor the folder owner reads it and then tries to delete it, then
the read answers 200 and the delete answers 403 and the bytes survive; and the
uploader and the folder owner each still delete their own.

## Why this is a case of its own and not a line in AC-397

AC-397's sweep found this (issue #74) and asserts one half of it: that the
member's DELETE is 403. It cannot assert the argument *for* 403, which is a
pair — the same person, the same file, 200 on the read and 403 on the delete —
because the sweep drives one request per row and never asks what else that
caller can do. And it asserts nothing at all about the arms 7.15 permits, so a
"fix" that answered 403 to everybody, uploader and folder owner included,
would satisfy the sweep completely. **That is the failure this file exists to
catch**: a status correction is the kind of change most likely to be made by
widening a refusal, and the sweep only ever looks at refusals.

## What the 403 rests on

10.2: "Inaccessible resources answer 404 (never 403) to avoid existence leaks;
permitted-visibility but forbidden-action answers 403." The first clause is
about a leak, and there is no leak left to prevent once the same caller has
been handed the bytes. 7.15's rule — "uploader or folder owner" — is unchanged
and is asserted here in both directions; only the refusal's status moved,
which the owner ruled on 2026-09-04 as a correction toward the contract rather
than a change to frozen section 7.

The non-member's 404 is deliberately asserted here too, beside the member's
403, because the two statuses on one route are the whole of the distinction
and a file that asserted only one of them would not show it. AC-195 already
covers the non-member on the *read*; this is the delete.

Spec: 4.16, 7.15, 10.2. Issue #74.
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
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { uploadImageOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'outsider'], 'ac398')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-398 the file delete refuses a member who can read it, visibly', () => {
  test('200 on the read, 403 on the delete, and the bytes survive', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'ac398 shared')
    await addMemberOk(owner, folderId, member.id)
    const fileId = await uploadImageOk(owner, folderId, 'ac398.png')

    const read = await member.browser.api(`/files/${fileId}`)
    expectStatus(
      read,
      200,
      'a member of the folder reads a file stored in it (spec 7.15, AC-195)',
    )

    const refused = await member.browser.json(`/files/${fileId}`, 'DELETE')
    expectStatus(
      refused,
      403,
      'the same member may not delete it, and 10.2 makes that 403 rather than 404: they have just been handed the bytes, so there is no existence left to protect',
    )
    expect(
      (refused.json() as { error?: { code?: unknown } }).error?.code,
      'the 7.0 envelope carries the forbidden code, as DELETE /comments/:id does for the same rule',
    ).toBe('forbidden')

    const survived = await member.browser.api(`/files/${fileId}`)
    expectStatus(
      survived,
      200,
      'the refused delete removed nothing (spec 7.15): a 403 that deleted the row anyway would pass every status assertion above',
    )
  })

  test('404, not 403, for someone outside the folder', async () => {
    const [owner, , outsider] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await createFolder(owner, 'ac398 private')
    const fileId = await uploadImageOk(owner, folderId, 'ac398-private.png')

    const refused = await outsider.browser.json(`/files/${fileId}`, 'DELETE')
    expectStatus(
      refused,
      404,
      '10.2\'s first clause, unchanged: a non-member cannot read this file, so the refusal must not confirm that it exists',
    )
  })

  test('the uploader and the folder owner each still delete', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'ac398 permitted')
    await addMemberOk(owner, folderId, member.id)

    // The uploader, who is not the folder's owner: 7.15's first actor.
    const theirs = await uploadImageOk(member, folderId, 'ac398-theirs.png')
    expectStatus(
      await member.browser.json(`/files/${theirs}`, 'DELETE'),
      204,
      'the uploader deletes their own file (spec 7.15), which the 403 above must not have widened over',
    )

    // The folder's owner over somebody else's upload: 7.15's second actor.
    const mine = await uploadImageOk(member, folderId, 'ac398-mine.png')
    expectStatus(
      await owner.browser.json(`/files/${mine}`, 'DELETE'),
      204,
      'the folder owner deletes a file another member uploaded (spec 7.15)',
    )
  })
})
