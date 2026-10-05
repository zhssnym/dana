-- 0019: the M1-C2 task dependency relation (issue #224). Forward-only,
-- additive, every constraint and index named because AC-001 asserts the
-- catalog by name. The number 0019 and the journal "when" 1789400000000 were
-- assigned before the file was written, three branches being open at once.
--
-- One directed row per relation and never a mirrored pair: the dependent task
-- depends on the blocking task, and "blocks" is the same row read from the
-- other end. Two rows would be two things to keep in step, and one of them
-- would eventually be wrong.
--
-- The row carries no state. Whether a dependency is active, satisfied or
-- unresolved is derived from the blocking task's own status at read time, so
-- completing, reopening or abandoning a blocker needs no write here and
-- nothing can drift from the status column that is already the truth.
--
-- The surrogate id is not decoration. A viewer who can read one end of a
-- relation may not be able to read the other, and the contract answers such an
-- edge with the far task redacted; an edge addressed by its two endpoints
-- could not be named for removal without handing back the id being withheld.
--
-- Both endpoint keys cascade, which is exactly the trash rule: a soft-deleted
-- task keeps its rows and restores whole, while the permanent delete (7.13)
-- and the 11.7 purge both DELETE FROM tasks and take the relations with them.
-- created_by is RESTRICT on the tasks_created_by_fkey precedent, an account
-- being scrubbed (8.10) rather than removed.
CREATE TABLE task_dependencies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dependent_task_id uuid NOT NULL,
  blocking_task_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_dependencies_pkey PRIMARY KEY (id),
  CONSTRAINT task_dependencies_pair_key UNIQUE (dependent_task_id, blocking_task_id),
  CONSTRAINT task_dependencies_no_self_edge_check CHECK (dependent_task_id <> blocking_task_id),
  CONSTRAINT task_dependencies_dependent_task_id_fkey FOREIGN KEY (dependent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_dependencies_blocking_task_id_fkey FOREIGN KEY (blocking_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_dependencies_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);
--> statement-breakpoint
-- The pair unique backs every read that leads with the dependent task. This
-- index is the other direction, which the "blocks" projection and the cycle
-- walk both take.
CREATE INDEX task_dependencies_blocking_task_id_idx ON task_dependencies (blocking_task_id);
