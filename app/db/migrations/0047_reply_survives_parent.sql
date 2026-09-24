-- 0047: a reply outlives the post it answered (round 5, discussions).
--
-- 0003 made comments_parent_id_fkey ON DELETE CASCADE, so deleting a post
-- deleted every reply to it: one person removing their own words silently
-- removed other people's words with them, and nothing asked or recorded it.
-- A reply is its author's, not the parent's author's. The key is re-created
-- ON DELETE SET NULL under the same name, so a reply whose parent is deleted
-- stays in the thread as an ordinary post (parent_id NULL), body intact.
--
-- comments_parent_id_idx is untouched: it indexes the column, not the key.
-- Forward only; no row changes on the way in, since no reply has a missing
-- parent while the old key held.
ALTER TABLE comments DROP CONSTRAINT comments_parent_id_fkey;
--> statement-breakpoint
ALTER TABLE comments ADD CONSTRAINT comments_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE SET NULL;
