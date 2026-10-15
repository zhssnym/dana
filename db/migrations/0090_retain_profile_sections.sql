ALTER TABLE member_profile_sections
  DROP CONSTRAINT member_profile_sections_member_fkey,
  ADD CONSTRAINT member_profile_sections_project_fkey
    FOREIGN KEY (project_id) REFERENCES folders(id) ON DELETE CASCADE,
  ADD CONSTRAINT member_profile_sections_subject_fkey
    FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE RESTRICT;
