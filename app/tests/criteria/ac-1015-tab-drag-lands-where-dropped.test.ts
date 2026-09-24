/*
AC-1015: given a Folder nobody has reordered, when a member drags their own
private tab between the built-ins, then the tab row draws it where it was
dropped (it does not snap back to the end), `after_facet_id: null` puts it at
the front of the row, every other member's drawn row is unchanged, and a later
shared-order write reorders the shared tabs exactly as asked without moving
the private one.

**Why this criterion exists.** An untouched Folder is drawn in
`NATIVE_TAB_ORDER` rather than stored order (`tabOrder`). The private route
used to re-key only the private row, so the Folder stayed "untouched" and the
drop was redrawn after the built-ins; and its null anchor meant "after Main",
which stopped being the front once Main could stand anywhere.

Spec: 7.27, 9.5 (tab row).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { NATIVE_TAB_ORDER } from '../../src/shared/facets.js'
import type { Facet } from '../../src/shared/facets.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac1015')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function facets(actor: Actor, folderId: string): Promise<Facet[]> {
  const listed = await actor.browser.json(`/folders/${folderId}/facets`, 'GET')
  expectStatus(listed, 200, 'a member lists the facets (7.27)')
  return (listed.json() as { facets: Facet[] }).facets
}

/**
 * The client's draw rule (`tabOrder` in `components/folder-facets.tsx`, which
 * this node-side project cannot import): built-ins still at their creation
 * keys (all shown) are drawn in `NATIVE_TAB_ORDER`, custom tabs after them in stored
 * order; otherwise the stored order is the order.
 */
function tabOrder(all: readonly Facet[]): Facet[] {
  const rows = all.filter((facet) => !facet.hidden)
  const at = (kind: string) => rows.find((facet) => facet.kind === kind)?.position
  const untouched = at('main') === 'a0' && at('purpose') === 'a1' && at('consultation') === 'a2' && at('results') === 'a3'
  if (!untouched) return [...rows]
  const rank = (facet: Facet): number => {
    const native = (NATIVE_TAB_ORDER as readonly string[]).indexOf(facet.kind)
    return native < 0 ? NATIVE_TAB_ORDER.length : native
  }
  return rows.map((facet, index) => ({ facet, index }))
    .sort((a, b) => rank(a.facet) - rank(b.facet) || a.index - b.index)
    .map((entry) => entry.facet)
}

/** The row as drawn: the client's own rule, names for legible failures. */
async function drawn(actor: Actor, folderId: string): Promise<string[]> {
  return tabOrder(await facets(actor, folderId)).map((facet) => facet.display_name ?? facet.kind)
}

async function create(actor: Actor, folderId: string, kind: 'shared_blank' | 'private_blank', name: string): Promise<string> {
  const made = await actor.browser.json(`/folders/${folderId}/facets`, 'POST', { kind, display_name: name })
  expectStatus(made, 201, `${actor.sub} creates ${name}`)
  return (made.json() as Facet).id
}

describe('AC-1015 a dragged tab lands where it was dropped', () => {
  test('AC-1015: private drag in an untouched Folder, null anchor, and the shared order', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await createFolder(owner, 'ac1015 tabs')
    await connect(app.db, owner.id, member.id)
    await addMemberOk(owner, folderId, member.id, 'can_edit')

    await create(owner, folderId, 'shared_blank', 'Shared')
    const mine = await create(owner, folderId, 'private_blank', 'Mine')
    await create(member, folderId, 'private_blank', 'Theirs')

    const byKind = new Map((await facets(owner, folderId)).map((facet) => [facet.kind, facet.id]))
    const purpose = byKind.get('purpose')!
    const memberBefore = await drawn(member, folderId)
    expect((await drawn(owner, folderId)).indexOf('Mine'), 'untouched: custom tabs are drawn after the built-ins').toBeGreaterThan(3)

    /* The drag: Mine dropped just after Purpose. */
    expectStatus(
      await owner.browser.json(`/folders/${folderId}/facets/my-order`, 'PUT', {
        placements: [{ facet_id: mine, after_facet_id: purpose }],
      }),
      200,
      'the owner places their own private tab (7.27)',
    )
    const ownerRow = await drawn(owner, folderId)
    expect(ownerRow.indexOf('Mine'), `the row draws Mine right after Purpose: ${ownerRow.join(', ')}`).toBe(1)
    expect(await drawn(member, folderId), "a private drag leaves another member's row as it was (invariant 11)").toEqual(memberBefore)

    /* Null is the front of the row, not "after Main". */
    expectStatus(
      await owner.browser.json(`/folders/${folderId}/facets/my-order`, 'PUT', {
        placements: [{ facet_id: mine, after_facet_id: null }],
      }),
      200,
      'the owner moves their private tab to the front',
    )
    expect((await drawn(owner, folderId))[0], 'after_facet_id null puts the tab first').toBe('Mine')
    expect(await drawn(member, folderId)).toEqual(memberBefore)

    /* The shared route: the whole shared order, exactly as asked. */
    const shared = (await facets(owner, folderId)).filter((facet) => !facet.private)
    const asked = [...shared].reverse().map((facet) => facet.id)
    expectStatus(
      await owner.browser.json(`/folders/${folderId}/facets/order`, 'PUT', { order: asked }),
      200,
      'the owner writes the shared order (7.27)',
    )
    const after = tabOrder(await facets(owner, folderId))
    expect(after.filter((facet) => !facet.private).map((facet) => facet.id), 'the shared tabs are drawn in the written order').toEqual(asked)
    expect(after[0]!.id, 'a shared-order write does not move the private tab').toBe(mine)
    const memberShared = tabOrder(await facets(member, folderId)).filter((facet) => !facet.private).map((facet) => facet.id)
    expect(memberShared, 'every member draws the written shared order').toEqual(asked)
  }, 60_000)

  test('AC-1015: with a built-in hidden the row is already stored order, and a private drag keeps it', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await createFolder(owner, 'ac1015 hidden')
    await connect(app.db, owner.id, member.id)
    await addMemberOk(owner, folderId, member.id, 'can_edit')
    const byKind = new Map((await facets(owner, folderId)).map((facet) => [facet.kind, facet.id]))
    expectStatus(
      await owner.browser.json(`/folders/${folderId}/facets/${byKind.get('consultation')!}`, 'PATCH', { hidden: true }),
      200,
      'the owner hides Discussion',
    )
    const mine = await create(owner, folderId, 'private_blank', 'Mine')
    const memberBefore = await drawn(member, folderId)
    expectStatus(
      await owner.browser.json(`/folders/${folderId}/facets/my-order`, 'PUT', {
        placements: [{ facet_id: mine, after_facet_id: byKind.get('purpose')! }],
      }),
      200,
      'the owner places their private tab',
    )
    const ownerRow = await drawn(owner, folderId)
    expect(ownerRow[ownerRow.indexOf('Mine') - 1], `Mine follows Purpose: ${ownerRow.join(', ')}`).toBe('purpose')
    expect(await drawn(member, folderId), 'the built-ins keep the order they were drawn in').toEqual(memberBefore)
  }, 60_000)
})
