/*
The database half of the folder-reference criteria: a real folder page holding
a real `folder_ref`, written through the route rather than with an INSERT, and
the stored row read back.

**Why this exists beside `folder-canvas-harness.tsx` rather than inside it.**
That file is the jsdom half — it renders `FolderCanvas`, doubles
`CanvasSurface` and drives the editor — and five of the criteria that import it
never open a database. Putting `createTestDb` and drizzle in it would make
AC-464 to AC-466 pay for a connection they do not use. So the two halves are
two files and a criterion that needs both imports both.

**Why AC-660 to AC-662 do not use it.** They carry this plumbing inline, and
they were written and adversarially reviewed that way on
`backend/255-folder-ref-survives-edit`; the follow-up that added AC-663 to
AC-665 left them alone on the rule that a criterion moves when the decision it
pins moves and not when a support file is tidied. The duplication is therefore
deliberate and is exactly two spellings, not five. Anything that changes the
seed's *meaning* has to move both, and `seedReferencePage` below states the
seed's shape in the same terms AC-660's does so that the two are comparable by
reading.

**What the route stand-in is, and what it is not.** `sendThroughTheRoute` is
`POST /folders/:id/page/actions` minus HTTP and the session it has already
checked: the body through `pageActionBody`, which is the schema `parseBody`
runs, then `actOnFolderPage`, which carries 10.2's gate and `applyDocument`,
and the response back through `getPageResponse` because that is what the client
parses before the writer ever sees it. So a transaction the server would refuse
is refused here, which is the thing the harness's own `refusalOf` cannot do.
Every refusal is recorded on the seam the caller owns rather than swallowed: a
criterion asserting a row has to be able to say "and nothing was refused on the
way", or a page that never moved reads as a page that moved correctly.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import { getPageResponse, pageActionBody } from '../../src/shared/pages.js'
import type { DocumentOperation, PageView } from '../../src/shared/pages.js'
import type { DocumentTransaction } from '../../src/shared/page-document.js'
import { actOnFolderPage, pageView } from '../../src/server/domain/pages.js'
import type { Db } from '../../db/client.js'
import { rows } from './helpers.js'

/**
 * The mutable seam each criterion file owns.
 *
 * The `vi.mock` factory that stands in for `api/http.js` is hoisted above
 * every `let` in its file, so the folder it sends to cannot be captured when
 * the mock is written; `send` is pointed at one folder's route after that
 * folder exists. `refusals` is what the route said no to, asserted empty.
 */
export interface FolderPageRoute {
  send: ((body: DocumentTransaction) => Promise<PageView>) | null
  refusals: string[]
}

/** One account to own everything a folder-reference criterion seeds. */
export async function seedOwner(db: Db, label: string): Promise<string> {
  const found = await rows(db, sql`INSERT INTO users (google_sub,email,display_name)
    VALUES (${`${label}-${randomUUID()}`},${`${label}-${randomUUID()}@folder-ref.test`},${`${label} owner`}) RETURNING id`)
  return String(found[0]?.id)
}

/** One folder the viewer owns and is a member of, which 10.2's gate reads. */
export async function seedFolder(db: Db, viewer: string, name: string): Promise<string> {
  const found = await rows(db, sql`INSERT INTO folders (owner_id,name) VALUES (${viewer}::uuid,${name}) RETURNING id`)
  const id = String(found[0]?.id)
  await db.execute(sql`INSERT INTO folder_members (folder_id,user_id) VALUES (${id}::uuid,${viewer}::uuid)`)
  return id
}

