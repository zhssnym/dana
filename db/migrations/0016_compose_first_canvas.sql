-- Issue #184: one durable ordering domain for a folder's page blocks and
-- tasks.  The columns stay nullable for rolling deploy compatibility: an old
-- application may still insert a row without the new key while this migration
-- is live, and the page action code seeds such rows under the folder lock.
ALTER TABLE page_blocks
  ADD COLUMN page_position text COLLATE "C",
  ADD COLUMN section_block_id uuid,
  ADD CONSTRAINT page_blocks_page_position_format_check
    CHECK (page_position IS NULL OR page_position ~ '^[0-9A-Za-z]{2,255}$'),
  ADD CONSTRAINT page_blocks_section_block_id_fkey
    FOREIGN KEY (section_block_id) REFERENCES page_blocks(id) ON DELETE SET NULL,
  ADD CONSTRAINT page_blocks_section_membership_check
    CHECK (section_block_id IS NULL OR (folder_id IS NOT NULL AND kind <> 'section'));
--> statement-breakpoint
ALTER TABLE tasks
  ADD COLUMN page_position text COLLATE "C",
  ADD CONSTRAINT tasks_page_position_format_check
    CHECK (page_position IS NULL OR page_position ~ '^[0-9A-Za-z]{2,255}$');
--> statement-breakpoint
/*
Backfill the exact folder-page order people saw before this migration:

  loose open tasks;
  then blocks in their legacy order, with a Section's opening paragraph and
  assigned tasks immediately after its heading before the rest of its span.

The fixed-width decimal fraction is a valid fractional key (the integer part
is `a0`, and `V` keeps the fraction from ending in zero).  Runtime writes use
the same fractional-index algorithm as task hand-ordering.
*/
WITH membership AS (
  SELECT child.id,
         (
           SELECT section.id
             FROM page_blocks section
            WHERE section.folder_id = child.folder_id
              AND section.kind = 'section'
              AND (section.position, section.id) < (child.position, child.id)
            ORDER BY section.position DESC, section.id DESC
            LIMIT 1
         ) AS section_id
    FROM page_blocks child
   WHERE child.folder_id IS NOT NULL
     AND child.kind <> 'section'
)
UPDATE page_blocks b
   SET section_block_id = membership.section_id
  FROM membership
 WHERE b.id = membership.id;
--> statement-breakpoint
WITH block_order AS (
  SELECT b.id, b.folder_id, b.kind,
         row_number() OVER (
           PARTITION BY b.folder_id ORDER BY b.position, b.id
         ) AS block_rank,
         lag(b.id) OVER (
           PARTITION BY b.folder_id ORDER BY b.position, b.id
         ) AS previous_id,
         lag(b.kind) OVER (
           PARTITION BY b.folder_id ORDER BY b.position, b.id
         ) AS previous_kind
    FROM page_blocks b
   WHERE b.folder_id IS NOT NULL
),
section_order AS (
  SELECT id, folder_id, block_rank
    FROM block_order
   WHERE kind = 'section'
),
task_order AS (
  SELECT t.id, t.folder_id,
         CASE WHEN s.id IS NULL THEN NULL ELSE t.section_block_id END AS section_id,
         row_number() OVER (
           PARTITION BY t.folder_id,
             CASE WHEN s.id IS NULL THEN NULL ELSE t.section_block_id END
           ORDER BY
             (t.due_date IS NULL) ASC,
             t.due_date ASC NULLS LAST,
             CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END,
             (t.due_time IS NOT NULL) ASC,
             t.due_time ASC NULLS FIRST,
             t.position ASC NULLS LAST,
             t.created_at ASC,
             t.id ASC
         ) AS task_rank
    FROM tasks t
    LEFT JOIN page_blocks s
      ON s.id = t.section_block_id
     AND s.folder_id = t.folder_id
     AND s.kind = 'section'
   WHERE t.deleted_at IS NULL
     AND t.status IN ('pending', 'abandoned')
),
visible_items AS (
  SELECT b.folder_id, 'block'::text AS item_kind, b.id,
         1 AS outer_rank,
         CASE WHEN b.previous_kind = 'section'
              THEN b.block_rank - 1 ELSE b.block_rank END AS major_rank,
         CASE WHEN b.kind = 'section' THEN 0
              WHEN b.previous_kind = 'section' THEN 1 ELSE 3 END AS slot_rank,
         0::bigint AS inner_rank
    FROM block_order b
  UNION ALL
  SELECT t.folder_id, 'task'::text, t.id,
         CASE WHEN t.section_id IS NULL THEN 0 ELSE 1 END,
         COALESCE(s.block_rank, 0),
         CASE WHEN t.section_id IS NULL THEN 0 ELSE 2 END,
         t.task_rank
    FROM task_order t
    LEFT JOIN section_order s ON s.id = t.section_id
),
numbered AS (
  SELECT folder_id, item_kind, id,
         row_number() OVER (
           PARTITION BY folder_id
           ORDER BY outer_rank, major_rank, slot_rank, inner_rank, item_kind, id
         ) AS page_rank
    FROM visible_items
),
block_keys AS (
  SELECT id, 'a0' || lpad(page_rank::text, 12, '0') || 'V' AS key
    FROM numbered
   WHERE item_kind = 'block'
)
UPDATE page_blocks b
   SET page_position = k.key
  FROM block_keys k
 WHERE b.id = k.id;
