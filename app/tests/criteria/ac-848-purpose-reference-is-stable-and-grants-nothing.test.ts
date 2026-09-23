/*
AC-848: a Dana Link to Purpose names the stable native facet identity. Rename
changes its live label, hiding does not revoke it, an inaccessible Purpose is
indistinguishable from a missing one, and resolving/searching the reference
grants nothing.

Issue #211, R1-R3 and Hassan's ruling:
https://github.com/zhssnym/dana/issues/211#issuecomment-5801396721
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, countRows, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  folderWithFacets,
  patchFacet,
} from '../support/facets-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac848')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-848 Purpose Dana Links resolve live and grant nothing', () => {
  test('rename and hide keep one stable reference identity', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-848 links', [
      [member, 'can_view'],
    ])
    const purpose = facets.find((facet) => facet.kind === 'purpose')!

    const first = await member.browser.api(`/references/facet/${purpose.id}`)
    expectStatus(first, 200, 'a current member resolves the native Purpose facet')
    expect(first.json()).toEqual({
      kind: 'facet',
      id: purpose.id,
      label: 'Purpose',
      path: `/app/facets/${purpose.id}`,
    })

    expectStatus(
      await patchFacet(owner, folderId, purpose.id, {
        display_name: 'North star',
        hidden: true,
      }),
      200,
      'Can edit may rename/hide Purpose',
    )
    const after = await member.browser.api(`/references/facet/${purpose.id}`)
    expectStatus(
      after,
      200,
      'hidden is presentation state, not revocation of a link the member may follow',
    )
    expect(after.json()).toEqual({
      kind: 'facet',
      id: purpose.id,
      label: 'North star',
      path: `/app/facets/${purpose.id}`,
    })

    const search = await member.browser.api(
      `/references/search?q=${encodeURIComponent('North star')}&folder=${folderId}`,
    )
    expectStatus(search, 200, 'the picker uses the same access boundary')
    expect(
      (search.json() as { results: { kind: string; id: string }[] }).results,
      'the hidden but readable Purpose remains discoverable to its member',
    ).toContainEqual(expect.objectContaining({ kind: 'facet', id: purpose.id }))
  })

  test('an outsider learns nothing and reference operations create no grant', async () => {
    const [owner, member, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    const { folderId, facets } = await folderWithFacets(app, owner, 'AC-848 no grant', [
      [member, 'can_view'],
    ])
    const purpose = facets.find((facet) => facet.kind === 'purpose')!
    const missing = '00000000-0000-4000-8000-000000000848'

    const memberships = () =>
      countRows(app.db, sql`SELECT count(*)::int AS n FROM folder_members`)
    const events = () =>
      countRows(app.db, sql`SELECT count(*)::int AS n FROM events`)
    const before = [await memberships(), await events()]

    const inaccessible = await stranger.browser.api(
      `/references/facet/${purpose.id}`,
    )
    const absent = await stranger.browser.api(`/references/facet/${missing}`)
    expectStatus(inaccessible, 404, 'inaccessible Purpose is not named')
    expectStatus(absent, 404, 'missing Purpose uses the same status')
    expect(
      inaccessible.body,
      'the response body is indistinguishable too',
    ).toBe(absent.body)

    await member.browser.api(`/references/facet/${purpose.id}`)
    await member.browser.api(
      `/references/search?q=${encodeURIComponent('Purpose')}&folder=${folderId}`,
    )
    expect(
      [await memberships(), await events()],
      'resolving/searching a Dana Link joins nobody and records no act',
    ).toEqual(before)

    expectStatus(
      await stranger.browser.api(`/folders/${folderId}`),
      404,
      'and the stranger still cannot open the Folder afterwards',
    )
  })
})
