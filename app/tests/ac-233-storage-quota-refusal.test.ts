/*
AC-233: given an account at its 1 GB storage quota, when it uploads another
file, then 413 with section 9's copy and no files row is created.

The quota's refusal path was untested: AC-194 exercises the per-file caps
and nothing exercised D5's account-wide byte ceiling, so a regression in the
FOR UPDATE ordering would surface as a silent overrun. A real gigabyte is
not uploaded; the account is put at the ceiling by seeding a ballast row,
the table being the authority on usage (4.16), and the refusal is then
measured on the wire. Proposed by the S14 security review, ruled in by RFC
0005 change control item 18, pinning behaviour the tree already has.

Spec: 10.3 (D5), 7.15, section 9's quota copy.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['hoarder'], 's14')

/** 10.3 (D5): 1 GB across every kind. */
const QUOTA_BYTES = 1024 * 1024 * 1024

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-233 the storage quota refuses at 413 and writes nothing', () => {
  test('an upload past the ceiling answers 413 with the section 9 copy', async () => {
    const [hoarder] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(hoarder, 's14 ac233 quota')

    // Ballast: a row claiming all but 50 bytes of the quota. The insert
    // bypasses the API deliberately; the criterion is about the refusal,
    // and the table is the authority on usage (4.16).
    await app.db.execute(sql`
      INSERT INTO files (owner_id, folder_id, kind, name, mime, bytes)
      VALUES (${hoarder.id}::uuid, ${folderId}::uuid, 'file', 'ballast.bin',
              'application/octet-stream', ${QUOTA_BYTES - 50})`)

    const refused = await upload(
      hoarder,
      '/files',
      { kind: 'file', folder_id: folderId },
      {
        name: 'straw.txt',
        type: 'text/plain',
        bytes: Buffer.from('x'.repeat(100), 'utf8'),
      },
    )
    expectStatus(
      refused,
      413,
      'the storage quota is the one limit 10.3 answers 413 rather than 422',
    )
    const envelope = refused.json() as { error?: { message?: unknown } }
    const message = String(envelope.error?.message ?? '')
    expect(
      message,
      'the 413 carries section 9 quota copy, naming the gigabyte and the way out',
    ).toBe("You've used your 1 GB of storage. Delete some files to add more.")

    const rows = await app.db.execute(sql`
      SELECT count(*)::int AS n FROM files WHERE owner_id = ${hoarder.id}::uuid`)
    expect(
      Number((rows.rows as Array<{ n: unknown }>)[0]?.n ?? -1),
      'the refused upload must create no row: the ballast row stays alone',
    ).toBe(1)
  })
})
