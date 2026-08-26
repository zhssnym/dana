-- RFC 0005's expand migration: the six systems' tables (4.13 to 4.19), the
-- 4.3/4.5 column additions, the user_settings expansion, and the Inbox to
-- Desk data migration. Expand-only: no existing column changes shape.
--
-- Two rulings this file records rather than hides. comment_files realizes
-- 10.3's "Files per comment: 10", which 4.15's table text has no column for;
-- one comment binds up to ten files, and the join is the only shape that
-- stores that. notifications carries UNIQUE (user_id, event_id) because 11.7
-- requires each tick duty to be idempotent, and fan-out replayed after a
-- crash must land on the constraint, not on hope. Both are for the section 4
-- fold at Implemented.
--
-- The pinned-views fold (BUG-8) is deliberately absent: RFC 0005 requires
-- the show_* flags to fold into the pinned-views value in the same migration
-- that adds it, and the v1 server still binds those columns, so that
-- migration ships with S7's server switch (its acceptance line owns "one
-- record of visibility"). Adding the column here would keep two records of
-- one fact between packages, which the same sentence forbids.
CREATE TABLE events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  verb text NOT NULL,
  subject_kind text NOT NULL,
  subject_id uuid NOT NULL,
  subject_name text NOT NULL,
  folder_id uuid,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT events_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT events_verb_check CHECK (verb IN ('created', 'renamed', 'edited', 'moved', 'completed', 'reopened', 'abandoned', 'restored', 'duplicated', 'removed', 'deleted', 'left')),
  CONSTRAINT events_subject_kind_check CHECK (subject_kind IN ('task', 'folder', 'shelf', 'comment')),
  CONSTRAINT events_detail_length_check CHECK (char_length(detail) <= 200)
);
--> statement-breakpoint
CREATE INDEX events_folder_created_idx ON events (folder_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX events_subject_created_idx ON events (subject_kind, subject_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT notifications_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT notifications_user_event_key UNIQUE (user_id, event_id)
);
--> statement-breakpoint
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
--> statement-breakpoint
CREATE TABLE files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  folder_id uuid,
  kind text NOT NULL,
  name text NOT NULL,
  mime text NOT NULL,
  bytes integer NOT NULL,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT files_pkey PRIMARY KEY (id),
  CONSTRAINT files_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT files_kind_check CHECK (kind IN ('image', 'file', 'voice', 'cover', 'avatar')),
  CONSTRAINT files_name_length_check CHECK (char_length(name) BETWEEN 1 AND 300),
  CONSTRAINT files_bytes_positive_check CHECK (bytes > 0),
  CONSTRAINT files_duration_voice_check CHECK (duration_ms IS NULL OR kind = 'voice')
);
--> statement-breakpoint
CREATE INDEX files_owner_id_idx ON files (owner_id);
--> statement-breakpoint
CREATE INDEX files_folder_id_idx ON files (folder_id) WHERE folder_id IS NOT NULL;
--> statement-breakpoint
-- The pair unique lets comments carry a composite key to (folder_id, id),
-- the same belt-and-braces the assignee FK set the precedent for: a
-- comment's visibility scope cannot drift from its task's folder.
ALTER TABLE tasks ADD CONSTRAINT tasks_folder_id_id_key UNIQUE (folder_id, id);
--> statement-breakpoint
CREATE TABLE comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  task_id uuid,
  parent_id uuid,
  author_id uuid NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  CONSTRAINT comments_pkey PRIMARY KEY (id),
  CONSTRAINT comments_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT comments_task_scope_fkey FOREIGN KEY (folder_id, task_id) REFERENCES tasks(folder_id, id) ON DELETE CASCADE,
  CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT comments_body_length_check CHECK (char_length(body) <= 4000)
);
--> statement-breakpoint
CREATE INDEX comments_thread_idx ON comments (folder_id, task_id, created_at);
--> statement-breakpoint
CREATE INDEX comments_parent_id_idx ON comments (parent_id) WHERE parent_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE comment_likes (
  comment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_likes_pkey PRIMARY KEY (comment_id, user_id),
  CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE comment_files (
  comment_id uuid NOT NULL,
  file_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_files_pkey PRIMARY KEY (comment_id, file_id),
  CONSTRAINT comment_files_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT comment_files_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX comment_files_file_id_idx ON comment_files (file_id);
--> statement-breakpoint
CREATE TABLE shelves (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  icon text,
  color text,
  cover_file_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shelves_pkey PRIMARY KEY (id),
  CONSTRAINT shelves_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT shelves_cover_file_id_fkey FOREIGN KEY (cover_file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT shelves_user_id_name_key UNIQUE (user_id, name),
  CONSTRAINT shelves_name_length_check CHECK (char_length(name) BETWEEN 1 AND 40),
  CONSTRAINT shelves_color_format_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT shelves_description_length_check CHECK (char_length(description) <= 500)
);
--> statement-breakpoint
CREATE TABLE page_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid,
  shelf_id uuid,
  kind text NOT NULL,
  position integer NOT NULL,
  text text,
  file_id uuid,
  ref_folder_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_blocks_pkey PRIMARY KEY (id),
  CONSTRAINT page_blocks_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT page_blocks_shelf_id_fkey FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE,
  CONSTRAINT page_blocks_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT page_blocks_ref_folder_id_fkey FOREIGN KEY (ref_folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT page_blocks_one_home_check CHECK ((folder_id IS NULL) <> (shelf_id IS NULL)),
  CONSTRAINT page_blocks_kind_check CHECK (kind IN ('section', 'paragraph', 'image', 'folder_ref')),
  CONSTRAINT page_blocks_text_length_check CHECK ((kind <> 'section' OR char_length(text) BETWEEN 1 AND 120) AND (kind <> 'paragraph' OR char_length(text) <= 4000))
);
--> statement-breakpoint
CREATE INDEX page_blocks_folder_position_idx ON page_blocks (folder_id, position) WHERE folder_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX page_blocks_shelf_position_idx ON page_blocks (shelf_id, position) WHERE shelf_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX page_blocks_ref_folder_id_idx ON page_blocks (ref_folder_id) WHERE ref_folder_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX page_blocks_file_id_idx ON page_blocks (file_id) WHERE file_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE user_views (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  definition jsonb NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_views_pkey PRIMARY KEY (id),
  CONSTRAINT user_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_views_name_length_check CHECK (char_length(name) BETWEEN 1 AND 40),
  CONSTRAINT user_views_definition_object_check CHECK (jsonb_typeof(definition) = 'object')
);
--> statement-breakpoint
CREATE INDEX user_views_user_id_idx ON user_views (user_id);
--> statement-breakpoint
ALTER TABLE folders
  ADD COLUMN icon text,
  ADD COLUMN color text,
  ADD COLUMN cover_file_id uuid,
  ADD COLUMN description text,
  ADD COLUMN deleted_at timestamptz,
  ADD CONSTRAINT folders_cover_file_id_fkey FOREIGN KEY (cover_file_id) REFERENCES files(id) ON DELETE SET NULL,
  ADD CONSTRAINT folders_color_format_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT folders_description_length_check CHECK (char_length(description) <= 500);
--> statement-breakpoint
CREATE INDEX folders_deleted_at_idx ON folders (deleted_at) WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE tasks
  ADD COLUMN section_block_id uuid,
  ADD COLUMN deleted_at timestamptz,
  ADD CONSTRAINT tasks_section_block_id_fkey FOREIGN KEY (section_block_id) REFERENCES page_blocks(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX tasks_section_block_id_idx ON tasks (section_block_id) WHERE section_block_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX tasks_deleted_at_idx ON tasks (deleted_at) WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE user_settings
  ADD COLUMN row_density text NOT NULL DEFAULT 'comfortable',
  ADD COLUMN clock text NOT NULL DEFAULT '12h',
  ADD COLUMN theme text NOT NULL DEFAULT 'system',
  ADD COLUMN task_open text NOT NULL DEFAULT 'panel',
  ADD COLUMN sidebar_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN arrangements jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT user_settings_row_density_check CHECK (row_density IN ('comfortable', 'compact')),
  ADD CONSTRAINT user_settings_clock_check CHECK (clock IN ('12h', '24h')),
  ADD CONSTRAINT user_settings_theme_check CHECK (theme IN ('system', 'light', 'dark')),
  ADD CONSTRAINT user_settings_task_open_check CHECK (task_open IN ('dialog', 'panel', 'tab')),
  ADD CONSTRAINT user_settings_sidebar_order_array_check CHECK (jsonb_typeof(sidebar_order) = 'array'),
  ADD CONSTRAINT user_settings_arrangements_object_check CHECK (jsonb_typeof(arrangements) = 'object');
--> statement-breakpoint
UPDATE folders SET name = 'Desk' WHERE is_default AND name = 'Inbox';
