-- #671: Add independent Facet identities without moving existing Page content.
-- The old folders rows remain the content homes until the Page editor is migrated.
-- One row per content home. Discussion stays a separate collaboration surface.
LOCK TABLE folders IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE page_facets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL,
  content_folder_id uuid NOT NULL,
  name text NOT NULL,
  position text COLLATE "C" NOT NULL,
  CONSTRAINT page_facets_pkey PRIMARY KEY (id),
  CONSTRAINT page_facets_content_folder_unique UNIQUE (content_folder_id),
  CONSTRAINT page_facets_page_fkey FOREIGN KEY (page_id)
    REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT page_facets_content_folder_fkey FOREIGN KEY (content_folder_id)
    REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT page_facets_name_length_check
    CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT page_facets_position_format_check
    CHECK (position ~ '^[0-9A-Za-z]{2,255}$')
);
--> statement-breakpoint
CREATE INDEX page_facets_page_position_idx
  ON page_facets (page_id, position, id);
--> statement-breakpoint
INSERT INTO page_facets (page_id, content_folder_id, name, position)
SELECT CASE WHEN f.tab_position IS NOT NULL AND f.id <> f.project_id
            THEN f.project_id ELSE f.id END,
       f.id,
       CASE WHEN f.id = f.project_id OR f.tab_position IS NULL
            THEN 'Main' ELSE f.name END,
       COALESCE(f.tab_position, 'a0')
  FROM folders f
 WHERE f.kind IS DISTINCT FROM 'discussion' OR f.id = f.project_id;
--> statement-breakpoint
-- A nested Page keeps its legacy parent pointer. This reference identifies
-- the Facet containing its home block, even when that Facet is a former tab.
ALTER TABLE folders
  ADD COLUMN containing_facet_id uuid,
  ADD CONSTRAINT folders_containing_facet_fkey
    FOREIGN KEY (containing_facet_id)
    REFERENCES page_facets(id) ON DELETE SET NULL;
--> statement-breakpoint
UPDATE folders f
   SET containing_facet_id = pf.id
  FROM page_facets pf
 WHERE f.parent_folder_id = pf.content_folder_id;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM folders f
     WHERE f.parent_folder_id IS NOT NULL AND f.containing_facet_id IS NULL
  ) THEN
    RAISE EXCEPTION '0085: a nested Page has no containing Facet';
  END IF;
END
$$;
--> statement-breakpoint
-- Legacy Page creation and moves keep the shadow reference current.
CREATE FUNCTION folders_set_containing_facet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.containing_facet_id := NULL;
  IF NEW.parent_folder_id IS NOT NULL THEN
    SELECT pf.id INTO NEW.containing_facet_id
      FROM page_facets pf
     WHERE pf.content_folder_id = NEW.parent_folder_id;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER folders_set_containing_facet_before_write
  BEFORE INSERT OR UPDATE OF parent_folder_id ON folders
  FOR EACH ROW EXECUTE FUNCTION folders_set_containing_facet();
--> statement-breakpoint
-- A Facet gets its own stable id. Its content remains in the existing row.
-- The old writers can still rename, reorder, move and create Page content.
CREATE FUNCTION folders_sync_page_facet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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
        name = EXCLUDED.name,
        position = EXCLUDED.position;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER folders_sync_page_facet_after_insert
  AFTER INSERT ON folders
  FOR EACH ROW EXECUTE FUNCTION folders_sync_page_facet();
--> statement-breakpoint
CREATE TRIGGER folders_sync_page_facet_after_update
  AFTER UPDATE OF name, tab_position, project_id, kind ON folders
  FOR EACH ROW EXECUTE FUNCTION folders_sync_page_facet();
