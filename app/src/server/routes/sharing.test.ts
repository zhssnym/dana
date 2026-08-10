/*
In-session proof of the 7.5 and 7.3 surfaces, the P1 idiom the folders and
tasks routers each used before them: the boot file mounts routers by
Platform's hand only, so the acceptance criteria stay red until that wiring
touch, and this file is how these two routers prove themselves before it. A
bare express application assembles the same pieces the requested wiring names
(auth router ahead, the two P5 routers behind it, the notify module attached
with a capturing sink), and the acceptance harness's own stub, HTTP client and
helpers drive it unchanged.

Both routers share one application here, rather than taking a file each,
because the surfaces interlock: 8.7's conversion arm reads the roster 7.3
exposes, and 7.3's removal is what makes a later invite park instead of
converting. Two applications would mean seeding one surface's rows behind the
other's back, which is the opposite of what an in-session proof is for.

Deliberately compressed: one core probe per behavior, because the
authoritative versions are AC-059 to AC-069, AC-133 to AC-141 and AC-124's
acceptance arm, and this file must never become a second acceptance suite.
Where a response has a shared schema, the probe parses the body with it, which
is the one thing the acceptance suite deliberately does not do: it measures
src/shared rather than importing it, so nothing else checks that the routes
and the contract-as-code agree.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import { getConnectionsResponse } from '../../shared/connections.js'
import {
  acceptInviteResponse,
  getInvitesPendingResponse,
  postInvitesResponse,
} from '../../shared/invites.js'
import type { AuthTestApp, EmailRecorder } from '../../../tests/auth-harness.js'
import {
  Cast,
  connect,
  createFolder,
  expectStatus,
  membershipUserIds,
} from '../../../tests/folders-harness.js'
import type { Actor } from '../../../tests/folders-harness.js'
import { createTestDb } from '../../../tests/helpers.js'
import { startOidcStub } from '../../../tests/oidc-stub.js'
import { TestBrowser } from '../../../tests/http-client.js'
import {
  backdateLastSent,
  freshEmail,
  signInActorWithEmail,
} from '../../../tests/sharing-harness.js'
import { createAuthRouter } from '../auth/index.js'
import type { AuthConfig } from '../auth/index.js'
import { attachNotifier, createNotifier } from '../notify/index.js'
import type { OutboundMessage } from '../notify/index.js'
import { createConnectionsRouter } from './connections.js'
import { createFoldersRouter } from './folders.js'
import { createInvitesRouter } from './invites.js'

let app: AuthTestApp
let server: Server
const delivered: OutboundMessage[] = []
const cast = new Cast(['inviter', 'connected'], 'p5r')

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
  // The merged P2 router rides along because the fixtures here are folders,
  // which the harness creates through 7.4's own endpoint rather than by
  // insert; it is mounted in the real application already, so nothing about
  // this arrangement is more than the tree Platform will meet.
  application.use('/api/v1', createFoldersRouter({ dbClient }))
  application.use('/api/v1', createInvitesRouter({ dbClient }))
  application.use('/api/v1', createConnectionsRouter({ dbClient }))
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
  inviter: Actor
  connected: Actor
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [inviter, connected] = await cast.of(app)
    if (inviter === undefined || connected === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, inviter.id, connected.id)
    staged = { inviter, connected }
  }
  return staged
}

describe('the P5 routers, driven through the harness idiom', () => {
  test('POST /invites parks an unconnected address and sends one invite email', async () => {
    const { inviter } = await stage()
    const folderId = await createFolder(inviter, 'p5r parked')
    const email = freshEmail('p5r-parked')
    app.emails.clear()

    const response = await inviter.browser.json('/invites', 'POST', {
      email,
      folder_id: folderId,
    })
    expectStatus(response, 201, 'the parked path answers 201 (spec 7.5)')
    const parsed = postInvitesResponse.safeParse(response.json())
    expect(
      parsed.success,
      'the 201 body satisfies the shared 7.5 schema, contract and route agreeing',
    ).toBe(true)
    expect(
      delivered.filter((m) => m.template === 'invite' && m.to === email).length,
      '5.2\'s create row sends exactly one email, through the 11.8 module',
    ).toBe(1)
  })

  test('a connected address converts with a folder and is refused without one', async () => {
    const { inviter, connected } = await stage()
    const folderId = await createFolder(inviter, 'p5r converted')
    app.emails.clear()

    const converted = await inviter.browser.json('/invites', 'POST', {
      email: connected.email,
      folder_id: folderId,
    })
    expectStatus(converted, 200, 'the conversion answers 200 (spec 7.5, 8.7)')
    expect(
      (converted.json() as { converted_to_share?: unknown }).converted_to_share,
      'and says so',
    ).toBe(true)
    expect(
      await membershipUserIds(app.db, folderId),
      'the membership is immediate (spec 8.7)',
    ).toContain(connected.id)
    expect(
      app.emails.shareGrants().filter((m) => m.to === connected.email).length,
      'with the share-grant template, never the invite one',
    ).toBe(1)

    const bare = await inviter.browser.json('/invites', 'POST', {
      email: connected.email,
    })
    expectStatus(
      bare,
      409,
      'and the same address with no folder is refused, the owner\'s ruling of 2026-08-09 (spec 7.5, 8.7)',
    )
  })

  test('acceptance answers frozen 7.5\'s three keys and grants the folder', async () => {
    const { inviter } = await stage()
    const folderId = await createFolder(inviter, 'p5r accepted')
    const email = freshEmail('p5r-recipient')
    const created = await inviter.browser.json('/invites', 'POST', {
      email,
      folder_id: folderId,
    })
    expectStatus(created, 201, 'the invite parks for an account that does not exist yet')
    const inviteId = String(
      (created.json() as { invite: { id: string } }).invite.id,
    )

    const recipient = await signInActorWithEmail(app, 'p5r-recipient', email, 'p5r')
    cast.trackUser(recipient.id)

    const pending = await recipient.browser.api('/invites/pending')
    expectStatus(pending, 200, 'Q12 lists it at login (spec 7.5)')
    expect(
      getInvitesPendingResponse.safeParse(pending.json()).success,
      'the pending list satisfies the shared 7.5 schema',
    ).toBe(true)

    const accepted = await recipient.browser.json(
      `/invites/${inviteId}/accept`,
      'POST',
      {},
    )
    expectStatus(accepted, 200, 'the matched recipient accepts (spec 7.5, 5.2)')
    expect(
      acceptInviteResponse.safeParse(accepted.json()).success,
      'the acceptance body satisfies the shared 7.5 schema, its folder floor included',
    ).toBe(true)
    expect(
      await membershipUserIds(app.db, folderId),
      'and the membership is granted (spec 8.7)',
    ).toContain(recipient.id)

    const sent = await inviter.browser.api('/invites/sent')
    expectStatus(sent, 200, 'the inviter\'s list answers (spec 7.5)')
    const entry = (sent.json() as { id: string; status: string }[]).find(
      (row) => row.id === inviteId,
    )
    expect(
      entry?.status,
      'carrying every status, so the inviter sees what happened',
    ).toBe('accepted')
  })

  test('resend is throttled inside the day and sends beyond it', async () => {
    const { inviter } = await stage()
    const email = freshEmail('p5r-resend')
    const created = await inviter.browser.json('/invites', 'POST', { email })
    expectStatus(created, 201, 'a bare invite to an unconnected address parks')
    const inviteId = String(
      (created.json() as { invite: { id: string } }).invite.id,
    )
    app.emails.clear()

    const throttled = await inviter.browser.json(
      `/invites/${inviteId}/resend`,
      'POST',
      {},
    )
    expectStatus(throttled, 429, '5.2\'s resend guard, this package\'s one 429')
    expect(
      throttled.headers['retry-after'],
      'carrying Retry-After, as 7.0 gives every 429',
    ).toBeDefined()
    expect(delivered.length, 'and sending nothing').toBe(0)

    await backdateLastSent(app.db, inviteId, 25)
    const resent = await inviter.browser.json(
      `/invites/${inviteId}/resend`,
      'POST',
      {},
    )
    expectStatus(resent, 200, 'beyond the window it goes through (spec 5.2)')
    expect(
      delivered.filter((m) => m.template === 'invite' && m.to === email).length,
      'sending one more',
    ).toBe(1)
  })

  test('the roster reads frozen 7.3 and either side may remove the pair', async () => {
    const { inviter, connected } = await stage()
    const roster = await inviter.browser.api('/connections')
    expectStatus(roster, 200, 'GET /connections answers the roster (spec 7.3)')
    expect(
      getConnectionsResponse.safeParse(roster.json()).success,
      'the list satisfies the shared 7.3 schema, email included',
    ).toBe(true)

    // The non-initiating side calls: the canonical pair of 4.2 is what makes
    // the removal symmetrical, and this is the direction a predicate written
    // on user_a_id alone gets wrong.
    const removed = await connected.browser.api(`/connections/${inviter.id}`, {
      method: 'DELETE',
    })
    expectStatus(removed, 204, 'either side may remove (spec 7.3)')
    const again = await connected.browser.api(`/connections/${inviter.id}`, {
      method: 'DELETE',
    })
    expectStatus(again, 404, 'and a pair that is not there answers 404 (spec 7.3)')
  })
})
