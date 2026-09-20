// @vitest-environment jsdom
/*
AC-665: given a folder page carrying a `folder_ref` block, when the person
types styled words and a second link inside it, then the relation survives and
the styling does not: the stored row is a `folder_ref` naming the same folder
whose `text` is the runs concatenated and whose `rich_content` is null, and the
next read draws the whole of that text as one link to the folder.

**This pins a loss, deliberately, because the loss is the ruling.**
`page_blocks_rich_content_check` admits `rich_content` on the seven rich-text
kinds and `folder_ref` is not one of them, and `put_block` says the same in the
contract. So the carry that keeps the relation across an edit (AC-660) has a
price on a block somebody has styled: bold and italic are dropped, and a second
link inside the reference is dropped with them. The alternative is not a better
projection — it is a 422 on every save of that page, which `CanvasWriter.flush`
latches as `failed` so that nothing typed afterwards is ever sent. Losing a
style is recoverable by restyling; a page that will not save is not recoverable
at all, which is the direction `restoreCanvas`'s own comment argues at length
for the structured kinds.

**And it is a real behaviour change rather than a pre-existing shrug.** On
`main` those runs survived, because the block was flattened to a paragraph and
a paragraph may carry rich content — and the relation was destroyed instead.
This is the same loss pointed the other way, and it is the trade the issue #255
fix makes. `adapters.ts` said "nothing the person can see is lost" until this
criterion was written; that sentence was measurably false and now says what is
actually lost.

**Neither AC-660 case has more than one plain run**, which is why nothing
noticed. This one carries three runs, a style and a second href.

**What is not established, and it is a question for a person rather than a
gap.** Emptying a reference — selecting its words and deleting them — is the
second case below. The relation survives, which is right and is what that case
pins. What the row then *draws* is not pinned: `hydrateCanvas` builds
`{type:'link', href:'/app/folders/<uuid>', content: ''}` from `text: ''`, a
zero-length link, so the page shows an empty line that still holds an ON DELETE
CASCADE relation to a folder. The placeholder that exists for a reference which
has never had words (`text: null` draws as "Open folder") does not apply,
because `dehydrateCanvas` writes `''` and never null. Whether an emptied
reference should fall back to that placeholder, be treated as a removal, or
stay as it is, is a product decision nobody has taken; **measured at the
adapter and not verified in a browser**, and left as it is rather than decided
here. Issue #255's review found it.

Spec 4.17, 7.16, 12.9. Issue #255.
*/
import { cleanup, waitFor } from '@testing-library/react'
import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import type { PageView } from '../../src/shared/pages.js'
import type { DocumentTransaction } from '../../src/shared/page-document.js'
import { hydrateCanvas } from '../../src/client/components/page/canvas/adapters.js'
import type { Db, DbClient } from '../../db/client.js'
import type { CanvasApiSpy, CanvasSurfaceSpy } from '../support/folder-canvas-harness.js'
import { editAndSave, mountCanvas, settled, typeInto } from '../support/folder-canvas-harness.js'
import type { FolderPageRoute } from '../support/folder-ref-page.js'
import { seedOwner, seedReferencePage, storedBlock } from '../support/folder-ref-page.js'
import { cleanupUsers, createTestDb } from '../support/helpers.js'

const surface = vi.hoisted((): CanvasSurfaceSpy => ({ props: null }))
const api = vi.hoisted((): CanvasApiSpy => ({ sent: [], page: { blocks: [], items: [] }, revision: 1 }))
const route = vi.hoisted((): FolderPageRoute => ({ send: null, refusals: [] }))

vi.mock('../../src/client/components/page/canvas/CanvasSurface.js', () => ({
  CanvasSurface: (props: NonNullable<CanvasSurfaceSpy['props']>) => { surface.props = props; return null },
}))
vi.mock('../../src/client/api/http.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mutateApi: async (_schema: unknown, options: { body: DocumentTransaction }) => {
    api.sent.push(options.body)
    api.page = await route.send!(options.body)
    return api.page
  },
}))

/** The column width `FolderCanvas` hydrates with; only image widths read it. */
const COLUMN = 600

let client: DbClient
let db: Db
let viewer = ''
const seededUsers: string[] = []

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
  viewer = await seedOwner(db, 'ac665')
  seededUsers.push(viewer)
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  for (const id of seededUsers) await db.execute(sql`DELETE FROM events WHERE actor_id = ${id}::uuid`)
  await cleanupUsers(db, seededUsers)
  await client.close()
})

afterEach(cleanup)
beforeEach(() => {
  surface.props = null
  api.sent = []
  api.page = { blocks: [], items: [] }
  route.send = null
  route.refusals = []
  sessionStorage.clear()
})

async function seed(name: string, text: string | null = null): Promise<{ folder: string; referenced: string; reference: string; page: PageView }> {
  const seeded = await seedReferencePage(db, viewer, route, name, text)
  api.sent = []
  return seeded
}

describe('AC-665 a folder reference keeps its relation and loses its styling', () => {
  test('two runs, a style and a second link flatten to their words under one folder link', async () => {
    const { folder, referenced, reference, page } = await seed('styled inside a reference')

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    const sent = await editAndSave(surface, api, (editor) => {
      editor.updateBlock(reference, { content: [
        { type: 'text', text: 'Design notes ', styles: {} },
        { type: 'text', text: 'urgent', styles: { bold: true } },
        { type: 'link', href: 'https://example.com/notes', content: 'elsewhere' },
      ] })
    })
    await settled(container)
    expect(route.refusals).toEqual([])

    const written = sent.operations.flatMap((operation) => operation.op === 'put_block' && operation.id === reference ? [operation] : [])
    expect(written).toMatchObject([{ block_kind: 'folder_ref', ref_folder_id: referenced, text: 'Design notes urgentelsewhere', rich_content: null }])

    const row = await storedBlock(db, reference)
    expect(row).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced, text: 'Design notes urgentelsewhere', rich_content: null })
    /* The second href, named as absent rather than implied by the null above:
       what the person typed pointed somewhere else, and nothing on this row
       remembers that it did. */
    expect(JSON.stringify(row).includes('example.com')).toBe(false)

    /* What comes back, which is the half a person sees. One link over the
       whole string, to the folder — not the three pieces that were typed. This
       is the loss, measured, and it is the criterion's subject rather than an
       aside. */
    expect(hydrateCanvas(api.page, COLUMN).find((block) => block.id === reference)).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'link', href: `/app/folders/${referenced}`, content: 'Design notes urgentelsewhere' }],
    })
  })

  /*
  The smaller probe of the same trade: the relation is not conditional on there
  being any words at all. What the empty row draws is the question in the
  header and is deliberately not asserted here.
  */
  test('emptying a reference keeps the kind and the relation, with no words', async () => {
    const { folder, referenced, reference, page } = await seed('emptied reference', 'Design')
    expect(await storedBlock(db, reference)).toMatchObject({ kind: 'folder_ref', text: 'Design' })

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    const sent = await editAndSave(surface, api, typeInto(reference, ''))
    await settled(container)
    expect(route.refusals).toEqual([])

    expect(sent.operations.flatMap((operation) => operation.op === 'put_block' && operation.id === reference ? [operation] : []))
      .toMatchObject([{ block_kind: 'folder_ref', ref_folder_id: referenced, text: '', rich_content: null }])
    expect(await storedBlock(db, reference)).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced, text: '', rich_content: null })
  })
})
