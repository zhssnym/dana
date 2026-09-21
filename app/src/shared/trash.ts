/*
The 7.13 Trash contract as the client reads it (RFC 0005, 9.11).

**A boundary note.** S3 built the 7.13 routes and typed the view in
`src/server/domain/trash.ts`, where the client cannot reach it: `src/shared`
is the contract both sides import, and `api/http.ts` parses every response
through a zod schema. So the shapes were restated here, which is the same
split every v1 surface already runs on; the alternative, importing a server
domain type into the client, is the one thing the directory boundary exists
to prevent.

**Restating them left them unlinked, and #39 closed that.** From 2026-08-24
this file and `server/domain/trash.ts` carried the same six-and-five fields
with nothing between them, so a field added to one alone would have compiled
on both sides and arrived as a 200 the client could not parse. The server no
longer declares the shape at all: `trashView` is annotated
`Promise<GetTrashResponse>` and writes against these schemas directly, which
is the only direction the boundary allows and the one that makes the
duplication unnecessary rather than merely watched. **So these are now the
server's types as well as the client's**, and a change here is a change to
what the handler must produce.

Recorded with the two additions in `shelves.ts` and `bundle.ts` as one change
control item in RFC 0005: the three v2 backend packages published write
bodies and interfaces and no read schemas, which is a real gap in the
contract rather than a client convenience, because a response nothing
validates is a response whose shape drifts silently.

Trash holds separate kinds and never one list. 9.11 lists "every deleted task
and folder the viewer can still reach", and they carry different facts (a task
names the folder it lived in, a folder names how many tasks it holds), so they
are separate arrays and the page interleaves them by their deletion time.
**It said "two kinds" until 2026-09-21, and issue #210 made it three**: a
custom Folder facet is the third, and its own block below says what it carries
and why.
*/
import { z } from 'zod'

import { FACET_KINDS } from './facets.js'
import { folderAccessPreset } from './folder-access.js'

/*
**`my_access` joined both rows on 2026-09-20 (issue #268), and `is_owner` is
kept beside it.** 7.13's permanent delete is not one rule: `task.destroy` is
Full control with ownership **ignored**, and `folder.destroy` is Full control
**and** the owner together, which is #228's Full-control list read against
governing R5. So one fact cannot answer both, and `is_owner` alone — which is
all these rows carried — answered neither: a Full-control member who owns
nothing was offered no permanent delete on a trashed task the server would
have destroyed for them, and an owner whose Access had been lowered was
offered both and refused 403 by each.

It is the **viewer's own** preset for the folder the row belongs to, taken
from the `folder_members` join that already scopes both queries in
`server/domain/trash.ts`, exactly as `my_access` on the 7.4 Folder object is
(Hassan's Ruling 4 of 2026-09-20). Never nullable: a Trash row only exists for
somebody in the folder, which is what that join means, and migration 0023 put
a preset on every membership row there is.

A trashed folder's row is **not** in `GET /folders`, which is why this could
not be read from the library the client already holds and had to join the
wire here.
*/
export const trashedTask = z.object({
  id: z.uuid(),
  title: z.string(),
  folder_id: z.uuid(),
  /** Where it lived, which 9.11 requires every row to name. */
  folder_name: z.string(),
  deleted_at: z.string(),
  /** Whether the viewer owns the folder it lived in, which is the one fact
   * 7.13's permanent delete turns on (RFC 0005 change control items 38 and
   * 53(b)); the same word the 7.0 Folder object already carries. Added
   * additively at S28b so the Trash page draws the control only where the
   * server would answer 204.
   *
   * **It is no longer that one fact**, and the sentence above is left where
   * it stands because it is the one the block at the top of this file
   * answers: `task.destroy` ignores ownership outright, so this field is
   * custody and nothing more. */
  is_owner: z.boolean(),
  /** The viewer's own Access preset for the folder this task lived in. */
  my_access: folderAccessPreset,
})
export type TrashedTask = z.infer<typeof trashedTask>

export const trashedFolder = z.object({
  id: z.uuid(),
  name: z.string(),
  /** What comes back with it, so a restore is not a surprise. */
  task_count: z.number().int().nonnegative(),
  deleted_at: z.string(),
  /** As on a task: the viewer owns this folder. Unlike a task's, this one is
   * still load-bearing — `folder.destroy` requires the owner *and* Full
   * control, so it is one of the two facts the gate reads rather than an
   * answer on its own. */
  is_owner: z.boolean(),
  /** As on a task: the viewer's own Access preset for this folder. */
  my_access: folderAccessPreset,
})
export type TrashedFolder = z.infer<typeof trashedFolder>

/*
**The third kind, added 2026-09-21 by issue #210** on Hassan's technical
ruling, https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756,
section 3. A custom Folder facet -- a Work facet, a shared blank or a private
blank -- goes to Trash like anything else, and it carries `is_owner` and
`my_access` exactly as the two rows above do and for the same reason: the
permanent delete is not one rule across the three kinds, so one fact cannot
answer for all of them.

**A facet's permanent delete is the Task's rule and not the Folder's**: Full
control with ownership **ignored** (7.13's 2026-09-20 correction). `is_owner`
is here anyway, because it is the Folder's custody and a Trash page draws all
three kinds from one response.

**A native facet is never here.** It is hidden and restored rather than
deleted, which `folder_facets_hidden_kind_check` and the 409 on
`DELETE /folders/:id/facets/:facetId` both say; `kind` carries all seven names
because the *column* does, and a row with a native kind in it would be a
defect this schema should not quietly accept the shape of.

`name` is resolved exactly as `GET /folders/:id/facets` resolves it, so a
Trash row says what the tab said -- including a Work facet's, which is its H1
block's text read at this moment and not a copy taken when it was trashed.
*/
export const trashedFacet = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(FACET_KINDS),
  folder_id: z.uuid(),
  /** Where it lived, as a trashed task names its folder. */
  folder_name: z.string(),
  deleted_at: z.string(),
  /** Whether the viewer owns the Folder this facet belongs to. */
  is_owner: z.boolean(),
  /** The viewer's own Access preset for that Folder. */
  my_access: folderAccessPreset,
})
export type TrashedFacet = z.infer<typeof trashedFacet>

export const getTrashResponse = z.object({
  tasks: z.array(trashedTask),
  folders: z.array(trashedFolder),
  facets: z.array(trashedFacet),
})
export type GetTrashResponse = z.infer<typeof getTrashResponse>
