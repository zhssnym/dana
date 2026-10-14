/*
The 7.22 data export (`GET /api/v1/me/export`), required by Google API terms.
Rule for new fields: no other person's email address appears anywhere; other
people appear only as display names.
*/
import { z } from 'zod'
import { pageRichContent } from './page-document.js'
import { richContent } from './rich-content.js'
import { profileContent } from './member-profile.js'

import { CALENDAR_ZOOMS } from './bundle.js'
import { postContent } from './comments.js'

export const EXPORT_FORMAT = 'dana-export'

/*
Bump on every shape change: a reader must refuse a version it does not know,
because an older schema strips new keys silently. Pick the next number from
the open branches, not this file, so two branches never share one number.
*/
export const EXPORT_VERSION = 15

/** 10.3's per-collection row cap; a cut collection is named in `truncated`. */
export const EXPORT_ROW_CAP = 1000

/** Dotted collection paths for `truncated`. One entry covers every place that
 * collection was cut. */
export const EXPORT_COLLECTIONS = [
  'folders',
  'folders.members',
  'responsibilities',
  'team_bios',
  'profile_sections',
  'responsibilities.revisions',
  'folders.tasks',
  'folders.tasks.steps',
  'folders.blocks',
  'folders.labels',
  'tasks_elsewhere',
  'tasks_elsewhere.steps',
  'comments',
  'direct_messages',
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

/** File metadata only; `url` needs a session, so an export names bytes others cannot fetch. */
export const exportFile = z.object({
  id: z.uuid(),
  kind: z.string(),
  name: z.string(),
  mime: z.string(),
  /** The stored length, which for an image is the downscaled one. */
  bytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  duration_ms: z.number().int().nullable(),
  created_at: z.string(),
  url: z.string(),
})
export type ExportFile = z.infer<typeof exportFile>

/*
Written out rather than imported from the read schema, so a read-shape change
cannot change a versioned document. Privacy lives in where definitions appear:
Personal ones only in `personal_labels`, Folder ones in owned folders or on a
foreign task that wears them.
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

/** 4.17 without the file dimensions; `files` carries those once. */
export const exportBlock = z.object({
  rich_content:pageRichContent.nullable(),
  section_block_id:z.uuid().nullable(),
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
  toggleable: z.boolean().nullable(),
  updated_at: z.string(),
})
export type ExportBlock = z.infer<typeof exportBlock>

/**
 * A task and everything on it. People appear as display names only. Trashed
 * tasks are included and flagged.
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
  start_time: z.string().nullable(),
  due_date: z.string().nullable(),
  due_time: z.string().nullable(),
  recurrence_rule: z.string().nullable(),
  series_id: z.uuid().nullable(),
  created_by: z.string().nullable(),
  assignee: z.string().nullable(),
  assignees: z.array(z.string().nullable()),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  trashed: z.boolean(),
  steps: z.array(exportStep),
  reminder: exportReminder.nullable(),
  /* Ids into the document's definitions: `personal` resolve in
     `personal_labels`, `folder` in the folder's `labels` or the task's own
     `folder_labels`. */
  personal_label_ids: z.array(z.uuid()),
  folder_label_ids: z.array(z.uuid()),
  /* The Task's document in page order; `notes` is its plain-text projection. */
  document: z.array(exportBlock),
})
export type ExportTask = z.infer<typeof exportTask>


/** A folder the person owns. Members are display names only. */
export const exportFolder = z.object({
  id: z.uuid(),
  name: z.string(),
  is_default: z.boolean(),
  /** Null for a root, or a parent not in this document. */
  parent_folder_id: z.uuid().nullable(),
  /** Tab position is null on a sub-page. */
  project_id: z.uuid(),
  kind: z.enum(['doc', 'work', 'discussion']).nullable(),
  tab_position: z.string().nullable(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  cover_file_id: z.uuid().nullable(),
  cover_preset: z.string().nullable(),
  cover_focal_y: z.number().int(),
  /** The owner's own private columns (`my_shelf` was `my_label` before v3). */
  my_shelf: z.string().nullable(),
  my_color: z.string().nullable(),
  created_at: z.string(),
  trashed: z.boolean(),
  members: z.array(z.string()),
  tasks: z.array(exportTask),
  blocks: z.array(exportBlock),
  /** The complete vocabulary, archived labels included. */
  labels: z.array(exportLabel),
  /** Only the viewer's own Personal Labels, never another member's. */
  personal_label_ids: z.array(z.uuid()),
})
export type ExportFolder = z.infer<typeof exportFolder>

/**
 * A Folder facet of the exporter's own, top-level because a private facet can
 * sit in a folder they do not own. Shared facets follow their folder page.
 */
export const exportFacet = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  kind: z.string(),
  /** Server-resolved, never a stored column. */
  name: z.string(),
  display_name: z.string().nullable(),
  hidden: z.boolean(),
  private: z.boolean(),
  position: z.string(),
  h1_block_id: z.uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  trashed: z.boolean(),
  blocks: z.array(exportBlock),
})
export type ExportFacet = z.infer<typeof exportFacet>

