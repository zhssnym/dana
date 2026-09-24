/*
The 7.22 data export: one JSON document holding the Dana data that belongs
to one person, answered by `GET /api/v1/me/export`.

**Why it exists.** The Google APIs Terms of Service, section 3(d), oblige an
application storing data obtained through a Google API to let people export
their equivalent data "substantially as fast and easy as exporting such data
from Google products and services". 10.9 recorded that obligation as Dana's
one unmet one, and named the ambiguity in "equivalent data": the narrow
reading is the three Google-derived profile fields, the wide one is
everything Dana holds about the person. Imran ruled the wide reading on issue
#77, on the ground 10.9 already argued — Google's own answer to the same
question is Takeout, which is a file rather than a screen.

**Client code that reads the export parses it through these schemas**, the
contract the server writes against, like every other response in this
folder, rather than through a private copy in `src/client`. The Settings
download is a plain link to the endpoint, so the browser saves the file
without parsing it.

**Every shape here is a response shape**, so the compiler is the guard on
both sides and the request-field hazard in `docs/troubleshooting.md` cannot
arise: the endpoint takes no body and no query parameter, and there is
no field for a caller to send and have silently dropped.

**Nobody else's email address appears anywhere in this document**, which is
the one rule to check against when adding a field. Other people reach the
export only as the `display_name` of a folder member, of a task's creator, or
of a task's assignee. That is not privacy theatre: an export is a file that
leaves Dana, and an address is the one field that lets whoever receives it
contact a person who never agreed to be in it.
*/
import { z } from 'zod'
import { richContent } from './page-document.js'

import { CALENDAR_ZOOMS } from './bundle.js'
import { postContent } from './comments.js'

/** The document's self-description, so a reader can tell what it is holding
 * before it parses anything else. */
export const EXPORT_FORMAT = 'dana-export'

/**
 * Version 1 carries metadata for every file the person owns and none of the
 * bytes. A later version that embeds or archives them changes this number;
 * a reader must refuse a version it does not know rather than guess.
 *
 * **2 to 3 at issue #226**, which renamed one key of `exportFolder`:
 * `my_label` became `my_shelf`, the Shelf half of removing the collision with
 * #208's Label model. Nothing was added and no value changed, but a reader
 * that knows version 2 would find the key it expects missing, and this number
 * is the whole mechanism by which it is told to refuse rather than guess.
 *
 * **3 to 4 at issue #227**, which put the Labels themselves in: the viewer's
 * Personal Label definitions at the top level, each owned Folder's complete
 * Folder Label vocabulary, the id arrays on every task and folder, and the
 * definitions a foreign task needs to be readable. A version-3 reader would
 * strip every one of those keys and hand back a document with a person's
 * whole classification silently missing, which is what the number exists to
 * prevent.
 *
 * **Version 5, issue #230**, adds `responsibilities`: the exporting person's
 * **own** current Responsibility document in each folder they are currently a
 * member of, with that document's own revisions. #230 asks for a deliberate
 * shape rather than an accreted one, and the deliberate part is what it
 * excludes, which is stated where the collection is declared below.
 *
 * ## Why it is 5, and what 3 and 4 were
 *
 * A reader meeting version 5 will want to know what it skipped, because this
 * file only ever carries the current shape. Three branches were open at once
 * on 2026-09-20 and each adds a collection the versions below it do not
 * declare:
 *
 * - **3 — `backend/226-label-core-domain`**, the `my_label` to `my_shelf`
 *   rename inside `folders[]`.
 * - **4 — `backend/227-label-lifecycle`**, the viewer's `personal_labels`
 *   catalog, each owned folder's Folder Label vocabulary, and the id arrays
 *   that connect both to the Work.
 * - **5 — this**, `responsibilities`.
 *
 * **Each number describes exactly one shape, and that is the whole point of
 * not taking 4.** The collision is the same shape as two branches picking one
 * migration prefix: two branches each bumping to the same number merge
 * cleanly and leave **one version covering two different documents**, which is
 * worse than either change alone. A reader that knows version 4 would then be
 * right about one of them and wrong about the other, with nothing in the file
 * to tell it which — and a version number exists precisely so that a reader
 * can refuse what it does not know rather than hand back a document quietly
 * missing somebody's data.
 *
 * So **read the number off the branches that are open rather than off this
 * file**, exactly as docs/troubleshooting.md says for migration prefixes.
 * Seeing one collision is not evidence that you have seen them all.
 *
 * **Both predecessors have since landed on `main`, which settles it**: #226 is
 * version 3 and #227 is version 4, so 5 is this document's number and the
 * reservation held. The conditional this paragraph used to carry — 5 coming
 * down to 4 or 3 if one or both of them went — is spent, and is recorded as
 * spent rather than deleted, because the reasoning above is why the number is
 * 5 and a reader meeting a gap would otherwise re-derive it from nothing.
 */
