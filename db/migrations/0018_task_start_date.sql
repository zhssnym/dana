-- 4.5 gains the Start Date of the Task Schedule (issue #215, M1-A1).
--
-- Two optional dates, four valid states: neither, start only, due only, and
-- both with start on or before due. The CHECK is the fourth state's rule and
-- admits the other three by its two null arms; it is named because AC-001
-- asserts this table's constraints by name from db/constraint-catalog.ts.
--
-- Nullable with no default, so every existing row migrates with a null start
-- date. Nothing infers one from created_at or from due_date: a task that was
-- never given a start has not got one, and 4.5's other optional dates are
-- absent the same way.
--
-- No index. #216 is what turns start_date into a query predicate and should
-- pick the index once it knows whether Scheduled membership reads it as a
-- filter or as a sort; a name in the catalog that no query justifies is worse
-- than a later migration.
-- One ALTER rather than two statements, the shape 0017 uses. Subcommands are
-- applied in order, so the CHECK sees the column the line above adds. Two
-- statements in one file need drizzle's own breakpoint marker between them,
-- and without it PGlite is handed both as a single extended-protocol parse and
-- refuses with SQLSTATE 42601 -- which reads as a broken migration rather than
-- as a missing marker. Do not write that marker's text inside a comment here
-- either: the splitter is textual and cuts the file wherever it appears.
ALTER TABLE tasks
  ADD COLUMN start_date date,
  ADD CONSTRAINT tasks_start_before_due_check
    CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date);