export async function sendThroughTheRoute(
  db: Db,
  viewer: string,
  route: FolderPageRoute,
  folder: string,
  body: DocumentTransaction,
): Promise<PageView> {
  const parsed = pageActionBody.safeParse(body)
  if (!parsed.success) {
    route.refusals.push('validation_failed')
    throw new Error(`the contract refused this transaction: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }
  const outcome = await actOnFolderPage(db, viewer, folder, parsed.data)
  if (outcome.kind !== 'written') {
    route.refusals.push(outcome.kind)
    throw new Error(`the server refused this transaction: ${outcome.kind}`)
  }
  return getPageResponse.parse(JSON.parse(JSON.stringify(outcome.page)))
}

export interface ReferencePage {
  /** The folder whose page is under test. */
  folder: string
  /** The folder the reference names, which is a different one. */
  referenced: string
  /** The `folder_ref` block's id. */
  reference: string
  /** An ordinary paragraph beside it, so no case is a one-block page. */
  prose: string
  /** The page as the route answered it, which is what the canvas mounts on. */
  page: PageView
}

/**
 * A folder page holding prose and a reference to another folder.
 *
 * `text` and `rich_content` are both null on the reference as seeded: a
 * reference names a folder and carries no words of its own until somebody
 * types in it, and `page_blocks_rich_content_check` refuses rich content on
 * this kind outright. A caller wanting words there passes `text`.
 *
 * That a folder page may hold this row at all is AC-660's paragraph, and the
 * 4.17 ruling behind it is written there rather than repeated here.
 *
 * Leaves `route.send` pointed at this folder. What the seeding transaction put
 * on the wire is the caller's to clear, because the spy it lands in is the
 * caller's: a criterion counting its own transactions empties `api.sent` after
 * this returns, and one that does not, does not.
 */
export async function seedReferencePage(
  db: Db,
  viewer: string,
  route: FolderPageRoute,
  name: string,
  text: string | null = null,
): Promise<ReferencePage> {
  const folder = await seedFolder(db, viewer, `${name} page`)
  const referenced = await seedFolder(db, viewer, `${name} target`)
  const prose = randomUUID(), reference = randomUUID()
  const empty = getPageResponse.parse(JSON.parse(JSON.stringify(await pageView(db, viewer, { folderId: folder, shelfId: null }))))
  const operations: DocumentOperation[] = [
    { op: 'put_block', id: prose, block_kind: 'paragraph', text: 'What the studio is for.', rich_content: { version: 1, runs: [{ text: 'What the studio is for.' }] }, file_id: null, ref_folder_id: null, width_pct: null, checked: null },
    { op: 'put_block', id: reference, block_kind: 'folder_ref', text, rich_content: null, file_id: null, ref_folder_id: referenced, width_pct: null, checked: null },
    { op: 'set_outline', items: [prose, reference].map((id) => ({ kind: 'block' as const, id, section_block_id: null, list_parent_block_id: null })) },
  ]
  const page = await sendThroughTheRoute(db, viewer, route, folder, {
    action: 'document_transaction', mutation_id: randomUUID(), base_revision: empty.revision!, operations,
  })
  route.send = (body) => sendThroughTheRoute(db, viewer, route, folder, body)
  return { folder, referenced, reference, prose, page }
}

export interface StoredBlock {
  kind: string
  ref_folder_id: string | null
  text: string | null
  rich_content: unknown
}

/**
 * The row itself, not the page the route answered with.
 *
 * Read with SQL rather than through `pageView` on purpose: a projection that
 * agreed with the client about a column it had already lost would answer the
 * question with the thing under test.
 */
export async function storedBlock(db: Db, id: string): Promise<StoredBlock> {
  const found = await rows(db, sql`SELECT kind, ref_folder_id, text, rich_content FROM page_blocks WHERE id=${id}::uuid`)
  const row = found[0]
  if (row === undefined) throw new Error(`the page no longer carries ${id}`)
  return {
    kind: String(row.kind),
    ref_folder_id: row.ref_folder_id === null || row.ref_folder_id === undefined ? null : String(row.ref_folder_id),
    text: row.text === null || row.text === undefined ? null : String(row.text),
    rich_content: row.rich_content ?? null,
  }
}
