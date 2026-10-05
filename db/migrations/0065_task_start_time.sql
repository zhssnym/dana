-- Issue #487: a task Schedule may carry an optional wall-clock time on its
-- Start endpoint, independently of the Due endpoint's existing due_time.
-- Both are floating local wall times (4.11): no timezone or instant is stored.
--
-- start_time is meaningful only beside start_date. On a same-day Schedule,
-- when both endpoint times are present, the Start endpoint cannot be later
-- than the Due endpoint. Missing times deliberately do not infer midnight or
-- any other clock value.
ALTER TABLE tasks
  ADD COLUMN start_time time,
  ADD CONSTRAINT tasks_start_time_requires_date_check
    CHECK (start_time IS NULL OR start_date IS NOT NULL),
  ADD CONSTRAINT tasks_same_day_time_order_check
    CHECK (
      start_date IS NULL OR due_date IS NULL OR start_date <> due_date
      OR start_time IS NULL OR due_time IS NULL OR start_time <= due_time
    );
