/*
The 7.13 Trash contract as the client reads it (RFC 0005, 9.11).

**A boundary note, because this file is new and this directory is not the
client arm's.** S3 built the 7.13 routes and typed the view in
`src/server/domain/trash.ts`, where the client cannot reach it: `src/shared`
is the contract both sides import, and `api/http.ts` parses every response
through a zod schema. So the shapes are restated here rather than exported
from the server tree, which is the same split every v1 surface already runs
on. The alternative, importing a server domain type into the client, is the
one thing the directory boundary exists to prevent.

Recorded with the two additions in `shelves.ts` and `bundle.ts` as one change
control item in RFC 0005: the three v2 backend packages published write
bodies and interfaces and no read schemas, which is a real gap in the
contract rather than a client convenience, because a response nothing
validates is a response whose shape drifts silently.

Trash holds two kinds and never one list. 9.11 lists "every deleted task and
folder the viewer can still reach", and the two carry different facts (a task
names the folder it lived in, a folder names how many tasks it holds), so
they are two arrays and the page interleaves them by their deletion time.
*/
import { z } from 'zod'

export const trashedTask = z.object({
  id: z.uuid(),
  title: z.string(),
  folder_id: z.uuid(),
  /** Where it lived, which 9.11 requires every row to name. */
  folder_name: z.string(),
  deleted_at: z.string(),
})
export type TrashedTask = z.infer<typeof trashedTask>

export const trashedFolder = z.object({
  id: z.uuid(),
  name: z.string(),
  /** What comes back with it, so a restore is not a surprise. */
  task_count: z.number().int().nonnegative(),
  deleted_at: z.string(),
})
export type TrashedFolder = z.infer<typeof trashedFolder>

export const getTrashResponse = z.object({
  tasks: z.array(trashedTask),
  folders: z.array(trashedFolder),
})
export type GetTrashResponse = z.infer<typeof getTrashResponse>
