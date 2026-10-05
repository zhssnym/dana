-- 0040: Discussion threads (Wave 2, W-C). A post is written in the editor.
--
-- `comments.content` holds a post's block tree (`postContent` in
-- src/shared/comments.ts): version 1, a `blocks` array, at most 256 KiB
-- serialized. The server derives `body` from it (plain text, <= 4000 chars,
-- NULL for a pictures-only post), so every reader that predates posts keeps
-- working. A comment written before posts keeps `content` NULL. That a media
-- block names one of the same comment's own files is a cross-row rule,
-- enforced by the server before any write, not here.
--
-- `discussions_resolution_check` is widened: a thread may close without a
-- decision (decision 3), so a resolved Discussion may have no current
-- Outcome; an open one still never has one. Every old row passes the new
-- check, which only admits more.
--
-- Forward only. Re-check the journal number/when against every branch that
-- is open when this merges; 0040 / 1791500000000 was allocated by the Wave 2
-- plan (0038, 0039 and 0041 belong to parallel units).
ALTER TABLE comments
  ADD COLUMN content jsonb,
  ADD CONSTRAINT comments_content_check
    CHECK (content IS NULL
           OR (content->>'version' = '1'
               AND jsonb_typeof(content->'blocks') = 'array'
               AND octet_length(content::text) <= 262144));
--> statement-breakpoint
-- Every operand is IS [NOT] NULL or a comparison on the NOT NULL `state`,
-- so no NULL reaches the equality and the CHECK cannot pass by UNKNOWN.
ALTER TABLE discussions
  DROP CONSTRAINT discussions_resolution_check,
  ADD CONSTRAINT discussions_resolution_check
    CHECK ((state = 'resolved') = (resolved_at IS NOT NULL)
           AND (state = 'resolved' OR current_outcome_id IS NULL));