/*
**5 to 6 on 2026-09-21, for Ruling 7 of the #210 addendum**, https://github.com/zhssnym/dana/issues/210#issuecomment-5757696835.
The document gains a `facets` collection: a private facet is content only its
owner can reach, and an export that left it out would hand somebody a copy of
their own data with their own writing missing. A version-5 reader's schema does
not declare `facets`, so it would drop them in silence -- which is the whole of
why this number moves rather than the shape arriving quietly.

The paragraph above is still the rule for taking the next one: read it off the
branches that are open rather than off this file. This branch is the only one
open with an export change on it, checked at the time of writing.
*/
/*
**6 to 7 on 2026-09-24, for issue #221.** Every task gains `document`, the
Task's own blocks. Read the next number off the open branches, as above.
*/
/*
**7 to 8 on 2026-09-24, wave 2 (pages in pages).** Every folder gains
`parent_folder_id`, null when the parent is not in this document. A `page`
block (a child page's home in its parent's document) arrives with the
document ops; workflow files will carry it as a link. Read the next number off
the open branches, as above.
*/
export const EXPORT_VERSION = 8

/**
 * 10.3's "List responses capped at 1000 rows with truncated flag", applied
 * per collection in this document. A collection that is cut is named in
 * `truncated`, so a short list is never silently short.
 */
export const EXPORT_ROW_CAP = 1000

/**
 * The names `truncated` uses: the path to the collection inside the
 * document, dotted. One entry stands for every place that collection was
 * cut, so `folders.tasks` means at least one folder's task list reached the
 * cap rather than naming which.
 */
export const EXPORT_COLLECTIONS = [
  'folders',
  'folders.members',
  'responsibilities',
  'responsibilities.revisions',
  'folders.tasks',
  'folders.tasks.steps',
  'folders.blocks',
  'folders.labels',
  'tasks_elsewhere',
  'tasks_elsewhere.steps',
  'comments',
  'comments.files',
  'shelves',
  'shelves.blocks',
  'views',
  'files',
  'personal_labels',
  'facets',
  'facets.blocks',
] as const
export type ExportCollection = (typeof EXPORT_COLLECTIONS)[number]

/**
 * A stored file, metadata only (4.16). `url` is 7.15's authenticated serving
 * path on this origin, `/api/v1/files/:id`, which answers the bytes to a
 * caller holding a session — the same path `users.avatar_url` holds and the
 * only way to read a file in Dana. There are no public URLs, so an export
 * handed to somebody else names bytes they cannot fetch, which is the
 * intended property rather than a limitation of version 1.
 */
export const exportFile = z.object({
  id: z.uuid(),
  kind: z.string(),
  name: z.string(),
  mime: z.string(),
  /** The stored length, which for an image is the downscaled one (7.15). */
  bytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  duration_ms: z.number().int().nullable(),
  created_at: z.string(),
  url: z.string(),
})
export type ExportFile = z.infer<typeof exportFile>

/*
A Label definition as the export carries one (#227 area 5).

**It is `labelDefinition` written out rather than imported**, for the reason
every other shape in this file is written out rather than imported from the
read schema it resembles: an export is a document with a version on it, and a
change to a read shape must not silently change the document's meaning under a
version that says it did not. The fields are the same today and the two are
free to part company tomorrow.

**Where each definition may appear is the privacy rule, and the shape does not
carry it.** A Personal definition appears only in `personal_labels`, which is
the viewer's own catalog; a Folder definition appears in an owned Folder's
`labels`, or on a foreign task that actually wears it, and nowhere else.
`owner_user_id` is absent for `labelDefinition`'s reason: every Personal
definition in this document is the viewer's, so the field would be a constant
that happens to be an account id.
*/
export const exportLabel = z.object({
  id: z.uuid(),
  scope: z.string(),
  name: z.string(),
  color: z.string(),
  description: z.string().nullable(),
  archived: z.boolean(),
  folder_id: z.uuid().nullable(),
})
export type ExportLabel = z.infer<typeof exportLabel>

