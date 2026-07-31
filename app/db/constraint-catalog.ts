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
appear as the literal string 'expr' (pg_index.indkey holds 0 there). "partial" means pg_index.indpred is set;
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
    checks: [{ name: 'folders_name_length_check', columns: ['name'] }],
    foreignKeys: [
      {
        name: 'folders_owner_id_fkey',
        columns: ['owner_id'],
        references: { table: 'users', columns: ['id'] },
        onDelete: 'restrict',
      },
    ],
    indexes: [
      { name: 'folders_one_default_per_owner_idx', unique: true, columns: ['owner_id'], partial: true },
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
    uniques: [],
    checks: [
      { name: 'tasks_completed_at_check', columns: ['completed_at', 'status'] },
      { name: 'tasks_completed_by_check', columns: ['completed_by', 'status'] },
      { name: 'tasks_due_time_requires_date_check', columns: ['due_date', 'due_time'] },
      { name: 'tasks_notes_length_check', columns: ['notes'] },
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
    checks: [],
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
}
