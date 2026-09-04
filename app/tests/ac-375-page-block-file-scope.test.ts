/*
AC-375: given a page that takes a block naming a file, when the file is not
one the page's own home can reach, then 422 naming the field and the page is
left exactly as it was — for a folder page, whose home is its folder, and for
a shelf page, whose home is a person.

**This is issue #107, and it is two clauses rather than one.** `putPage` wrote
`${block.file_id ?? null}` with no check at all and there is no composite
foreign key underneath it, so a member of folder A could plant an id from
folder B and everybody in A learned that a file with that id exists — and,
since issue #106 put the picture's shape on the block read, roughly what it
looks like. The bytes were never at risk: `serveFile` scopes independently, so
this is disclosure of existence, which is why it was a defect to fix rather
than an incident to declare.

**The shelf half is the one a careless fix misses**, and the reasoning that
deferred #107 got it backwards by saying `readableFileScope` is the wrong gate
"because a page block wants folder scope". `page_blocks` carries exactly one
home — `page_blocks_one_home_check` is `(folder_id IS NULL) <> (shelf_id IS
NULL)` — so on a shelf page there is no folder id for `AND folder_id = $x` to
compare against, and a fix written from that sentence alone gates folder pages
and leaves shelf pages open. Shelf pages are where the folder-less pictures
issue #119 introduced actually live, so that is the half that matters most.

**Nothing structural would have caught either.** There is no authorization
chokepoint in this build: about twenty hand-written `accessOf(...)` gates do
that job, and `ac-236-structural-guard-sweep` asserts that a mutating route
has a session and a CSRF token and never asks what the route does with the ids
in its body. A `PUT /folders/:id/page` that stored any uuid handed to it
passes the whole suite, which is why this file exists.

**The refusal discloses nothing either way.** A uuid naming no file at all and
a uuid naming somebody else's file get the same sentence, exactly as 7.16's
shelf cover already does (10.2). And the positive halves are asserted beside
the refusals, because a gate that refuses everything would pass a file of only
refusals while breaking the product: a member may use a picture another member
uploaded into the same folder, and a shelf may use its owner's own folder-less
one.

Spec: 4.17, 4.18, 7.15, 7.16 as annotated for issue #107 on 2026-09-04, 10.2,
10.3.
*/
import { randomUUID } from 'node:crypto'

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
import type { RawResponse } from './http-client.js'
import { uploadCoverOk, uploadImageOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['alice', 'bob'], 'ac375')

interface Block extends Record<string, unknown> {
  id?: string
  kind?: string
  file_id?: unknown
  updated_at?: string
}

function sentenceOf(response: RawResponse): unknown {
  return (response.json() as { error?: { message?: unknown } }).error?.message
}