export const exportStep = z.object({
  id: z.uuid(),
  title: z.string(),
  done: z.boolean(),
  position: z.number().int(),
  created_at: z.string(),
})
export type ExportStep = z.infer<typeof exportStep>

/** 4.8, exactly one of the two modes non-null, as 7.0's TaskDetail says. */
export const exportReminder = z.object({
  offset_minutes: z.number().int().nullable(),
  time_of_day: z.string().nullable(),
  fire_at: z.string(),
  state: z.string(),
  fired_at: z.string().nullable(),
})
export type ExportReminder = z.infer<typeof exportReminder>

/** 4.17, without the file dimensions `GET /pages` joins in: the shape of a
 * picture is a fact about the file, and `files` below carries it once. */
export const exportBlock = z.object({
  rich_content:richContent.nullable(),
  section_block_id:z.uuid().nullable(),
  /* #219's two structured-block columns. They are here rather than derived,
     because an export that dropped them would read back a flattened list and a
     checklist with no ticks, which is the loss the issue exists to prevent. */
  list_parent_block_id:z.uuid().nullable(),
  checked:z.boolean().nullable(),
  page_position:z.string().nullable(),
  id: z.uuid(),
  kind: z.string(),
  position: z.number().int(),
  text: z.string().nullable(),
  file_id: z.uuid().nullable(),
  ref_folder_id: z.uuid().nullable(),
  width_pct: z.number().int().nullable(),
  updated_at: z.string(),
})
export type ExportBlock = z.infer<typeof exportBlock>

/**
 * A task and everything hanging off it. Two people appear on it and both as
 * a display name alone: the creator and the assignee.
 *
 * `trashed` is 4.5's `deleted_at` as a boolean. 7.13's trash has not deleted
 * anything yet, so a person's export holds what their Trash holds, flagged
 * rather than dropped: an export that quietly omitted them would be wrong on
 * the day they restore one.
 */
export const exportTask = z.object({
  section_block_id:z.uuid().nullable(),
  page_position:z.string().nullable(),
  id: z.uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  status: z.string(),
  important: z.boolean(),
  start_date: z.string().nullable(),
  due_date: z.string().nullable(),
  due_time: z.string().nullable(),
  recurrence_rule: z.string().nullable(),
  series_id: z.uuid().nullable(),
  created_by: z.string().nullable(),
  assignee: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  trashed: z.boolean(),
  steps: z.array(exportStep),
  reminder: exportReminder.nullable(),
  /* Ids into the document's own definitions rather than definitions inlined
     per task: a Label on forty tasks is one definition and forty references,
     which is also the only spelling in which the archived state of a Label
     cannot be written forty times and disagree with itself. `personal` are the
     viewer's own and resolve in `personal_labels`; `folder` resolve in the
     owning folder's `labels`, or — for a task in a folder the viewer does not
     own — in that task's own `folder_labels` (#227 area 5). */
  personal_label_ids: z.array(z.uuid()),
  folder_label_ids: z.array(z.uuid()),
  /* Version 7, issue #221: the Task's document, in page order. `notes` above
     is its plain-text projection; this is the content itself, so a reader of
     version 6 that dropped it would lose formatting and media, never text. */
  document: z.array(exportBlock),
})
export type ExportTask = z.infer<typeof exportTask>


/** A folder the person owns (4.3), with its page, its tasks and the names of
 * the people in it. Members are display names and nothing else. */
