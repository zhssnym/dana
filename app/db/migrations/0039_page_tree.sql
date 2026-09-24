-- 0039: pages in pages (wave 2, unit W-A).
--
-- A page (a folders row) may sit under another page. `parent_folder_id` is
-- the parent, ON DELETE SET NULL so purging a parent turns its surviving
-- children into roots rather than deleting them; `child_position` orders
-- siblings under one parent (a fractional-index key, the same shape and C
-- collation as tasks.position). There is deliberately no CHECK tying
-- child_position to parent_folder_id: a root keeps null, but a child whose
-- parent was purged keeps its stale key harmlessly.
--
-- Trashing a page trashes the descendants its actor may delete with it;
-- each such descendant records the initiating page in
-- `trashed_with_folder_id` so a restore brings back exactly that set and
-- /trash lists only initiators. The CHECK keeps the pointer on trashed rows
-- only; SET NULL on purge of the initiator keeps it satisfied.
--
-- A default folder (the personal one) is always a root, and a page is never
-- its own parent. Cycles and depth (<= 20) are cross-row rules enforced by
-- the move transaction under an advisory lock, not here.
--
-- page_blocks gains the `page` kind: the block in a parent page's document
-- that stands for a child page, naming it through the existing
-- `ref_folder_id` (FK ON DELETE CASCADE since 0003). A page block lives only
-- in a folder's document and names a page; a page has at most one home
-- block. Widens page_blocks_kind_check in place exactly as 0037 wrote it
-- plus 'page'. No backfill. Forward only. Re-check number/when against every
-- open branch when this merges; 0039 / 1791400000000 per the wave 2 plan
-- (0038 belongs to unit W-B).
ALTER TABLE folders
  ADD COLUMN parent_folder_id uuid,
  ADD COLUMN child_position text COLLATE "C",
  ADD COLUMN trashed_with_folder_id uuid,
  ADD CONSTRAINT folders_parent_folder_id_fkey
    FOREIGN KEY (parent_folder_id) REFERENCES folders(id) ON DELETE SET NULL,
  ADD CONSTRAINT folders_trashed_with_folder_id_fkey
    FOREIGN KEY (trashed_with_folder_id) REFERENCES folders(id) ON DELETE SET NULL,
  ADD CONSTRAINT folders_child_position_format_check
    CHECK (child_position IS NULL OR child_position ~ '^[0-9A-Za-z]{2,255}$'),
  ADD CONSTRAINT folders_parent_not_self_check
    CHECK (parent_folder_id IS NULL OR parent_folder_id <> id),
  ADD CONSTRAINT folders_default_is_root_check
    CHECK (NOT is_default OR parent_folder_id IS NULL),
  ADD CONSTRAINT folders_trashed_with_check
    CHECK (trashed_with_folder_id IS NULL OR deleted_at IS NOT NULL);
--> statement-breakpoint
CREATE INDEX folders_parent_child_position_idx
  ON folders (parent_folder_id, child_position, id)
  WHERE parent_folder_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX folders_trashed_with_folder_id_idx
  ON folders (trashed_with_folder_id)
  WHERE trashed_with_folder_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE page_blocks
  DROP CONSTRAINT page_blocks_kind_check,
  ADD CONSTRAINT page_blocks_kind_check
    CHECK (kind IN ('section', 'paragraph',
                    'heading1', 'heading2', 'heading3',
                    'image', 'folder_ref',
                    'bullet', 'numbered', 'checklist', 'toggle', 'quote',
                    'callout', 'code', 'file', 'audio', 'video', 'diagram',
                    'divider', 'page')),
  ADD CONSTRAINT page_blocks_page_kind_check
    CHECK (kind <> 'page' OR (folder_id IS NOT NULL AND ref_folder_id IS NOT NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX page_blocks_page_home_idx
  ON page_blocks (ref_folder_id)
  WHERE kind = 'page';
