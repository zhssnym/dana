-- #671: New Facets may exist before the universal editor gives them content.
-- Existing Facets keep their content Page and do not move any content.
ALTER TABLE page_facets ALTER COLUMN content_folder_id DROP NOT NULL;
--> statement-breakpoint
-- Keep legacy edits compatible without resetting a Page's custom Main name.
-- A legacy name/order change wins only when that field actually changes.
CREATE OR REPLACE FUNCTION folders_sync_page_facet() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  name_changed boolean := true;
  position_changed boolean := true;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    name_changed := NEW.name IS DISTINCT FROM OLD.name;
    position_changed := NEW.tab_position IS DISTINCT FROM OLD.tab_position;
  END IF;
  IF NEW.kind = 'discussion' AND NEW.id <> NEW.project_id THEN
    DELETE FROM page_facets WHERE content_folder_id = NEW.id;
    RETURN NEW;
  END IF;
  INSERT INTO page_facets (page_id, content_folder_id, name, position)
  VALUES (
    CASE WHEN NEW.tab_position IS NOT NULL AND NEW.id <> NEW.project_id
         THEN NEW.project_id ELSE NEW.id END,
    NEW.id,
    CASE WHEN NEW.id = NEW.project_id OR NEW.tab_position IS NULL
         THEN 'Main' ELSE NEW.name END,
    COALESCE(NEW.tab_position, 'a0')
  )
  ON CONFLICT (content_folder_id) DO UPDATE
    SET page_id = EXCLUDED.page_id,
        name = CASE
          WHEN NEW.id = NEW.project_id OR NEW.tab_position IS NULL
            THEN page_facets.name
          WHEN name_changed THEN EXCLUDED.name
          ELSE page_facets.name
        END,
        position = CASE WHEN position_changed
          THEN EXCLUDED.position ELSE page_facets.position END;
  RETURN NEW;
END
$$;
