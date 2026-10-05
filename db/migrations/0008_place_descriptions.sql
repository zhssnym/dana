-- 0008: a person's own words under one of Dana's place pages (issue #68,
-- from #21). Forward-only, additive, every constraint named because AC-001
-- asserts the catalog by name.
--
-- **Why a table of its own rather than a column on user_page_covers**, which
-- already keys (user_id, place) and is the obvious place to look. Two of that
-- table's own rules are load-bearing and neither survives a passenger column.
-- Its one-source CHECK, `(file_id IS NULL) <> (preset IS NULL)`, admits no row
-- without a cover, so a description with no cover has nowhere to sit; that was
-- measured against the migrated schema rather than read off the DDL. And its
-- file FK cascades, deliberately, so that deleting the picture deletes the
-- cover rather than leaving a half-set row -- which would mean deleting a
-- photograph silently destroyed the sentence a person wrote about the page.
-- Relaxing both to carry one nullable column would rewrite a shipped surface's
-- semantics; a second table costs one join nobody makes, both readers being
-- one viewer's own rows keyed by the primary key.
--
-- **The row exists exactly when there are words**, which is 4.20's discipline
-- restated: description is NOT NULL and at least one character, so clearing is
-- the row's deletion and "no row" and "empty string" cannot both mean the same
-- absence. 500 is folders' and shelves' limit (4.3, 4.18), not a new one.
--
-- No index: the primary key serves the only read this table has, which is one
-- viewer's descriptions (4.12's rule, an index needs a named consumer).
CREATE TABLE user_page_descriptions (
  user_id uuid NOT NULL,
  place text NOT NULL,
  description text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_page_descriptions_pkey PRIMARY KEY (user_id, place),
  CONSTRAINT user_page_descriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_page_descriptions_place_check CHECK (place IN ('today', 'scheduled', 'assignments', 'important', 'all', 'done', 'abandoned', 'anytime')),
  CONSTRAINT user_page_descriptions_length_check CHECK (char_length(description) BETWEEN 1 AND 500)
);
