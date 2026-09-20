/*
In-session proof of the 7.4 surface, the P1 idiom: the boot file mounts
routers by Platform's hand only, so the acceptance criteria stay red until
that wiring touch, and this file is how the router proves itself before it.
A bare express application assembles the same pieces the requested wiring
names (auth router ahead, folders router behind it, the notify module
attached with a capturing sink), and the acceptance harness's own stub,
HTTP client, and helpers drive it unchanged, so what passes here is the
same vocabulary the criteria speak.

Deliberately compressed: one core probe per behavior, because the
authoritative versions are AC-011 to AC-024 and this file must never
become a second acceptance suite. Anything proven here is proven again,
by the tester's sentences, the moment Platform mounts the router.

**Three probes moved on 2026-09-20 with the criteria above them** -- the
rename, the member add and the owner leave -- under Hassan's ruling on issue
#228, https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771. The
records are accepted #209 R8A for the first two and governing #209 R6 for the
third; AC-011, AC-012, AC-015, AC-019, AC-024 and AC-202 carry the full
argument and this file follows them rather than restating it.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import { folder as folderSchema } from '../../shared/folders.js'
import type { AuthTestApp, EmailRecorder } from '../../../tests/support/auth-harness.js'
import {
  Cast,
  addMember,
  addMemberOk,
  connect,
  createFolder,
  defaultFolderOf,
  expectStatus,
  folderInList,
  listFolders,
  membershipUserIds,
  removeMember,
  seedMembership,
  seedMyDayEntry,
  seedTask,
  taskAssignee,
} from '../../../tests/support/folders-harness.js'
import type { Actor } from '../../../tests/support/folders-harness.js'
import { createTestDb, rows } from '../../../tests/support/helpers.js'
import { startOidcStub } from '../../../tests/support/oidc-stub.js'
import { TestBrowser } from '../../../tests/support/http-client.js'
import { createAuthRouter } from '../auth/index.js'
import type { AuthConfig } from '../auth/index.js'
import { attachNotifier, createNotifier } from '../notify/index.js'
import type { OutboundMessage } from '../notify/index.js'
import { createFoldersRouter } from './folders.js'

let app: AuthTestApp
let server: Server
const delivered: OutboundMessage[] = []
const cast = new Cast(['owner', 'member', 'stranger', 'target', 'viewer'])

const recorder: EmailRecorder = {
  sent: () => delivered.map((m) => ({ template: m.template, to: m.to, raw: m })),
  shareGrants: () =>
    delivered
      .filter((m) => m.template === 'share_grant')
      .map((m) => ({ template: m.template, to: m.to, raw: m })),
  clear: () => {
    delivered.length = 0
  },
}

beforeAll(async () => {
  const dbClient: DbClient = await createTestDb()
  const stub = await startOidcStub()

  server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${String(port)}`
  const auth: AuthConfig = {
    issuerUrl: stub.issuerUrl,
    clientId: stub.clientId,
    clientSecret: stub.clientSecret,
    appOrigin: origin,
    allowInsecureRequests: true,
  }

  const application = express()
  application.use(express.json())
  attachNotifier(
    application,
    createNotifier({
      sink: {
        send(message: OutboundMessage): void {
          delivered.push(message)
        },
      },
      logger: { info: () => undefined },
    }),
  )
  application.use('/api/v1', createAuthRouter({ dbClient, auth }))
  application.use('/api/v1', createFoldersRouter({ dbClient }))
  server.on('request', application)

  app = {
    origin,
    dbClient,
    db: dbClient.db,
    stub,
    emails: recorder,
    browser: () => new TestBrowser(origin),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      await stub.close()
      await dbClient.close()
    },
  }
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Stage {
  owner: Actor
  member: Actor
  stranger: Actor
  target: Actor
  /** Admitted at Can view wherever a refusal below Can edit is the probe. */
  viewer: Actor
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, member, stranger, target, viewer] = await cast.of(app)
    if (
      owner === undefined ||
      member === undefined ||
      stranger === undefined ||
      target === undefined ||
      viewer === undefined
    ) {
      throw new Error('cast must produce five actors')
    }
    await connect(app.db, owner.id, member.id)
    await connect(app.db, owner.id, target.id)
    await connect(app.db, member.id, target.id)
    await connect(app.db, owner.id, viewer.id)
    staged = { owner, member, stranger, target, viewer }
  }
  return staged
}

