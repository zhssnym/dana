ALTER TABLE users ADD COLUMN signup_source text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN signup_campaign text;
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_signup_source_length_check
  CHECK (char_length(signup_source) <= 100 AND char_length(signup_campaign) <= 100);
--> statement-breakpoint
CREATE TABLE feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  content jsonb NOT NULL,
  context jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  done_at timestamptz,
  CONSTRAINT feedback_pkey PRIMARY KEY (id),
  CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT feedback_kind_check CHECK (kind IN ('bug', 'idea', 'other'))
);
--> statement-breakpoint
CREATE INDEX feedback_created_at_idx ON feedback (created_at DESC);
--> statement-breakpoint
CREATE TABLE feedback_files (
  feedback_id uuid NOT NULL,
  file_id uuid NOT NULL,
  CONSTRAINT feedback_files_pkey PRIMARY KEY (feedback_id, file_id),
  CONSTRAINT feedback_files_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE,
  CONSTRAINT feedback_files_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX feedback_files_file_id_idx ON feedback_files (file_id);
