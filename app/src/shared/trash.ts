/*
The 7.13 Trash contract (9.11), and the server's types as well as the
client's: `src/shared` is the contract both sides import, `api/http.ts` parses
every response through a zod schema, and `server/domain/trash.ts` annotates
`trashView` as `Promise<GetTrashResponse>` and writes against these schemas
directly. A change here is a change to what the handler must produce. The
server must not declare the shape itself: two unlinked copies let a field
added to one compile on both sides and arrive as a 200 the client cannot
parse.

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
  /** Whether the viewer owns the folder it lived in; the same word the 7.0
   * Folder object already carries. It is custody and nothing more:
   * `task.destroy` ignores ownership outright, so it does not by itself
   * decide the permanent delete. */
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
**The third kind (issue #210).** A custom Folder facet -- a Work facet, a shared blank or a private
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

/*
**The fourth kind (issue #320): a Discussion of a Folder's Consultation.**
It carries `is_owner` and `my_access` for the same reason the three above do.
Its permanent delete is `discussion.purge`, Full control with ownership
ignored -- the Task rule, as a facet's is -- because the Folder survives it.
`title` is the Discussion's own. Restore is `discussion.restore` (Can edit),
or the creator's own-unshared path while nobody else has contributed.

`.default([])` so that a server without this kind still parses: the array is
additive and a client must never refuse a Trash page over it.
*/
export const trashedDiscussion = z.object({
  id: z.uuid(),
  title: z.string(),
  folder_id: z.uuid(),
  /** Where it lived, as a trashed task names its folder. */
  folder_name: z.string(),
  deleted_at: z.string(),
  /** The Discussion's creator; the own-unshared restore is theirs. */
  created_by: z.uuid(),
  /** Whether the viewer owns the Folder this Discussion belongs to. */
  is_owner: z.boolean(),
  /** The viewer's own Access preset for that Folder. */
  my_access: folderAccessPreset,
  /** Whether the viewer may restore it (`discussion.restore`, or its creator
      while unshared). Absent from an older server: treat as restorable. */
  restorable: z.boolean().optional(),
})
export type TrashedDiscussion = z.infer<typeof trashedDiscussion>

export const getTrashResponse = z.object({
  tasks: z.array(trashedTask),
  folders: z.array(trashedFolder),
  facets: z.array(trashedFacet),
  discussions: z.array(trashedDiscussion).default([]),
})
export type GetTrashResponse = z.infer<typeof getTrashResponse>
