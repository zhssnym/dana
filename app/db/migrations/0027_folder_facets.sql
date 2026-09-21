-- 0027: the M1-F Folder facet framework (issue #210), on Hassan's technical
-- ruling of 2026-09-21,
-- https://github.com/zhssnym/dana/issues/210#issuecomment-5756722756,
-- section 1. Product authority is #210 as written plus the Frontend ->
-- Backend Handoff of the same day; authorization authority is accepted #209
-- R8A through #228's table. Forward-only and additive, except for one CHECK
-- that is dropped and re-added under its own name over a strictly larger
-- admitted set.
--
-- **The number and the `when` were assigned before this file was written,
-- and the sibling list is named rather than implied.** 0027 and
-- 1790200000000, against `app/db/migrations/meta/_journal.json` whose last
-- entry when this was assigned was 0026/1790100000000 (issue #247 release B,
-- on main). **No other branch open on 2026-09-21 carries a journal entry**:
-- the open branches were read one by one and none of them touches
-- `app/db/migrations/`, so this file's `when` is the highest there is and
-- nothing sits above it that could skip it.
--
-- That check is the whole of 0026's and 0025's hazard paragraph and it is
-- restated here because it does not travel: the drizzle migrator reads the
-- last applied `created_at` **once, before its loop**, and applies a file
-- only when that value is lower than the file's own
-- (`node_modules/drizzle-orm/pg-core/dialect.js`). A sibling that deploys
-- with a **higher** `when` makes this file be skipped with no error, no
-- table, and a 500 on every read that wanted it. **Check it again before
-- merging**: if a branch opened after this one takes a `when` above
-- 1790200000000 and merges first, this file never runs and nothing says so.
--
-- ---------------------------------------------------------------------
-- What lands here, and why each piece is the shape it is
-- ---------------------------------------------------------------------
--
-- **1. `folder_facets`, spec 4.30.** One row is one facet of one Folder: the
-- four natives (Main, Purpose, Consultation, Results) and the custom ones a
-- member adds (a Work facet over an H1 of Main, a shared blank document, a
-- private blank document). Every constraint and index is named, because
-- AC-001 asserts the catalog by name out of `db/constraint-catalog.ts`.
--
-- The two `users` keys are **RESTRICT** rather than CASCADE, and that is
-- 4.28's reason transcribed one table over: 8.10 scrubs a `users` row and
-- never deletes it, so no `ON DELETE` clause on a `users` key ever fires. A
-- CASCADE here would therefore delete nothing while *looking* like the
-- cleanup. RESTRICT makes a future hard delete fail loudly instead.
--
-- `position` is `text COLLATE "C"` carrying **literally the same regex** as
-- `page_blocks.page_position` (0016:5-9). One fractional-key domain, one
-- collation, one alphabet: the order this database sorts by and the order
-- `domain/fractional-index.ts` computes in are then the same order, on
-- PGlite and on Postgres alike.
--
-- `h1_block_id` is **ON DELETE CASCADE**, which destroys the facet row when
-- its H1 goes rather than sending it to Trash. That is the one place the
-- ruling reads past #210's words and it says so: 7.16's `delete_block` is
-- permanent, so a trashed Work facet could never be restored, and an
-- unrestorable Trash row is worse than none. Deleting a Work facet through
-- its own route stamps `deleted_at` and touches no block and no Task.
--
-- Four CHECKs pair a nullable column with `kind`, and every one of them is
-- written so that **no possibly-null value is compared until both sides are
-- known** -- `IS NULL` and `IS NOT NULL` always yield a real boolean, and a
-- CHECK fails only on FALSE, so the obvious `(a IS NULL AND ...) OR (...)`
-- spelling would admit exactly the row it was written to refuse. That is
-- `docs/workflow/backend.md`'s nullable-CHECK trap, and AC-001 cannot see
-- the difference: it asserts constraints by name and by which columns they
-- mention, never by what the expression does. AC-831, AC-833 and AC-835 are
-- the behavioural cases that try the bad rows.
--
-- **2. `page_blocks.facet_id`, an amendment to 4.17.** A blank facet's
-- document reuses 4.17 rather than getting a store of its own.
-- `page_blocks_one_home_check` is dropped and re-added **under the same
-- name** over `num_nonnulls(folder_id, shelf_id, facet_id) = 1`. That set is
-- strictly larger than `(folder_id IS NULL) <> (shelf_id IS NULL)`: every
-- existing row has exactly one of the two old homes and a null `facet_id`,
-- so every one of them passes by construction and **no backfill is needed
-- and none is run**. The constraint is dropped and re-added rather than
-- renamed so that one reader can read this file and the catalog against each
-- other, which is 0026's rule for a named constraint.
--
-- `page_blocks_section_membership_check` is deliberately **untouched and is
-- already exactly right**: it admits `section_block_id` only where
-- `folder_id` is not null, so a facet document has no Sections and nothing
-- had to be written to make that true.
--
-- **`page_blocks_list_parent_kind_check` is untouched too, and unlike the
-- one above that is a live limitation rather than a happy accident.** It
-- also requires `folder_id IS NOT NULL`, so a facet document cannot hold a
-- nested list item. The ruling does not amend it and this file does not
-- amend it either; what closes the hole is that `domain/facets.ts` refuses
-- a facet document transaction carrying `list_parent_block_id` with a 422
-- naming the field, rather than letting the write reach this CHECK and
-- answer 500. Said out loud in the pull request and in the Backend ->
-- Frontend Handoff, because it is a real difference between a Folder page
-- and a facet page that a client has to know about.
--
-- **No column on `tasks` names a facet.** That absence is #210's "not
-- another Task database" written where it cannot be edited out.
--
-- **3. The backfill.** Natives are created with the folder, not lazily
-- (ruling section 1), so every folder that already exists gets its four here
-- -- **including trashed ones**, which are folders that may still be
-- restored and whose facets must be waiting when they are. Lazy creation
-- would mean a GET writes, two members race the unique index, and a
-- Can-view member's read either creates rows or answers differently from a
-- Can-edit member's.
--
-- The four positions are `a0`, `a1`, `a2`, `a3`, which is exactly what
-- `initialKeys(4)` in `domain/fractional-index.ts` produces and is what
-- `POST /folders` writes for a new folder from this release on. They are
-- literals here rather than a call because a migration cannot call
-- TypeScript, and the two are pinned against each other by AC-830.
--
-- `created_by` is the folder's owner: provenance, never authority (#228's
-- authorship rule). `folders.owner_id` is NOT NULL, so this column is
-- satisfied for every row.
--
-- Forward only. There is no down migration; recovery is a fix-forward
-- migration or a restore. Nothing here is destructive: one table is created,
-- one nullable column is added, one CHECK is replaced by a weaker one, and
-- one INSERT writes rows nothing had before.
CREATE TABLE folder_facets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  kind text NOT NULL,
  owner_id uuid,
  display_name text,
  hidden boolean NOT NULL DEFAULT false,
  position text COLLATE "C" NOT NULL,
  h1_block_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT folder_facets_pkey PRIMARY KEY (id),
  CONSTRAINT folder_facets_folder_id_fkey
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT folder_facets_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT folder_facets_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT folder_facets_h1_block_id_fkey
    FOREIGN KEY (h1_block_id) REFERENCES page_blocks(id) ON DELETE CASCADE,
  CONSTRAINT folder_facets_kind_check
    CHECK (kind IN ('main', 'purpose', 'consultation', 'results',
                    'work', 'shared_blank', 'private_blank')),
  -- Custody, and only on the one kind that has an owner at all (#209: a
  -- private facet's owner is the person it is private to).
  CONSTRAINT folder_facets_owner_kind_check
    CHECK ((owner_id IS NOT NULL) = (kind = 'private_blank')),
  -- NULL on main/consultation/work, NOT NULL on the two blanks, either on
  -- purpose/results -- where NULL *is* the default name and Reset is a write
  -- of NULL. A CASE over `kind` rather than a chain of ORs, so every branch
  -- yields a real boolean and the unreachable kind falls to TRUE explicitly.
  CONSTRAINT folder_facets_display_name_kind_check
    CHECK (CASE kind
             WHEN 'main' THEN display_name IS NULL
             WHEN 'consultation' THEN display_name IS NULL
             WHEN 'work' THEN display_name IS NULL
             WHEN 'shared_blank' THEN display_name IS NOT NULL
             WHEN 'private_blank' THEN display_name IS NOT NULL
             ELSE TRUE
           END),
  -- 4.17's heading ceiling, one object over: a facet's name sits where an H1
  -- sits and is bounded the same way.
  CONSTRAINT folder_facets_display_name_length_check
    CHECK (display_name IS NULL
           OR char_length(display_name) BETWEEN 1 AND 120),
  -- Main can never be hidden (#210), and a custom facet is deleted rather
  -- than hidden.
  CONSTRAINT folder_facets_hidden_kind_check
    CHECK (NOT hidden OR kind IN ('purpose', 'consultation', 'results')),
  CONSTRAINT folder_facets_position_format_check
    CHECK (position ~ '^[0-9A-Za-z]{2,255}$'),
  CONSTRAINT folder_facets_h1_kind_check
    CHECK ((h1_block_id IS NOT NULL) = (kind = 'work'))
);
--> statement-breakpoint
-- The effective order read, and the only index `GET /folders/:id/facets`
-- needs: one folder's live facets in `position` order, with `id` breaking
-- the tie section 6's preamble leaves.
CREATE INDEX folder_facets_folder_id_position_idx
  ON folder_facets (folder_id, position, id)
  WHERE deleted_at IS NULL;
--> statement-breakpoint
-- "Exactly one of each", as a constraint rather than as a handler's good
-- intentions. It is deliberately **not** partial on `deleted_at`: a native
-- facet is hidden rather than deleted (`folder_facets_hidden_kind_check`
-- above), so there is no live-versus-trashed distinction to make here and a
-- partial index would admit a second Main the moment somebody wrote a
-- `deleted_at` onto the first.
CREATE UNIQUE INDEX folder_facets_folder_native_kind_idx
  ON folder_facets (folder_id, kind)
  WHERE kind IN ('main', 'purpose', 'consultation', 'results');
--> statement-breakpoint
-- One Work facet per H1, which is #210's rule and the 409 the route answers.
-- Partial on `deleted_at IS NULL` for 4.28's leave-and-rejoin reason: a
-- trashed Work facet must not stop somebody making a new one over the same
-- heading, and restoring it is then the thing that can collide rather than
-- the thing that is pre-emptively forbidden.
CREATE UNIQUE INDEX folder_facets_h1_block_id_idx
  ON folder_facets (h1_block_id)
  WHERE h1_block_id IS NOT NULL AND deleted_at IS NULL;
--> statement-breakpoint
-- "My private facets", which every facet listing asks for every member.
CREATE INDEX folder_facets_owner_id_idx
  ON folder_facets (owner_id)
  WHERE owner_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE page_blocks
  ADD COLUMN facet_id uuid,
  ADD CONSTRAINT page_blocks_facet_id_fkey
    FOREIGN KEY (facet_id) REFERENCES folder_facets(id) ON DELETE CASCADE,
  DROP CONSTRAINT page_blocks_one_home_check,
  ADD CONSTRAINT page_blocks_one_home_check
    CHECK (num_nonnulls(folder_id, shelf_id, facet_id) = 1);
--> statement-breakpoint
-- 0016:254's folder index mirrored for the third home.
CREATE INDEX page_blocks_facet_page_position_idx
  ON page_blocks (facet_id, page_position, id)
  WHERE facet_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO folder_facets (folder_id, kind, position, created_by)
SELECT f.id, k.kind, k.pos, f.owner_id
  FROM folders f
  CROSS JOIN (VALUES ('main', 'a0'),
                     ('purpose', 'a1'),
                     ('consultation', 'a2'),
                     ('results', 'a3')) AS k(kind, pos);