export const exportFolder = z.object({
  id: z.uuid(),
  name: z.string(),
  is_default: z.boolean(),
  /** Version 8: the page this one sits under, when that page is in this
   * document too; null for a root or a parent the export does not carry. */
  parent_folder_id: z.uuid().nullable(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  cover_file_id: z.uuid().nullable(),
  cover_preset: z.string().nullable(),
  cover_focal_y: z.number().int(),
  /** 4.4's two private columns, the owner's own row on their own folder.
   *  `my_shelf` was `my_label` until issue #226 renamed the Shelf half of
   *  the collision with #208's Label model; the value and the column behind
   *  it are unchanged, and version 3 below is what says the key moved. */
  my_shelf: z.string().nullable(),
  my_color: z.string().nullable(),
  created_at: z.string(),
  trashed: z.boolean(),
  members: z.array(z.string()),
  tasks: z.array(exportTask),
  blocks: z.array(exportBlock),
  /** The Folder's complete Folder Label vocabulary, archived definitions
   * included with their state. This is an **owned** folder, so #227 asks for
   * all of it: the taxonomy is the owner's to take with them, and a vocabulary
   * cut down to what happens to be in use would not reconstruct the folder. */
  labels: z.array(exportLabel),
  /** The viewer's own Personal Labels applied to this Folder, by id into
   * `personal_labels`. Never another member's, here or anywhere. */
  personal_label_ids: z.array(z.uuid()),
})
export type ExportFolder = z.infer<typeof exportFolder>

/**
 * One Folder facet of the exporting person's own, with its document
 * (Ruling 7 of the #210 addendum, https://github.com/zhssnym/dana/issues/210#issuecomment-5757696835).
 *
 * **It is a top-level collection rather than a field on `exportFolder`**, and
 * that follows from what it carries: `folders` holds the folders this person
 * **owns**, and a private facet can sit in any folder they are merely a member
 * of. Nesting it would have silently dropped exactly the facets most worth
 * keeping. `folder_id` is here instead, naming a folder that may or may not
 * appear in `folders` above.
 *
 * **Which facets are in it, and the rule 7.22 states in words.** Every facet
 * whose `owner_id` is the exporting person, in every folder they are currently
 * in -- that is the private ones, all of them, because no other kind has an
 * owner. **Shared facets follow the folder page they sit beside**: the page is
 * carried under `folders.blocks` for a folder this person owns and not
 * otherwise, so a shared facet is carried on the same terms. A facet in Trash
 * is carried with `trashed: true`, as a trashed folder is.
 *
 * `name` is resolved exactly as 7.27 resolves it, including a Work facet's
 * from its H1, so the document reads as the tabs read. A Work facet carries no
 * blocks of its own: it is a view of the folder page, which is already here.
 */
export const exportFacet = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  kind: z.string(),
  /** Server-resolved, never a stored column (7.27). */
  name: z.string(),
  display_name: z.string().nullable(),
  hidden: z.boolean(),
  private: z.boolean(),
  position: z.string(),
  h1_block_id: z.uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  trashed: z.boolean(),
  /** 4.17's storage format, the same shape `folders.blocks` uses. */
  blocks: z.array(exportBlock),
})
export type ExportFacet = z.infer<typeof exportFacet>

/**
 * A task in somebody else's folder that is still the person's own work:
 * they wrote it, or it is assigned to them. Everything else in a folder they
 * merely belong to is the owner's, and their own export is where it belongs.
 */
export const exportForeignTask = exportTask.extend({
  folder: z.object({ id: z.uuid(), name: z.string() }),
  /*
  **Exactly the Folder Label definitions this task wears, and not one more.**

  #227 draws the line here in terms: for a task exported out of a folder the
  viewer does not own, include only what is needed to describe that task, and
  do not export the other folder's unrelated vocabulary. So these are resolved
  per task rather than per folder — a colleague's folder with forty categories
  contributes the two on the one task that is the viewer's own work.

  There is no Personal counterpart, and there is deliberately no key for one:
  another person's Personal Labels are never exported, and the viewer's own
  ones on such a task resolve in `personal_labels` like everywhere else.
  */
  folder_labels: z.array(exportLabel),
})
export type ExportForeignTask = z.infer<typeof exportForeignTask>

/** A comment the person wrote (4.15), wherever they wrote it. */
export const exportComment = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  task_id: z.uuid().nullable(),
  /** The Discussion a Folder-level comment belongs to (issue #320, 4.31);
   * null on a Task comment. */
  discussion_id: z.uuid().nullable(),
  parent_id: z.uuid().nullable(),
  body: z.string().nullable(),
  /** The post's editor content (W-C), as stored; null for a plain-text
   * comment, whose `body` is then the whole of it. `body` is always the
   * plain text of `content` when both are present. */
  content: postContent.nullable(),
  created_at: z.string(),
  edited_at: z.string().nullable(),
  files: z.array(exportFile),
})
export type ExportComment = z.infer<typeof exportComment>

