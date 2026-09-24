-- 0041: @mentions (Wave 2, unit W-D).
--
-- A person mention is a rich-text run carrying `mention: { user_id }`; the
-- run itself lives in `page_blocks.rich_content` (and, with 0040, in a post's
-- `comments.content`). This table is the one fact the run cannot hold: that
-- a given person has already been told about a given mention. One row per
-- (source, person), inserted ON CONFLICT DO NOTHING, so re-saving a block
-- that still names someone never notifies them twice.
--
-- `user_id` is ON DELETE CASCADE, which never fires here (8.10 step 7 scrubs
-- the users row rather than deleting it), so account deletion sweeps these
-- rows itself: `USER_CASCADE_DISPOSALS` in domain/account-deletion.ts.
-- The source goes with its block or comment; the event is history and may
-- go first, so it only nulls.
--
-- Also widens 4.13's verb set with 'mentioned'. Forward only; every existing
-- row passes both checks.
CREATE TABLE mention_notices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  block_id uuid,
  comment_id uuid,
  event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mention_notices_pkey PRIMARY KEY (id),
  CONSTRAINT mention_notices_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT mention_notices_block_id_fkey FOREIGN KEY (block_id) REFERENCES page_blocks(id) ON DELETE CASCADE,
  CONSTRAINT mention_notices_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT mention_notices_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  CONSTRAINT mention_notices_one_source_check CHECK (num_nonnulls(block_id, comment_id) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX mention_notices_block_user_idx ON mention_notices (block_id, user_id) WHERE block_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX mention_notices_comment_user_idx ON mention_notices (comment_id, user_id) WHERE comment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX mention_notices_user_id_idx ON mention_notices (user_id);
--> statement-breakpoint
CREATE INDEX mention_notices_event_id_idx ON mention_notices (event_id) WHERE event_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE events
  DROP CONSTRAINT events_verb_check,
  ADD CONSTRAINT events_verb_check
    CHECK (verb IN ('created', 'renamed', 'edited', 'moved', 'completed',
                    'reopened', 'abandoned', 'restored', 'duplicated',
                    'removed', 'deleted', 'left', 'mentioned'));
