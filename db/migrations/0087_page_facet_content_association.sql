-- #671: Give the existing Work document's blocks and Tasks a stable Facet
-- association. Keep folder_id, task ids, the legacy facet_id column, ordering
-- and content untouched. The editor's read/write paths remain unchanged.
--
-- Existing content homes map to page_facets.content_folder_id. New Facets can
-- later write to their owning Page's folder_id with an explicit page_facet_id.
LOCK TABLE page_blocks, tasks IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
ALTER TABLE page_blocks
  ADD COLUMN page_facet_id uuid,
  ADD CONSTRAINT page_blocks_page_facet_id_fkey
    FOREIGN KEY (page_facet_id) REFERENCES page_facets(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE tasks
  ADD COLUMN page_facet_id uuid,
  ADD CONSTRAINT tasks_page_facet_id_fkey
    FOREIGN KEY (page_facet_id) REFERENCES page_facets(id) ON DELETE SET NULL;
--> statement-breakpoint
UPDATE page_blocks b
   SET page_facet_id = pf.id
  FROM page_facets pf
 WHERE b.folder_id = pf.content_folder_id;
--> statement-breakpoint
UPDATE tasks t
   SET page_facet_id = pf.id
  FROM page_facets pf
 WHERE t.folder_id = pf.content_folder_id;
--> statement-breakpoint
CREATE INDEX page_blocks_page_facet_id_page_position_idx
  ON page_blocks (page_facet_id, page_position) WHERE page_facet_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX tasks_page_facet_id_page_position_idx
  ON tasks (page_facet_id, page_position) WHERE page_facet_id IS NOT NULL;
--> statement-breakpoint
-- Legacy writers insert only folder_id. Fill the matching Facet automatically;
-- when a row moves to a different Page, reassign only if the caller has not
-- explicitly chosen a new Facet. Do not alter the folder_id or other data.
CREATE FUNCTION assign_page_content_facet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.folder_id IS NULL THEN
    IF NEW.page_facet_id IS NOT NULL THEN
      RAISE EXCEPTION 'page_facet_without_folder' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.page_facet_id IS NULL THEN
      SELECT id INTO NEW.page_facet_id
        FROM page_facets WHERE content_folder_id = NEW.folder_id;
    END IF;
  ELSIF NEW.folder_id IS DISTINCT FROM OLD.folder_id THEN
    IF NEW.page_facet_id IS NULL OR NEW.page_facet_id IS NOT DISTINCT FROM OLD.page_facet_id THEN
      SELECT id INTO NEW.page_facet_id
        FROM page_facets WHERE content_folder_id = NEW.folder_id;
    END IF;
  END IF;

  IF NEW.page_facet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM page_facets pf
     WHERE pf.id = NEW.page_facet_id
       AND (pf.page_id = NEW.folder_id OR pf.content_folder_id = NEW.folder_id)
  ) THEN
    RAISE EXCEPTION 'page_facet_not_here' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER page_blocks_assign_page_facet
  BEFORE INSERT OR UPDATE OF folder_id, page_facet_id ON page_blocks
  FOR EACH ROW EXECUTE FUNCTION assign_page_content_facet();
--> statement-breakpoint
CREATE TRIGGER tasks_assign_page_facet
  BEFORE INSERT OR UPDATE OF folder_id, page_facet_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION assign_page_content_facet();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM page_blocks b JOIN page_facets pf
      ON pf.content_folder_id = b.folder_id
     WHERE b.page_facet_id IS DISTINCT FROM pf.id
  ) OR EXISTS (
    SELECT 1 FROM tasks t JOIN page_facets pf
      ON pf.content_folder_id = t.folder_id
     WHERE t.page_facet_id IS DISTINCT FROM pf.id
  ) THEN
    RAISE EXCEPTION '0087: legacy content Facet association is incomplete';
  END IF;
END
$$;
