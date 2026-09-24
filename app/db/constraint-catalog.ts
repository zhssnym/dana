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
      /* Migration 0023, issue #228: the member's one durable Access preset,
         R8A's six and no seventh. `role` is left exactly as it was, admitting
         only 'member': ownership is folders.owner_id and Access is this
         column, and a third authority proxy is what #209 exists to remove. */
      { name: 'folder_members_access_check', columns: ['access'] },
      { name: 'folder_members_color_format_check', columns: ['color'] },
      /*
      **One membership column and one CHECK (issue #247).** `shelf_name` holds
      the viewer's own Shelf membership (4.4, held in step with `shelves.name`
      by 4.18); it was `label` until #208's Label model needed the word back.
      The move was expand and contract across two releases rather than a
      rename (11.5): Render waits for the new instance to pass health checks
      before draining the old one, so a rename leaves the old instance
      selecting a column that no longer exists for the length of a deploy.
      This catalog transcribes the schema that exists, so a row moves in the
      same commit as the migration that changes it. AC-479 asserts that one
      column is left and that nothing answers to the old name.
      */
      { name: 'folder_members_shelf_name_length_check', columns: ['shelf_name'] },
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
  /* Migration 0023, issue #228: R9's structured append-only Access transition
     record, and the authority for "what could this member do then, and who
     changed it". The generic events table renders a transition and is
     explicitly not the source of truth (R9 section 12).

     The two nullable Access columns mean different things -- previous NULL is
     first activation, new NULL is the end of active membership -- and the
     some_access CHECK refuses the row where both are null. It is written with
     IS NOT NULL rather than with a comparison, because a CHECK passes on
     UNKNOWN (docs/troubleshooting.md).

     actor_id is nullable only for the migration's own baseline rows, which
     the system_actor CHECK ties to that one transition kind. folder_id
     cascades because R9 section 15 keeps history exactly as long as the
     Folder; the two user references are RESTRICT on the
     tasks_created_by_fkey precedent, 8.10 scrubbing an account rather than
     deleting its row, and because SET NULL on actor_id would forge system
     provenance onto a transition a person made. */
  folder_access_history: {
    primaryKey: { name: 'folder_access_history_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      { name: 'folder_access_history_new_access_check', columns: ['new_access'] },
      { name: 'folder_access_history_previous_access_check', columns: ['previous_access'] },
      { name: 'folder_access_history_some_access_check', columns: ['new_access', 'previous_access'] },
      { name: 'folder_access_history_system_actor_check', columns: ['actor_id', 'transition'] },
      { name: 'folder_access_history_transition_check', columns: ['transition'] },
    ],
    foreignKeys: [
      {
        name: 'folder_access_history_actor_id_fkey',
        columns: ['actor_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'folder_access_history_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'folder_access_history_member_id_fkey',
        columns: ['member_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
    ],
    indexes: [
      {
        name: 'folder_access_history_folder_id_effective_at_idx',
        unique: false,
        columns: ['folder_id', 'effective_at'],
        partial: false,
      },
      {
        name: 'folder_access_history_member_id_effective_at_idx',
        unique: false,
        columns: ['member_id', 'effective_at'],
        partial: false,
      },
    ],
  },
  /* Migration 0027, issue #210: the Folder facet framework, spec 4.30. This
     entry and the migration must agree exactly, so they land together.

     Four of the seven CHECKs pair a nullable column with `kind`. AC-001
     asserts them by name and by the columns they mention and can see nothing
     of what the expressions do -- a CHECK fails only on FALSE, and UNKNOWN
     is as good as TRUE to it -- so the behavioural cases that try the bad
     rows are AC-831, AC-833 and AC-835.

     The two `users` keys are RESTRICT on 4.28's precedent: 8.10 scrubs an
     account rather than deleting its row, so a CASCADE would fire never
     while looking like the cleanup. `h1_block_id` is CASCADE, a reading past
     #210's words that the migration states.

     Two of the three indexes are UNIQUE and partial, and the difference
     between their predicates is the whole design: the native one is partial
     on `kind` and **not** on `deleted_at`, because a native is hidden rather
     than deleted; the H1 one is partial on `deleted_at IS NULL` for 4.28's
     leave-and-rejoin reason. */
  folder_facets: {
    primaryKey: { name: 'folder_facets_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      {
        name: 'folder_facets_display_name_kind_check',
        columns: ['display_name', 'kind'],
      },
      {
        name: 'folder_facets_display_name_length_check',
        columns: ['display_name'],
      },
      { name: 'folder_facets_h1_kind_check', columns: ['h1_block_id', 'kind'] },
      { name: 'folder_facets_hidden_kind_check', columns: ['hidden', 'kind'] },
      { name: 'folder_facets_kind_check', columns: ['kind'] },
      { name: 'folder_facets_owner_kind_check', columns: ['kind', 'owner_id'] },
      { name: 'folder_facets_position_format_check', columns: ['position'] },
    ],
    foreignKeys: [
      {
        name: 'folder_facets_created_by_fkey',
        columns: ['created_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'folder_facets_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'folder_facets_h1_block_id_fkey',
        columns: ['h1_block_id'],
        references: { table: 'page_blocks', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'folder_facets_owner_id_fkey',
        columns: ['owner_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
    ],
    indexes: [
      {
        name: 'folder_facets_folder_id_position_idx',
        unique: false,
        columns: ['folder_id', 'position', 'id'],
        partial: true,
      },
      {
        name: 'folder_facets_folder_native_kind_idx',
        unique: true,
        columns: ['folder_id', 'kind'],
        partial: true,
      },
      {
        name: 'folder_facets_h1_block_id_idx',
        unique: true,
        columns: ['h1_block_id'],
        partial: true,
      },
      {
        name: 'folder_facets_owner_id_idx',
        unique: false,
        columns: ['owner_id'],
        partial: true,
      },
    ],
  },
  /* Migration 0025, issue #230: the current Responsibility document, one row
     per membership generation (#209 R5, R10).

     The uniqueness that matters is the partial index rather than a
     constraint: one *active* document per (folder, member), active meaning
     ended_at IS NULL. That single index carries the leave/rejoin rule. Ending
     a membership stamps ended_at, which both stops the row being the current
     document and frees the pair, so a rejoin starts from nothing and no old
     content silently reactivates; the ended row and its revisions stay where
     they are, which is the other half of the same rule.

     There is no `ended_by` beside `ended_at`: who ended a standing is on the
     `responsibility_ended` entry, which is the record and therefore the
     authority, and a copy here could only ever drift from it. folder_id
     cascades because a permanent Folder purge takes the Responsibility with
     it under the Folder's own retention lifecycle; the two user references
     are RESTRICT on folder_access_history's precedent, 8.10 scrubbing an
     account rather than deleting its row, and because SET NULL would forge a
     different historical actor onto a document a person wrote. */
  folder_responsibilities: {
    primaryKey: { name: 'folder_responsibilities_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      {
        name: 'folder_responsibilities_current_revision_no_check',
        columns: ['current_revision_no'],
      },
    ],
    foreignKeys: [
      {
        name: 'folder_responsibilities_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'folder_responsibilities_member_id_fkey',
        columns: ['member_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'folder_responsibilities_updated_by_fkey',
        columns: ['updated_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
    ],
    indexes: [
      {
        name: 'folder_responsibilities_folder_id_member_id_active_idx',
        unique: true,
        columns: ['folder_id', 'member_id'],
        partial: true,
      },
      {
        name: 'folder_responsibilities_member_id_idx',
        unique: false,
        columns: ['member_id'],
        partial: false,
      },
    ],
  },
  /* Migration 0025, issue #230: the append-only Responsibility record. Its
     content-bearing rows are R10's immutable revisions; the other two kinds
     record the standing changes #230 requires to be history-visible.

     The revision CHECK is the one worth reading. Every clause is IS NULL, IS
     NOT NULL or an IN over a NOT NULL column, so none of them can yield
     UNKNOWN, which a CHECK would pass (issue #27). AC-001 asserts this
     constraint by name and by the columns it mentions and can see nothing of
     what it does, so the behavioural case that tries the bad row is AC-560.

     The partial unique index over (responsibility_id, revision_no) is what
     makes "one revision per number per document" a database fact rather than
     an application convention, and it is what the current-document row's
     current_revision_no points into. */
  folder_responsibility_history: {
    primaryKey: { name: 'folder_responsibility_history_pkey', columns: ['id'] },
    uniques: [],
    checks: [
      {
        name: 'folder_responsibility_history_document_check',
        columns: ['responsibility_id', 'transition'],
      },
      {
        name: 'folder_responsibility_history_revision_check',
        columns: ['content', 'content_hash', 'revision_no', 'transition'],
      },
      {
        name: 'folder_responsibility_history_transition_check',
        columns: ['transition'],
      },
    ],
    foreignKeys: [
      {
        name: 'folder_responsibility_history_actor_id_fkey',
        columns: ['actor_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'folder_responsibility_history_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'folder_responsibility_history_member_id_fkey',
        columns: ['member_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'folder_responsibility_history_responsibility_id_fkey',
        columns: ['responsibility_id'],
        references: { table: 'folder_responsibilities', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      {
        name: 'folder_responsibility_history_folder_id_effective_at_idx',
        unique: false,
        columns: ['folder_id', 'effective_at'],
        partial: false,
      },
      {
        name: 'folder_responsibility_history_member_id_effective_at_idx',
        unique: false,
        columns: ['member_id', 'effective_at'],
        partial: false,
      },
      {
        name: 'folder_responsibility_history_revision_no_idx',
        unique: true,
        columns: ['responsibility_id', 'revision_no'],
        partial: true,
      },
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
      { name: 'tasks_page_position_format_check', columns: ['page_position'] },
      { name: 'tasks_position_format_check', columns: ['position'] },
      { name: 'tasks_recurrence_requires_date_check', columns: ['due_date', 'recurrence_rule'] },
      { name: 'tasks_recurrence_requires_series_check', columns: ['recurrence_rule', 'series_id'] },
      { name: 'tasks_recurrence_rule_length_check', columns: ['recurrence_rule'] },
      { name: 'tasks_start_before_due_check', columns: ['due_date', 'start_date'] },
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
      {
        name: 'tasks_folder_page_position_idx',
        unique: false,
        columns: ['folder_id', 'page_position', 'id'],
        partial: false,
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
      /* Migration 0023, issue #228: the intended Access preset a pending
         Folder invite carries (R9 section 5). The second check is
         both-or-neither in its IS NULL form, which always yields a real
         boolean; a folderless roster invite grants no Folder Access and so
         carries no preset. */
      { name: 'invites_access_check', columns: ['access'] },
      { name: 'invites_access_requires_folder_check', columns: ['access', 'folder_id'] },
      { name: 'invites_email_length_check', columns: ['email'] },
      /* Migration 0025, issue #230: the optional initial Responsibility
         content an authorized inviter may attach. Tied to a folder invite for
         the same reason `access` is -- a folderless roster invite creates no
         Folder standing for a Responsibility to belong to. */
      { name: 'invites_responsibility_requires_folder_check', columns: ['folder_id', 'responsibility'] },
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
      /* Migration 0013, issues #140 and #142: the calendar's zoom is a durable
         account preference, and its three values are 9.5's. AC-001 sees this
         line as a name over a column; AC-380 is what sees the expression. */
      { name: 'user_settings_calendar_zoom_check', columns: ['calendar_zoom'] },
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
    checks: [
      { name: 'comments_body_length_check', columns: ['body'] },
      // Migration 0029 (#320): never both Task- and Discussion-scoped.
      { name: 'comments_one_scope_check', columns: ['discussion_id', 'task_id'] },
    ],
    foreignKeys: [
      {
        name: 'comments_author_id_fkey',
        columns: ['author_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        // Migration 0029: a comment's Discussion is in the comment's Folder.
        name: 'comments_discussion_scope_fkey',
        columns: ['folder_id', 'discussion_id'],
        references: { table: 'discussions', columns: ['folder_id', 'id'] },
        onDelete: 'cascade',
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
      {
        name: 'comments_discussion_thread_idx',
        unique: false,
        columns: ['discussion_id', 'created_at'],
        partial: true,
      },
      // Migration 0029: the legacy Folder thread's stray sweep (4.31).
      {
        name: 'comments_unfiled_folder_idx',
        unique: false,
        columns: ['folder_id'],
        partial: true,
      },
    ],
  },
  // Migration 0029 (#320): Consultation Discussions and their Outcomes.
  discussions: {
    primaryKey: { name: 'discussions_pkey', columns: ['id'] },
    uniques: [{ name: 'discussions_folder_id_id_key', columns: ['folder_id', 'id'] }],
    checks: [
      { name: 'discussions_context_length_check', columns: ['context'] },
      {
        name: 'discussions_resolution_check',
        columns: ['current_outcome_id', 'resolved_at', 'state'],
      },
      { name: 'discussions_state_check', columns: ['state'] },
      { name: 'discussions_title_length_check', columns: ['title'] },
    ],
    foreignKeys: [
      {
        name: 'discussions_created_by_fkey',
        columns: ['created_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        // NO ACTION, not RESTRICT: the two tables reference each other and a
        // folder purge cascades to both inside one statement.
        name: 'discussions_current_outcome_fkey',
        columns: ['id', 'current_outcome_id'],
        references: { table: 'discussion_outcomes', columns: ['discussion_id', 'id'] },
        onDelete: 'no action',
      },
      {
        name: 'discussions_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'discussions_resolved_by_fkey',
        columns: ['resolved_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
    ],
    indexes: [
      {
        name: 'discussions_folder_activity_idx',
        unique: false,
        columns: ['folder_id', 'last_activity_at', 'id'],
        partial: true,
        descColumns: ['last_activity_at', 'id'],
      },
      {
        // At most one open, untrashed General discussion per Folder: the
        // legacy Folder thread's write target (4.31).
        name: 'discussions_one_open_general_key',
        unique: true,
        columns: ['folder_id'],
        partial: true,
      },
    ],
  },
  discussion_outcomes: {
    primaryKey: { name: 'discussion_outcomes_pkey', columns: ['id'] },
    uniques: [
      { name: 'discussion_outcomes_discussion_id_id_key', columns: ['discussion_id', 'id'] },
    ],
    checks: [{ name: 'discussion_outcomes_statement_length_check', columns: ['statement'] }],
    foreignKeys: [
      {
        name: 'discussion_outcomes_actor_id_fkey',
        columns: ['actor_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'discussion_outcomes_discussion_id_fkey',
        columns: ['discussion_id'],
        references: { table: 'discussions', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        // The Outcome is a snapshot; its source comment may go.
        name: 'discussion_outcomes_source_comment_id_fkey',
        columns: ['source_comment_id'],
        references: { table: 'comments', columns: ['id'] },
        onDelete: 'set null',
      },
    ],
    indexes: [
      {
        name: 'discussion_outcomes_source_comment_id_idx',
        unique: false,
        columns: ['source_comment_id'],
        partial: true,
      },
    ],
  },
  // Migration 0030 (#321): Consultation structured input rounds.
  discussion_input_rounds: {
    primaryKey: { name: 'discussion_input_rounds_pkey', columns: ['id'] },
    uniques: [{ name: 'discussion_input_rounds_id_mode_key', columns: ['id', 'mode'] }],
    checks: [
      { name: 'discussion_input_rounds_close_reason_check', columns: ['close_reason'] },
      {
        name: 'discussion_input_rounds_closure_check',
        columns: ['close_reason', 'closed_at', 'state'],
      },
      { name: 'discussion_input_rounds_mode_check', columns: ['mode'] },
      { name: 'discussion_input_rounds_prompt_length_check', columns: ['prompt'] },
      { name: 'discussion_input_rounds_state_check', columns: ['state'] },
    ],
    foreignKeys: [
      {
        name: 'discussion_input_rounds_closed_by_fkey',
        columns: ['closed_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'discussion_input_rounds_created_by_fkey',
        columns: ['created_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'discussion_input_rounds_discussion_id_fkey',
        columns: ['discussion_id'],
        references: { table: 'discussions', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      {
        name: 'discussion_input_rounds_discussion_idx',
        unique: false,
        columns: ['discussion_id', 'created_at'],
        partial: false,
      },
      {
        // At most one open round per Discussion (#321).
        name: 'discussion_input_rounds_one_open_key',
        unique: true,
        columns: ['discussion_id'],
        partial: true,
      },
    ],
  },
  discussion_input_options: {
    primaryKey: { name: 'discussion_input_options_pkey', columns: ['id'] },
    uniques: [
      { name: 'discussion_input_options_round_id_id_key', columns: ['round_id', 'id'] },
      {
        name: 'discussion_input_options_round_id_position_key',
        columns: ['round_id', 'position'],
      },
    ],
    checks: [
      { name: 'discussion_input_options_label_length_check', columns: ['label'] },
      { name: 'discussion_input_options_position_check', columns: ['position'] },
    ],
    foreignKeys: [
      {
        name: 'discussion_input_options_round_id_fkey',
        columns: ['round_id'],
        references: { table: 'discussion_input_rounds', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [],
  },
  discussion_input_responses: {
    primaryKey: { name: 'discussion_input_responses_pkey', columns: ['id'] },
    uniques: [
      {
        name: 'discussion_input_responses_round_id_user_id_key',
        columns: ['round_id', 'user_id'],
      },
    ],
    checks: [
      { name: 'discussion_input_responses_body_length_check', columns: ['body'] },
      { name: 'discussion_input_responses_concern_check', columns: ['concern'] },
      {
        name: 'discussion_input_responses_shape_check',
        columns: ['body', 'concern', 'mode', 'option_id'],
      },
    ],
    foreignKeys: [
      {
        name: 'discussion_input_responses_option_fkey',
        columns: ['round_id', 'option_id'],
        references: { table: 'discussion_input_options', columns: ['round_id', 'id'] },
        onDelete: 'cascade',
      },
      {
        name: 'discussion_input_responses_round_mode_fkey',
        columns: ['round_id', 'mode'],
        references: { table: 'discussion_input_rounds', columns: ['id', 'mode'] },
        onDelete: 'cascade',
      },
      {
        name: 'discussion_input_responses_user_id_fkey',
        columns: ['user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
    ],
    indexes: [],
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
      //
      // Both of the next two were widened in place by migration 0024 (#220):
      // `files_kind_check` gained `audio` and `video`, and the folder-less one
      // gained `file`, `audio` and `video`, leaving `voice` as the only kind
      // that still requires a folder. **Neither name nor either column list
      // moved, so neither row here changes** — this catalog sees names and
      // columns, never what an expression admits. AC-490 to AC-507 are the
      // behavioural cases that can.
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
      { name: 'page_blocks_rich_content_check', columns: ['kind', 'rich_content'] },
      { name: 'page_blocks_kind_check', columns: ['kind'] },
      /* #219's two new CHECKs. A checklist item is the only kind that carries a
         tick, and it always carries one; every other kind carries none, which
         is one equality rather than two nullable comparisons (a CHECK passes
         on UNKNOWN, so a nullable comparison can admit what it meant to
         refuse). A list parent belongs
         only to a list item on a folder page, and never to itself. */
      { name: 'page_blocks_checked_kind_check', columns: ['checked', 'kind'] },
      {
        name: 'page_blocks_list_parent_kind_check',
        columns: ['facet_id', 'folder_id', 'id', 'kind', 'list_parent_block_id'],
      },
      /* Migration 0027 (#210) dropped and re-added this under the same name
         over `num_nonnulls(folder_id, shelf_id, facet_id) = 1`, so the
         column list gains `facet_id` and the name does not move. A strictly
         larger admitted set: every existing row has exactly one of the two
         old homes and a null `facet_id`, so no backfill was needed. AC-836
         is the behavioural case -- a facet's blocks carry `facet_id` and
         never `folder_id`, and no Task row ever belongs to a facet. */
      /* Migration 0031 (#221) re-added it once more under the same name over
         `num_nonnulls(folder_id, shelf_id, facet_id, task_id) = 1`: the
         fourth home is a Task's document. */
      {
        name: 'page_blocks_one_home_check',
        columns: ['facet_id', 'folder_id', 'shelf_id', 'task_id'],
      },
      { name: 'page_blocks_page_position_format_check', columns: ['page_position'] },
      {
        name: 'page_blocks_section_membership_check',
        columns: ['folder_id', 'section_block_id'],
      },
      { name: 'page_blocks_text_length_check', columns: ['kind', 'text'] },
      /* Migration 0024 (#220) widened both of these in place and moved
         neither: `page_blocks_kind_check` above gained `file`, `audio` and
         `video`, and the width check below gained `video` beside `image`,
         because R1 extends the restrained centred width to previewable video
         and to nothing else. Same names, same columns, so this catalog is
         unchanged and only a behavioural case can see the difference. */
      { name: 'page_blocks_width_pct_kind_check', columns: ['kind', 'width_pct'] },
      { name: 'page_blocks_width_pct_range_check', columns: ['width_pct'] },
    ],
    foreignKeys: [
      /* Migration 0027 (#210): the third home. CASCADE because a facet's
         document is the facet's -- deleting the facet row permanently takes
         its blocks with it, exactly as a folder's does. */
      {
        name: 'page_blocks_facet_id_fkey',
        columns: ['facet_id'],
        references: { table: 'folder_facets', columns: ['id'] },
        onDelete: 'cascade',
      },
      /* Migration 0031 (#221): a Task's document. CASCADE, because purging
         the Task takes its document; trashing it stamps `deleted_at` and
         touches no block. */
      {
        name: 'page_blocks_task_id_fkey',
        columns: ['task_id'],
        references: { table: 'tasks', columns: ['id'] },
        onDelete: 'cascade',
      },
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
      {
        name: 'page_blocks_section_block_id_fkey',
        columns: ['section_block_id'],
        references: { table: 'page_blocks', columns: ['id'] },
        onDelete: 'set null',
      },
      /* #219's list nesting, a second and independent self-reference. Set null
         rather than cascade for the same reason the Section one is: removing a
         list parent promotes the writing underneath it, never deletes it. */
      {
        name: 'page_blocks_list_parent_block_id_fkey',
        columns: ['list_parent_block_id'],
        references: { table: 'page_blocks', columns: ['id'] },
        onDelete: 'set null',
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
        name: 'page_blocks_folder_page_position_idx',
        unique: false,
        columns: ['folder_id', 'page_position', 'id'],
        partial: true,
      },
      {
        name: 'page_blocks_shelf_page_position_idx',
        unique: false,
        columns: ['shelf_id', 'page_position', 'id'],
        partial: true,
      },
      {
        name: 'page_blocks_section_block_id_idx',
        unique: false,
        columns: ['section_block_id'],
        partial: true,
      },
      {
        name: 'page_blocks_list_parent_block_id_idx',
        unique: false,
        columns: ['list_parent_block_id'],
        partial: true,
      },
      {
        name: 'page_blocks_ref_folder_id_idx',
        unique: false,
        columns: ['ref_folder_id'],
        partial: true,
      },
      { name: 'page_blocks_file_id_idx', unique: false, columns: ['file_id'], partial: true },
      /* Migration 0027 (#210), mirroring `page_blocks_folder_page_position_idx`
         above for the third home: one facet document in page order. */
      {
        name: 'page_blocks_facet_page_position_idx',
        unique: false,
        columns: ['facet_id', 'page_position', 'id'],
        partial: true,
      },
      /* Migration 0031 (#221): one Task document in page order. */
      {
        name: 'page_blocks_task_page_position_idx',
        unique: false,
        columns: ['task_id', 'page_position', 'id'],
        partial: true,
      },
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
  /* Migration 0032, issue #221: the Shelf-keyed sibling of
     page_document_receipts. No actor column, because a Shelf is one
     person's (4.18); the receipts go with the Shelf. */
  shelf_document_receipts: {
    primaryKey: { name: 'shelf_document_receipts_pkey', columns: ['shelf_id', 'mutation_id'] },
    uniques: [],
    checks: [],
    foreignKeys: [
      {
        name: 'shelf_document_receipts_shelf_id_fkey',
        columns: ['shelf_id'],
        references: { table: 'shelves', columns: ['id'] },
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
  page_document_receipts: {
    primaryKey:{name:'page_document_receipts_pkey',columns:['actor_id','folder_id','mutation_id']},
    uniques:[],checks:[],indexes:[],
    foreignKeys:[
      {name:'page_document_receipts_actor_id_fkey',columns:['actor_id'],references:{table:'users',columns:['id']},onDelete:'cascade'},
      {name:'page_document_receipts_folder_id_fkey',columns:['folder_id'],references:{table:'folders',columns:['id']},onDelete:'cascade'},
    ],
  },
  /* Migration 0019, issue #224: one directed row, dependent depends on
     blocking, and "blocks" is the same row read from the other end. The
     surrogate primary key is what lets an edge whose far task the viewer
     cannot read be named for removal without handing back that task's id; the
     pair unique is the relation's real identity, and its own index is what
     every depends_on read leads with. The self-edge CHECK is the one cycle a
     constraint can see — every longer one is the domain module's, before the
     write. Both endpoints cascade so that a permanent delete takes the
     relations and a soft delete leaves them standing. */
  task_dependencies: {
    primaryKey: { name: 'task_dependencies_pkey', columns: ['id'] },
    uniques: [
      {
        name: 'task_dependencies_pair_key',
        columns: ['dependent_task_id', 'blocking_task_id'],
      },
    ],
    checks: [
      {
        name: 'task_dependencies_no_self_edge_check',
        columns: ['blocking_task_id', 'dependent_task_id'],
      },
    ],
    foreignKeys: [
      {
        name: 'task_dependencies_blocking_task_id_fkey',
        columns: ['blocking_task_id'],
        references: { table: 'tasks', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'task_dependencies_created_by_fkey',
        columns: ['created_by'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
      {
        name: 'task_dependencies_dependent_task_id_fkey',
        columns: ['dependent_task_id'],
        references: { table: 'tasks', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      {
        name: 'task_dependencies_blocking_task_id_idx',
        unique: false,
        columns: ['blocking_task_id'],
        partial: false,
      },
    ],
  },
  /*
  The M1 Label model, migration 0022 (issue #226, parent #208).

  Two scopes and no third, and the two composite uniques below are the whole
  reason the cross-scope invariants are the database's rather than the
  handlers'. `labels_id_owner_user_id_key` is what the two personal
  assignment tables' composite foreign keys point at, so a row can never name
  a Label somebody else owns; `labels_folder_id_id_key` is what
  `task_folder_labels` points at, so a Folder Label from Folder A on a Task in
  Folder B is a row the database will not store.

  The two unique indexes are partial because each names one catalog, and the
  other scope's key column is NULL on every row of it; the expression member
  `lower(name)` appears as 'expr' under this file's shape rules.
  */
  labels: {
    primaryKey: { name: 'labels_pkey', columns: ['id'] },
    uniques: [
      { name: 'labels_folder_id_id_key', columns: ['folder_id', 'id'] },
      { name: 'labels_id_owner_user_id_key', columns: ['id', 'owner_user_id'] },
    ],
    checks: [
      { name: 'labels_color_format_check', columns: ['color'] },
      { name: 'labels_description_length_check', columns: ['description'] },
      { name: 'labels_name_length_check', columns: ['name'] },
      {
        name: 'labels_ownership_check',
        columns: ['folder_id', 'owner_user_id', 'scope'],
      },
      { name: 'labels_scope_check', columns: ['scope'] },
    ],
    foreignKeys: [
      {
        name: 'labels_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'labels_owner_user_id_fkey',
        columns: ['owner_user_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      {
        name: 'labels_folder_name_idx',
        unique: true,
        columns: ['folder_id', 'expr'],
        partial: true,
      },
      {
        name: 'labels_personal_name_idx',
        unique: true,
        columns: ['owner_user_id', 'expr'],
        partial: true,
      },
    ],
  },
  task_personal_labels: {
    primaryKey: {
      name: 'task_personal_labels_pkey',
      columns: ['task_id', 'label_id'],
    },
    uniques: [],
    checks: [],
    foreignKeys: [
      {
        name: 'task_personal_labels_label_scope_fkey',
        columns: ['label_id', 'owner_user_id'],
        references: { table: 'labels', columns: ['id', 'owner_user_id'] },
        onDelete: 'cascade',
      },
      {
        name: 'task_personal_labels_task_id_fkey',
        columns: ['task_id'],
        references: { table: 'tasks', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      {
        name: 'task_personal_labels_label_id_idx',
        unique: false,
        columns: ['label_id'],
        partial: false,
      },
    ],
  },
  folder_personal_labels: {
    primaryKey: {
      name: 'folder_personal_labels_pkey',
      columns: ['folder_id', 'label_id'],
    },
    uniques: [],
    checks: [],
    foreignKeys: [
      {
        name: 'folder_personal_labels_folder_id_fkey',
        columns: ['folder_id'],
        references: { table: 'folders', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        name: 'folder_personal_labels_label_scope_fkey',
        columns: ['label_id', 'owner_user_id'],
        references: { table: 'labels', columns: ['id', 'owner_user_id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      {
        name: 'folder_personal_labels_label_id_idx',
        unique: false,
        columns: ['label_id'],
        partial: false,
      },
    ],
  },
  task_folder_labels: {
    primaryKey: {
      name: 'task_folder_labels_pkey',
      columns: ['task_id', 'label_id'],
    },
    uniques: [],
    checks: [],
    foreignKeys: [
      {
        name: 'task_folder_labels_label_scope_fkey',
        columns: ['folder_id', 'label_id'],
        references: { table: 'labels', columns: ['folder_id', 'id'] },
        onDelete: 'cascade',
      },
      {
        name: 'task_folder_labels_task_scope_fkey',
        columns: ['folder_id', 'task_id'],
        references: { table: 'tasks', columns: ['folder_id', 'id'] },
        onDelete: 'cascade',
      },
    ],
    indexes: [
      {
        name: 'task_folder_labels_label_idx',
        unique: false,
        columns: ['folder_id', 'label_id'],
        partial: false,
      },
    ],
  },
}
