-- 0049: when each person last opened each task's thread (round 7, discuss).
--
-- A Discussion has had server-side read state since 0048; a task's thread
-- (comments with comments.task_id set) had none, so the bell kept counting
-- posts the viewer had watched arrive. One row per (task, person), upserted
-- by PUT /tasks/:id/thread/read; a task with no row for the viewer has never
-- had its thread opened by them.
--
-- The task key cascades: the marker means nothing once the task is purged.
-- `user_id` is ON DELETE CASCADE, which never fires (8.10 step 7 scrubs the
-- users row rather than deleting it), so account deletion sweeps these rows
-- itself: `USER_CASCADE_DISPOSALS` in domain/account-deletion.ts.
--
-- Forward only; a new empty table.
CREATE TABLE task_thread_reads (
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_thread_reads_pkey PRIMARY KEY (task_id, user_id),
  CONSTRAINT task_thread_reads_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_thread_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX task_thread_reads_user_id_idx ON task_thread_reads (user_id);
