/*
The 7.4 folder and membership surface as code: the request bodies the server
validates with, and the 7.0 Folder object both sides read.

The body-schema conventions are me.ts's: z.object so unknown fields are
stripped, never refused (7.0 tolerates them), a camelCase schema named for
method and route, its inferred PascalCase type beside it, and per-field
messages phrased without the field name, because sendValidationError prefixes
the path when it builds the 422 (10.3).

The response side, including the shapes 7.4 leaves open, is settled further
down with its grounds.
*/
import { z } from 'zod'

import { folderAccessPreset } from './folder-access.js'
import { labelRef } from './labels.js'
import { responsibilityDocument } from './responsibility.js'

/*
The three 7.4 field primitives, one definition each so the write path, the
read path, and the client's convenience validation cannot drift. The lengths
are 10.3's rows (folder name 1 to 100, personal label 1 to 40); the color
pattern is the 4.4 CHECK as migration 0000 names it, six hex digits of
either case behind a hash.
*/
export const folderName = z
  .string({ error: 'must be a string' })
  .min(1, { error: 'must be 1 to 100 characters' })
  .max(100, { error: 'must be 1 to 100 characters' })

/**
 * The viewer's own Shelf membership on a folder: 4.18's `folder_members`
 * column, 1 to 40 characters, held in step with `shelves.name`.
 *
 * **It was called `personalLabel` until issue #226 and it never was one.** A
 * Shelf is how one person groups their own folders; a Label is the M1
 * classification vocabulary of #208, which is a different model with its own
 * table, its own scopes and its own endpoints. The two words collided in the
 * database, in this contract and on the screen, and #226 renames the Shelf
 * side of the collision rather than the Label side, because the Label side is
 * the one that matches what the word means everywhere else. Nothing about
 * Shelf semantics moved with the name.
 */
export const shelfName = z
  .string({ error: 'must be a string' })
  .min(1, { error: 'must be 1 to 40 characters' })
  .max(40, { error: 'must be 1 to 40 characters' })

export const hexColor = z
  .string({ error: 'must be a string' })
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'must be a hex color in #RRGGBB form' })

/*
A fourth primitive, and 4.3's `description`: the sentence a folder's page
opens with, bounded by that table's `folders_description_length_check` at 500
characters. It is one definition for the same reason the three above are, and
the reason became load-bearing on 2026-09-04 (issues #21 and #70): two
endpoints write this column now, the create as well as the rename, and a
folder that could be started with a sentence no later edit could restore
would be two rules wearing one column's name. The message is this file's
convention rather than zod's default, which reads "expected string to have
<=500 characters" beside "must be 1 to 100 characters"; the PATCH's 422 moves
to the same wording with it, being the same rule.

Nullable and optional are left to each body, so that each endpoint says for
itself what an absent field means.
*/
export const folderDescription = z
  .string({ error: 'must be a string' })
  .max(500, { error: 'must be 500 characters or fewer' })

/*
POST /folders. Body { name, description }, 422 outside 1 to 100 (7.4, 10.3).
The 200-custom-folder cap is a count the domain module resolves, not a body
fact.

`description` joined the create on 2026-09-04 (7.4's dated paragraph, issues
#21 and #70): a new folder starts with a sentence, and the sentence has to
ride the create because the gesture that makes a folder is one request. AC-279
counts the mutations the hold writes and admits `POST /folders` plus the task
moves and nothing else, so a follow-up PATCH is not a slower way to do this,
it is a different act that fails a criterion. Absent or null is NULL, which is
what a folder made before this carried and still carries.
*/
export const postFoldersBody = z.object({
  name: folderName,
  description: folderDescription.nullable().optional(),
  /* Wave 2 (pages in pages): create this page as a sub-page of that one.
     A body id, so the ac-397 sweep never sees it: the route gates it itself
     (404 when the viewer is not a member of the parent, 403 below edit
     rights there) and a test proves the value arrives. The new page copies
     the parent's members and their presets at this moment (Hassan's
     decision 1); the creator gets full control. Absent or null is a root. */
  parent_folder_id: z.uuid({ error: 'must be a uuid' }).nullable().optional(),
  /* Step 7: what the page is for. On a new project, absent means Work (what
     every caller made before), and null leaves it unpicked: the project's
     page offers the picker, and `POST /folders/:id/tabs` picks. On a
     sub-page, absent or null means Doc. */
  kind: z.enum(['doc', 'work', 'discussion']).nullable().optional(),
})
export type PostFoldersBody = z.infer<typeof postFoldersBody>

