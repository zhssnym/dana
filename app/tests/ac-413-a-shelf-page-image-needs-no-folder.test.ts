/*
AC-413: given the upload surface, when a picture is stored as an `image` with
no `folder_id`, then it stores and belongs to the person, who reads it while
nobody else can; `file` and `voice` still require a folder; a block on a shelf
page may name that picture and a block on a folder page may not; setting it as
that shelf's cover copies it rather than wearing it as it stands; and the 11.7
pass reclaims one nothing references on the same window a cover gets.

**This is issue #167, and it is the sentence issues #20 and #100 stopped one
page short of.** Their amendment made `cover` the kind that may stand outside a
folder, because a shelf and a place page are not folders and a cover of theirs
belongs to the person. A shelf page's *image* is in exactly that position — 4.17
gives a block one home and a shelf page's home is the shelf, so there is no
folder for the picture to take its visibility from — and it was left requiring
one. `POST /files { kind: image }` answered 422, the client sent `folder_id=""`
because that was the only shape it had, and a person choosing a picture on a
shelf page saw nothing whatever happen. Found twice on 2026-09-04, by the branch
gating page-block files (#107) and by the branch giving shelves a cover picker
(#118), neither able to fix it: it is a section 7 question.

**The read arm is asserted even though nothing in the server changed for it,
and that is the point of asserting it.** `readableFileScope`'s folder-less arm
is `kind`-blind — it admits an avatar to everyone and every other folder-less
row to its owner — so a folder-less `image` became its uploader's alone with no
line written. A predicate that had instead named `cover` would have failed open
the moment this widening landed, which is the exact fault the 2026-09-03
amendment records finding on the wire, so what needs proving here is not that
somebody remembered to widen it but that nobody had to.

**The two page gates are asserted together because they disagree on purpose.**
A shelf-homed block scopes with that serving predicate (issue #107), so the
shelf's owner may name their own folder-less picture; a folder-homed block
scopes with `f.folder_id = <this folder>`, which no folder-less row can satisfy,
so the same picture is refused on a folder page belonging to the same person.
That is not an oversight to be tidied later: a folder page is shared with its
members (4.3), and a picture only its uploader can read would draw as a broken
image for everyone else.

**A cover set from one is copied rather than worn as it stands, and that arm
is here because the widening is what makes the case reachable.** 7.19's rule 1
keeps a named file only when it is already a `cover` in the page's own scope
owned by the setter; a folder-less `image` is readable and is one of the two
kinds 7.16 admits, so it passes the gate and then fails that test on its kind
alone. So the shelf wears a new id, of kind `cover`, and the person's quota
carries both rows. Nothing in `coverFileFor` was changed for #167 — the arm
asserts that the file it now has to consider is normalised like any other.

**And the lifetime, because a widening that stopped at the upload would leak.**
A folder-less image nothing names is listed by no surface and reachable by no
route, which is the state #116 built the reclaim for; it is swept on the same
reference query, the same `unreferenced_since` mark and the same 30 days as a
cover. Aging by UPDATE is AC-213's precedent and the injected store is AC-235's,
both by way of AC-385, which asserts the cover half of this sweep.

Spec: 4.16, 4.17, 4.18, 7.15, 7.16 and 7.19 as amended 2026-09-04, 10.2, 10.3,
11.7, migration 0015; issue #167.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { rows } from './helpers.js'
import { runPass } from './reminders-harness.js'
import { ONE_PIXEL_PNG, imagePng, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'ac413')

/** AC-385's store, for the reclaim arm: a removal from a store nothing reads
 * is unobservable, and the serving arm needs the bytes to exist at all. */
const objects = new Map<string, Buffer>()
const memoryStore = {
  put: (id: string, bytes: Buffer): Promise<void> => {
    objects.set(id, bytes)
    return Promise.resolve()
  },
  get: (id: string): Promise<Buffer | null> =>
    Promise.resolve(objects.get(id) ?? null),
  remove: (id: string): Promise<void> => {
    objects.delete(id)
    return Promise.resolve()
  },
}

