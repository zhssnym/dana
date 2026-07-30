## 5. State machines

Every transition not listed is forbidden and must be rejected by the API with 409 (state conflict) or 403 (actor not permitted). Same-state repeats listed as no-op return 200 without side effects, which is the idempotency contract for retried requests.

### 5.1 Task status

Actors: any member of the task's folder. All transitions execute as guarded single-row updates (UPDATE ... WHERE id = X AND status = 'expected'); zero rows updated means the caller lost a race and the server re-reads to classify no-op versus conflict.

| Current | Event | Guard | Next | Side effects |
| - | - | - | - | - |
| pending | complete | none | completed | set completed_at = now(), completed_by = actor; if recurrence_rule set, run generation (section 8.5) in the same transaction |
| pending | abandon | none | abandoned | if recurrence_rule set, run generation (section 8.5) in the same transaction |
| completed | uncomplete | G-SERIES (below) | pending | clear completed_at, completed_by; recurring branch of G-SERIES may delete the successor and reclaim the rule |
| abandoned | restore | G-SERIES | pending | dates, due_time, reminder configuration untouched |
| completed | complete | none | completed | no-op, 200 |
| abandoned | abandon | none | abandoned | no-op, 200 |
| pending | uncomplete | none | pending | no-op, 200 |
| pending | restore | none | pending | no-op, 200 |
| completed | abandon | never | rejected | 409, copy: complete tasks cannot be abandoned; un-complete first |
| abandoned | complete | never | rejected | 409, copy: restore the task first |
| abandoned | uncomplete | never | rejected | 409 |
| completed | restore | never | rejected | 409 |
| any | delete | actor is member | row removed | cascades: steps, my_day_entries, reminder, invites.task_id set null |

G-SERIES guard, applied when the row has a series_id: let S be the pending row with the same series_id other than this row (INV-7 makes it unique or absent).
- S exists: allowed. In the same transaction, delete S (its steps and reminder cascade), copy S.recurrence_rule back onto this row, and this row becomes the current occurrence. The confirmation dialog warns that the next scheduled occurrence is removed, including any edits made to it.
- S absent and this row has the greatest created_at among rows sharing series_id: allowed. The row returns to pending keeping whatever recurrence_rule it holds (an exhausted series keeps its rule on the last row and simply resumes).
- Otherwise: rejected, 409, copy: this repeating task has already moved on; restore is only possible on its latest occurrence.

### 5.2 Invite lifecycle

| Current | Event | Actor guard | State guard | Next | Side effects |
| - | - | - | - | - | - |
| (none) | create | any authenticated user | validations V-INV (section 8.7) | pending | one email sent; last_sent_at = now() |
| pending | accept | user whose lowercased Google email equals invites.email | acceptor not soft-deleted | accepted | acceptance transaction, section 8.7: connection upsert, membership grant if folder attached and absent, conditional assignment if task_id set; responded_at, accepted_by set |
| pending | decline | matched recipient (same rule as accept) | none | declined | responded_at set; no email to inviter |
| pending | cancel | inviter, or owner of the attached folder | none | canceled | responded_at set |
| pending | resend | inviter | now() minus last_sent_at at least 24 hours, else 429 | pending | email re-sent; last_sent_at updated |
| pending | inviter account deleted | system | none | invalidated | part of the account deletion transaction (section 8.10) |
| pending | folder deleted | system | none | row removed | via FK cascade |
| any terminal | any event | any | never | rejected | 409 |

Terminal states: accepted, declined, canceled, invalidated. A new invite to the same email and folder may be created after a terminal state; INV-11 only restricts pending duplicates.

### 5.3 Folder membership

| Current | Event | Actor guard | State guard | Next | Side effects |
| - | - | - | - | - | - |
| non-member | add | any current member of the folder | target has a roster connection with the actor; folder not default; member count below cap | member | membership row created; share-grant email to target |
| non-member | add via invite acceptance | system (section 8.7) | folder not default | member | membership row created |
| member (not owner) | remove | folder owner | none | non-member | R-CLEAN below |
| member (not owner) | leave | the member themselves | none | non-member | R-CLEAN below |
| member (owner) | leave | the owner | at least one other member exists, else 409 with copy: delete the folder instead | non-member | ownership transfers first (section 8.9), then R-CLEAN |
| member | add | any | never (already member) | rejected | 409, copy: already a member |

R-CLEAN, the removal side-effect block, one transaction: set assignee_id null on the leaver's assigned tasks in the folder (the composite FK also enforces this); delete the leaver's my_day_entries for tasks in the folder; if the folder's remaining member count is exactly one, assign every unassigned task in it to the remaining member (INV-5); the leaver's pending invites for this folder remain valid (they were sent by a then-member; revisit only if abused).

### 5.4 Permission matrix (authorization, not state)

Server-enforced on every endpoint; the client merely hides controls.

| Action | Owner | Member (not owner) | Non-member |
| - | - | - | - |
| See folder and every task in it | yes | yes | no (404) |
| Create, edit, complete, abandon, restore, delete any task | yes | yes | no |
| Move a task in or out (must be member of both folders) | yes | yes | no |
| Pull any visible task into own My Day | yes | yes | no |
| Set or clear own label and color on the folder | yes | yes | no |
| Add members, send folder invites, cancel own invites | yes | yes | no |
| Cancel any invite for the folder | yes | no (only own) | no |
| Rename folder | yes | no (403) | no |
| Delete folder | yes | no (403) | no |
| Remove another member | yes | no (403) | no |
| Leave folder | via transfer rule | yes | no |
| Share or delete a default folder | no (409) | n/a | n/a |
