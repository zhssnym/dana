/*
AC-362: given an upload of a kind that carries no picture — a voice note, a
downloaded attachment — then its width and height are null and stay null; and
given a row that claims a dimension for such a kind, or half a pair, or a zero
edge, then the database refuses it by name.

**Null is the whole point of the pair being nullable, and it has two sources
that must behave identically.** A voice note has no shape to record, and a
file stored before migration 0009 has one that was never read; both answer
null, and null means "nothing is known", never zero and never square. A
consumer that treated null as a shape would draw a reservation around nothing,
which is the fault the columns exist to remove rather than a new way to cause
it.

**The refusals are asserted against the database rather than against the
route**, because the route is not where the rule lives. Nothing in
`domain/files.ts` can write a dimension onto a voice note today; the CHECKs are
there so that nothing can write one tomorrow either, and a criterion that only
exercised today's upload path would pass on a schema that had lost them.

Spec: 4.16 as amended by migration 0009, 7.15. Issue #27.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectRejectedBy, rows } from './helpers.js'
import { ONE_PIXEL_PNG, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'i27b')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const VOICE_BYTES = Buffer.from('i27b not really an opus stream', 'utf8')
const DOCUMENT_BYTES = Buffer.from('%PDF-1.4\n% i27b\n', 'utf8')

describe('AC-362 only a picture has a shape', () => {
  test('a voice note and a plain attachment store null width and height', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folder = await createFolder(owner, 'i27b ac362 folder')

    for (const [kind, file, why] of [
      [
        'voice',
        { name: 'note.webm', type: 'audio/webm', bytes: VOICE_BYTES },
        'a voice note has no dimensions and none may be invented for it (4.16)',
      ],
      [
        'file',
        { name: 'paper.pdf', type: 'application/pdf', bytes: DOCUMENT_BYTES },
        'a downloaded attachment never passes the re-encode, so nothing knows its shape (7.15)',
      ],
    ] as const) {
      const stored = await upload(
        owner,
        '/files',
        { kind, folder_id: folder },
        file,
      )
      expectStatus(stored, 201, `${kind} uploads (spec 7.15)`)
      const answer = stored.json() as {
        id?: unknown
        width?: unknown
        height?: unknown
      }
      expect(answer.width, why).toBeNull()
      expect(answer.height, why).toBeNull()

      const found = await rows(
        app.db,
        sql`SELECT width, height FROM files WHERE id = ${String(answer.id)}::uuid`,
      )
      expect(found[0]?.width, `${kind}: the row agrees with the answer`).toBeNull()
      expect(found[0]?.height, `${kind}: the row agrees with the answer`).toBeNull()
    }
  })

  test('a picture still records its shape, so the null above is a kind rule and not a broken write', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folder = await createFolder(owner, 'i27b ac362 control')

    const stored = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folder },
      { name: 'dot.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(stored, 201, 'the control image stores (spec 7.15)')
    const answer = stored.json() as { width?: unknown; height?: unknown }
    expect(
      answer.width,
      'without this the case above passes on a build that records nothing at all',
    ).toBe(1)
    expect(answer.height).toBe(1)
  })

  test('the database refuses a dimension on a kind that has none, half a pair, and a zero edge', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folder = await createFolder(owner, 'i27b ac362 refusals')

    const insert = (
      kind: string,
      width: number | null,
      height: number | null,
    ): (() => Promise<unknown>) => {
      const id = randomUUID()
      return () =>
        app.db.execute(sql`
          INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes,
                             width, height)
          VALUES (${id}::uuid, ${owner.id}::uuid, ${folder}::uuid, ${kind},
                  ${`i27b ${id.slice(0, 8)}`}, 'image/png', 1024,
                  ${width}, ${height})
        `)
    }

    await expectRejectedBy(insert('voice', 40, 24), 'files_dimensions_kind_check')
    await expectRejectedBy(insert('file', 40, 24), 'files_dimensions_kind_check')
    await expectRejectedBy(insert('image', 40, null), 'files_dimensions_pair_check')
    await expectRejectedBy(insert('image', null, 24), 'files_dimensions_pair_check')
    await expectRejectedBy(insert('image', 0, 24), 'files_dimensions_pair_check')
    await expectRejectedBy(insert('image', 40, -1), 'files_dimensions_pair_check')
  })
})
