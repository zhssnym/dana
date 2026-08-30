-- S22a's ruled schema: the four frozen section 4 changes RFC 0005 change
-- control item 44 ruled (B4, B1, B7) and nothing else. The fourth, B3, is
-- frozen section 7 alone and needs no column.
--
-- Expand-only and data-free. Every addition is nullable or defaulted, no
-- existing column changes shape, and nothing here rewrites a row: a folder
-- nobody has arranged by hand carries no positions and reads exactly as
-- section 6's Q2 has always ordered it.
--
-- Three rulings this file records rather than hides.
--
-- tasks.position is COLLATE "C" because the order of a text column is the
-- order its collation gives it, and section 6's byte-identical guarantee
-- would otherwise depend on the locale each database happened to be created
-- with. 11.10 spends a section on making PGlite and the postgres:18 leg
-- agree; pinning this one column to byte order makes that agreement
-- structural rather than configured, production included.
--
-- Its CHECK holds the alphabet and the length bounds and stops there. The
-- key's deeper invariant, that it never ends in the least digit, is a
-- property of its integer part and its fractional part together, so it is
-- enforced in src/server/domain/fractional-index.ts where both are known.
-- The upper bound is 255 rather than something tighter because subdividing
-- one gap costs about a character every six placements, and a list two
-- people rearrange for years should meet no ceiling worth reaching. It is
-- 255 rather than a round number because that is the largest repetition
-- count a POSIX regular expression may carry in Postgres: a {2,256} here
-- applies cleanly at migration time and then fails every write with
-- "invalid regular expression: invalid repetition count(s)", which reads as
-- a broken query rather than as a bad constraint.
--
-- user_page_covers.file_id cascades where folders.cover_file_id sets null,
-- and the difference is forced by the one-source CHECK below: a row with
-- neither a file nor a preset is a row this table does not admit, so the
-- file's deletion has to take the cover with it. It is also the honest
-- reading, a cover whose picture is gone being no cover rather than a
-- half-set one.
--
-- No index ships with either addition. Section 4.12's rule is that an index
-- needs a named consumer in section 6: the hand order's one reader already
-- has tasks (folder_id, status, due_date) for its predicate and sorts one
-- folder's undated open rows under the 1000-row cap, and the cover table's
-- one reader is its own primary key. steps.position has carried the same
-- shape since 4.6.
ALTER TABLE tasks
  ADD COLUMN position text COLLATE "C",
  ADD CONSTRAINT tasks_position_format_check
    CHECK (position IS NULL OR position ~ '^[0-9A-Za-z]{2,255}$');
--> statement-breakpoint
ALTER TABLE page_blocks
  ADD COLUMN width_pct integer,
  ADD CONSTRAINT page_blocks_width_pct_range_check
    CHECK (width_pct IS NULL OR width_pct BETWEEN 25 AND 100),
  ADD CONSTRAINT page_blocks_width_pct_kind_check
    CHECK (width_pct IS NULL OR kind = 'image');
--> statement-breakpoint
CREATE TABLE user_page_covers (
  user_id uuid NOT NULL,
  place text NOT NULL,
  file_id uuid,
  preset text,
  focal_y integer NOT NULL DEFAULT 50,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_page_covers_pkey PRIMARY KEY (user_id, place),
  CONSTRAINT user_page_covers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_page_covers_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  CONSTRAINT user_page_covers_place_check CHECK (place IN ('today', 'scheduled', 'assignments', 'important', 'all', 'done', 'abandoned', 'anytime')),
  CONSTRAINT user_page_covers_one_source_check CHECK ((file_id IS NULL) <> (preset IS NULL)),
  CONSTRAINT user_page_covers_preset_format_check CHECK (preset IS NULL OR preset ~ '^[a-z0-9-]{1,40}$'),
  CONSTRAINT user_page_covers_focal_y_range_check CHECK (focal_y BETWEEN 0 AND 100)
);
