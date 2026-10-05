-- Issue #497: Discussion ↔ Task is a durable many-to-many relationship.
--
-- 0059 put one nullable task_id on discussions and enforced one live
-- Discussion per Task. That made a relationship behave like containment:
-- moving a Task moved its Discussion, and every projection could name only
-- one endpoint. The relation below is the source of truth from this migration
-- onward. Soft Trash touches neither edge; permanent deletion of either
-- endpoint removes only its relation rows through these CASCADEs.
--
-- `created_via_task` is compatibility provenance, not relationship meaning.
-- POST /tasks/:id/discussion uses it to find the Discussion that route made
-- (including 0059-era task threads) without treating every linked Discussion
-- as "the" Task Discussion. Explicit links always store false.
--
-- Forward only.
CREATE TABLE discussion_tasks (
  discussion_id uuid NOT NULL,
  task_id uuid NOT NULL,
  created_via_task boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discussion_tasks_pkey PRIMARY KEY (discussion_id, task_id),
  CONSTRAINT discussion_tasks_discussion_id_fkey
    FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
  CONSTRAINT discussion_tasks_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX discussion_tasks_task_id_idx ON discussion_tasks(task_id);
--> statement-breakpoint

-- Backfill every 0059 relationship before the old column disappears. A
-- Discussion older than its Task is the old "Turn into a task" direction;
-- one created at/after the Task is task-thread provenance and is reusable by
-- POST /tasks/:id/discussion. This is the same age distinction 0059's
-- UNSTARTED_TASK_THREAD compatibility path used.
INSERT INTO discussion_tasks
  (discussion_id, task_id, created_via_task, created_at)
SELECT d.id, d.task_id,
       (t.created_at <= d.created_at),
       d.created_at
  FROM discussions d
  JOIN tasks t ON t.id = d.task_id
 WHERE d.task_id IS NOT NULL;
--> statement-breakpoint

-- Refuse to retire the source column if any legacy edge somehow failed to
-- copy. The migration must be all-or-nothing, never silently orphan links.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM discussions d
      LEFT JOIN discussion_tasks dt
        ON dt.discussion_id = d.id AND dt.task_id = d.task_id
     WHERE d.task_id IS NOT NULL AND dt.discussion_id IS NULL
  ) THEN
    RAISE EXCEPTION '0066 discussion_tasks backfill is incomplete';
  END IF;
END $$;
--> statement-breakpoint

DROP INDEX discussions_one_live_per_task_key;
--> statement-breakpoint
ALTER TABLE discussions DROP CONSTRAINT discussions_task_id_fkey;
--> statement-breakpoint
ALTER TABLE discussions DROP COLUMN task_id;