/* Step 7: a page's kind. */
export const PAGE_KINDS = ['doc', 'work', 'discussion'] as const
export type PageKind = (typeof PAGE_KINDS)[number]

/* A tab's name when it is made, and the project root's tab label (the root's
   own `name` is the project's). */
export const DEFAULT_TAB_NAMES: Readonly<Record<PageKind, string>> = {
  doc: 'Doc',
  work: 'Work',
  discussion: 'Discussion',
}

/*
POST /folders/:id/tabs. `:id` is any page of the project. While the project's
kind is unpicked, `kind` picks it; `usual` makes the root Work with Purpose
(Doc) before it and Results (Doc) and Discussion after. Once picked, it adds
one tab after the last; `usual` then answers 422, and a second live
Discussion 409. Answers the project's live tabs in order.
*/
export const postFolderTabsBody = z.object({
  kind: z.enum(['doc', 'work', 'discussion', 'usual']),
})
export type PostFolderTabsBody = z.infer<typeof postFolderTabsBody>

// PATCH /folders/:id. Body { name }: the rename, default folder included
// (7.4). The same name rule as the create, declared separately so each
// endpoint's body carries its route's name; the shared primitives keep the
// name and the description one rule apiece.
/** 4.20's preset key shape, shared by a folder's cover. */
const coverPreset = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, 'must be a preset key')

export const patchFolderBody = z.object({
  name: folderName.optional(),
  // The 4.3 identity, folder-owned. The name and the dressing are one thing,
  // ordinary shared Folder work that Can edit and above change and nobody
  // below does (#209 R8A, AC-011, AC-012, AC-193). The schema splits nothing
  // by authority -- that is the route's single `folder.profile.edit` gate.
  // The icon key is pattern-validated only; the server stores it opaquely.
  icon: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/, 'must be an icon key')
    .nullable()
    .optional(),
  color: hexColor.nullable().optional(),
  cover_file_id: z.uuid().nullable().optional(),
  /* 4.3: the preset and the crop 4.20 gives a place page, so a folder can wear every tier a place
     can. A file and a preset are one source: setting either clears the
     other server-side, and a body naming both is refused. */
  cover_preset: coverPreset.nullable().optional(),
  cover_focal_y: z.int().min(0).max(100).optional(),
  description: folderDescription.nullable().optional(),
}).refine(
  (body) => !(body.cover_file_id != null && body.cover_preset != null),
  { message: 'cover_file_id and cover_preset: a cover is a file or a preset, not both', path: ['cover_preset'] },
)
export type PatchFolderBody = z.infer<typeof patchFolderBody>

/*
PATCH /folders/:id/my-membership. Body { shelf, color }, either nullable
(7.4); null clears the field, which 4.4 stores as null.

Presence follows the PATCH convention that holds everywhere else in section 7
(7.2 "any subset", 7.6 "only present fields change", 7.7
"any subset"): an absent field is left alone, a present one must be valid.
7.4's terser sentence is read the same way rather than as the surface's one
full-body PATCH. The route convention (validate, then delegate) also
requires it: AC-023 probes a label-only body against an inaccessible folder
and must reach the 404, so the schema cannot refuse the absent color first.
*/
export const patchFolderMyMembershipBody = z.object({
  /* **`shelf` is the only spelling.** This is the viewer's Shelf
     membership, not a classification Label (#208). The old key `label` gets
     the ordinary unknown-key treatment -- stripped, logged by
     `parse-body.ts`, and changing nothing -- and AC-750 pins that against the
     stored row rather than against the 200.

     Renaming a wire key is expand-and-contract across two releases, like a
     column (11.5): a browser tab open across a deploy keeps its old bundle
     and goes on calling the new API, and because this is a `z.object` a key
     the new schema no longer declares is stripped, so the request would
     answer **200 having stored nothing**. Declare both keys for one release,
     then drop the old one. */
  shelf: shelfName.nullable().optional(),
  color: hexColor.nullable().optional(),
})
export type PatchFolderMyMembershipBody = z.infer<
  typeof patchFolderMyMembershipBody
