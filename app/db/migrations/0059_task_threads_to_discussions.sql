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
-- 4. A thread turned into a task before M5 ended in a post "Turned into a
--    task: <link>". Where that task is live and in the thread's Folder, the
--    thread is linked to it, so both directions hold for old conversions
--    too. The latest such post wins, and a task takes one thread. The
--    conversion resolved that thread; it is reopened here (unless someone
--    recorded a decision on it), because a task's thread is where its
--    talk goes on, and a resolved thread takes no post, edit, delete or
--    like -- not even an author's own.
-- 5. Every other task with comments gets one Discussion, titled with the
--    task and linked to it. It is created live even for a trashed task: the
--    link hides a trashed task, restoring the task finds it again, and a
--    purge leaves it standing, so nothing is purged with the task. It is
--    created open whatever the task's status, as "Discuss" makes one, so
--    every commenter keeps editing and deleting their own words and can
--    still talk about a finished task. Every comment is then
--    re-pointed in place: ids, authors, bodies, content, timestamps,
--    replies, likes, files and mention notices all hang on `comments.id` and
--    are untouched. Desk tasks are included; the task page is their way in.
-- 6. Read state follows: whoever had read the task thread has read the
--    Discussion at that time; every other member of its Folder has read it
--    up to its last post, so months-old talk does not come back unread.
-- 7. Nothing writes a task comment again (23514 rather than a post nothing
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
UPDATE discussions d
   SET task_id = link.task_id
  FROM (SELECT DISTINCT ON (conv.task_id) conv.discussion_id, conv.task_id
          FROM (SELECT DISTINCT ON (c.discussion_id)
                       c.discussion_id,
                       substring(c.content::text
                                 FROM '/app/tasks/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid
                         AS task_id,
                       c.created_at
                  FROM comments c
                 WHERE c.discussion_id IS NOT NULL
                   AND c.content #>> '{blocks,0,rich_content,runs,0,text}'
                       = 'Turned into a task: '
                   AND c.content::text ~ '/app/tasks/[0-9a-f-]{36}'
                 ORDER BY c.discussion_id, c.created_at DESC, c.id DESC) conv
          JOIN discussions cd ON cd.id = conv.discussion_id
          JOIN tasks t ON t.id = conv.task_id
         WHERE t.deleted_at IS NULL AND t.folder_id = cd.folder_id
           AND cd.trashed_at IS NULL AND NOT cd.is_general
         ORDER BY conv.task_id, conv.created_at DESC) link
 WHERE d.id = link.discussion_id;
--> statement-breakpoint
UPDATE discussions
   SET state = 'open', resolved_at = NULL, resolved_by = NULL
 WHERE task_id IS NOT NULL AND state = 'resolved'
   AND current_outcome_id IS NULL;
--> statement-breakpoint
INSERT INTO discussions
  (folder_id, task_id, title, created_by, state, resolved_at,
   last_activity_at, created_at, updated_at)
SELECT t.folder_id, t.id,
       COALESCE(NULLIF(btrim(left(btrim(t.title), 200)), ''), 'Untitled task'),
       (SELECT c1.author_id FROM comments c1 WHERE c1.task_id = t.id
         ORDER BY c1.created_at, c1.id LIMIT 1),
       'open', NULL,
       max(c.created_at), min(c.created_at), min(c.created_at)
  FROM tasks t
  JOIN comments c ON c.task_id = t.id
 WHERE NOT EXISTS (SELECT 1 FROM discussions d WHERE d.task_id = t.id)
 GROUP BY t.id, t.folder_id, t.title;
--> statement-breakpoint
UPDATE comments c
   SET discussion_id = d.id, task_id = NULL
  FROM discussions d
 WHERE d.task_id = c.task_id AND c.task_id IS NOT NULL;
--> statement-breakpoint
UPDATE discussions d
   SET last_activity_at = latest.at
  FROM (SELECT discussion_id, max(created_at) AS at FROM comments
         WHERE discussion_id IS NOT NULL GROUP BY discussion_id) latest
 WHERE d.task_id IS NOT NULL AND latest.discussion_id = d.id
   AND latest.at > d.last_activity_at;
--> statement-breakpoint
INSERT INTO discussion_reads (discussion_id, user_id, read_at)
SELECT d.id, r.user_id, r.read_at
  FROM task_thread_reads r
  JOIN discussions d ON d.task_id = r.task_id
ON CONFLICT (discussion_id, user_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO discussion_reads (discussion_id, user_id, read_at)
SELECT d.id, m.user_id, d.last_activity_at
  FROM discussions d
  JOIN folder_members m ON m.folder_id = d.folder_id
 WHERE d.task_id IS NOT NULL
ON CONFLICT (discussion_id, user_id) DO NOTHING;
--> statement-breakpoint
ALTER TABLE comments
  ADD CONSTRAINT comments_no_task_scope_check CHECK (task_id IS NULL);
