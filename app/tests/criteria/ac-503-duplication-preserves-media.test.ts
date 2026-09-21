/*
AC-503: given a folder whose page holds an image, a generic file, an audio and
a video, when the folder is duplicated, then each asset is copied as an
independent file in the copy's own scope, **each copy keeps the source's
semantic kind**, and every copied block names the copy rather than the source.

AC-504: given a duplicate that fails on the storage quota, then nothing is
left behind: no folder, no page blocks, no file rows, and no bytes in the
object store.

Issue #220, R1's "Duplication", proofs 15 and 16.

**AC-503 is the criterion for the trap the issue names by name.** Duplication
used `copyCoverFile` as its byte-copy primitive — which writes `kind='cover'`
whatever the source was — and then ran `UPDATE files SET kind='image'` over
every copied page asset. That was correct while a page block could only hold a
picture. With four media kinds it silently destroys the thing #220 exists to
preserve: a duplicated MP4 would come out declared an image, and a duplicated
generic File — untrusted bytes, attachment-served — would come out declared
previewable media. So the assertion is on the copied row's `kind`, one per
kind, and it would have failed on every branch of the old code.

**AC-504 is atomicity, and it is asserted on the store as well as on the
database.** A rollback takes the rows; it does not take bytes that a copy
already wrote, because a `put` is not transactional. The catch that removes
them is the half of "no orphaned object-store bytes" that is not free, and an
injected store is the only way to see that it ran.

Spec: 4.16, 7.16, 10.3, DES-198.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import type { DocumentOperation, PageView } from '../../src/shared/pages.js'
import {
  MP3_BYTES,
  MP4_BYTES,
  ZIP_BYTES,
  uploadImageOk,
  uploadKindOk,
} from '../support/uploads-harness.js'
import { randomUUID } from 'node:crypto'

/** A recording store, so AC-504 can read what bytes survived a refusal. The
 * shape is AppOptions['fileStore'] restated structurally, which is this
 * suite's rule for the 11.10 seam. */
function recordingStore() {
  const objects = new Map<string, Buffer>()
  return {
    objects,
    put: (id: string, bytes: Buffer) => {
      objects.set(id, bytes)
      return Promise.resolve()
    },
    get: (id: string) => Promise.resolve(objects.get(id) ?? null),
    remove: (id: string) => {
      objects.delete(id)
      return Promise.resolve()
    },
  }
}

const store = recordingStore()
let app: AuthTestApp
const cast = new Cast(['owner'], 'ac503')
beforeAll(async () => {
  app = await startAuthTestApp({ fileStore: store })
}, 60_000)
afterAll(async () => {
  if (app) {
    await cast.cleanup(app.db)
    await app.close()
  }
})

async function read(owner: Actor, folder: string): Promise<PageView> {
  const response = await owner.browser.json(`/folders/${folder}/page`, 'GET')
  expectStatus(response, 200, 'page read')
  return response.json() as PageView
}

const ZONE = 'Pacific/Kiritimati'