>

/*
POST /folders/:id/members. Body { user_id, access }: the target account and
the Access preset they arrive with. Everything else the endpoint refuses
(default folder, existing member, missing roster connection, the 25 cap) is
state, resolved by the domain module against 5.3 row 1.

`access` is **required**, added with issue #228 (R9 section 6: "Direct member
add similarly requires an explicit Access preset"). It has deliberately no
default. A default would be one person's authority chosen by nobody, and the
value would then be invisible in the request that granted it. The server reads it in `addMember`, which writes it into the
membership row and into the `null -> preset` history transition in one
transaction, and AC-513 drives the endpoint with each of the six presets and
reads the stored value back.
*/
/*
`responsibility` is **optional** and is issue #230's initial-content field
(#230 "Invite / member activation"). Where `access` has no default because a
default would be an authority nobody chose, this one has no default because a
default would be *text nobody wrote*: R10's "do not fabricate" applies exactly
here, so an absent field means the new member starts with no Responsibility
document at all rather than with an empty one.

It is read by `addMember`, which writes the first revision in the same
transaction as the membership row and attributes it to the **administrator**,
never to the person arriving. AC-569 drives the endpoint with content and
without it, and reads back both the stored document and the actor on its first
revision, which proves the field is read rather than silently dropped.
*/
export const postFolderMembersBody = z.object({
  user_id: z.uuid({ error: 'must be a uuid' }),
  access: folderAccessPreset,
  responsibility: responsibilityDocument.optional(),
})
export type PostFolderMembersBody = z.infer<typeof postFolderMembersBody>

/*
The 7.0 Folder object, the row shape of GET /folders and the base of GET
/folders/:id. It lives here for the me.ts reason: app/src/shared is the one
artifact the client, the server, and the tests all import, and a shape
declared beside a handler is a second definition of the same promise.

Field truths, each from its owning section: name, my_shelf, and my_color
reuse the write primitives because the 4.3 and 4.4 CHECKs guarantee stored
values satisfy them already; is_owner derives from folders.owner_id, the one
ownership source (4.3); member_count is at least 1 because INV-10 keeps the
owner's membership row on every folder that exists; counts are 8.11's
pending and completed tallies, abandoned rows on neither side; my_shelf and
my_color are null for a member who set none (4.4).

`my_shelf` is the Shelf half of keeping clear of #208's Label model;
`personal_labels` below is the Label half. AC-750 asserts that no producer
answers the old `my_label` key.

`my_access` (issue #228, 7.4) is the **viewer's own** membership preset and never anybody
else's: the same value their own element of `GET /folders/:id`'s `members`
carries, taken from the row `folderSelect` already joins to scope the query.
It is not nullable, because a Folder object only exists for somebody who is in
the folder, and INV-10 plus migration 0023 put a preset on every membership
row there is.
*/
/*
Finite Task progress (issue #205), the truth behind "17/22 done · ↻ 3
recurring" on a Folder and on each of its Sections.

`done` and `total` count **one-off** Tasks only: a Task whose
`recurrence_rule` is null. Every occurrence of a recurring Task is its own row
(8.4 generates a successor on completion), so counting them would grow the
denominator forever; they are left out of it and reported apart as
`recurring_active`, the recurring occurrences still pending. A completed
occurrence has handed its rule to its successor (8.5) and is known by the
`series_id` it keeps; it counts nowhere. Abandoned Tasks
sit in neither `done` nor `total`, as `counts` already treats them (8.11), and
trashed Tasks count nowhere.

This lives beside `counts` rather than replacing it: `counts` is what the
deployed client draws, so it stays exactly as it was.
*/
export const taskProgress = z.object({
  done: z.int().nonnegative(),
  total: z.int().nonnegative(),
  recurring_active: z.int().nonnegative(),
})
export type TaskProgress = z.infer<typeof taskProgress>

