CREATE TABLE profile_doc_roots (
  root_folder_id uuid NOT NULL,
  profile_user_id uuid NOT NULL,
  custody_project_id uuid,
  audience_project_id uuid,
  audience text NOT NULL DEFAULT 'only_me',
  tab_position text COLLATE "C" NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_doc_roots_pkey PRIMARY KEY (root_folder_id),
  CONSTRAINT profile_doc_roots_root_fkey FOREIGN KEY (root_folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT profile_doc_roots_person_fkey FOREIGN KEY (profile_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT profile_doc_roots_custody_fkey FOREIGN KEY (custody_project_id) REFERENCES folders(id) ON DELETE RESTRICT,
  CONSTRAINT profile_doc_roots_audience_project_fkey FOREIGN KEY (audience_project_id) REFERENCES folders(id) ON DELETE SET NULL,
  CONSTRAINT profile_doc_roots_audience_check CHECK (audience IN ('only_me', 'project_members', 'selected_people')),
  CONSTRAINT profile_doc_roots_custody_audience_check CHECK (custody_project_id IS NULL OR audience <> 'only_me'),
  CONSTRAINT profile_doc_roots_position_check CHECK (tab_position ~ '^[0-9A-Za-z]{2,255}$')
);
--> statement-breakpoint
CREATE INDEX profile_doc_roots_person_position_idx
  ON profile_doc_roots (profile_user_id, tab_position, root_folder_id);
--> statement-breakpoint
CREATE INDEX profile_doc_roots_audience_project_idx
  ON profile_doc_roots (audience_project_id) WHERE audience = 'project_members';
--> statement-breakpoint
CREATE TABLE profile_doc_grants (
  root_folder_id uuid NOT NULL,
  user_id uuid NOT NULL,
  may_edit boolean NOT NULL DEFAULT false,
  CONSTRAINT profile_doc_grants_pkey PRIMARY KEY (root_folder_id, user_id),
  CONSTRAINT profile_doc_grants_root_fkey FOREIGN KEY (root_folder_id) REFERENCES profile_doc_roots(root_folder_id) ON DELETE CASCADE,
  CONSTRAINT profile_doc_grants_user_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX profile_doc_grants_user_idx ON profile_doc_grants (user_id, root_folder_id);
--> statement-breakpoint
CREATE VIEW visible_folder_members AS
SELECT DISTINCT ON (folder_id, user_id)
       folder_id, user_id, access, shelf_name, color
  FROM (
    SELECT m.folder_id, m.user_id, m.access, m.shelf_name, m.color, 0 AS priority
      FROM folder_members m
     WHERE NOT EXISTS (SELECT 1 FROM profile_doc_roots r WHERE r.root_folder_id = m.folder_id)
    UNION ALL
    SELECT r.root_folder_id, r.profile_user_id, 'full_control'::text, NULL::text, NULL::text, 0
      FROM profile_doc_roots r JOIN folders f ON f.id = r.root_folder_id
     WHERE r.custody_project_id IS NULL
    UNION ALL
    SELECT r.root_folder_id, m.user_id, 'full_control'::text, NULL::text, NULL::text, 0
      FROM profile_doc_roots r
      JOIN folders f ON f.id = r.root_folder_id
      JOIN folders p ON p.id = r.custody_project_id AND p.deleted_at IS NULL AND p.archived_at IS NULL
      JOIN folder_members m ON m.folder_id = p.id AND m.access = 'full_control'
    UNION ALL
    SELECT r.root_folder_id, p.owner_id, 'can_view'::text, NULL::text, NULL::text, 2
      FROM profile_doc_roots r
      JOIN folders f ON f.id = r.root_folder_id
      JOIN folders p ON p.id = r.custody_project_id AND p.deleted_at IS NULL AND p.archived_at IS NULL
    UNION ALL
    SELECT r.root_folder_id, m.user_id, 'can_view'::text, NULL::text, NULL::text, 2
      FROM profile_doc_roots r
      JOIN folders f ON f.id = r.root_folder_id
      JOIN folders p ON p.id = r.audience_project_id AND p.deleted_at IS NULL AND p.archived_at IS NULL
      JOIN folder_members m ON m.folder_id = p.id
     WHERE r.audience = 'project_members'
    UNION ALL
    SELECT r.root_folder_id, g.user_id,
           CASE WHEN g.may_edit THEN 'can_edit' ELSE 'can_view' END,
           NULL::text, NULL::text, CASE WHEN g.may_edit THEN 1 ELSE 2 END
      FROM profile_doc_roots r
      JOIN folders f ON f.id = r.root_folder_id
      JOIN profile_doc_grants g ON g.root_folder_id = r.root_folder_id
     WHERE r.audience <> 'only_me'
  ) grants (folder_id, user_id, access, shelf_name, color, priority)
 ORDER BY folder_id, user_id, priority;
