-- 0048: when each person last opened each Discussion (round 5, discussions).
--
-- Unread state used to live in the browser, so it did not follow a person
-- to another device and could not clear the bell. One row per (Discussion,
-- person), upserted by PUT /discussions/:id/read; a Discussion with no row
-- for the viewer has never been opened by them.
--
-- The Discussion key cascades: the marker means nothing once the thread is
-- purged. `user_id` is ON DELETE CASCADE, which never fires (8.10 step 7
-- scrubs the users row rather than deleting it), so account deletion sweeps
-- these rows itself: `USER_CASCADE_DISPOSALS` in domain/account-deletion.ts.
--
-- Forward only; a new empty table.
CREATE TABLE discussion_reads (
  discussion_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discussion_reads_pkey PRIMARY KEY (discussion_id, user_id),
  CONSTRAINT discussion_reads_discussion_id_fkey FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
  CONSTRAINT discussion_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX discussion_reads_user_id_idx ON discussion_reads (user_id);