beforeAll(async () => {
  app = await startAuthTestApp({ fileStore: memoryStore })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function sentenceOf(response: RawResponse): string {
  return String(
    (response.json() as { error?: { message?: unknown } }).error?.message ?? '',
  )
}

/** One folder-less `image`, answering its id: the shape #167 added. No
 * `folder_id` part at all rather than an empty one, which is the wire shape
 * the route admits and the empty string is not. */
async function uploadFolderlessImage(
  actor: Actor,
  name: string,
): Promise<string> {
  const stored = await upload(
    actor,
    '/files',
    { kind: 'image' },
    { name, type: 'image/png', bytes: ONE_PIXEL_PNG },
  )
  expectStatus(
    stored,
    201,
    `a page image with no folder stores (spec 7.15 as amended for issue #167); answered ${stored.body.slice(0, 160)}`,
  )
  return String((stored.json() as { id?: unknown }).id)
}

async function markOf(fileId: string): Promise<unknown> {
  const found = await rows(
    app.db,
    sql`SELECT unreferenced_since FROM files WHERE id = ${fileId}::uuid`,
  )
  return (found[0] as Record<string, unknown> | undefined)?.unreferenced_since ?? null
}

async function fileExists(fileId: string): Promise<boolean> {
  const found = await rows(
    app.db,
    sql`SELECT 1 AS present FROM files WHERE id = ${fileId}::uuid`,
  )
  return found.length > 0
}

/** 10.3's 1 GB is a sum of `bytes` by `owner_id`, so a copy is visible in it
 * as an upload is. AC-389's arithmetic, one criterion over. */
async function quotaSpent(userId: string): Promise<number> {
  const found = await rows(
    app.db,
    sql`SELECT coalesce(sum(bytes), 0)::bigint AS used
        FROM files WHERE owner_id = ${userId}::uuid`,
  )
  return Number((found[0] as Record<string, unknown> | undefined)?.used ?? 0)
}

/** Backdates the mark the tick writes, which is what the window is measured
 * from (migration 0014). 30 days is the line; 31 puts a row over it. */
async function ageTheMark(fileId: string): Promise<void> {
  await app.db.execute(
    sql`UPDATE files SET unreferenced_since = now() - interval '31 days'
        WHERE id = ${fileId}::uuid`,
  )
}

describe('AC-413 a shelf page’s image belongs to the person, like its cover', () => {
  test('it stores with no folder, serves to its uploader alone, and file and voice still need one', async () => {
    const [owner, stranger] = (await cast.of(app)) as [Actor, Actor]

    // Large enough that the 2048px downscale has something to do, so the
    // folder-less arm is proved to run the same sharp pass a folder-scoped
    // image runs rather than some shorter path (7.15, 4.16).
    const oversized = await imagePng(2600, 1300)
    const stored = await upload(
      owner,
      '/files',
      { kind: 'image' },
      { name: 'ac413-shelf.png', type: 'image/png', bytes: oversized },
    )
    expectStatus(
      stored,
      201,
      'a page image stores with no folder_id at all (spec 7.15 as amended for issue #167)',
    )
    const body = stored.json() as {
      id?: unknown
      bytes?: unknown
      width?: unknown
      height?: unknown
    }
    const fileId = String(body.id)
    expect(
      body.width,
      'the same downscale ran: 2600 by 1300 comes back bounded on its longest edge (7.15)',
    ).toBe(2048)
    expect(body.height, 'and the ratio is kept').toBe(1024)

    const record = (
      await rows(
        app.db,
        sql`SELECT folder_id, owner_id, kind, bytes, width
            FROM files WHERE id = ${fileId}::uuid`,
      )
    )[0] as Record<string, unknown> | undefined
    expect(record, 'the row exists').toBeDefined()
    expect(
      record?.folder_id,
      'it has no folder: the picture belongs to the person (issue #167, migration 0015)',
    ).toBeNull()
    expect(
      String(record?.owner_id),
      'and it names the uploader as its owner, which is the column the 1 GB quota sums (10.3)',
    ).toBe(owner.id)
    expect(String(record?.kind), 'stored as 4.16’s image kind').toBe('image')
    expect(
      Number(record?.bytes),
      'with a positive byte count, so the quota arithmetic sees it',
    ).toBeGreaterThan(0)
    expect(
      Number(record?.width),
      '4.16’s dimensions are recorded for a folder-less image as for any other (issue #27)',
    ).toBe(2048)

    // Who may read it. The arm that needed no widening, asserted because a
    // predicate naming kinds would have failed open here (7.15, AC-371).
    expectStatus(
      await owner.browser.request(`/api/v1/files/${fileId}`, { method: 'GET' }),
      200,
      'the uploader reads their own folder-less picture (spec 7.15)',
    )
    expectStatus(
      await stranger.browser.request(`/api/v1/files/${fileId}`, {
        method: 'GET',
      }),
      404,
      'and a signed-in stranger does not: every folder-less row but an avatar is its owner’s alone (7.15, 10.2)',
    )

    // The two kinds that hang on a comment thread keep their folder, and the
    // refusal is a shape refusal naming the field rather than the 404 an
    // unreachable folder gets.
    for (const kind of ['file', 'voice'] as const) {
      const refused = await upload(
        owner,
        '/files',
        { kind },
        { name: `ac413-${kind}.png`, type: 'image/png', bytes: ONE_PIXEL_PNG },
      )
      expectStatus(
        refused,
        422,
        `kind ${kind} still requires a folder_id, its visibility being its folder's (4.16)`,
      )
      expect(
        sentenceOf(refused),
        'and the sentence names the field a caller has to fix',
      ).toContain('folder_id')
      expect(
        sentenceOf(refused),
        'and it names the rule as it now stands, rather than the one #167 replaced',
      ).toContain('a file or a voice note')
    }

    // A folder_id that is present is still honoured and still scoped: the
    // widening added an arm and removed no membership check.
    const folderId = await createFolder(owner, 'ac413 folder')
    const inFolder = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folderId },
      { name: 'ac413-in-folder.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(inFolder, 201, 'a folder-scoped image still stores (7.15)')
    const scoped = (
      await rows(
        app.db,
        sql`SELECT folder_id FROM files
            WHERE id = ${String((inFolder.json() as { id?: unknown }).id)}::uuid`,
      )
    )[0] as Record<string, unknown> | undefined
    expect(
      String(scoped?.folder_id),
      'and it kept the folder it named, which is what a shared page’s picture needs (4.3)',
    ).toBe(folderId)
  })

  test('a shelf page may name it and a folder page may not', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac413 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)
    const picture = await uploadFolderlessImage(owner, 'ac413-block.png')

    const written = await owner.browser.json(`/shelves/${shelfId}/page`, 'PUT', {
      blocks: [{ kind: 'image', position: 0, file_id: picture }],
    })
    expectStatus(
      written,
      200,
      'the shelf’s own page names the owner’s folder-less picture: the gate is 7.15’s serving predicate (issue #107)',
    )
    const read = await owner.browser.json(`/shelves/${shelfId}/page`, 'GET')
    expectStatus(read, 200, 'the shelf page reads back (7.16)')
    const blocks = (read.json() as { blocks?: Array<Record<string, unknown>> })
      .blocks
    expect(
      blocks?.[0]?.file_id,
      'and the block reads it back, which is the whole round trip issue #167 reports missing',
    ).toBe(picture)

    /* The same person, the same picture, a folder of their own: refused,
       because a folder-homed block's gate is `f.folder_id = <this folder>`
       and a folder-less row satisfies it for nobody. A folder page is shared
       (4.3), and a picture only its uploader can read would draw as a broken
       image for every other member. */
    const folderId = await createFolder(owner, 'ac413 own folder')
    const planted = await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [{ kind: 'image', position: 0, file_id: picture }],
    })
    expectStatus(
      planted,
      422,
      'a folder page refuses a folder-less picture even from its own owner (7.16 as annotated for issue #107)',
    )
    expect(sentenceOf(planted), 'and the field is named (7.0)').toContain(
      'file_id',
    )
    const folderPage = await owner.browser.json(`/folders/${folderId}/page`, 'GET')
    expectStatus(folderPage, 200, 'the folder page reads back (7.16)')
    expect(
      (folderPage.json() as { blocks?: unknown[] }).blocks,
      'a PUT is one unit, so a body refused on one block applies none of itself (7.16)',
    ).toHaveLength(0)
  })

  test('a shelf cover set from one is copied rather than kept, and both rows are the person’s', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac413 cover shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)
    const picture = await uploadFolderlessImage(owner, 'ac413-as-cover.png')

    const before = await quotaSpent(owner.id)
    const worn = await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
      cover_file_id: picture,
    })
    expectStatus(
      worn,
      200,
      'a folder-less image of the person’s own passes 7.16’s gate: readable, and kind in (cover, image)',
    )
    const shelfCover = String(
      (worn.json() as { cover_file_id?: unknown }).cover_file_id,
    )
    expect(
      shelfCover,
      '7.19 rule 1 keeps only a file that is already a cover in the page’s scope, and this is an image, so the page stores a copy',
    ).not.toBe(picture)

    const copy = (
      await rows(
        app.db,
        sql`SELECT folder_id, owner_id, kind, bytes
            FROM files WHERE id = ${shelfCover}::uuid`,
      )
    )[0] as Record<string, unknown> | undefined
    expect(copy, 'the copy is a row of its own').toBeDefined()
    expect(String(copy?.kind), 'and it is a cover, which is what 4.16 calls a page’s picture').toBe('cover')
    expect(
      copy?.folder_id,
      'in the page’s own scope, which for a shelf is no folder at all (7.19 rule 1)',
    ).toBeNull()
    expect(
      String(copy?.owner_id),
      'and owned by the person who set it, so leaving a folder can never blank it',
    ).toBe(owner.id)
    expect(
      objects.has(shelfCover),
      'the bytes are copied with the row, or the cover would serve nothing',
    ).toBe(true)

    expect(
      await fileExists(picture),
      'the page image itself is untouched: a set copies rather than moves',
    ).toBe(true)
    expect(
      await quotaSpent(owner.id),
      'and the person now pays for both rows, which is 7.19 rule 4’s whole subject (10.3)',
    ).toBe(before + Number(copy?.bytes))
  })

  test('the tick reclaims one nothing names, and spares the one a shelf page holds', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac413 sweep shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)

    const worn = await uploadFolderlessImage(owner, 'ac413-worn.png')
    const dropped = await uploadFolderlessImage(owner, 'ac413-dropped.png')
    expect(
      objects.has(worn) && objects.has(dropped),
      'the injected store must hold both objects, or nothing here measures anything',
    ).toBe(true)

    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}/page`, 'PUT', {
        blocks: [
          { kind: 'image', position: 0, file_id: worn },
          { kind: 'image', position: 1, file_id: dropped },
        ],
      }),
      200,
      'the shelf page holds both pictures (spec 7.16)',
    )

    // Both referenced: neither is marked, whatever a pass is told to think.
    await runPass(app)
    expect(
      await markOf(dropped),
      'a picture a page names carries no mark at all (7.19 rule 2)',
    ).toBeNull()

    /* One block removed, which is what a person dropping a picture from a
       shelf page does: the page is PUT whole, so a block left out of the body
       is a block deleted (7.16). Nothing anywhere can reach the file after
       that, which is why the sweep has to. */
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}/page`, 'PUT', {
        blocks: [{ kind: 'image', position: 0, file_id: worn }],
      }),
      200,
      'the second picture comes off the page (spec 7.16, 4.17)',
    )

    await runPass(app)
    expect(
      await fileExists(dropped),
      'a picture that came off a moment ago is not reclaimed: the window runs from the mark (migration 0014)',
    ).toBe(true)
    expect(
      await markOf(dropped),
      'and the tick has recorded when it came off, which is the fact the rule reads',
    ).not.toBeNull()

    await ageTheMark(dropped)
    await runPass(app)
    expect(
      await fileExists(dropped),
      'thirty days unnamed, and the row goes on the same rule a cover’s does (7.19 as amended for issue #167)',
    ).toBe(false)
    expect(
      objects.has(dropped),
      'and the object goes with it, the row having been the only index to the bytes',
    ).toBe(false)

    // And the one the page still holds survives the same pass at any age.
    expect(
      await markOf(worn),
      'the picture the page still names carries no mark',
    ).toBeNull()
    await ageTheMark(worn)
    await runPass(app)
    expect(
      await fileExists(worn),
      'and even a mark planted under it is cleared before the delete looks (7.19 rule 2)',
    ).toBe(true)
    expect(objects.has(worn), 'bytes included').toBe(true)
  })
})
