/*
The expected constraint catalog for AC-001, hand-transcribed from spec
section 4. This file and the migration DDL restate the same contract; if
they ever disagree with each other or with section 4, one of the three is
wrong and the disagreement is a defect to fix, never to paper over.

Shape rules, so the catalog test can assert structured facts from
pg_constraint and pg_index rather than deparsed SQL text (spec 11.10):

Primary key, unique, and foreign key column lists are in declaration order:
for a foreign key, "columns" and "references.columns" pair up positionally.
CHECK column lists are sorted alphabetically, since the expression imposes no
order; assert them against a sorted read of pg_constraint.conkey. Index
column lists are in index order, which is meaningful; expression members
appear as the literal string 'expr' (pg_index.indkey holds 0 there). An
absent descColumns means every column ascending, and the assertion runs
either way; an absent method means btree. "partial" means pg_index.indpred is set;
the predicate's text is deliberately not recorded. Primary keys and unique
constraints arrive with backing indexes named like the constraint; the
"indexes" arrays below list only standalone CREATE INDEX statements, so the
test should skip indexes that back a constraint (pg_constraint.conindid)
when comparing. The drizzle migrator additionally owns the schema "drizzle"
and its bookkeeping table; the catalog covers schema public only.

Postgres 18 catalogs NOT NULL as named constraint rows (contype 'n', names
like users_id_not_null), on PGlite 18 and postgres:18 alike. Those rows are
outside this catalog and outside AC-001's enumeration; compare against
contype in ('p', 'u', 'c', 'f') only. Section 4's Null column is enforced by
NOT NULL and asserted behaviorally, not by name.

Deferrability is recorded on foreign keys only, and its absence means
immediate, which is asserted rather than skipped: a constraint that quietly
became deferrable would let a transaction hold a broken state across
statements, which is the opposite of what section 4 promises. Migration 0007
made one constraint deferrable on purpose and it is the only entry carrying
the flag. Nothing else in this schema is deferrable, and Postgres does not
admit a deferrable CHECK at all, so the other three kinds are compared
against immediate without a field to say so.
*/

export type OnDelete = 'cascade' | 'restrict' | 'set null' | 'no action'

export interface ExpectedPrimaryKey {
  name: string
  columns: string[]
}

export interface ExpectedUnique {
  name: string
  columns: string[]
}

export interface ExpectedCheck {
  name: string
  columns: string[]
}

export interface ExpectedForeignKey {
  name: string
  columns: string[]
  references: { table: string; columns: string[] }
  onDelete: OnDelete
  onDeleteSetColumns?: string[]
  /** pg_constraint.condeferrable. Absent means false. */
  deferrable?: boolean
  /** pg_constraint.condeferred, meaningful only when deferrable. Absent
   * means false, which is INITIALLY IMMEDIATE. */
  initiallyDeferred?: boolean
}

export interface ExpectedIndex {
  name: string
  unique: boolean
  columns: string[]
  partial: boolean
  method?: 'gin'
  descColumns?: string[]
}

export interface ExpectedTable {
  primaryKey: ExpectedPrimaryKey
  uniques: ExpectedUnique[]
  checks: ExpectedCheck[]
  foreignKeys: ExpectedForeignKey[]
  indexes: ExpectedIndex[]
}

