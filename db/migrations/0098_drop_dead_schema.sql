-- #721 removed every reader and writer of page_block_facets, and #724 removed What's New.
-- Drop the triggers first: they delete from page_block_facets on each folder or task move.
DROP TRIGGER IF EXISTS page_block_facets_prune_folder_move_after_update ON folders;
--> statement-breakpoint
DROP TRIGGER IF EXISTS page_block_facets_prune_task_move_after_update ON tasks;
--> statement-breakpoint
DROP FUNCTION IF EXISTS page_block_facets_prune_folder_move();
--> statement-breakpoint
DROP FUNCTION IF EXISTS page_block_facets_prune_task_move();
--> statement-breakpoint
DROP TABLE IF EXISTS page_block_facets;
--> statement-breakpoint
ALTER TABLE user_settings
  DROP CONSTRAINT IF EXISTS user_settings_updates_seen_ids_array_check,
  DROP COLUMN IF EXISTS updates_seen_ids;