--> statement-breakpoint
WITH block_order AS (
  SELECT b.id, b.folder_id, b.kind,
         row_number() OVER (
           PARTITION BY b.folder_id ORDER BY b.position, b.id
         ) AS block_rank,
         lag(b.kind) OVER (
           PARTITION BY b.folder_id ORDER BY b.position, b.id
         ) AS previous_kind
    FROM page_blocks b
   WHERE b.folder_id IS NOT NULL
),
section_order AS (
  SELECT id, folder_id, block_rank
    FROM block_order
   WHERE kind = 'section'
),
task_order AS (
  SELECT t.id, t.folder_id,
         CASE WHEN s.id IS NULL THEN NULL ELSE t.section_block_id END AS section_id,
         row_number() OVER (
           PARTITION BY t.folder_id,
             CASE WHEN s.id IS NULL THEN NULL ELSE t.section_block_id END
           ORDER BY
             (t.due_date IS NULL) ASC,
             t.due_date ASC NULLS LAST,
             CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END,
             (t.due_time IS NOT NULL) ASC,
             t.due_time ASC NULLS FIRST,
             t.position ASC NULLS LAST,
             t.created_at ASC,
             t.id ASC
         ) AS task_rank
    FROM tasks t
    LEFT JOIN page_blocks s
      ON s.id = t.section_block_id
     AND s.folder_id = t.folder_id
     AND s.kind = 'section'
   WHERE t.deleted_at IS NULL
     AND t.status IN ('pending', 'abandoned')
),
visible_items AS (
  SELECT b.folder_id, 'block'::text AS item_kind, b.id,
         1 AS outer_rank,
         CASE WHEN b.previous_kind = 'section'
              THEN b.block_rank - 1 ELSE b.block_rank END AS major_rank,
         CASE WHEN b.kind = 'section' THEN 0
              WHEN b.previous_kind = 'section' THEN 1 ELSE 3 END AS slot_rank,
         0::bigint AS inner_rank
    FROM block_order b
  UNION ALL
  SELECT t.folder_id, 'task'::text, t.id,
         CASE WHEN t.section_id IS NULL THEN 0 ELSE 1 END,
         COALESCE(s.block_rank, 0),
         CASE WHEN t.section_id IS NULL THEN 0 ELSE 2 END,
         t.task_rank
    FROM task_order t
    LEFT JOIN section_order s ON s.id = t.section_id
),
numbered AS (
  SELECT folder_id, item_kind, id,
         row_number() OVER (
           PARTITION BY folder_id
           ORDER BY outer_rank, major_rank, slot_rank, inner_rank, item_kind, id
         ) AS page_rank
    FROM visible_items
),
task_keys AS (
  SELECT id, 'a0' || lpad(page_rank::text, 12, '0') || 'V' AS key
    FROM numbered
   WHERE item_kind = 'task'
)
UPDATE tasks t
   SET page_position = k.key
  FROM task_keys k
 WHERE t.id = k.id;
--> statement-breakpoint
-- Finished or trashed tasks are outside the live canvas. Give them stable
-- trailing keys so a later restore has a deterministic place at the foot.
WITH unplaced AS (
  SELECT t.id, t.folder_id,
         row_number() OVER (
           PARTITION BY t.folder_id ORDER BY t.created_at, t.id
         ) AS task_rank
    FROM tasks t
   WHERE t.page_position IS NULL
),
offsets AS (
  SELECT positioned.folder_id, count(*)::bigint AS visible_count
    FROM (
      SELECT b.folder_id
        FROM page_blocks b
       WHERE b.folder_id IS NOT NULL AND b.page_position IS NOT NULL
      UNION ALL
      SELECT t.folder_id
        FROM tasks t
       WHERE t.page_position IS NOT NULL
    ) positioned
   GROUP BY positioned.folder_id
),
keys AS (
  SELECT t.id,
         'a0' || lpad((COALESCE(o.visible_count, 0) + t.task_rank)::text, 12, '0') || 'V' AS key
    FROM unplaced t
    LEFT JOIN offsets o ON o.folder_id = t.folder_id
)
UPDATE tasks t
   SET page_position = k.key
  FROM keys k
 WHERE t.id = k.id;
--> statement-breakpoint
WITH shelf_keys AS (
  SELECT b.id,
         'a0' || lpad(row_number() OVER (
           PARTITION BY b.shelf_id ORDER BY b.position, b.id
         )::text, 12, '0') || 'V' AS key
    FROM page_blocks b
   WHERE b.shelf_id IS NOT NULL
)
UPDATE page_blocks b
   SET page_position = k.key
  FROM shelf_keys k
 WHERE b.id = k.id;
--> statement-breakpoint
CREATE INDEX page_blocks_folder_page_position_idx
  ON page_blocks (folder_id, page_position, id)
  WHERE folder_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX page_blocks_section_block_id_idx
  ON page_blocks (section_block_id)
  WHERE section_block_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX page_blocks_shelf_page_position_idx
  ON page_blocks (shelf_id, page_position, id)
  WHERE shelf_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX tasks_folder_page_position_idx
  ON tasks (folder_id, page_position, id);
