-- 0059: a task's conversation moves into the project's Discussion (M5).
--
-- The Discussion tab is the one place people talk. A task no longer has a
-- thread of its own: "Discuss" on a task opens that task's Discussion, made on
-- first use, and the Discussion names the task through `discussions.task_id`.
--
-- 1. `discussions.task_id` links a Discussion to the task it is about. Plain
--    FK, SET NULL: purging a task leaves its conversation standing, unlinked.
-- 2. At most one live (untrashed) Discussion per task. A trashed one may sit
--    beside it; restoring it then answers 409.
-- 3. `comments_discussion_scope_fkey` becomes DEFERRABLE INITIALLY IMMEDIATE,
--    as 0007 made the task pair, so a task's move can carry its Discussion
--    and the Discussion's comments to the new Folder in one transaction.
-- 4. Every task with comments gets one Discussion, titled with the task and
--    linked to it; a trashed task's Discussion is created trashed with it.
--    Every comment is re-pointed in place: ids, authors, bodies, content,
--    timestamps, replies, likes, files and mention notices all hang on
--    `comments.id` and are untouched.
-- 5. Read state follows: whoever had read the task thread has read the
--    Discussion.
-- 6. Nothing writes a task comment again (23514 rather than a post nothing
--    reads). `comments.task_id`, its FK and index, and `task_thread_reads`
--    stay, read by nothing; dropping them is a later migration.
--
-- Forward only.
ALTER TABLE discussions
  ADD COLUMN task_id uuid,
  ADD CONSTRAINT discussions_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX discussions_one_live_per_task_key
  ON discussions (task_id)
  WHERE task_id IS NOT NULL AND trashed_at IS NULL;
--> statement-breakpoint
ALTER TABLE comments ALTER CONSTRAINT comments_discussion_scope_fkey
  DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
INSERT INTO discussions
  (folder_id, task_id, title, created_by, state,
   last_activity_at, created_at, updated_at, trashed_at)
SELECT t.folder_id, t.id,
       COALESCE(NULLIF(btrim(left(btrim(t.title), 200)), ''), 'Untitled task'),
       (SELECT c1.author_id FROM comments c1 WHERE c1.task_id = t.id
         ORDER BY c1.created_at, c1.id LIMIT 1),
       'open', max(c.created_at), min(c.created_at), min(c.created_at),
       t.deleted_at
  FROM tasks t
  JOIN comments c ON c.task_id = t.id
 WHERE NOT EXISTS (SELECT 1 FROM discussions d WHERE d.task_id = t.id)
 GROUP BY t.id, t.folder_id, t.title, t.deleted_at;
--> statement-breakpoint
UPDATE comments c
   SET discussion_id = d.id, task_id = NULL
  FROM discussions d
 WHERE d.task_id = c.task_id AND c.task_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO discussion_reads (discussion_id, user_id, read_at)
SELECT d.id, r.user_id, r.read_at
  FROM task_thread_reads r
  JOIN discussions d ON d.task_id = r.task_id
ON CONFLICT (discussion_id, user_id) DO NOTHING;
--> statement-breakpoint
ALTER TABLE comments
  ADD CONSTRAINT comments_no_task_scope_check CHECK (task_id IS NULL);
