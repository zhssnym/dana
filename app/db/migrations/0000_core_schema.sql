CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  google_sub text,
  email text,
  display_name text,
  avatar_url text,
  timezone text NOT NULL DEFAULT 'UTC',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_google_sub_key UNIQUE (google_sub),
  CONSTRAINT users_email_lower_check CHECK (email = lower(email)),
  CONSTRAINT users_display_name_length_check CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT users_avatar_url_length_check CHECK (char_length(avatar_url) <= 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX users_email_active_idx ON users (email) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE TABLE connections (
  user_a_id uuid NOT NULL,
  user_b_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connections_pkey PRIMARY KEY (user_a_id, user_b_id),
  CONSTRAINT connections_user_a_id_fkey FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT connections_user_b_id_fkey FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT connections_user_order_check CHECK (user_a_id < user_b_id)
);
--> statement-breakpoint
CREATE INDEX connections_user_b_id_idx ON connections (user_b_id);
--> statement-breakpoint
CREATE TABLE folders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folders_pkey PRIMARY KEY (id),
  CONSTRAINT folders_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT folders_name_length_check CHECK (char_length(name) BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX folders_one_default_per_owner_idx ON folders (owner_id) WHERE is_default;
--> statement-breakpoint
CREATE TABLE folder_members (
  folder_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  label text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folder_members_pkey PRIMARY KEY (folder_id, user_id),
  CONSTRAINT folder_members_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT folder_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT folder_members_role_check CHECK (role IN ('member')),
  CONSTRAINT folder_members_label_length_check CHECK (char_length(label) BETWEEN 1 AND 40),
  CONSTRAINT folder_members_color_format_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE INDEX folder_members_user_id_idx ON folder_members (user_id);
--> statement-breakpoint
CREATE TABLE tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  title text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  important boolean NOT NULL DEFAULT false,
  due_date date,
  due_time time,
  recurrence_rule text,
  series_id uuid,
  assignee_id uuid,
  created_by uuid NOT NULL,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT tasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES users(id),
  CONSTRAINT tasks_assignee_membership_fkey FOREIGN KEY (folder_id, assignee_id) REFERENCES folder_members (folder_id, user_id) ON DELETE SET NULL (assignee_id),
  CONSTRAINT tasks_title_length_check CHECK (char_length(title) BETWEEN 1 AND 300),
  CONSTRAINT tasks_notes_length_check CHECK (char_length(notes) <= 10000),
  CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'completed', 'abandoned')),
  CONSTRAINT tasks_due_time_requires_date_check CHECK (due_time IS NULL OR due_date IS NOT NULL),
  CONSTRAINT tasks_recurrence_requires_date_check CHECK (recurrence_rule IS NULL OR due_date IS NOT NULL),
  CONSTRAINT tasks_recurrence_rule_length_check CHECK (char_length(recurrence_rule) <= 200),
  CONSTRAINT tasks_recurrence_requires_series_check CHECK (recurrence_rule IS NULL OR series_id IS NOT NULL),
  CONSTRAINT tasks_completed_at_check CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT tasks_completed_by_check CHECK ((status = 'completed') = (completed_by IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX tasks_folder_status_due_idx ON tasks (folder_id, status, due_date);
--> statement-breakpoint
CREATE INDEX tasks_assignee_status_due_idx ON tasks (assignee_id, status, due_date);
--> statement-breakpoint
CREATE INDEX tasks_series_id_idx ON tasks (series_id) WHERE series_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX tasks_done_pagination_idx ON tasks (completed_at DESC, id DESC) WHERE status = 'completed';
--> statement-breakpoint
CREATE INDEX tasks_search_trgm_idx ON tasks USING gin (title gin_trgm_ops, notes gin_trgm_ops);
--> statement-breakpoint
CREATE TABLE steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT steps_pkey PRIMARY KEY (id),
  CONSTRAINT steps_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT steps_title_length_check CHECK (char_length(title) BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE INDEX steps_task_id_idx ON steps (task_id);
--> statement-breakpoint
CREATE TABLE my_day_entries (
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  added_on date NOT NULL,
  CONSTRAINT my_day_entries_pkey PRIMARY KEY (task_id, user_id),
  CONSTRAINT my_day_entries_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT my_day_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX my_day_entries_user_id_idx ON my_day_entries (user_id);
--> statement-breakpoint
CREATE TABLE reminders (
  task_id uuid NOT NULL,
  offset_minutes integer,
  time_of_day time,
  fire_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'scheduled',
  fired_at timestamptz,
  created_by uuid NOT NULL,
  CONSTRAINT reminders_pkey PRIMARY KEY (task_id),
  CONSTRAINT reminders_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT reminders_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT reminders_offset_range_check CHECK (offset_minutes BETWEEN 0 AND 10080),
  CONSTRAINT reminders_state_check CHECK (state IN ('scheduled', 'sent', 'skipped')),
  CONSTRAINT reminders_mode_check CHECK ((offset_minutes IS NULL) <> (time_of_day IS NULL))
);
--> statement-breakpoint
CREATE INDEX reminders_scheduled_fire_at_idx ON reminders (fire_at) WHERE state = 'scheduled';
--> statement-breakpoint
CREATE TABLE invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL,
  email text NOT NULL,
  folder_id uuid,
  task_id uuid,
  status text NOT NULL DEFAULT 'pending',
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invites_pkey PRIMARY KEY (id),
  CONSTRAINT invites_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES users(id),
  CONSTRAINT invites_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT invites_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  CONSTRAINT invites_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES users(id),
  CONSTRAINT invites_email_lower_check CHECK (email = lower(email)),
  CONSTRAINT invites_email_length_check CHECK (char_length(email) <= 320),
  CONSTRAINT invites_task_requires_folder_check CHECK (task_id IS NULL OR folder_id IS NOT NULL),
  CONSTRAINT invites_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'canceled', 'invalidated'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX invites_pending_uniq_idx ON invites (inviter_id, email, (COALESCE(folder_id, '00000000-0000-0000-0000-000000000000'::uuid))) WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX invites_pending_email_idx ON invites (email) WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX invites_inviter_id_idx ON invites (inviter_id);
--> statement-breakpoint
CREATE TABLE user_settings (
  user_id uuid NOT NULL,
  show_important boolean NOT NULL DEFAULT true,
  show_all boolean NOT NULL DEFAULT true,
  show_done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
