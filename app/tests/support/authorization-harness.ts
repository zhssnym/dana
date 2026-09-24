/*
Fixtures for AC-397, the authorization sweep.

The sweep drives every id-bearing route on the mounted application as a
person with no relationship to the thing the id names, so it needs one real
instance of every kind of thing this API addresses by id. That is what this
file builds: a folder, a task, a step, a shelf, a saved view, a comment, a
file, a place cover, an invite, a notification, and a page in each of its two
homes, plus the trashed task and trashed folder the 7.13 surface addresses
and the roster connection 7.3 does.

**Every resource is created as user A through the API wherever the API can
create it**, the folders-harness rule, and for the same reason: a fixture
built by INSERT can be built into a state no endpoint would produce, and the
sweep would then be measuring a row rather than the product. The two
exceptions are named where they are made -- the roster connection, which is
`connect` from the folders harness because 7.5's invite flow is a slower way
to reach the same row, and the upstream photo stub, which is not a resource
of ours at all.

**The cast is three people and the third one is the point.** `owner` makes
everything; `member` is in `owner`'s folder, which is what lets the sweep
tell 5.4's member column from its owner column; `stranger` has no
relationship to anything here and is who most of the table is driven as.

The upstream photo stub exists because `GET /covers/photos/:id/thumb` and `POST /folders/:id/cover/photo`
both call Openverse before they reach anything of ours, and a sweep that let
them reach the real network would be measuring the internet's availability.
Nothing here touches it.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { expect } from 'vitest'

import type { AuthTestApp } from './auth-harness.js'
import {
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { ONE_PIXEL_PNG, uploadImageOk } from './uploads-harness.js'

/* ------------------------------------------------------------------ *
 * The object store the sweep hands the application
 * ------------------------------------------------------------------ */

export interface MemoryFileStore {
  put(id: string, bytes: Buffer): Promise<void>
  get(id: string): Promise<Buffer | null>
  remove(id: string): Promise<void>
}

/** In memory rather than on disk: the sweep stores one picture and reads it
 * back through the route, and a local `.data` can reach a state where every
 * query throws (docs/troubleshooting.md). Shaped exactly as AppOptions.fileStore. */
export function memoryFileStore(): MemoryFileStore {
  const objects = new Map<string, Buffer>()
  return {
    put: (id: string, bytes: Buffer): Promise<void> => {
      objects.set(id, bytes)
      return Promise.resolve()
    },
    get: (id: string): Promise<Buffer | null> =>
      Promise.resolve(objects.get(id) ?? null),
    remove: (id: string): Promise<void> => {
      objects.delete(id)
      return Promise.resolve()
    },
  }
}

/* ------------------------------------------------------------------ *
 * The upstream photo stub (7.19)
 * ------------------------------------------------------------------ */

/** A uuid, because the route parses `:id` with `parsedId` before it fetches
 * anything, so a non-uuid would answer 404 for the shape rather than for the
 * authorization question the sweep is asking. */
export const STUB_PHOTO_ID = '7c1b6f52-4a3d-4f6e-9c21-8b0a5d3e2f41'

export interface UpstreamStub {
  base: string
  close(): Promise<void>
}

/**
 * Openverse, in so far as two routes of ours use it: the detail record, the
 * thumbnail, and the full image. Everything else is 404, which is what makes
 * an unknown photo id observably different from the known one.
 */
