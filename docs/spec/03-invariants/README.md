## 3. Invariants

Properties that must hold at all times, phrased as testable assertions. "Constraint" means
a database constraint enforces it; "transaction" means the owning server transaction
enforces it; "guard" means an API precondition enforces it. An automated test suite must
assert each after every mutation-heavy test.

| ID | Assertion | Enforced by |
| - | - | - |
| INV-1 | Every task's folder_id references an existing folder and is never null | NOT NULL plus FK |
| INV-2 | Every non-deleted user has exactly one folder with is_default true; that folder is never shared, never deleted, and its owner never changes | Partial unique index; guards on share, delete, transfer |
| INV-3 | A default folder has exactly one membership row, its owner's | Guards on member add; invite validation rejects default folders |
| INV-4 | tasks.assignee_id is null or (folder_id, assignee_id) exists in folder_members | Composite FK (section 4.5) |
| INV-5 | In a folder with exactly one member, every task has assignee_id equal to that member | Transactions: create, move, unassign guard, member removal, leave |
| INV-6 | due_time, recurrence_rule, and a reminder row exist only while due_date is set | CHECK constraints; clear-date cascade (section 8.4) |
| INV-7 | Per series_id, at most one task row has status pending | Generation transaction; un-complete and restore guards |
| INV-8 | status = completed exactly when completed_at is set and exactly when completed_by is set | CHECK constraints |
| INV-9 | At most one connection row per unordered user pair, and user_a_id < user_b_id on every row | PK plus CHECK |
| INV-10 | At most one membership per (folder, user); the folder owner always holds a membership | PK; transactions on create, transfer, removal |
| INV-11 | At most one pending invite per (inviter, email, folder), counting the no-folder case as one folder value | Partial unique index |
| INV-12 | At most one Today entry per (task, user); added_on is not after today in the adder's timezone at insert time | PK; guard |
| INV-13 | recurrence_rule set implies series_id set | CHECK constraint |
| INV-14 | Every non-deleted user has exactly one user_settings row and a valid IANA timezone | Provisioning transaction; timezone validation |
