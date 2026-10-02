-- Issue #488: a whole persisted block may reference one or more facet tabs.
--
-- Inline facet references remain Dana Links inside rich_content. This table is
-- deliberately only for the block-owned form needed by image/file/media and
-- by people who mean "this whole block belongs to this facet". The target is
-- the current step-7 tab/page (`folders.id`), not the retired folder_facets
-- row. Same-project and Doc-tab eligibility are state across tables and are
-- therefore enforced by the transactional write, not guessed by a CHECK that
-- cannot see those rows. There is no actor copy: the edge is current relation
-- state, not history, and account deletion should not need another provenance
-- retention rule for a fact that simply follows its two endpoints.
CREATE TABLE page_block_facets (
  block_id uuid NOT NULL,
  facet_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_block_facets_pkey PRIMARY KEY (block_id, facet_id),
  CONSTRAINT page_block_facets_block_id_fkey FOREIGN KEY (block_id)
    REFERENCES page_blocks(id) ON DELETE CASCADE,
  CONSTRAINT page_block_facets_facet_id_fkey FOREIGN KEY (facet_id)
    REFERENCES folders(id) ON DELETE CASCADE
);
--> statement-breakpoint
-- The primary key serves block -> facets. Connected work reads the inverse.
CREATE INDEX page_block_facets_facet_id_block_id_idx
  ON page_block_facets (facet_id, block_id);
--> statement-breakpoint
-- A facet relation is deliberately Work-local. A page/tree move changes the
-- source folder's project_id, so old edges are removed rather than hidden and
-- allowed to reappear if the page later moves back. The second delete covers
-- the inverse: if a Doc tab itself changes project, it keeps no sources from
-- the old Work.
CREATE FUNCTION page_block_facets_prune_folder_move() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
    RETURN NEW;
  END IF;

  DELETE FROM page_block_facets pbf
   USING page_blocks b, folders target
   WHERE pbf.block_id = b.id
     AND pbf.facet_id = target.id
     AND b.folder_id = NEW.id
     AND target.project_id IS DISTINCT FROM NEW.project_id;

  DELETE FROM page_block_facets pbf
   WHERE pbf.facet_id = NEW.id
     AND EXISTS (
       SELECT 1
         FROM page_blocks b
         LEFT JOIN folders source_folder ON source_folder.id = b.folder_id
         LEFT JOIN tasks source_task ON source_task.id = b.task_id
        WHERE b.id = pbf.block_id
          AND COALESCE(source_folder.project_id, source_task.project_id)
              IS DISTINCT FROM NEW.project_id
     );
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER page_block_facets_prune_folder_move_after_update
  AFTER UPDATE OF project_id ON folders
  FOR EACH ROW EXECUTE FUNCTION page_block_facets_prune_folder_move();
--> statement-breakpoint
-- Task-document blocks travel with the Task. A cross-project task move must
-- therefore sever its old facet edges in the same transaction as the move.
CREATE FUNCTION page_block_facets_prune_task_move() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
    RETURN NEW;
  END IF;

  DELETE FROM page_block_facets pbf
   USING page_blocks b, folders target
   WHERE pbf.block_id = b.id
     AND pbf.facet_id = target.id
     AND b.task_id = NEW.id
     AND target.project_id IS DISTINCT FROM NEW.project_id;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER page_block_facets_prune_task_move_after_update
  AFTER UPDATE OF project_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION page_block_facets_prune_task_move();