/** A task in someone else's folder that the person wrote or is assigned. */
export const exportForeignTask = exportTask.extend({
  folder: z.object({ id: z.uuid(), name: z.string() }),
  /* Only the Folder Label definitions this task wears, not the folder's whole
     vocabulary. Other people's Personal Labels are never exported. */
  folder_labels: z.array(exportLabel),
})
export type ExportForeignTask = z.infer<typeof exportForeignTask>

export const exportComment = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  task_id: z.uuid().nullable(),
  /** Null on a Task comment. */
  discussion_id: z.uuid().nullable(),
  parent_id: z.uuid().nullable(),
  body: z.string().nullable(),
  /** Editor content; null for a plain-text comment. `body` is its plain text. */
  content: postContent.nullable(),
  created_at: z.string(),
  edited_at: z.string().nullable(),
  files: z.array(exportFile),
})
export type ExportComment = z.infer<typeof exportComment>

export const exportDirectMessage = z.object({
  id: z.uuid(),
  conversation_id: z.uuid(),
  other_name: z.string().nullable(),
  sent_by_me: z.boolean(),
  body: z.string(),
  created_at: z.string(),
})
export type ExportDirectMessage = z.infer<typeof exportDirectMessage>

/** Shelves are private by construction. */
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
Saved view definitions pass through unchanged, Label ids included: dropping an
unreachable id would broaden the view, and resolving it would leak the label.
*/
export const exportView = z.object({
  id: z.uuid(),
  name: z.string(),
  definition: z.record(z.string(), z.unknown()),
  pinned: z.boolean(),
  created_at: z.string(),
})
export type ExportView = z.infer<typeof exportView>

export const exportAccount = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  timezone: z.string(),
  created_at: z.string(),
})
export type ExportAccount = z.infer<typeof exportAccount>

/** Everything 4.10 holds for the person, plus their page descriptions and covers. */
export const exportSettings = z.object({
  theme: z.string(),
  row_density: z.string(),
  clock: z.string(),
  task_open: z.string(),
  /* `domain/export.ts` spreads readBundle's answer, so every bundle key must be
     declared here or `.parse()` strips it silently. */
  calendar_zoom: z.enum(CALENDAR_ZOOMS),
  pinned_views: z.array(z.string()),
  sidebar_order: z.array(z.string()),
  arrangements: z.record(z.string(), z.string()),
  focus_lists: z.array(z.string()),
  /** Sparse overrides; each entry has at least one non-null field. */
  focus_appearance: z.record(
    z.string(),
    z.object({ icon: z.string().nullable(), color: z.string().nullable() }),
  ),
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

/*
Deliberately absent from the document: notifications, events (shared
activity), invites and connections (other people's addresses and identities),
my_day_entries, and file bytes. Responsibilities are the exporter's own only,
in folders they are still in, with no grant or roster.
*/
export const exportResponsibilityRevision = z.object({
  revision_no: z.number().int(),
  content: z.unknown(),
  committed_at: z.string(),
  /** Display name of whoever committed it; never an address. */
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

export const exportTeamBio = z.object({
  folder: z.object({ id: z.uuid(), name: z.string() }),
  bio: z.string(),
  content: richContent.nullable(),
  author: z.string().nullable(),
  last_editor: z.string().nullable(),
  updated_at: z.string().nullable(),
})

/** One member's contextual content. Project-owned or this user's self-authored area. */
export const exportProfileSection = z.object({
  project: z.object({ id: z.uuid(), name: z.string() }),
  member_id: z.uuid(),
  member_name: z.string().nullable(),
  area: z.enum(['project', 'shared']),
  content: profileContent,
  revision: z.number().int().nonnegative(),
  updated_at: z.string().nullable(),
  updated_by: z.string().nullable(),
})

export const exportDocument = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exported_at: z.string(),
  account: exportAccount,
  settings: exportSettings,
  folders: z.array(exportFolder),
  tasks_elsewhere: z.array(exportForeignTask),
  responsibilities: z.array(exportResponsibility),
  team_bios: z.array(exportTeamBio),
  profile_sections: z.array(exportProfileSection),
  comments: z.array(exportComment),
  direct_messages: z.array(exportDirectMessage),
  shelves: z.array(exportShelf),
  views: z.array(exportView),
  files: z.array(exportFile),
  /** The viewer's whole Personal Label catalog; every `personal_label_ids` resolves here. */
  personal_labels: z.array(exportLabel),
  /** The exporter's own facets; see `exportFacet`. */
  facets: z.array(exportFacet),
  truncated: z.array(z.enum(EXPORT_COLLECTIONS)),
})
export type ExportDocument = z.infer<typeof exportDocument>

/** `dana-export-YYYY-MM-DD.json`, by the UTC date of `exported_at`. */
export function exportFilename(exportedAt: string): string {
  return `dana-export-${exportedAt.slice(0, 10)}.json`
}
