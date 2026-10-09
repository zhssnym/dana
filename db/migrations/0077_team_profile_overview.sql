ALTER TABLE folder_members
  ADD COLUMN bio_content jsonb,
  ADD COLUMN bio_author_id uuid,
  ADD COLUMN bio_last_editor_id uuid,
  ADD COLUMN bio_updated_at timestamptz,
  ADD CONSTRAINT folder_members_bio_author_id_fkey FOREIGN KEY (bio_author_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT folder_members_bio_last_editor_id_fkey FOREIGN KEY (bio_last_editor_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT folder_members_bio_content_requires_bio_check CHECK (bio_content IS NULL OR bio IS NOT NULL);
