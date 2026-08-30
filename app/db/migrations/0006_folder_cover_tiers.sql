-- 0006: a folder's cover gains the preset and the crop 4.20 already gives a
-- place page (RFC 0005 change control item 58, taking section 13 item 53's
-- first answer). Forward-only, additive, every constraint named because
-- AC-001 asserts the catalog by name.
--
-- The one-source rule differs from user_page_covers' by exactly one case: a
-- folder may wear no cover at all, which 4.3 has always admitted, so the
-- CHECK forbids both rather than demanding one. cover_file_id's FK sets
-- null when the file goes, and that leaves a row with neither, which the
-- rule admits.
ALTER TABLE folders
  ADD COLUMN cover_preset text,
  ADD COLUMN cover_focal_y integer NOT NULL DEFAULT 50,
  ADD CONSTRAINT folders_cover_one_source_check CHECK (cover_file_id IS NULL OR cover_preset IS NULL),
  ADD CONSTRAINT folders_cover_preset_format_check CHECK (cover_preset IS NULL OR cover_preset ~ '^[a-z0-9-]{1,40}$'),
  ADD CONSTRAINT folders_cover_focal_y_range_check CHECK (cover_focal_y BETWEEN 0 AND 100);