async function blocksOf(actor: Actor, path: string): Promise<Block[]> {
  const read = await actor.browser.json(path, 'GET')
  expectStatus(read, 200, `${path} reads back (spec 7.16)`)
  return (read.json() as { blocks?: Block[] }).blocks ?? []
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-375 a page block names a file its own page can reach', () => {
  test('a folder page refuses another folder’s file, and keeps its own', async () => {
    const [alice, bob] = (await cast.of(app)) as [Actor, Actor]

    // Folder A: both of them. Folder B: alice alone, and it holds the picture
    // bob is about to try to name.
    await connect(app.db, alice.id, bob.id)
    const folderA = await createFolder(alice, 'ac375 shared folder')
    await addMemberOk(alice, folderA, bob.id)
    const folderB = await createFolder(alice, 'ac375 alice only')
    const fileInB = await uploadImageOk(alice, folderB, 'ac375-in-b.png')

    // A page bob may legitimately write, so the refusal below has something to
    // leave alone.
    const settled = await bob.browser.json(`/folders/${folderA}/page`, 'PUT', {
      blocks: [{ kind: 'paragraph', position: 0, text: 'ac375 words' }],
    })
    expectStatus(settled, 200, 'a member writes the folder page (spec 7.16)')

    const planted = await bob.browser.json(`/folders/${folderA}/page`, 'PUT', {
      blocks: [
        { kind: 'paragraph', position: 0, text: 'ac375 words' },
        { kind: 'image', position: 1, file_id: fileInB },
      ],
    })
    expectStatus(
      planted,
      422,
      'a file from a folder the writer is not in is not this page’s to name (issue #107, 10.2)',
    )
    expect(
      sentenceOf(planted),
      '7.0 requires the 422 to name the field, and the block index says which one',
    ).toContain('file_id')

    expect(
      await blocksOf(bob, `/folders/${folderA}/page`),
      'a PUT is one unit, so a body refused on one block applies none of itself (7.16)',
    ).toHaveLength(1)

    /* The same body, block for block, with one uuid swapped for one that
       names nothing at all: the two answers must be indistinguishable, which
       is what stops the refusal being an existence oracle (10.2). Same shape
       because the message addresses the block by its index, so comparing a
       one-block body against a two-block one would compare the addressing
       rather than the disclosure. */
    const nothing = await bob.browser.json(`/folders/${folderA}/page`, 'PUT', {
      blocks: [
        { kind: 'paragraph', position: 0, text: 'ac375 words' },
        { kind: 'image', position: 1, file_id: randomUUID() },
      ],
    })
    expectStatus(nothing, 422, 'a uuid naming no file is refused too')
    expect(
      sentenceOf(nothing),
      'and with the same sentence, so the refusal is not an existence oracle (10.2)',
    ).toBe(sentenceOf(planted))

    // The positive half, and it is the one that proves the clause is the
    // folder rather than the uploader: alice uploaded this picture, bob writes
    // the block, and a folder's files are every member's to read (4.3).
    const fileInA = await uploadImageOk(alice, folderA, 'ac375-in-a.png')
    const written = await bob.browser.json(`/folders/${folderA}/page`, 'PUT', {
      blocks: [
        { kind: 'paragraph', position: 0, text: 'ac375 words' },
        { kind: 'image', position: 1, file_id: fileInA },
      ],
    })
    expectStatus(
      written,
      200,
      'a picture of this folder, whoever uploaded it, is the page’s to use',
    )
    const after = await blocksOf(bob, `/folders/${folderA}/page`)
    expect(
      after.find((block) => block.kind === 'image')?.file_id,
      'and it reads back on the block',
    ).toBe(fileInA)
  })

  test('a shelf page refuses another person’s folder-less picture, and keeps its own', async () => {
    const [alice, bob] = (await cast.of(app)) as [Actor, Actor]

    const made = await bob.browser.json('/shelves', 'POST', {
      name: 'ac375 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)

    // The class issue #119 introduced and #107 reaches: a cover with no folder
    // at all, belonging to a person. `AND folder_id = $x` gates nothing here,
    // because a shelf page's folder_id is NULL.
    const hers = await uploadCoverOk(alice, null, 'ac375-hers.png')
    const borrowed = await bob.browser.json(`/shelves/${shelfId}/page`, 'PUT', {
      blocks: [{ kind: 'image', position: 0, file_id: hers }],
    })
    expectStatus(
      borrowed,
      422,
      'another person’s folder-less picture is not this shelf’s to name (issue #107, 10.2)',
    )
    expect(sentenceOf(borrowed), 'and the field is named (7.0)').toContain(
      'file_id',
    )
    expect(
      await blocksOf(bob, `/shelves/${shelfId}/page`),
      'and the refused body wrote nothing',
    ).toHaveLength(0)

    // The bytes were never the leak, which is what makes the id itself worth
    // refusing: bob is answered 404 for the picture he just tried to plant.
    expectStatus(
      await bob.browser.request(`/api/v1/files/${hers}`, { method: 'GET' }),
      404,
      'the file itself was never readable to him (7.15)',
    )

    const mine = await uploadCoverOk(bob, null, 'ac375-mine.png')
    const written = await bob.browser.json(`/shelves/${shelfId}/page`, 'PUT', {
      blocks: [{ kind: 'image', position: 0, file_id: mine }],
    })
    expectStatus(
      written,
      200,
      'his own folder-less picture is the shelf’s to use: the gate is 7.15’s own serving predicate, not a blanket refusal',
    )
    expect(
      (await blocksOf(bob, `/shelves/${shelfId}/page`))[0]?.file_id,
      'and it reads back on the block',
    ).toBe(mine)
  })
})