test('AC-503 duplication copies the bytes, keeps every kind, and remaps every file_id', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac503 four kinds on a page')

  const sources = {
    image: await uploadImageOk(owner, folder, 'ac503.png'),
    file: await uploadKindOk(owner, 'file', folder, {
      name: 'ac503.q4data',
      type: 'application/octet-stream',
      bytes: ZIP_BYTES,
    }),
    audio: await uploadKindOk(owner, 'audio', folder, {
      name: 'ac503.mp3',
      type: 'audio/mpeg',
      bytes: MP3_BYTES,
    }),
    video: await uploadKindOk(owner, 'video', folder, {
      name: 'ac503.mp4',
      type: 'video/mp4',
      bytes: MP4_BYTES,
    }),
  }

  const kinds = ['image', 'file', 'audio', 'video'] as const
  const ids = Object.fromEntries(kinds.map((kind) => [kind, randomUUID()])) as Record<
    (typeof kinds)[number],
    string
  >
  const before = await read(owner, folder)
  const operations: DocumentOperation[] = [
    ...kinds.map((kind) => ({
      op: 'put_block' as const,
      id: ids[kind],
      block_kind: kind,
      text: null,
      rich_content: null,
      file_id: sources[kind],
      ref_folder_id: null,
      width_pct: kind === 'video' ? 80 : null,
      checked: null,
    })),
    {
      op: 'set_outline' as const,
      items: kinds.map((kind) => ({
        kind: 'block' as const,
        id: ids[kind],
        section_block_id: null,
        list_parent_block_id: null,
      })),
    },
  ]
  expectStatus(
    await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: before.revision!,
      operations,
    }),
    200,
    'the source page holds one block of each media kind',
  )

  const duplicated = await owner.browser.json(
    `/folders/${folder}/duplicate?tz=${encodeURIComponent(ZONE)}`,
    'POST',
  )
  expectStatus(duplicated, 201, 'duplicate answers the copy (spec 7.16)')
  const copyId = String((duplicated.json() as { id?: unknown }).id)

  const copy = await read(owner, copyId)
  expect(copy.blocks.length, 'the copy carries one block per source block').toBe(4)

  for (const kind of kinds) {
    const block = copy.blocks.find((candidate) => candidate.kind === kind)
    expect(block, `the copy has a ${kind} block`).toBeDefined()
    expect(
      block?.file_id,
      `the copied ${kind} block names its own file, never the source's`,
    ).not.toBe(sources[kind])
    expect(block?.file_id, `the copied ${kind} block names a file`).toBeTruthy()

    const copied = await rows(
      app.db,
      sql`SELECT kind, name, mime, folder_id FROM files WHERE id = ${block!.file_id!}::uuid`,
    )
    /* The assertion the old `UPDATE files SET kind='image'` would have failed
       on three of these four rows. */
    expect(String(copied[0]?.kind), `the copied file keeps the source's kind for ${kind}`).toBe(
      kind,
    )
    expect(String(copied[0]?.folder_id), 'the copy lives in the copy folder, its own scope').toBe(
      copyId,
    )
    // The bytes are real and are the source's bytes, not a reference to them.
    expect(store.objects.has(block!.file_id!), `${kind} bytes were written for the copy`).toBe(true)
    expect(
      store.objects.get(block!.file_id!)?.equals(store.objects.get(sources[kind])!),
      `${kind} bytes are copied rather than shared`,
    ).toBe(true)
  }

  // The video's persisted width rides across with the block, which is
  // presentation state rather than a fact about the file.
  expect(copy.blocks.find((block) => block.kind === 'video')?.width_pct).toBe(80)
})

test('AC-504 a duplicate refused on quota leaves no folder, no rows and no bytes', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac504 at the gigabyte')
  const audio = await uploadKindOk(owner, 'audio', folder, {
    name: 'ac504.mp3',
    type: 'audio/mpeg',
    bytes: MP3_BYTES,
  })

  const id = randomUUID()
  const before = await read(owner, folder)
  expectStatus(
    await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: before.revision!,
      operations: [
        {
          op: 'put_block',
          id,
          block_kind: 'audio',
          text: null,
          rich_content: null,
          file_id: audio,
          ref_folder_id: null,
          width_pct: null,
          checked: null,
        },
        {
          op: 'set_outline',
          items: [{ kind: 'block', id, section_block_id: null, list_parent_block_id: null }],
        },
      ],
    }),
    200,
    'the source page holds the audio block',
  )

  /* 10.3's gigabyte, spent by seeding the ledger rather than by uploading
     one: `files.bytes` is the quota's own record and this is what AC-194
     already does. The row is folder-less so it cannot disturb the page. */
  await app.db.execute(
    sql`INSERT INTO files (owner_id, folder_id, kind, name, mime, bytes)
        VALUES (${owner.id}::uuid, NULL, 'cover', 'ac504-ballast', 'image/png',
                ${1024 * 1024 * 1024})`,
  )

  const objectsBefore = new Set(store.objects.keys())
  const foldersBefore = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${owner.id}::uuid AND deleted_at IS NULL`,
  )

  const refused = await owner.browser.json(
    `/folders/${folder}/duplicate?tz=${encodeURIComponent(ZONE)}`,
    'POST',
  )
  expectStatus(refused, 413, 'the quota is the one limit that answers 413 (spec 10.3)')

  const foldersAfter = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${owner.id}::uuid AND deleted_at IS NULL`,
  )
  expect(
    Number(foldersAfter[0]?.n),
    'no half-created folder survives the refusal (#220 R1, issue #128)',
  ).toBe(Number(foldersBefore[0]?.n))

  const strays = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM files
        WHERE owner_id = ${owner.id}::uuid AND name = 'ac504.mp3'`,
  )
  expect(Number(strays[0]?.n), 'the copy of the audio row rolled back with the folder').toBe(1)

  /* And the half the rollback cannot reach. A `put` is not transactional, so
     bytes a copy wrote before the refusal would sit in the store for ever
     with no row indexing them; the catch removes what it was told about. */
  expect(
    [...store.objects.keys()].filter((key) => !objectsBefore.has(key)),
    'no orphaned object-store bytes survive the refusal (#220 R1)',
  ).toEqual([])
})
