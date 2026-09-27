/*
AC-1528: a project member reads every tab and sub-page of the project, a
stranger gets 404 on each, and a member removed from the project gets 404 on
all of them at once (step 8, spec 4.4, 10.2). Membership rows live on the
project root alone, so this is the access resolver's join: it goes red when
that join names the page instead of its project.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, expectStatus, removeMember } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac1528')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function statuses(actor: Actor, ids: readonly string[]): Promise<number[]> {
  const found: number[] = []
  for (const id of ids) {
    found.push((await actor.browser.json(`/folders/${id}`, 'GET')).status)
    found.push((await actor.browser.json(`/folders/${id}/page`, 'GET')).status)
  }
  return found
}

describe('AC-1528 a project member reads every page of it', () => {
  test('AC-1528: every tab and sub-page to a member, none to a stranger, none once removed', async () => {
    const [owner, member, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1528 trip', kind: null })
    expectStatus(made, 201, 'an unpicked project')
    const project = (made.json() as { id: string }).id
    const tabs = await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' })
    expectStatus(tabs, 201, 'the usual project')
    const tabIds = (tabs.json() as { id: string; kind: string }[]).filter((t) => t.kind !== 'discussion').map((t) => t.id)
    const purpose = tabIds[0] as string
    const sub = await owner.browser.json('/folders', 'POST', { name: 'ac1528 packing', parent_folder_id: purpose })
    expectStatus(sub, 201, 'a sub-page')
    const subId = (sub.json() as { id: string }).id
    const grand = await owner.browser.json('/folders', 'POST', { name: 'ac1528 boots', parent_folder_id: subId })
    expectStatus(grand, 201, 'a grandchild')
    const pages = [...tabIds, subId, (grand.json() as { id: string }).id]

    await connect(app.db, owner.id, member.id)
    await connect(app.db, owner.id, stranger.id)
    await addMemberOk(owner, project, member.id, 'can_view')

    expect(await statuses(member, pages), 'the member reads every tab and sub-page').toEqual(pages.flatMap(() => [200, 200]))
    expect(await statuses(stranger, pages), 'a stranger reads none').toEqual(pages.flatMap(() => [404, 404]))

    expectStatus(await removeMember(owner, project, member.id), 204, 'removed from the project')
    expect(await statuses(member, pages), 'removed, they read none').toEqual(pages.flatMap(() => [404, 404]))
  }, 60_000)
})