/** A shelf (4.18) with its page. Shelves are private by construction. */
export const exportShelf = z.object({
  id: z.uuid(),
  name: z.string(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  cover_file_id: z.uuid().nullable(),
  cover_preset: z.string().nullable(),
  cover_focal_y: z.number().int(),
  created_at: z.string(),
  blocks: z.array(exportBlock),
})
export type ExportShelf = z.infer<typeof exportShelf>

/*
A saved view (4.19), its definition passed through as the generic JSON the
column holds.

**#227 area 6's rule lives in this shape's *unchanged*ness.** A definition may
name Label ids in its criteria, and the export neither rewrites them, drops
them, nor resolves them into definitions: a criterion naming a Folder Label the
viewer can no longer reach stays exactly as it was stored, because dropping it
would silently broaden the view — "tasks in Research" becoming "tasks" — and
resolving it would add metadata about a Label the viewer may not read. The
document adds Label definitions the viewer owns or may read on their own work,
and the ids in a view definition get no special treatment beyond that.
*/
export const exportView = z.object({
  id: z.uuid(),
  name: z.string(),
  definition: z.record(z.string(), z.unknown()),
  pinned: z.boolean(),
  created_at: z.string(),
})
export type ExportView = z.infer<typeof exportView>

/**
 * The person's own profile as 7.1's `GET /me` reports it, plus the join date
 * that endpoint has no reason to carry and an export does.
 */
export const exportAccount = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  timezone: z.string(),
  created_at: z.string(),
})
export type ExportAccount = z.infer<typeof exportAccount>

/**
 * Everything 4.10 holds for the person — the v2 bundle `GET /settings`
 * answers and the three v1 booleans `GET /me` still answers —
 * together with the two per-person page tables.
 *
 * **The last two are an addition to what #77 enumerated and they are here on
 * the wide reading rather than despite it.** 4.22 holds a sentence the
 * person wrote under one of Dana's own pages: that is authored text, not a
 * preference, and an export of "everything Dana holds about you" that
 * dropped it would be wrong in the way the narrow reading is wrong. 4.20's
 * covers ride beside them because they are the same kind of thing on the
 * same eight pages, and leaving one of the pair out would be arbitrary.
 */
export const exportSettings = z.object({
  theme: z.string(),
  row_density: z.string(),
  clock: z.string(),
  task_open: z.string(),
  /* Declared 2026-09-04 at the wave-1 integration, having been emitted and
     undeclared for a day: `domain/export.ts` spreads `readBundle`'s answer,
     so `calendar_zoom` (4.10, migration 0013, issue #142) has been in the
     document since it entered the bundle, and this object is the other half
     of 7.22's "everything 4.10 holds for them". An undeclared key is not a
     wrong key, it is a key a `.parse()` strips in silence, which is the
     request-schema fault of 11.15 wearing a response's clothes.

     `z.enum` rather than the `z.string()` its four neighbours carry, matching
     `settingsBundle` exactly: this value has a CHECK under it and a shared
     constant over it, and `readBundle` maps anything else to the default, so
     nothing this endpoint can emit fails it. The neighbours are loose because
     they predate their own constants, not because looseness is the rule. */
  calendar_zoom: z.enum(CALENDAR_ZOOMS),
  pinned_views: z.array(z.string()),
  sidebar_order: z.array(z.string()),
  arrangements: z.record(z.string(), z.string()),
  show_important: z.boolean(),
  show_all: z.boolean(),
  show_done: z.boolean(),
  place_covers: z.array(
    z.object({
      place: z.string(),
      file_id: z.uuid().nullable(),
      preset: z.string().nullable(),
      focal_y: z.number().int(),
    }),
  ),
  place_descriptions: z.array(
    z.object({ place: z.string(), description: z.string().nullable() }),
  ),
})
export type ExportSettings = z.infer<typeof exportSettings>

