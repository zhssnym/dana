## 5. State machines

Every transition not listed is forbidden and must be rejected by the API with 409 (state
conflict) or 403 (actor not permitted). Same-state repeats listed as no-op return 200
without side effects, which is the idempotency contract for retried requests.

| | File | Covers |
| - | - | - |
| 5.1 | [`05.1-task-status.md`](05.1-task-status.md) | 5.1 Task status |
| 5.2 | [`05.2-invite-lifecycle.md`](05.2-invite-lifecycle.md) | 5.2 Invite lifecycle |
| 5.3 | [`05.3-folder-membership.md`](05.3-folder-membership.md) | 5.3 Folder membership |
| 5.4 | [`05.4-permission-matrix.md`](05.4-permission-matrix.md) | 5.4 Permission matrix (authorization, not state) |