/* One Section's progress: the Tasks whose `section_block_id` is that section
   block. Sections do not roll up into one another; a Task counts toward the
   one Section it sits in, and toward the Folder. */
export const sectionProgress = taskProgress.extend({
  section_block_id: z.uuid(),
})
export type SectionProgress = z.infer<typeof sectionProgress>

export const folder = z.object({
  id: z.uuid(),
  /* Up to 120 since step 7: a tab made from a facet keeps its facet name. */
  name: z.string().min(1).max(120),
  is_default: z.boolean(),
  is_owner: z.boolean(),
  member_count: z.int().min(1),
  counts: z.object({
    pending: z.int().nonnegative(),
    completed: z.int().nonnegative(),
  }),
  /* Finite progress (issue #205): one-off Tasks only. `counts` above stays
     for the clients already deployed; see `taskProgress`. Optional because a
     client reading an older server must not need it. */
  progress: taskProgress.optional(),
  my_shelf: shelfName.nullable(),
  my_color: hexColor.nullable(),
  /* The viewer's own Access preset (issue #228). It sits with the other two `my_` fields because it is the
     same kind of fact — something true of this reader's membership rather
     than of the folder — and **not** beside `is_owner`, which is the folder's
     `owner_id` and is now neither necessary nor sufficient for any act a
     surface draws.

     What it is for: the Library row in `shell/app-sidebar.tsx` is built from
     `GET /folders` and never fetches a detail, and `is_owner` cannot gate
     Rename, Leave and Delete -- a Full-control non-owner may rename and a
     demoted owner may not delete. Both surfaces gate through `lib/folder-authority.ts`, which answers from
     `shared/folder-actions.ts`, so no bar is written twice. */
  my_access: folderAccessPreset,
  /*
  The M1 Label projection for a Folder (issue #226, parent #208): the viewer's
  own Personal Labels applied to this Folder, ordered active before archived,
  then lower(name), then id.

  **Only Personal, and that is the model rather than a simplification.** A
  Folder Label belongs to one Folder and classifies the Tasks inside it; it
  never classifies the Folder that owns it (R4), so there is no second array
  here to hold one. And because the array is the viewer's own, two members
  reading the same Folder read different arrays, exactly as they read
  different `my_shelf` values.
  */
  personal_labels: z.array(labelRef),
  // The 4.3 identity: the folder's own, one look for every
  // member, null where never set.
  icon: z.string().nullable(),
  color: hexColor.nullable(),
  cover_file_id: z.uuid().nullable(),
  cover_preset: z.string().nullable(),
  cover_focal_y: z.int().min(0).max(100),
  description: z.string().nullable(),
  /* Wave 2 page tree (migration 0039). The parent as THIS viewer may see it:
     null when the page is a root, and also null when the viewer is not a
     member of the parent (or the parent is trashed), so an inaccessible
     ancestor makes the child a root in that viewer's sidebar and its id
     never leaks. `child_position` orders siblings under one parent (a
     fractional-index key, C collation); null for roots, whose order stays
     the viewer's own library order. Optional so an older server's answer
     still parses. */
  parent_folder_id: z.uuid().nullable().optional(),
  child_position: z.string().nullable().optional(),
  /* Step 7 (migration 0061). The project this page belongs to (its root's
     id; a root is its own), what the page is for (null only on a root
     nobody has picked a kind for), and its place in the project's tab row
     (null on a sub-page). A project's tabs are its pages with a
     `tab_position`, in that order. */
  project_id: z.uuid(),
  kind: z.enum(PAGE_KINDS).nullable(),
  tab_position: z.string().nullable(),
})
export type Folder = z.infer<typeof folder>

/**
 * `GET /folders?tabs=1` lists every page, a project's tabs included. Without
 * it the answer keeps the shape a client from before step 7 reads (an
 * installed PWA on the old bundle): no tab but the root, and a page under a
 * tab listed under its project root. The default flips with the contract
 * migration, when the old bundle is gone.
 */
