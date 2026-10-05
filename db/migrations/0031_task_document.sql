-- 0031_task_document.sql
-- Issue #221 (M1-B4), the Task half of the contextual composer backend.
--
-- A Task owns a document in 4.17's `page_blocks`, the store Folder pages,
-- Shelf pages and facet documents already use. No new table.
--
-- 1. `page_blocks.task_id`, the fourth home. `page_blocks_one_home_check` is
--    dropped and re-added under the same name over
--    `num_nonnulls(folder_id, shelf_id, facet_id, task_id) = 1`: a strictly
--    larger admitted set, since every existing row has a null `task_id` and
--    exactly one of the three old homes. CASCADE, because a Task's document is
--    the Task's: purging the Task row takes its blocks with it. Trash is a
--    `deleted_at` stamp on the Task and touches no block, so a restored Task
--    comes back with its document.
--
--    `page_blocks_section_membership_check` and
--    `page_blocks_list_parent_kind_check` are untouched: a Task document has
--    no Sections and (for now) no nested list items, and the applier refuses
--    both with a 422 naming the field before a write can reach either CHECK.
--
-- 2. The backfill. Every Task whose `notes` is non-empty gets a document of
--    paragraph blocks. `notes` itself is not touched. A line break is kept
--    as a hard break (a '\n' inside the paragraph's text), so a note of up to
--    4000 characters becomes exactly one paragraph whose text equals it. A
--    longer note is cut at the last line break inside each 4000-character
--    window, and that break is the boundary between two paragraphs, so the
--    paragraphs joined with '\n' reproduce the note exactly. Only a single
--    line longer than 4000 characters is cut mid-line. The same algorithm is
--    `notesParagraphs` in `src/server/domain/task-document.ts`; AC-881 pins
--    the two against each other. Guarded by NOT EXISTS, so a re-run writes
--    nothing twice. Trashed Tasks are included: they may be restored.
--
-- Forward only. Nothing here is destructive.
ALTER TABLE page_blocks
  ADD COLUMN task_id uuid,
  ADD CONSTRAINT page_blocks_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  DROP CONSTRAINT page_blocks_one_home_check,
  ADD CONSTRAINT page_blocks_one_home_check
    CHECK (num_nonnulls(folder_id, shelf_id, facet_id, task_id) = 1);
--> statement-breakpoint
CREATE INDEX page_blocks_task_page_position_idx
  ON page_blocks (task_id, page_position, id)
  WHERE task_id IS NOT NULL;
--> statement-breakpoint
DO $$
DECLARE
  r record;
  rest text;
  piece text;
  win text;
  cut integer;
  nl integer;
  pos integer;
BEGIN
  FOR r IN
    SELECT t.id, t.notes FROM tasks t
     WHERE t.notes IS NOT NULL AND t.notes <> ''
       AND NOT EXISTS (SELECT 1 FROM page_blocks b WHERE b.task_id = t.id)
     ORDER BY t.id
  LOOP
    rest := r.notes;
    pos := 0;
    LOOP
      IF char_length(rest) <= 4000 THEN
        piece := rest;
        rest := NULL;
      ELSE
        win := substr(rest, 1, 4001);
        cut := position(E'\n' IN reverse(win));
        IF cut > 0 THEN
          nl := 4002 - cut;
          piece := substr(rest, 1, nl - 1);
          rest := substr(rest, nl + 1);
        ELSE
          piece := substr(rest, 1, 4000);
          rest := substr(rest, 4001);
        END IF;
      END IF;
      INSERT INTO page_blocks (task_id, kind, position, page_position, text)
      VALUES (r.id, 'paragraph', pos,
              'a' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', pos + 1, 1),
              piece);
      pos := pos + 1;
      EXIT WHEN rest IS NULL;
    END LOOP;
  END LOOP;
END
$$;