/**
 * The whole document.
 *
 * **What is deliberately absent, each for its own reason**, recorded here so
 * that a later reader meets a decision rather than a gap:
 *
 * - **notifications** (4.14) are a delivery record of things that happened
 *   to other people's rows, and every one of them points at an event.
 * - **events** (4.13) belong to a folder rather than to a person. An owner's
 *   history of their own folder is a shared record of what several people
 *   did in it, and exporting one person's copy of it would hand them
 *   somebody else's activity log.
 * - **invites** (4.9) are addressed to email addresses, which is the one
 *   field this document refuses to carry.
 * - **connections** (4.2) are the roster: other people, identified.
 * - **my_day_entries** (4.7) are a fact about one day, stamped `added_on`
 *   and rewritten every morning. There is nothing in one to port.
 * - **file bytes**, which version 1 names and does not embed; `files[].url`
 *   is how a session fetches them.
 */
/**
 * One folder's Responsibility standing, **the exporting person's own**
 * (issue #230, #209 R10 "Export / duplication / workflows").
 *
 * R10 admits exactly this much: "account export preserves the exporting
 * user's current/historical Responsibility and Access information only within
 * the existing privacy/access boundary". So the four exclusions are the shape
 * rather than omissions from it, and each one is a thing a careless version of
 * this collection would have carried:
 *
 * - **no other member's Responsibility.** The document is Folder-visible, so
 *   the exporter may *read* their colleagues' in the application; an export
 *   is a file that leaves Dana, and #230 forbids "confidential personnel
 *   information" and "another user's private future Member records" in one
 *   breath. Their own is the boundary that needs no argument.
 * - **no folder they have left.** The revisions survive with the folder (R10)
 *   and are reachable by nobody outside it; #230 names this exactly --
 *   "inaccessible former-Folder data merely because a historical row exists".
 * - **no self-edit grant and no member roster**, which are member
 *   administration rather than the exporter's own data.
 * - **no actor identities beyond a display name**, the rule the whole
 *   document already keeps.
 */
export const exportResponsibilityRevision = z.object({
  revision_no: z.number().int(),
  content: z.unknown(),
  committed_at: z.string(),
  /** The display name of whoever committed it, which may be the exporter or
   * the administrator who wrote it for them. Names and never addresses, the
   * rule `folders[].members` already keeps. */
  committed_by: z.string().nullable(),
})
export type ExportResponsibilityRevision = z.infer<
  typeof exportResponsibilityRevision
>

export const exportResponsibility = z.object({
  folder: z.object({ id: z.uuid(), name: z.string() }),
  content: z.unknown(),
  revision_no: z.number().int(),
  updated_at: z.string(),
  updated_by: z.string().nullable(),
  revisions: z.array(exportResponsibilityRevision),
})
export type ExportResponsibility = z.infer<typeof exportResponsibility>

export const exportDocument = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exported_at: z.string(),
  account: exportAccount,
  settings: exportSettings,
  folders: z.array(exportFolder),
  tasks_elsewhere: z.array(exportForeignTask),
  /** Issue #230, version 5. The exporting person's own current Responsibility
   * in each folder they are currently in, and nobody else's anywhere. */
  responsibilities: z.array(exportResponsibility),
  comments: z.array(exportComment),
  shelves: z.array(exportShelf),
  views: z.array(exportView),
  files: z.array(exportFile),
  /** Every Personal Label definition the viewer holds, archived state and
   * all — the catalog rather than what happens to be applied, for the reason
   * an owned folder's vocabulary is complete. Every `personal_label_ids`
   * entry anywhere in this document resolves here, and no other account's
   * Personal Label appears in this document at all (#227 area 5). */
  personal_labels: z.array(exportLabel),
  /** Ruling 7 of the #210 addendum: the exporting person's own Folder facets
   * with their documents, top-level because a private facet can sit in a
   * folder they do not own. `exportFacet` carries the rule. */
  facets: z.array(exportFacet),
  /** The collections 10.3's cap cut, by the names in `EXPORT_COLLECTIONS`.
   * Empty on every export that fit, which is every ordinary one. */
  truncated: z.array(z.enum(EXPORT_COLLECTIONS)),
})
export type ExportDocument = z.infer<typeof exportDocument>

/**
 * The filename the browser saves, `dana-export-YYYY-MM-DD.json`, built from
 * an ISO instant so the route and any test that checks the header derive it
 * one way. The date is UTC, matching `exported_at`: this is a label on a
 * file rather than a date anyone reads a day off, so 8.1's viewer-timezone
 * rule does not reach it.
 */
export function exportFilename(exportedAt: string): string {
  return `dana-export-${exportedAt.slice(0, 10)}.json`
}