export const getFoldersQuery = z.object({
  tabs: z.literal('1', { error: "must be '1'" }).optional(),
})
export type GetFoldersQuery = z.infer<typeof getFoldersQuery>

/** The project's live tabs, in order, from a folder list. */
export function projectTabs<T extends Pick<Folder, 'id' | 'project_id' | 'tab_position'>>(
  folders: readonly T[],
  projectId: string,
): T[] {
  return folders
    .filter((f) => f.project_id === projectId && f.tab_position !== null)
    .sort((a, b) =>
      a.tab_position! < b.tab_position! ? -1 : a.tab_position! > b.tab_position! ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
}

type TabRow = Pick<Folder, 'id' | 'project_id' | 'tab_position' | 'kind' | 'name'>

/**
 * The project's Purpose tab: the first Doc tab before the root's own tab, as
 * the usual project and migration 0061 place it (the server's `purposeTabOf`).
 * `tabs` is `projectTabs`' answer.
 */
export function purposeTab<T extends TabRow>(tabs: readonly T[]): T | undefined {
  const root = tabs.findIndex((tab) => tab.id === tab.project_id)
  return root < 0 ? undefined : tabs.slice(0, root).find((tab) => tab.kind === 'doc')
}

/**
 * The project's Results tab: the first Doc tab after the root's own tab named
 * Results, the name the usual project and 0061 give it. A renamed one is an
 * ordinary Doc, and the Work thread then offers no "Write what came of it".
 */
export function resultsTab<T extends TabRow>(tabs: readonly T[]): T | undefined {
  const root = tabs.findIndex((tab) => tab.id === tab.project_id)
  return root < 0 ? undefined : tabs.slice(root + 1).find((tab) => tab.kind === 'doc' && tab.name === 'Results')
}

/* One step of a page's breadcrumb: enough to draw and route. */
export const folderCrumb = z.object({
  id: z.uuid(),
  name: z.string(),
  icon: z.string().nullable(),
  color: hexColor.nullable(),
})
export type FolderCrumb = z.infer<typeof folderCrumb>

/*
PATCH /folders/:id/location. Body { parent_folder_id, after_id? }: move a
page under another page (null = make it a root). `after_id` names the
sibling the page lands right after; null puts it first; absent puts it last.
Both are body ids the ac-397 sweep cannot see, so the route gates them:
404 when the viewer is not a member of the target parent (or of after_id's
page), 403 below edit rights on the page or the target parent, 422 when the
move would make a cycle or a tree deeper than 20. Answers the Folder object.
*/
export const patchFolderLocationBody = z.object({
  parent_folder_id: z.uuid({ error: 'must be a uuid' }).nullable(),
  after_id: z.uuid({ error: 'must be a uuid' }).nullable().optional(),
})
export type PatchFolderLocationBody = z.infer<typeof patchFolderLocationBody>
export const patchFolderLocationResponse = folder

/*
The response side of 7.4. 7.4 fixes the Folder object, the members and
pending-invites element fields, and the DELETE response; the four decisions
below are the ones it leaves open, each with its grounds:

- GET /folders answers the bare array. The section's own notation draws
  the line: 7.10's view endpoints write their wrappers out ({ rows,
  truncated }) because those responses carry more than rows, while 7.4
  and 7.5 write lists. A wrapper here would be a shape the spec never
  wrote, and the acceptance harness reads the bare form as the
  literal one.
- The detail's invite key is pending_invites. "Pending invites" is prose
  that cannot be a key verbatim; this transcribes it, and stays distinct
  from 7.5's /invites responses, which list every status.
- The person inside a members element is 7.0's person shape, {id,
  display_name, avatar_url}, the object TaskCard's assignee already
  uses. 7.3 adds email to the roster's user object explicitly; 7.4 does
  not, the 9.x sharing panel renders names and join dates and never a
  member's address, and co-members are not necessarily connected, so the
  contract carries no address nothing consumes.
- Mutations answer what a fresh GET would: PATCH /folders/:id and PATCH
  .../my-membership answer the Folder object (the PATCH /me
  convention), and POST members answers the member element it created.
*/

export const folderMemberUser = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
})

