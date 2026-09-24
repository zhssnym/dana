-- 0029: the Consultation foundation (issue #320, product authority #212 R1,
-- R2 and R4): Discussions, their append-only Outcomes, and the comment scope
-- that puts a Folder-level comment inside exactly one Discussion.
--
-- The number and `when` (1790400000000) were assigned by the 2026-09-24
-- swarm brief, above 0028/1790300000000 on main. The drizzle migrator reads
-- the last applied `created_at` once and skips any file whose `when` is not
-- higher, silently (see 0027's header), so **re-check the journal before
-- merging**: 0030 (#321) and later must sit above this one.
--
-- What lands here:
--
-- 1. `discussions`. One row is one Discussion of one Folder. `state` is
--    exactly open | resolved (#320: no Discussion types). The resolution
--    CHECK ties the three resolution facts together so that a resolved
--    Discussion always has a current Outcome and an open one never does:
--    #320 "resolving requires creating a new current Outcome", and reopen
--    "clears the current Outcome pointer". `resolved_by` is deliberately
--    *not* in that CHECK: it is a users key, and a key on users that a CHECK
--    pins cannot be released by the suite's cleanupUsers, nor would it need
--    to be -- it is provenance. `context` is plain text (the #320 opening
--    context), at most 4000 characters, the comment body's own limit.
--    Removal is `trashed_at` (non-destructive, restorable); permanent purge
--    is a DELETE, which cascades to Outcomes and comments.
--
-- 2. `discussion_outcomes`. Append-only: nothing in the application updates
--    a statement, and supersession is a new row plus a moved pointer, so an
--    earlier Outcome id keeps resolving to exactly what it said.
--    `source_comment_id` is the optional `Use as outcome` provenance and is
--    ON DELETE SET NULL: the statement is a snapshot, and deleting the source
--    comment must not take the Outcome with it.
--
--    `discussions.current_outcome_id` is held by a composite key against
--    (discussion_id, id), so the current Outcome is always one of the
--    Discussion's own. That key is NO ACTION rather than RESTRICT because the
--    two tables reference each other: a folder purge cascades to both in one
--    statement, and NO ACTION checks at the statement's end, when the
--    referencing Discussion is gone too.
--
-- 3. `comments.discussion_id`, nullable, held by a composite key against
--    discussions (folder_id, id) -- 4.15's comments_task_scope_fkey shape --
--    so a comment's Discussion is always in the comment's own Folder.
--    `comments_one_scope_check` refuses a comment that is both Task-scoped
--    and Discussion-scoped. It does **not** yet require one of the two: the
--    currently deployed client still posts to the Folder thread with neither,
--    and the route change that files those under a Discussion ships with the
--    comment-scoping work (#320, U11), after which a later migration may
--    tighten this to exactly-one.
--
-- 4. The backfill. Every Folder that has Folder-level comments
--    (task_id IS NULL) -- trashed folders and default Desk folders included,
--    because both can still be read and neither may lose a conversation --
--    gets exactly one "General discussion", and every one of those comments,
--    roots and replies, is pointed at it. Comment ids, authorship, bodies,
--    timestamps, likes and files are untouched: this only sets a column.
--    The Discussion takes the Folder owner as `created_by` (provenance, as
--    0027 did for native facets), the earliest comment's time as its
--    `created_at`, and the latest comment's time as `last_activity_at`, so
--    no new activity is fabricated. Folders without Folder-level comments get
--    nothing. The INSERT is guarded by NOT EXISTS so a re-run cannot
--    duplicate.
--
-- 5. `discussions.is_general` marks the Folder's General discussion: the
--    one the currently deployed client's Folder thread reads and writes
--    (4.31). It is a flag, never the title, so renaming it (PATCH) or
--    creating another Discussion titled "General discussion" moves nothing
--    between the legacy thread and the Consultation. The backfill sets it;
--    the legacy post sets it on the one it creates; nothing clears it.
--    `discussions_one_open_general_key` holds at most one open, untrashed
--    one per Folder, and `comments_unfiled_folder_idx` serves the legacy
--    post's sweep of comments filed nowhere yet.
--
-- The three users keys are RESTRICT for 0027's reason: 8.10 scrubs a users
-- row and never deletes it, so no clause on them fires; each is listed in
-- USER_RESTRICT_DISPOSALS as outliving the account.
--
-- Forward only. Nothing here is destructive: two tables and one nullable
-- column are created, and the backfill writes rows and a column nothing had.
CREATE TABLE discussions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  title text NOT NULL,
  context text,
  created_by uuid NOT NULL,
  state text NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  resolved_by uuid,
  current_outcome_id uuid,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  trashed_at timestamptz,
  is_general boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discussions_pkey PRIMARY KEY (id),
  CONSTRAINT discussions_folder_id_id_key UNIQUE (folder_id, id),
  CONSTRAINT discussions_folder_id_fkey
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT discussions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT discussions_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT discussions_state_check CHECK (state IN ('open', 'resolved')),
  CONSTRAINT discussions_title_length_check
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT discussions_context_length_check
    CHECK (char_length(context) <= 4000),
  -- Every operand is IS [NOT] NULL or a comparison on the NOT NULL `state`,
  -- so no NULL reaches the equality and the CHECK cannot pass by UNKNOWN.
  CONSTRAINT discussions_resolution_check
    CHECK ((state = 'resolved') = (resolved_at IS NOT NULL)
           AND (state = 'resolved') = (current_outcome_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX discussions_folder_activity_idx
  ON discussions (folder_id, last_activity_at DESC, id DESC)
  WHERE trashed_at IS NULL;
--> statement-breakpoint
-- At most one open, untrashed General discussion per Folder: the legacy
-- Folder thread's write target (see 5. below). A resolved or trashed one may
-- sit beside it; reopen and restore refuse (409) rather than make two.
CREATE UNIQUE INDEX discussions_one_open_general_key
  ON discussions (folder_id)
  WHERE is_general AND state = 'open' AND trashed_at IS NULL;
--> statement-breakpoint
CREATE TABLE discussion_outcomes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL,
  statement text NOT NULL,
  actor_id uuid NOT NULL,
  source_comment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discussion_outcomes_pkey PRIMARY KEY (id),
  CONSTRAINT discussion_outcomes_discussion_id_id_key UNIQUE (discussion_id, id),
  CONSTRAINT discussion_outcomes_discussion_id_fkey
    FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
  CONSTRAINT discussion_outcomes_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT discussion_outcomes_source_comment_id_fkey
    FOREIGN KEY (source_comment_id) REFERENCES comments(id) ON DELETE SET NULL,
  CONSTRAINT discussion_outcomes_statement_length_check
    CHECK (char_length(btrim(statement)) BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE INDEX discussion_outcomes_source_comment_id_idx
  ON discussion_outcomes (source_comment_id)
  WHERE source_comment_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE discussions
  ADD CONSTRAINT discussions_current_outcome_fkey
    FOREIGN KEY (id, current_outcome_id)
    REFERENCES discussion_outcomes(discussion_id, id) ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE comments
  ADD COLUMN discussion_id uuid,
  ADD CONSTRAINT comments_discussion_scope_fkey
    FOREIGN KEY (folder_id, discussion_id)
    REFERENCES discussions(folder_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT comments_one_scope_check
    CHECK (task_id IS NULL OR discussion_id IS NULL);
--> statement-breakpoint
CREATE INDEX comments_discussion_thread_idx
  ON comments (discussion_id, created_at)
  WHERE discussion_id IS NOT NULL;
--> statement-breakpoint
-- The legacy post's stray sweep ("any Folder-level comment no Discussion
-- holds yet?") answers from this instead of scanning the Folder's thread.
CREATE INDEX comments_unfiled_folder_idx
  ON comments (folder_id)
  WHERE task_id IS NULL AND discussion_id IS NULL;
--> statement-breakpoint
INSERT INTO discussions
  (folder_id, title, created_by, state, is_general,
   last_activity_at, created_at, updated_at)
SELECT f.id, 'General discussion', f.owner_id, 'open', true,
       max(c.created_at), min(c.created_at), min(c.created_at)
  FROM folders f
  JOIN comments c ON c.folder_id = f.id AND c.task_id IS NULL
 WHERE NOT EXISTS (SELECT 1 FROM discussions d WHERE d.folder_id = f.id)
 GROUP BY f.id, f.owner_id;
--> statement-breakpoint
UPDATE comments c
   SET discussion_id = d.id
  FROM discussions d
 WHERE d.folder_id = c.folder_id
   AND d.is_general
   AND c.task_id IS NULL
   AND c.discussion_id IS NULL;
