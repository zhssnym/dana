-- 0033: remember that a media block's file was taken from under it (issue #267).
--
-- `page_blocks_file_id_fkey` is ON DELETE SET NULL, so a block whose file is
-- deleted keeps its row and loses its reference, and a stored image with no
-- file then reads exactly like a picture somebody inserted and has not filled
-- yet. The two are different states and only one is safe to "fill in".
--
-- This column is the difference: the moment the server deleted the file the
-- block named. It is written by the deleting transaction, immediately before
-- the delete (`domain/files.ts` `markBlocksLosingFiles`), and it is reported
-- on reads only while the block is a media block with no file.
--
-- Additive and nullable: the deployed client never sends it and never reads
-- it, and every existing row stays null. **No backfill is possible** — a
-- historical null `file_id` is indistinguishable from a never-filled block,
-- which is the defect itself; nothing recorded the deletion in the database.
ALTER TABLE page_blocks
  ADD COLUMN file_reclaimed_at timestamptz;