export const folderMember = z.object({
  user: folderMemberUser,
  // 4.4 admits exactly 'member' in v1; ownership is the folder column,
  // never this field (8.9).
  role: z.literal('member'),
  /* The member's current Access preset (issue #228, R8A). It sits beside
     `role` rather than replacing it: `role` expresses no authority, and
     dropping a field from a response is a separate decision from adding one.

     Folder-visible to every member, which is #209 R9's recommended M1 rule: knowing what the people you work with may do is ordinary Work
     awareness. Pending-invite administration is the part that is not, and it
     is withheld separately below. */
  access: folderAccessPreset,
  joined_at: z.iso.datetime(),
  is_owner: z.boolean(),
})
export type FolderMember = z.infer<typeof folderMember>

export const folderPendingInvite = z.object({
  id: z.uuid(),
  email: z.string().min(1),
  task_id: z.uuid().nullable(),
  /** The preset this invite grants on acceptance (R9 section 5). Null cannot
   * occur on a folder invite -- the table's both-or-neither CHECK sees to
   * that -- and is admitted here because the projection's type is the
   * column's. */
  access: folderAccessPreset.nullable(),
  created_at: z.iso.datetime(),
  last_sent_at: z.iso.datetime(),
})
export type FolderPendingInvite = z.infer<typeof folderPendingInvite>

export const getFoldersResponse = z.array(folder)
export type GetFoldersResponse = z.infer<typeof getFoldersResponse>

/**
 * GET /folders/:id.
 *
 * `pending_invites` is **empty for every member below Full control** since
 * issue #228, which classifies a pending invite's email and intended Access
 * as member-administration data rather than ordinary Work: accepted R8A
 * gives administering people and Access to Full control alone. The key is
 * still present and still an array, because a response that
 * dropped a key would make "you may not see this" and "there are none" two
 * different shapes for the client to handle, and the second is the one the
 * panel already renders.
 */
export const getFolderResponse = folder.extend({
  /* Issue #205: one entry per Section block in the folder, zeros included,
     in no promised order (the client keys by `section_block_id`). Only the
     single read carries it; GET /folders does not. Optional, additive. */
  section_progress: z.array(sectionProgress).optional(),
  members: z.array(folderMember),
  pending_invites: z.array(folderPendingInvite),
  /* Wave 2: the page's ancestors, root first, nearest parent last. Walked
     upward from the parent and cut at the first ancestor the viewer is not
     a member of (or that is trashed), so an inaccessible ancestor truncates
     the breadcrumb and its name never reaches this viewer. Empty for a root.
     Optional so an older server's answer still parses. */
  ancestors: z.array(folderCrumb).optional(),
})
export type GetFolderResponse = z.infer<typeof getFolderResponse>

export const patchFolderResponse = folder
export const patchFolderMyMembershipResponse = folder
export const postFolderMembersResponse = folderMember

export const deleteFolderResponse = z.object({
  deleted: z.object({
    tasks_open: z.int().nonnegative(),
    tasks_completed: z.int().nonnegative(),
    tasks_abandoned: z.int().nonnegative(),
  }),
})
export type DeleteFolderResponse = z.infer<typeof deleteFolderResponse>

/*
POST /folders/:id/duplicate (7.16) answers the copy's identity and nothing
more: the copy is the duplicator's own private folder, and the client's next
read of /folders carries it in full. Written from `routes/workshop.ts`.
*/
export const duplicateFolderResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  /* How many days the plan moved, 0 where every date kept (7.16). */
  shifted_days: z.int().nonnegative(),
})
export type DuplicateFolderResponse = z.infer<typeof duplicateFolderResponse>

/*
POST /folders/:id/transfer-ownership (7.16, 8.9's direct form) answers the
folder's new owner and nothing else; the client refetches the folder for the
rest.

It sits beside the duplicate
response above because both are 7.16 acts on a folder and this file already
owns that surface's answers.
*/
export const transferOwnershipResponse = z.object({
  owner_id: z.uuid(),
})
export type TransferOwnershipResponse = z.infer<
  typeof transferOwnershipResponse
>
