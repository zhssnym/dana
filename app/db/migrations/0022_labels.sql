-- M1-D1 (issue #226, parent #208): the Label model, its three assignment
-- relations, and the Shelf terminology rename that removes the collision
-- this table's name would otherwise create.
--
-- Two scopes and no third. A Personal Label is owned by one user and is
-- private to them; a Folder Label belongs to one Folder and is shared with
-- its members. Scope is part of identity: Personal "Research", Folder A
-- "Research" and Folder B "Research" are three different Labels and are
-- never merged by name.
--
-- Every constraint and index is named because AC-001 asserts them by name
-- from db/constraint-catalog.ts, and the catalog moves in this same change.
--
-- The number and the journal `when` were assigned rather than taken: 0022 and
-- 1789700000000. The order on main is 0018 and 0019, both merged, then 0021
-- (issue #219), then this one, then 0023 (#228) and 0024 (#220). 0022 had been
-- pencilled in for a Schedule index that was measured and declined, so it was
-- free.
--
-- **This file was authored as 0020 and moved, and the move is worth recording
-- rather than tidying away.** #219 finished first holding 0021, and this
-- branch then went back for the expand-and-contract split below; holding a
-- finished branch behind a reworking one buys nothing, so the reworking one
-- moved. The drizzle migrator reads the last applied timestamp **once, before
-- its loop**, and applies a file only when that value is lower than the file's
-- own, so a 0021 deploying ahead of a 0020 would make the 0020 be skipped
-- **silently and permanently** — no error, no tables, and then every read that
-- wants them throwing in production. That is why the number is assigned by
-- whoever holds the branches rather than taken by whoever writes the file.
--
-- The statement separator below is drizzle's own, and it is load-bearing:
-- without one between two statements PGlite is handed the whole file as a
-- single extended-protocol parse and refuses it with SQLSTATE 42601, which
-- reads as broken SQL rather than as a missing marker. The splitter is
-- textual, so the marker's literal text never appears inside a comment here.
CREATE TABLE labels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  owner_user_id uuid,
  folder_id uuid,
  name text NOT NULL,
  color text NOT NULL,
  description text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labels_pkey PRIMARY KEY (id),
  -- The two composite uniques exist to be referenced, not to be queried.
  -- Each is the target of an assignment table's composite foreign key, and
  -- between them they are what makes a mis-scoped assignment unrepresentable
  -- rather than merely unwritten by the handlers.
  CONSTRAINT labels_id_owner_user_id_key UNIQUE (id, owner_user_id),
  CONSTRAINT labels_folder_id_id_key UNIQUE (folder_id, id),
  CONSTRAINT labels_scope_check CHECK (scope IN ('personal', 'folder')),
  -- Ownership XOR, written so that no possibly-null value is compared until
  -- both sides are known to be present: a CHECK fails only on FALSE, and
  -- UNKNOWN is as good as TRUE to it, so the obvious spelling of a
  -- both-or-neither rule admits exactly the row it was written to refuse
  -- (backend README, issue #27). Every operand here is IS NULL or an
  -- equality over a NOT NULL column, so the expression is never UNKNOWN.
  CONSTRAINT labels_ownership_check CHECK (
    (owner_user_id IS NULL) <> (folder_id IS NULL)
    AND (scope = 'personal') = (owner_user_id IS NOT NULL)
  ),
  CONSTRAINT labels_name_length_check CHECK (char_length(name) BETWEEN 1 AND 40),
  CONSTRAINT labels_color_format_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT labels_description_length_check CHECK (char_length(description) <= 100),
  -- A person's Personal Labels go with their account (8.10), and a Folder's
  -- Labels go with the Folder when it is purged. Soft-deleting a Folder sets
  -- deleted_at and touches no row here, which is the rule #208 states.
  CONSTRAINT labels_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT labels_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
--> statement-breakpoint
-- Case-insensitive uniqueness within one catalog, archived rows included:
-- archive is non-destructive, so an archived "Research" still holds the name
-- and a second one cannot be created beside it. Partial rather than plain,
-- because the other scope's key column is NULL on every row of it and NULLs
-- do not conflict; the predicate says which catalog each index is about
-- instead of leaving that to be inferred.
CREATE UNIQUE INDEX labels_personal_name_idx
  ON labels (owner_user_id, lower(name)) WHERE scope = 'personal';
--> statement-breakpoint
CREATE UNIQUE INDEX labels_folder_name_idx
  ON labels (folder_id, lower(name)) WHERE scope = 'folder';
--> statement-breakpoint
-- Relation 1: a Personal Label on a Task.
--
-- owner_user_id is stored rather than derived, and the composite foreign key
-- onto labels(id, owner_user_id) is what makes it honest: the pair cannot
-- name a Label somebody else owns, and because the column is NOT NULL here
-- while a Folder Label's owner_user_id is NULL, a Folder Label cannot be
-- attached through this table at all. The column also lets the per-viewer
-- read and the 100-per-Task cap be answered from this table alone.
CREATE TABLE task_personal_labels (
  task_id uuid NOT NULL,
  label_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_personal_labels_pkey PRIMARY KEY (task_id, label_id),
  CONSTRAINT task_personal_labels_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_personal_labels_label_scope_fkey FOREIGN KEY (label_id, owner_user_id) REFERENCES labels(id, owner_user_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX task_personal_labels_label_id_idx ON task_personal_labels (label_id);
--> statement-breakpoint
-- Relation 2: a Personal Label on a Folder. The same shape one target over.
-- A Folder Label may never classify a Folder (#208 R4), and the same NOT NULL
-- owner column is what refuses it.
CREATE TABLE folder_personal_labels (
  folder_id uuid NOT NULL,
  label_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folder_personal_labels_pkey PRIMARY KEY (folder_id, label_id),
  CONSTRAINT folder_personal_labels_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT folder_personal_labels_label_scope_fkey FOREIGN KEY (label_id, owner_user_id) REFERENCES labels(id, owner_user_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX folder_personal_labels_label_id_idx ON folder_personal_labels (label_id);
--> statement-breakpoint
-- Relation 3: a Folder Label on a Task, and the one invariant worth the
-- extra column.
--
-- The row carries the Folder, and both foreign keys are composite against it:
-- the first holds the Task to that Folder, the second holds the Label to it.
-- So a Folder Label from Folder A on a Task in Folder B is not a rule the
-- handlers enforce, it is a row the database cannot store, direct SQL
-- included. The shape is 4.15's comments_task_scope_fkey, which holds a
-- comment to its task's folder the same way; unlike that one it is not
-- deferrable, because nothing here needs to hold a broken pair across two
-- statements of one transaction.
CREATE TABLE task_folder_labels (
  folder_id uuid NOT NULL,
  task_id uuid NOT NULL,
  label_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_folder_labels_pkey PRIMARY KEY (task_id, label_id),
  CONSTRAINT task_folder_labels_task_scope_fkey FOREIGN KEY (folder_id, task_id) REFERENCES tasks(folder_id, id) ON DELETE CASCADE,
  CONSTRAINT task_folder_labels_label_scope_fkey FOREIGN KEY (folder_id, label_id) REFERENCES labels(folder_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX task_folder_labels_label_idx ON task_folder_labels (folder_id, label_id);
--> statement-breakpoint
-- The Shelf terminology cleanup (#208 R9, #226), **expand half only**.
--
-- folder_members.label has never meant classification. It is the viewer's own
-- Shelf membership, held in step with shelves.name by 4.18, and the column
-- name is now a collision with the table above rather than a description of
-- what it holds. What moves here is the name and nothing else: the Shelf
-- model, its 1-to-40 bound and every rule about holding membership and shelf
-- name in step are untouched.
--
-- **This was one ALTER ... RENAME COLUMN and is now expand-and-contract, on
-- the owner's ruling of 2026-09-20 under hard stop 1, and the reasoning is
-- worth keeping because the mistake was a reasonable one.** The argument for
-- the rename was that migrations run at boot before the process serves and
-- that Dana runs exactly one production instance. The first half is true. The
-- second is true of *steady state* and not of a deploy: Render brings the new
-- instance up and waits for it to pass health checks before draining the old
-- one, so between this statement committing and traffic switching there is a
-- window in which the old instance is still serving and every one of its
-- folder reads selects a column that no longer exists. That is not a rare
-- path — it is GET /folders, the sidebar and every folder page, so a rename
-- here is a total outage of the main surface for the length of a deploy.
--
-- So: the new column is **added beside** the old one and backfilled, the old
-- column and its CHECK are left exactly as they were, and for this release
-- the application **reads shelf_name and writes both**. An old instance
-- reading `label` through the deploy window therefore sees current data
-- rather than a missing column. `db/constraint-catalog.ts` carries both
-- columns and both CHECKs for the same release, and AC-479 asserts that the
-- two agree rather than that the old one is gone.
--
-- **The contract half — DROP COLUMN label and its CHECK — is issue #247 and
-- must not merge until this migration is live in production.**
--
-- The column is nullable with no default, which is what `label` already is: a
-- member on no shelf has no membership, and the CHECK admits that by never
-- seeing a value.
ALTER TABLE folder_members
  ADD COLUMN shelf_name text,
  ADD CONSTRAINT folder_members_shelf_name_length_check
    CHECK (char_length(shelf_name) BETWEEN 1 AND 40);
--> statement-breakpoint
-- The backfill. NULL stays NULL, which the predicate makes explicit rather
-- than leaving to the assignment: a row with no membership must not acquire
-- one, and writing NULL over NULL would touch every row in the table for no
-- change.
UPDATE folder_members SET shelf_name = label WHERE label IS NOT NULL;
