-- 0007: the sample workspace's register (RFC 0005 change control item 60,
-- ruled by delegation 2026-08-30). Forward-only, additive, every constraint
-- named because AC-001 asserts the catalog by name.
--
-- One row per object the sample created, keyed by the object's own id and
-- carrying no foreign key to it, deliberately: a sample task the person
-- completes, moves, edits or trashes keeps its id, so removal still finds
-- it, and an object the person destroyed themselves leaves a row that
-- names nothing, which the sweep drops. The user FK cascades so 8.10's
-- account deletion needs no new step.
CREATE TABLE sample_objects (
  user_id uuid NOT NULL,
  kind text NOT NULL,
  id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sample_objects_pkey PRIMARY KEY (user_id, kind, id),
  CONSTRAINT sample_objects_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT sample_objects_kind_check CHECK (kind IN ('shelf', 'folder', 'task', 'view'))
);
--> statement-breakpoint
-- Found by the sample's own tests: a task carrying comments could not be
-- moved between folders, because comments_task_scope_fkey holds the pair
-- (folder_id, task_id) against tasks (folder_id, id) and neither side's
-- UPDATE can go first while the check is immediate. The pair stays, and the
-- check now admits being deferred to the commit within one transaction, so
-- 7.6's move re-scopes the conversation in the same statement pair. The
-- constraint's name and shape are unchanged for AC-001.
ALTER TABLE comments ALTER CONSTRAINT comments_task_scope_fkey DEFERRABLE INITIALLY IMMEDIATE;