export const constraintCatalog: Record<string, ExpectedTable> = {
  users: {
    primaryKey: { name: 'users_pkey', columns: ['id'] },
    uniques: [{ name: 'users_google_sub_key', columns: ['google_sub'] }],
    checks: [
      { name: 'users_avatar_url_length_check', columns: ['avatar_url'] },
      { name: 'users_display_name_length_check', columns: ['display_name'] },
      { name: 'users_email_lower_check', columns: ['email'] },
    ],
    foreignKeys: [],
    indexes: [
      { name: 'users_email_active_idx', unique: true, columns: ['email'], partial: true },
    ],
  },
  connections: {
    primaryKey: { name: 'connections_pkey', columns: ['user_a_id', 'user_b_id'] },
    uniques: [],
    checks: [
      { name: 'connections_user_order_check', columns: ['user_a_id', 'user_b_id'] },
    ],
    foreignKeys: [
      {
        name: 'connections_user_a_id_fkey',
        columns: ['user_a_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'connections_user_b_id_fkey',
        columns: ['user_b_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      { name: 'connections_user_b_id_idx', unique: false, columns: ['user_b_id'], partial: false },
    ],
  },
  folders: {
    primaryKey: { name: 'folders_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      { name: 'folders_color_format_check', columns: ['color'] },
      { name: 'folders_cover_focal_y_range_check', columns: ['cover_focal_y'] },
      { name: 'folders_cover_one_source_check', columns: ['cover_file_id', 'cover_preset'] },
      { name: 'folders_cover_preset_format_check', columns: ['cover_preset'] },
      { name: 'folders_description_length_check', columns: ['description'] },
      { name: 'folders_name_length_check', columns: ['name'] },
    ],
    foreignKeys: [
      {
        name: 'folders_cover_file_id_fkey',
        columns: ['cover_file_id'],
        references: { table: 'files', columns: ['id'] },
        onDelete: 'set null',
      },
      {
        name: 'folders_owner_id_fkey',
        columns: ['owner_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
    ],
    indexes: [
      { name: 'folders_one_default_per_owner_idx', unique: true, columns: ['owner_id'], partial: true },
      { name: 'folders_deleted_at_idx', unique: false, columns: ['deleted_at'], partial: true },
    ],
  },
  folder_members: {
    primaryKey: { name: 'folder_members_pkey', columns: ['folder_id', 'user_id'] },
    uniques: [],
    checks: [
      { name: 'folder_members_color_format_check', columns: ['color'] },
      { name: 'folder_members_label_length_check', columns: ['label'] },
      { name: 'folder_members_role_check', columns: ['role'] },
    ],
    foreignKeys: [
      {
        name: 'folder_members_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'folder_members_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      { name: 'folder_members_user_id_idx', unique: false, columns: ['user_id'], partial: false },
    ],
  },
  tasks: {
    primaryKey: { name: 'tasks_pkey', columns: ['id'] },
    uniques: [{ name: 'tasks_folder_id_id_key', columns: ['folder_id', 'id'] }],
    checks: [
      { name: 'tasks_completed_at_check', columns: ['completed_at', 'status'] },
      { name: 'tasks_completed_by_check', columns: ['completed_by', 'status'] },
      { name: 'tasks_due_time_requires_date_check', columns: ['due_date', 'due_time'] },
      { name: 'tasks_notes_length_check', columns: ['notes'] },
      { name: 'tasks_position_format_check', columns: ['position'] },
      { name: 'tasks_recurrence_requires_date_check', columns: ['due_date', 'recurrence_rule'] },
      { name: 'tasks_recurrence_requires_series_check', columns: ['recurrence_rule', 'series_id'] },
      { name: 'tasks_recurrence_rule_length_check', columns: ['recurrence_rule'] },
      { name: 'tasks_status_check', columns: ['status'] },
      { name: 'tasks_title_length_check', columns: ['title'] },
    ],
    foreignKeys: [
      {
        name: 'tasks_assignee_membership_fkey',
        columns: ['folder_id', 'assignee_id'],
        references: { table: 'folder_members', columns: ['folder_id', 'user_id'] },
        onDelete: 'set null',
        onDeleteSetColumns: ['assignee_id'],
      },
      {
        name: 'tasks_completed_by_fkey',
        columns: ['completed_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'no action',
      },
      {
        name: 'tasks_created_by_fkey',
        columns: ['created_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'tasks_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'tasks_section_block_id_fkey',
        columns: ['section_block_id'],
        references: { table: 'page_blocks', columns: ['id'] },
        onDelete: 'set null',
      },
    ],
    indexes: [
      {
        name: 'tasks_folder_status_due_idx',
        unique: false,
        columns: ['folder_id', 'status', 'due_date'],
        partial: false,
      },
      {
        name: 'tasks_assignee_status_due_idx',
        unique: false,
        columns: ['assignee_id', 'status', 'due_date'],
        partial: false,
      },
      { name: 'tasks_series_id_idx', unique: false, columns: ['series_id'], partial: true },
      {
        name: 'tasks_done_pagination_idx',
        unique: false,
        columns: ['completed_at', 'id'],
        partial: true,
        descColumns: ['completed_at', 'id'],
      },
      {
        name: 'tasks_search_trgm_idx',
        unique: false,
        columns: ['title', 'notes'],
        partial: false,
        method: 'gin',
      },
      {
        name: 'tasks_section_block_id_idx',
        unique: false,
        columns: ['section_block_id'],
        partial: true,
      },
      { name: 'tasks_deleted_at_idx', unique: false, columns: ['deleted_at'], partial: true },
    ],
  },
  steps: {
    primaryKey: { name: 'steps_pkey', columns: ['id'] },
    uniques: [],
    checks: [{ name: 'steps_title_length_check', columns: ['title'] }],
    foreignKeys: [
      {
        name: 'steps_task_id_fkey',
        columns: ['task_id'],
        references: { table: 'tasks', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      { name: 'steps_task_id_idx', unique: false, columns: ['task_id'], partial: false },
    ],
  },
  my_day_entries: {
    primaryKey: { name: 'my_day_entries_pkey', columns: ['task_id', 'user_id'] },
    uniques: [],
    checks: [],
    foreignKeys: [
      {
        name: 'my_day_entries_task_id_fkey',
        columns: ['task_id'],
        references: { table: 'tasks', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'my_day_entries_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      { name: 'my_day_entries_user_id_idx', unique: false, columns: ['user_id'], partial: false },
    ],
  },
  reminders: {
    primaryKey: { name: 'reminders_pkey', columns: ['task_id'] },
    uniques: [],
    checks: [
      { name: 'reminders_mode_check', columns: ['offset_minutes', 'time_of_day'] },
      { name: 'reminders_offset_range_check', columns: ['offset_minutes'] },
      { name: 'reminders_state_check', columns: ['state'] },
    ],
    foreignKeys: [
      {
        name: 'reminders_created_by_fkey',
        columns: ['created_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'no action',
      },
      {
        name: 'reminders_task_id_fkey',
        columns: ['task_id'],
        references: { table: 'tasks', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      { name: 'reminders_scheduled_fire_at_idx', unique: false, columns: ['fire_at'], partial: true },
    ],
  },
  invites: {
    primaryKey: { name: 'invites_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      { name: 'invites_email_length_check', columns: ['email'] },
      { name: 'invites_email_lower_check', columns: ['email'] },
      { name: 'invites_status_check', columns: ['status'] },
      { name: 'invites_task_requires_folder_check', columns: ['folder_id', 'task_id'] },
    ],
    foreignKeys: [
      {
        name: 'invites_accepted_by_fkey',
        columns: ['accepted_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'no action',
      },
      {
        name: 'invites_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'invites_inviter_id_fkey',
        columns: ['inviter_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'no action',
      },
      {
        name: 'invites_task_id_fkey',
        columns: ['task_id'],
        references: { table: 'tasks', columns: ['id'] },
        onDelete: 'set null',
      },
    ],
    indexes: [
      {
        name: 'invites_pending_uniq_idx',
        unique: true,
        columns: ['inviter_id', 'email', 'expr'],
        partial: true,
      },
      { name: 'invites_pending_email_idx', unique: false, columns: ['email'], partial: true },
      { name: 'invites_inviter_id_idx', unique: false, columns: ['inviter_id'], partial: false },
    ],
  },
  user_settings: {
    primaryKey: { name: 'user_settings_pkey', columns: ['user_id'] },
    uniques: [],
    checks: [
      { name: 'user_settings_arrangements_object_check', columns: ['arrangements'] },
      { name: 'user_settings_clock_check', columns: ['clock'] },
      { name: 'user_settings_pinned_views_array_check', columns: ['pinned_views'] },
      { name: 'user_settings_row_density_check', columns: ['row_density'] },
      { name: 'user_settings_sidebar_order_array_check', columns: ['sidebar_order'] },
      { name: 'user_settings_task_open_check', columns: ['task_open'] },
      { name: 'user_settings_theme_check', columns: ['theme'] },
    ],
    foreignKeys: [
      {
        name: 'user_settings_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [],
  },
  events: {
    primaryKey: { name: 'events_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      { name: 'events_detail_length_check', columns: ['detail'] },
      { name: 'events_subject_kind_check', columns: ['subject_kind'] },
      { name: 'events_verb_check', columns: ['verb'] },
    ],
    foreignKeys: [
      {
        name: 'events_actor_id_fkey',
        columns: ['actor_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'events_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      {
        name: 'events_folder_created_idx',
        unique: false,
        columns: ['folder_id', 'created_at'],
        partial: false,
        descColumns: ['created_at'],
      },
      {
        name: 'events_subject_created_idx',
        unique: false,
        columns: ['subject_kind', 'subject_id', 'created_at'],
        partial: false,
        descColumns: ['created_at'],
      },
    ],
  },
  notifications: {
    primaryKey: { name: 'notifications_pkey', columns: ['id'] },
    uniques: [
      { name: 'notifications_user_event_key', columns: ['user_id', 'event_id'] },
    ],
    checks: [],
    foreignKeys: [
      {
        name: 'notifications_event_id_fkey',
        columns: ['event_id'],
        references: { table: 'events', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'notifications_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      { name: 'notifications_unread_idx', unique: false, columns: ['user_id'], partial: true },
    ],
  },
  comments: {
    primaryKey: { name: 'comments_pkey', columns: ['id'] },
    uniques: [],
    checks: [{ name: 'comments_body_length_check', columns: ['body'] }],
    foreignKeys: [
      {
        name: 'comments_author_id_fkey',
        columns: ['author_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'comments_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'comments_parent_id_fkey',
        columns: ['parent_id'],
        references: { table: 'comments', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'comments_task_scope_fkey',
        columns: ['folder_id', 'task_id'],
        references: { table: 'tasks', columns: ['folder_id', 'id'] },
        onDelete: 'cascade',
        // Migration 0007: the pair holds (folder_id, task_id) against
        // tasks (folder_id, id), so neither side's UPDATE can go first
        // while the check is immediate and 7.6's move could not re-scope a
        // conversation. DEFERRABLE INITIALLY IMMEDIATE, so it still fires
        // per statement unless a transaction asks for the commit.
        deferrable: true,
        initiallyDeferred: false,
      },
    ],
    indexes: [
      {
        name: 'comments_thread_idx',
        unique: false,
        columns: ['folder_id', 'task_id', 'created_at'],
        partial: false,
      },
      { name: 'comments_parent_id_idx', unique: false, columns: ['parent_id'], partial: true },
    ],
  },
  comment_likes: {
    primaryKey: { name: 'comment_likes_pkey', columns: ['comment_id', 'user_id'] },
    uniques: [],
    checks: [],
    foreignKeys: [
      {
        name: 'comment_likes_comment_id_fkey',
        columns: ['comment_id'],
        references: { table: 'comments', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'comment_likes_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [],
  },
  comment_files: {
    primaryKey: { name: 'comment_files_pkey', columns: ['comment_id', 'file_id'] },
    uniques: [],
    checks: [],
    foreignKeys: [
      {
        name: 'comment_files_comment_id_fkey',
        columns: ['comment_id'],
        references: { table: 'comments', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'comment_files_file_id_fkey',
        columns: ['file_id'],
        references: { table: 'files', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      { name: 'comment_files_file_id_idx', unique: false, columns: ['file_id'], partial: false },
    ],
  },
  files: {
    primaryKey: { name: 'files_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      { name: 'files_bytes_positive_check', columns: ['bytes'] },
      // Issue #27, migration 0009. Both CHECK expressions name width, so
      // both column lists carry it; the header's rule sorts them.
      { name: 'files_dimensions_kind_check', columns: ['kind', 'width'] },
      { name: 'files_dimensions_pair_check', columns: ['height', 'width'] },
      { name: 'files_duration_voice_check', columns: ['duration_ms', 'kind'] },
      // Issues #20 and #100, migration 0012: which kinds may stand outside a
      // folder. The expression names folder_id and kind, so both are listed
      // and the header's rule sorts them.
      { name: 'files_folderless_kind_check', columns: ['folder_id', 'kind'] },
      { name: 'files_kind_check', columns: ['kind'] },
      { name: 'files_name_length_check', columns: ['name'] },
    ],
    foreignKeys: [
      {
        name: 'files_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'files_owner_id_fkey',
        columns: ['owner_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
    ],
    indexes: [
      { name: 'files_owner_id_idx', unique: false, columns: ['owner_id'], partial: false },
      { name: 'files_folder_id_idx', unique: false, columns: ['folder_id'], partial: true },
      // Issue #116, migration 0014: when a cover stopped being worn. Partial
      // on the mark, because the tick reads the marked rows and the unmarked
      // ones and never the rest of the table.
      {
        name: 'files_unreferenced_since_idx',
        unique: false,
        columns: ['unreferenced_since'],
        partial: true,
      },
    ],
  },
  page_blocks: {
    primaryKey: { name: 'page_blocks_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      { name: 'page_blocks_kind_check', columns: ['kind'] },
      { name: 'page_blocks_one_home_check', columns: ['folder_id', 'shelf_id'] },
      { name: 'page_blocks_text_length_check', columns: ['kind', 'text'] },
      { name: 'page_blocks_width_pct_kind_check', columns: ['kind', 'width_pct'] },
      { name: 'page_blocks_width_pct_range_check', columns: ['width_pct'] },
    ],
    foreignKeys: [
      {
        name: 'page_blocks_file_id_fkey',
        columns: ['file_id'],
        references: { table: 'files', columns: ['id'] },
        onDelete: 'set null',
      },
      {
        name: 'page_blocks_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'page_blocks_ref_folder_id_fkey',
        columns: ['ref_folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'page_blocks_shelf_id_fkey',
        columns: ['shelf_id'],
        references: { table: 'shelves', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      {
        name: 'page_blocks_folder_position_idx',
        unique: false,
        columns: ['folder_id', 'position'],
        partial: true,
      },
      {
        name: 'page_blocks_shelf_position_idx',
        unique: false,
        columns: ['shelf_id', 'position'],
        partial: true,
      },
      {
        name: 'page_blocks_ref_folder_id_idx',
        unique: false,
        columns: ['ref_folder_id'],
        partial: true,
      },
      { name: 'page_blocks_file_id_idx', unique: false, columns: ['file_id'], partial: true },
    ],
  },
  shelves: {
    primaryKey: { name: 'shelves_pkey', columns: ['id'] },
    uniques: [{ name: 'shelves_user_id_name_key', columns: ['user_id', 'name'] }],
    checks: [
      { name: 'shelves_color_format_check', columns: ['color'] },
      // Issues #20 and #100, migration 0012: 0006's folder cover columns
      // transcribed one object over, so a shelf can wear every tier a folder
      // can. The one-source CHECK names both columns.
      { name: 'shelves_cover_focal_y_range_check', columns: ['cover_focal_y'] },
      { name: 'shelves_cover_one_source_check', columns: ['cover_file_id', 'cover_preset'] },
      { name: 'shelves_cover_preset_format_check', columns: ['cover_preset'] },
      { name: 'shelves_description_length_check', columns: ['description'] },
      { name: 'shelves_name_length_check', columns: ['name'] },
    ],
    foreignKeys: [
      {
        name: 'shelves_cover_file_id_fkey',
        columns: ['cover_file_id'],
        references: { table: 'files', columns: ['id'] },
        onDelete: 'set null',
      },
      {
        name: 'shelves_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [],
  },
  user_views: {
    primaryKey: { name: 'user_views_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      { name: 'user_views_definition_object_check', columns: ['definition'] },
      { name: 'user_views_name_length_check', columns: ['name'] },
    ],
    foreignKeys: [
      {
        name: 'user_views_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      { name: 'user_views_user_id_idx', unique: false, columns: ['user_id'], partial: false },
    ],
  },
  user_page_covers: {
    primaryKey: { name: 'user_page_covers_pkey', columns: ['user_id', 'place'] },
    uniques: [],
    checks: [
      { name: 'user_page_covers_focal_y_range_check', columns: ['focal_y'] },
      { name: 'user_page_covers_one_source_check', columns: ['file_id', 'preset'] },
      { name: 'user_page_covers_place_check', columns: ['place'] },
      { name: 'user_page_covers_preset_format_check', columns: ['preset'] },
    ],
    foreignKeys: [
      {
        name: 'user_page_covers_file_id_fkey',
        columns: ['file_id'],
        references: { table: 'files', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'user_page_covers_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [],
  },
  sample_objects: {
    primaryKey: { name: 'sample_objects_pkey', columns: ['user_id', 'kind', 'id'] },
    uniques: [],
    checks: [{ name: 'sample_objects_kind_check', columns: ['kind'] }],
    foreignKeys: [
      {
        name: 'sample_objects_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [],
  },
  user_page_descriptions: {
    primaryKey: {
      name: 'user_page_descriptions_pkey',
      columns: ['user_id', 'place'],
    },
    uniques: [],
    checks: [
      { name: 'user_page_descriptions_length_check', columns: ['description'] },
      { name: 'user_page_descriptions_place_check', columns: ['place'] },
    ],
    foreignKeys: [
      {
        name: 'user_page_descriptions_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [],
  },
}
