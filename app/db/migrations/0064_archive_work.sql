ALTER TABLE folders
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid,
  ADD COLUMN archived_with_folder_id uuid;
--> statement-breakpoint
ALTER TABLE folders
  ADD CONSTRAINT folders_archived_by_fkey
    FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT folders_archived_with_folder_id_fkey
    FOREIGN KEY (archived_with_folder_id) REFERENCES folders(id) ON DELETE SET NULL,
  ADD CONSTRAINT folders_archive_state_check
    CHECK (archived_at IS NOT NULL OR archived_by IS NULL),
  ADD CONSTRAINT folders_archived_with_check
    CHECK (archived_with_folder_id IS NULL OR archived_at IS NOT NULL),
  ADD CONSTRAINT folders_archive_trash_check
    CHECK (archived_at IS NULL OR deleted_at IS NULL);
--> statement-breakpoint
CREATE INDEX folders_archived_at_idx ON folders (archived_at DESC)
  WHERE archived_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX folders_archived_with_folder_id_idx ON folders (archived_with_folder_id)
  WHERE archived_with_folder_id IS NOT NULL;
--> statement-breakpoint
DROP INDEX folders_one_discussion_per_project_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX folders_one_discussion_per_project_idx
  ON folders (project_id)
  WHERE kind = 'discussion' AND deleted_at IS NULL AND archived_at IS NULL;
