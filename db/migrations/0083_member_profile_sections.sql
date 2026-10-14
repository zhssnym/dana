-- #620: Project-scoped teammate writing. These are references and profile text, not private Docs.
-- Do not inherit permissions from the visible profile: reads still require project membership.
CREATE TABLE member_profile_sections (
  project_id uuid NOT NULL,
  member_id uuid NOT NULL,
  area text NOT NULL,
  content jsonb NOT NULL DEFAULT '{"version":1,"blocks":[]}'::jsonb,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz,
  updated_by uuid,
  CONSTRAINT member_profile_sections_pkey PRIMARY KEY (project_id, member_id, area),
  CONSTRAINT member_profile_sections_member_fkey
    FOREIGN KEY (project_id, member_id) REFERENCES folder_members(folder_id, user_id) ON DELETE CASCADE,
  CONSTRAINT member_profile_sections_editor_fkey
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT member_profile_sections_area_check CHECK (area IN ('project', 'shared')),
  CONSTRAINT member_profile_sections_revision_check CHECK (revision >= 0),
  CONSTRAINT member_profile_sections_content_check
    CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 65536)
);
--> statement-breakpoint
CREATE INDEX member_profile_sections_editor_idx ON member_profile_sections (updated_by)
  WHERE updated_by IS NOT NULL;
