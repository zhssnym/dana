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

**Nothing on the client imports this yet**, and that is deliberate. The
control that downloads the file is Imran's to build (the handoff issue on
#77); this schema exists so that when he does, the response is parsed through
the same contract the server writes against, like every other response in
this folder, rather than through a private copy in `src/client`.

**Every shape here is a response shape**, so the compiler is the guard on
both sides and the request-field hazard `src/shared/README` warns about
cannot arise: the endpoint takes no body and no query parameter, and there is
no field for a caller to send and have silently dropped.

**Nobody else's email address appears anywhere in this document**, which is
the one rule to check against when adding a field. Other people reach the
export only as the `display_name` of a folder member, of a task's creator, or
of a task's assignee. That is not privacy theatre: an export is a file that
leaves Dana, and an address is the one field that lets whoever receives it
contact a person who never agreed to be in it.
*/
import { z } from 'zod'

/** The document's self-description, so a reader can tell what it is holding
 * before it parses anything else. */
export const EXPORT_FORMAT = 'dana-export'

/**
 * Version 1 carries metadata for every file the person owns and none of the
 * bytes. A later version that embeds or archives them changes this number;
 * a reader must refuse a version it does not know rather than guess.
 */
export const EXPORT_VERSION = 1

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
  'folders.tasks',
  'folders.tasks.steps',
  'folders.blocks',
  'tasks_elsewhere',
  'tasks_elsewhere.steps',
  'comments',
  'comments.files',
  'shelves',
  'shelves.blocks',
  'views',
  'files',
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
  id: z.uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  status: z.string(),
  important: z.boolean(),
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
})
export type ExportTask = z.infer<typeof exportTask>

/** 4.17, without the file dimensions `GET /pages` joins in: the shape of a
 * picture is a fact about the file, and `files` below carries it once. */
export const exportBlock = z.object({
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

/** A folder the person owns (4.3), with its page, its tasks and the names of
 * the people in it. Members are display names and nothing else. */
export const exportFolder = z.object({
  id: z.uuid(),
  name: z.string(),
  is_default: z.boolean(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  cover_file_id: z.uuid().nullable(),
  cover_preset: z.string().nullable(),
  cover_focal_y: z.number().int(),
  /** 4.4's two private columns, the owner's own row on their own folder. */
  my_label: z.string().nullable(),
  my_color: z.string().nullable(),
  created_at: z.string(),
  trashed: z.boolean(),
  members: z.array(z.string()),
  tasks: z.array(exportTask),
  blocks: z.array(exportBlock),
})
export type ExportFolder = z.infer<typeof exportFolder>

/**
 * A task in somebody else's folder that is still the person's own work:
 * they wrote it, or it is assigned to them. Everything else in a folder they
 * merely belong to is the owner's, and their own export is where it belongs.
 */
export const exportForeignTask = exportTask.extend({
  folder: z.object({ id: z.uuid(), name: z.string() }),
})
export type ExportForeignTask = z.infer<typeof exportForeignTask>

/** A comment the person wrote (4.15), wherever they wrote it. */
export const exportComment = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  task_id: z.uuid().nullable(),
  parent_id: z.uuid().nullable(),
  body: z.string().nullable(),
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
 * answers and the three v1 booleans frozen 7.2 still reads and writes —
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
export const exportDocument = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exported_at: z.string(),
  account: exportAccount,
  settings: exportSettings,
  folders: z.array(exportFolder),
  tasks_elsewhere: z.array(exportForeignTask),
  comments: z.array(exportComment),
  shelves: z.array(exportShelf),
  views: z.array(exportView),
  files: z.array(exportFile),
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