describe('the folders router, driven through the harness idiom', () => {
  test('POST /folders answers 201 with a valid shared Folder object, listed in order', async () => {
    const { owner } = await stage()
    const response = await owner.browser.json('/folders', 'POST', {
      name: 'proof bbb',
    })
    expectStatus(response, 201, 'POST /folders answers 201 (spec 7.4)')
    const parsed = folderSchema.safeParse(response.json())
    expect(
      parsed.success,
      'the 201 body is the shared Folder schema, the contract as code (7.0)',
    ).toBe(true)

    await createFolder(owner, 'proof aaa')
    const list = await listFolders(owner)
    const names = list.map((entry) => entry.name)
    expect(
      names[0],
      'the default folder sorts first (spec 7.4; RFC 0005 names it Desk)',
    ).toBe('Desk')
    expect(
      names.slice(1, 3),
      'custom folders follow in lower(name) order (spec 7.4)',
    ).toEqual(['proof aaa', 'proof bbb'])
  })

  test('rename: Can edit 200, Can view 403, stranger 404, anonymous 401', async () => {
    /* The probe read "owner 200, member 403" until 2026-09-20. The rule it
       followed was the DES-225 split, which accepted #209 R8A replaces: a
       folder's identity is ordinary shared Folder work, so Can edit and above
       change it and Can contribute and below do not. AC-011 and AC-012 carry
       the argument and the ruling. */
    const { owner, member, stranger, viewer } = await stage()
    const folderId = await createFolder(owner, 'proof rename')
    await addMemberOk(owner, folderId, member.id, 'can_edit')
    await addMemberOk(owner, folderId, viewer.id, 'can_view')

    const byViewer = await viewer.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'usurped',
    })
    expectStatus(
      byViewer,
      403,
      'accepted R8A: Can view is read only (spec 7.4)',
    )

    const byStranger = await stranger.browser.json(
      `/folders/${folderId}`,
      'PATCH',
      { name: 'probed' },
    )
    expectStatus(byStranger, 404, 'inaccessible reads as nonexistent (10.2)')

    const anonymous = await app
      .browser()
      .json(`/folders/${folderId}`, 'PATCH', { name: 'nobody' }, { csrf: 'omit' })
    expectStatus(anonymous, 401, 'no session answers 401 (spec 7.0)')

    const byMember = await member.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'proof renamed by Can edit',
    })
    expectStatus(
      byMember,
      200,
      'accepted R8A: Can edit plans and changes all shared Folder work (spec 7.4)',
    )
    expect((await folderInList(viewer, folderId))?.name).toBe(
      'proof renamed by Can edit',
    )

    const byOwner = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'proof renamed',
    })
    expectStatus(byOwner, 200, 'and the owner renames too (spec 7.4)')
    expect((await folderInList(member, folderId))?.name).toBe('proof renamed')
  })

  test('delete: counts in the response, everything gone, default folder refused', async () => {
    const { owner } = await stage()
    const folderId = await createFolder(owner, 'proof doomed')
    await seedTask(app.db, { folderId, createdBy: owner.id, assigneeId: owner.id })
    await seedTask(app.db, { folderId, createdBy: owner.id, status: 'completed' })
    await seedTask(app.db, { folderId, createdBy: owner.id, status: 'abandoned' })

    const entry = await folderInList(owner, folderId)
    expect(
      entry?.counts,
      '8.11 counts: abandoned on neither side',
    ).toEqual({ pending: 1, completed: 1 })

    const response = await owner.browser.api(`/folders/${folderId}`, {
      method: 'DELETE',
    })
    expectStatus(response, 200, 'the owner delete answers 200 (spec 7.4)')
    expect((response.json() as { deleted?: unknown }).deleted).toEqual({
      tasks_open: 1,
      tasks_completed: 1,
      tasks_abandoned: 1,
    })
    const probe = await owner.browser.api(`/folders/${folderId}`)
    expectStatus(probe, 404, 'a deleted folder reads as nonexistent (7.0)')

    const defaultId = await defaultFolderOf(app.db, owner.id)
    const refused = await owner.browser.api(`/folders/${defaultId}`, {
      method: 'DELETE',
    })
    expectStatus(refused, 409, 'the default folder never deletes (INV-2)')
  })

  test('my-membership: subsets write the own row alone, strangers read 404', async () => {
    const { owner, member, stranger } = await stage()
    const folderId = await createFolder(owner, 'proof labels')
    await addMemberOk(owner, folderId, member.id)

    const set = await member.browser.json(
      `/folders/${folderId}/my-membership`,
      'PATCH',
      { shelf: 'Deep work', color: '#AB12CD' },
    )
    expectStatus(set, 200, 'any member sets their own row (spec 7.4)')

    const shelfOnly = await member.browser.json(
      `/folders/${folderId}/my-membership`,
      'PATCH',
      { shelf: null },
    )
    expectStatus(shelfOnly, 200, 'a subset patch is legal (shared schema)')
    const mine = await folderInList(member, folderId)
    expect(mine?.my_shelf, 'null cleared the shelf membership').toBeNull()
    expect(mine?.my_color, 'the absent color stayed').toBe('#AB12CD')
    expect(
      (await folderInList(owner, folderId))?.my_shelf,
      'the other member row never moves (4.4)',
    ).toBeNull()

    const probe = await stranger.browser.json(
      `/folders/${folderId}/my-membership`,
      'PATCH',
      { shelf: 'Intruding' },
    )
    expectStatus(probe, 404, 'no membership row to write reads as 404 (10.2)')
  })

  test('member add: guards, the winning email, and the raced double add', async () => {
    /* The second racer held Can edit until 2026-09-20 and the pair read
       201/403 the moment `member.add` became Full control's -- which proves
       the gate and says **nothing at all** about INV-10, the assertion this
       probe exists for. Both racers now hold Full control, which is the only
       standing from which the race is reachable, and the refusal below Full
       control is probed separately on a folder of its own. Accepted #209 R8A:
       "Full control -- administer members"; "Can edit ... cannot administer
       people/Access". AC-024 carries the argument and the ruling. */
    const { owner, member, stranger, target } = await stage()
    const folderId = await createFolder(owner, 'proof adds')
    await addMemberOk(owner, folderId, member.id, 'full_control')
    recorder.clear()

    const unconnected = await addMember(owner, folderId, stranger.id)
    expectStatus(unconnected, 422, 'no roster edge answers 422 (spec 5.3)')
    expect(recorder.shareGrants().length, 'a refusal sends nothing').toBe(0)

    const defaultId = await defaultFolderOf(app.db, owner.id)
    const ontoDefault = await addMember(owner, defaultId, member.id)
    expectStatus(ontoDefault, 409, 'the default folder never shares (INV-3)')

    const [first, second] = await Promise.all([
      addMember(owner, folderId, target.id),
      addMember(member, folderId, target.id),
    ])
    expect(
      [first.status, second.status].sort((a, b) => a - b),
      'the raced double add splits 201 and 409 (INV-10)',
    ).toEqual([201, 409])
    const grants = recorder.shareGrants()
    expect(
      grants.filter((email) => email.to === target.email).length,
      'exactly one share-grant email followed the winner (spec 5.3, 11.8)',
    ).toBe(1)

    const repeat = await addMember(owner, folderId, target.id)
    expectStatus(repeat, 409, 'the sequential repeat answers 409 (5.3)')
    expect(repeat.body.toLowerCase()).toContain('already a member')

    const detail = await owner.browser.api(`/folders/${folderId}`)
    const body = detail.json() as { members?: { is_owner?: unknown }[] }
    expect(body.members?.length, '7.4 members composition').toBe(3)
    expect(
      body.members?.filter((element) => element.is_owner === true).length,
      'exactly one element carries is_owner (8.9)',
    ).toBe(1)

    /* And below Full control the act is refused outright, on a folder of its
       own so the counts above stay this probe's. The actor holds a roster
       edge with the target -- `stage` makes it -- and a missing one answers
       422, so a 403 here is the Access gate and nothing else. */
    const gatedId = await createFolder(owner, 'proof adds gated')
    await addMemberOk(owner, gatedId, member.id, 'can_edit')
    recorder.clear()
    const byEditor = await addMember(member, gatedId, target.id)
    expectStatus(
      byEditor,
      403,
      'accepted R8A: Can edit cannot administer people (spec 5.4)',
    )
    expect(
      await membershipUserIds(app.db, gatedId),
      'the refused add created no membership (5.3)',
    ).not.toContain(target.id)
    expect(recorder.shareGrants().length, 'and a refusal sends nothing').toBe(0)
  })

  test('removal and leave run R-CLEAN; the drop-to-one sweep assigns everything', async () => {
    const { owner, member, target } = await stage()
    const folderId = await createFolder(owner, 'proof rclean')
    await addMemberOk(owner, folderId, member.id)
    await addMemberOk(owner, folderId, target.id)
    const assigned = await seedTask(app.db, {
      folderId,
      createdBy: owner.id,
      assigneeId: member.id,
      status: 'completed',
    })
    const unassigned = await seedTask(app.db, { folderId, createdBy: owner.id })
    await seedMyDayEntry(app.db, assigned, member.id)
    await seedMyDayEntry(app.db, assigned, owner.id)

    const removal = await removeMember(owner, folderId, member.id)
    expectStatus(removal, 204, 'the owner removes a member (spec 5.4, 7.4)')
    expect(
      await taskAssignee(app.db, assigned),
      'the completed assignment unassigned too, no status carve-out (5.3)',
    ).toBeNull()
    expect(
      Number(
        (
          await rows(
            app.db,
            sql`SELECT count(*)::int AS n FROM my_day_entries
                WHERE task_id = ${assigned}`,
          )
        )[0]?.n,
      ),
      'only the leaver My Day entry went (5.3)',
    ).toBe(1)

    const leave = await removeMember(target, folderId, target.id)
    expectStatus(leave, 204, 'leaving is the self shape (spec 5.3)')
    expect(
      await taskAssignee(app.db, unassigned),
      'dropping to one member swept every unassigned task (INV-5)',
    ).toBe(owner.id)
    const again = await removeMember(target, folderId, target.id)
    expectStatus(again, 404, 'the departed member reads 404 (10.2)')
  })

  test('owner leave: sole member 409 with copy, and no succession without a transfer', async () => {
    /* The probe read "transfer to the earliest joiner" until 2026-09-20.
       Governing #209 R6 section 2 replaces that with an explicit transfer to
       an active member who currently holds Full control: joining first is not
       evidence that anybody intended you to hold custody, and the old rule
       handed it out on that evidence every time an owner walked away. AC-019
       and AC-202 carry the argument and the ruling. */
    const { owner, member } = await stage()
    const soloId = await createFolder(owner, 'proof solo')
    const solo = await removeMember(owner, soloId, owner.id)
    expectStatus(solo, 409, 'the sole-member owner cannot leave (spec 5.3)')
    expect(solo.body.toLowerCase()).toContain('delete the folder instead')

    const transferringId = await createFolder(owner, 'proof transfer')
    await seedMembership(app.db, transferringId, member.id, {
      createdAt: '2026-08-01T10:00:00.000Z',
      access: 'full_control',
    })
    const refused = await removeMember(owner, transferringId, owner.id)
    expectStatus(
      refused,
      409,
      'governing R6: an owner transfers ownership before leaving, and being the earliest joiner is not a transfer (5.3)',
    )
    expect(refused.body.toLowerCase()).toContain('transfer ownership')
    const stillOwned = await rows(
      app.db,
      sql`SELECT owner_id FROM folders WHERE id = ${transferringId}`,
    )
    expect(
      String(stillOwned[0]?.owner_id),
      'the refusal promoted nobody (governing R6)',
    ).toBe(owner.id)
    expect(
      (await membershipUserIds(app.db, transferringId)).slice().sort(),
      'and cost the owner nothing: the refused leave left every membership standing (5.3)',
    ).toEqual([member.id, owner.id].sort())

    /* The transfer itself is `POST /folders/:id/transfer-ownership`, which
       lives in `workshop.ts` and is not one of the two routers this file
       mounts; AC-521 drives it end to end against the whole application. What
       is this router's, and what is asserted here, is the half after it: once
       custody has moved to a member who holds Full control, the previous
       owner leaves like anybody else (AC-202's second clause). */
    await app.db.execute(
      sql`UPDATE folders SET owner_id = ${member.id} WHERE id = ${transferringId}`,
    )
    const leave = await removeMember(owner, transferringId, owner.id)
    expectStatus(
      leave,
      204,
      'the previous owner leaves once custody has moved (spec 5.3; AC-202)',
    )
    expect(
      await membershipUserIds(app.db, transferringId),
      'the departed owner membership is gone (5.3)',
    ).toEqual([member.id])
  })
})
