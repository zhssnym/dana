CREATE TABLE profile_doc_migrations (
  source_project_id uuid NOT NULL,
  source_member_id uuid NOT NULL,
  source_area text NOT NULL,
  root_folder_id uuid,
  source_revision integer NOT NULL,
  source_content jsonb NOT NULL,
  source_updated_at timestamptz,
  source_updated_by uuid,
  migrated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_doc_migrations_pkey
    PRIMARY KEY (source_project_id, source_member_id, source_area),
  CONSTRAINT profile_doc_migrations_root_fkey
    FOREIGN KEY (root_folder_id) REFERENCES folders(id) ON DELETE SET NULL,
  CONSTRAINT profile_doc_migrations_editor_fkey
    FOREIGN KEY (source_updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT profile_doc_migrations_area_check
    CHECK (source_area IN ('project', 'shared')),
  CONSTRAINT profile_doc_migrations_revision_check
    CHECK (source_revision >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX profile_doc_migrations_root_idx
  ON profile_doc_migrations (root_folder_id)
  WHERE root_folder_id IS NOT NULL;
