Refs #487

## Backend contract
- Persist optional `tasks.start_time` as the Start endpoint wall-clock time, with migration and database invariants.
- Carry `start_time` through shared task schemas/types, POST/PATCH, canonical TaskCard/TaskDetail projections, server domain reads/writes, task/folder duplication, and account export.
- Validate `start_time` requires `start_date`; clearing Start clears only `start_time`; same-day schedules with both clocks require Start time <= Due time against the effective merged PATCH state.
- Keep date-only tasks valid and never infer a missing endpoint time.

## Preserved semantics
- Due remains the deadline/reminder/overdue/recurrence anchor.
- Start-time-only edits do not recompute Due reminders.
- Recurring generated successors remain Due-anchored and do not invent a Start endpoint.
- Existing Due-time and copy behavior is otherwise unchanged.

## Verification
- Focused #487 backend criterion covers persistence, PATCH invariants, same-day ordering, reminder non-interference, Due-anchored recurrence, duplication and export.
- Full available gate: lint, typecheck, 101 test files / 485 tests, build and Playwright smoke all passed. Dana reports the gate as incomplete only when `TEST_DATABASE_URL` is unset, so the real-Postgres leg was unavailable on the runner.
- Latest-main integration gate passed after merging current `main`: lint, typecheck, build, focused backend/export tests and diff check passed.
- Migration catalog has the same pre-existing single verifier mismatch on `folders_archived_at_idx`; #487 introduces no additional catalog failure.

Backend only. The Schedule picker/range UI is intentionally not implemented here.