export async function startUpstreamStub(): Promise<UpstreamStub> {
  let base = ''
  const server: Server = createServer((req, res) => {
    if (req.url === `/v1/images/${STUB_PHOTO_ID}/thumb/`) {
      res.setHeader('Content-Type', 'image/png')
      res.end(ONE_PIXEL_PNG)
      return
    }
    if (req.url === `/v1/images/${STUB_PHOTO_ID}/`) {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          id: STUB_PHOTO_ID,
          title: 'A swept photograph',
          url: `${base}/full.png`,
        }),
      )
      return
    }
    if (req.url === '/full.png') {
      res.setHeader('Content-Type', 'image/png')
      res.end(ONE_PIXEL_PNG)
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  return {
    base,
    close: (): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

/* ------------------------------------------------------------------ *
 * One factory per resource kind
 * ------------------------------------------------------------------ */

function idOf(response: RawResponse, what: string): string {
  const body = response.json() as { id?: unknown }
  expect(typeof body.id, `${what} answers with its id (spec 7.0)`).toBe('string')
  return body.id as string
}

/**
 * A folder owned by A with M in it, which is the shape every membership
 * variant in the sweep needs: 5.4's member column only exists where somebody
 * is a member and is not the owner.
 */
export async function makeSharedFolder(
  app: AuthTestApp,
  owner: Actor,
  member: Actor,
  name: string,
): Promise<string> {
  await connect(app.db, owner.id, member.id)
  const folderId = await createFolder(owner, name)
  await addMemberOk(owner, folderId, member.id)
  return folderId
}

/** 7.6's create, as the folder's owner. */
export async function makeTask(
  owner: Actor,
  folderId: string,
  title: string,
): Promise<string> {
  const made = await owner.browser.json('/tasks', 'POST', {
    title,
    folder_id: folderId,
  })
  expectStatus(made, 201, `POST /tasks must create ${title} (spec 7.6)`)
  return idOf(made, 'the created task')
}

/**
 * One dependency edge: `dependent` comes to wait on `blocking` (issue #224).
 *
 * The 201 answers the edge itself, whose id is what names it for removal —
 * the endpoints are never handed back, because the same object is answered to
 * a viewer who may not be able to read the far end.
 */
export async function makeDependency(
  owner: Actor,
  dependentTaskId: string,
  blockingTaskId: string,
): Promise<string> {
  const made = await owner.browser.json(
    `/tasks/${dependentTaskId}/dependencies`,
    'POST',
    { blocking_task_id: blockingTaskId },
  )
  expectStatus(
    made,
    201,
    'POST /tasks/:id/dependencies must create the edge for a member of both ends',
  )
  return idOf(made, 'the created dependency')
}

/** 7.7's step. The 201 answers the affected task, so the step's own id comes
 * off that task's steps rather than off the envelope. */
export async function makeStep(
  owner: Actor,
  taskId: string,
  title: string,
): Promise<string> {
  const made = await owner.browser.json(`/tasks/${taskId}/steps`, 'POST', {
    title,
  })
  expectStatus(made, 201, 'POST /tasks/:id/steps must add the step (spec 7.7)')
  const body = made.json() as {
    steps?: Array<{ id?: unknown; title?: unknown }>
  }
  const step = (body.steps ?? []).find((row) => row.title === title)
  expect(
    typeof step?.id,
    'the affected task carries the step that was just added (spec 7.7)',
  ).toBe('string')
  return step?.id as string
}

/** 7.16's shelf: private to its owner by 4.18, so there is no member variant
 * for anything addressed by a shelf id. */
export async function makeShelf(owner: Actor, name: string): Promise<string> {
  const made = await owner.browser.json('/shelves', 'POST', { name })
  expectStatus(made, 201, 'POST /shelves must create the shelf (spec 7.16)')
  return idOf(made, 'the created shelf')
}

/**
 * A Personal Label (issue #226, parent #208): one account's private
 * classification vocabulary, which nobody else can read or write.
 */
export async function makePersonalLabel(
  owner: Actor,
  name: string,
): Promise<string> {
  const made = await owner.browser.json('/labels/personal', 'POST', {
    name,
    color: '#336699',
  })
  expectStatus(made, 201, 'POST /labels/personal must create the label (spec 7.26)')
  return idOf(made, 'the created personal label')
}

/** A Folder Label: shared vocabulary belonging to one Folder, which every
 * current member of that Folder may manage until #209 says otherwise. */
export async function makeFolderLabel(
  owner: Actor,
  folderId: string,
  name: string,
): Promise<string> {
  const made = await owner.browser.json(`/folders/${folderId}/labels`, 'POST', {
    name,
    color: '#993366',
  })
  expectStatus(
    made,
    201,
    'POST /folders/:folderId/labels must create the label (spec 7.26)',
  )
  return idOf(made, 'the created folder label')
}

/** A saved view, one person's own by construction (4.19). */
export async function makeSavedView(
  owner: Actor,
  name: string,
): Promise<string> {
  const made = await owner.browser.json('/views', 'POST', {
    name,
    definition: { status: 'pending' },
  })
  expectStatus(made, 201, 'POST /views must create the saved view (spec 7.17)')
  return idOf(made, 'the created saved view')
}

/** 7.14's comment on a folder thread, authored by the folder's owner, so the
 * member variant on the edit and the delete is a member who is neither. */
export async function makeComment(
  owner: Actor,
  folderId: string,
  body: string,
): Promise<string> {
  const made = await owner.browser.json(
    `/folders/${folderId}/comments`,
    'POST',
    { body },
  )
  expectStatus(
    made,
    201,
    'POST /folders/:id/comments must create the comment (spec 7.14)',
  )
  return idOf(made, 'the created comment')
}

/** 7.15's upload, through the uploads harness, so the multipart body is the
 * one every other file criterion sends. */
export function makeFile(
  owner: Actor,
  folderId: string,
  name: string,
): Promise<string> {
  return uploadImageOk(owner, folderId, name)
}

/**
 * 7.19's place cover, and the one factory whose return value is not an id:
 * `:place` names one of 4.20's eight pages rather than a row, and the row it
 * reaches is keyed by the viewer. It is here because the enumeration finds
 * those routes and every enumerated route owes the table an entry.
 */
export async function makePlaceCover(
  owner: Actor,
  place: string,
  fileId: string,
): Promise<void> {
  const put = await owner.browser.json(`/place-covers/${place}`, 'PUT', {
    file_id: fileId,
  })
  expectStatus(
    put,
    200,
    'PUT /place-covers/:place must set the cover (spec 7.19)',
  )
}

/** 7.5's invite, addressed to an account nobody in the cast holds, attached
 * to the shared folder so cancel and resend have their member arm. */
export async function makeInvite(
  owner: Actor,
  folderId: string,
  email: string,
): Promise<string> {
  const made = await owner.browser.json('/invites', 'POST', {
    email,
    folder_id: folderId,
    // Issue #228: a folder invite names the preset it will grant. `can_edit`
    // is the ordinary member standing; this fixture is about who may reach
    // the route, not about which preset arrives.
    access: 'can_edit',
  })
  expectStatus(made, 201, 'POST /invites must create the invite (spec 7.5)')
  const envelope = made.json() as { invite?: { id?: unknown } }
  expect(
    typeof envelope.invite?.id,
    'the 201 body is { invite } and the invite carries its id (spec 7.5)',
  ).toBe('string')
  return envelope.invite?.id as string
}

/**
 * 7.12's notification, which no endpoint creates directly: it is a side
 * effect of an assignment (8.11), so the member assigns a task to the owner
 * and the row lands in the owner's list. Returned as the owner's, because
 * that is who the sweep's stranger must fail to reach.
 */
export async function makeNotification(
  owner: Actor,
  member: Actor,
  folderId: string,
  title: string,
): Promise<string> {
  const made = await member.browser.json('/tasks', 'POST', {
    title,
    folder_id: folderId,
    assignee_id: owner.id,
  })
  expectStatus(
    made,
    201,
    'an assignment by another member must commit before it can notify (spec 7.6, 8.11)',
  )
  const listed = await owner.browser.api('/notifications')
  expectStatus(
    listed,
    200,
    'GET /notifications answers the viewer list (spec 7.12)',
  )
  const body = listed.json() as { notifications?: Array<{ id?: unknown }> }
  const first = (body.notifications ?? [])[0]
  expect(
    typeof first?.id,
    'the assignment must have left one notification for the assignee (spec 8.11)',
  ).toBe('string')
  return first?.id as string
}

/**
 * 4.17's page, in whichever of its two homes the caller names. The page is
 * addressed by its home's id rather than by one of its own, so this writes a
 * block and answers nothing: what the sweep drives is `/folders/:id/page` or
 * `/shelves/:id/page`.
 */
export async function writePage(
  owner: Actor,
  home: 'folders' | 'shelves',
  homeId: string,
  text: string,
): Promise<void> {
  const put = await owner.browser.json(`/${home}/${homeId}/page`, 'PUT', {
    blocks: [{ kind: 'paragraph', position: 0, text }],
  })
  expectStatus(put, 200, `PUT /${home}/:id/page must write the page (spec 7.16)`)
}

/**
 * A shared blank facet of a folder (7.27, issue #210).
 *
 * Shared rather than private, deliberately: a private facet is invisible to
 * every other member, so a fixture built as one would make the `member` rows
 * of `ac-397` answer 404 for the privacy rule rather than 403 for the preset,
 * and the sweep would be measuring the wrong refusal.
 */
export async function makeFacet(
  owner: Actor,
  folderId: string,
  name: string,
): Promise<string> {
  const made = await owner.browser.json(`/folders/${folderId}/facets`, 'POST', {
    kind: 'shared_blank',
    display_name: name,
  })
  expectStatus(
    made,
    201,
    'POST /folders/:id/facets must create a shared blank facet (spec 7.27)',
  )
  return String((made.json() as { id: string }).id)
}

/** A facet in the Trash, addressed afterwards by the restore and the
 * permanent-delete routes. */
export async function trashFacet(
  owner: Actor,
  folderId: string,
  facetId: string,
): Promise<void> {
  const deleted = await owner.browser.json(
    `/folders/${folderId}/facets/${facetId}`,
    'DELETE',
  )
  expectStatus(
    deleted,
    204,
    'DELETE /folders/:id/facets/:facetId must trash the facet (spec 7.27, 7.13)',
  )
}

/** A task in the Trash: 7.13's delete is the ordinary one, and the row is
 * then addressed by the permanent-delete route. */
export async function trashTask(owner: Actor, taskId: string): Promise<void> {
  const deleted = await owner.browser.json(`/tasks/${taskId}`, 'DELETE')
  expectStatus(
    deleted,
    204,
    'DELETE /tasks/:id must trash the task (spec 7.13)',
  )
}

/** A folder in the Trash, with its member still attached so the permanent
 * delete has the 403 arm 7.13 gives it. */
export async function trashFolder(
  owner: Actor,
  folderId: string,
): Promise<void> {
  const deleted = await owner.browser.json(`/folders/${folderId}`, 'DELETE')
  expectStatus(
    deleted,
    200,
    'DELETE /folders/:id must trash the folder (spec 7.4, 7.13)',
  )
}
