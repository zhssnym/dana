# Docs

The rules that the code does not show. When a document and the code do not agree, the code
is the current behavior. Correct the one that is wrong.

| File | Content |
| - | - |
| `product-rules.md` | What Dana is, permissions, task status, time rules, trash and deletion |
| `security.md` | Sign-in, sessions, authorization, limits, logs, headers, email, data obligations |
| `architecture.md` | The stack, constraints and library traps |
| `troubleshooting.md` | Traps that fail silently, flaky test classes, machine setup |

## Rules

- Write only what the code does not show. Do not copy columns, API shapes, routes or UI text.
- Write the current rule only. Git keeps the history.
- Do not write counts. They become wrong at the next change.
- Open questions and notes go in an issue or a PR.
- Update a document when a rule changes. You do not have to update it for each change.

`tests/repo/agent-instructions.test.ts` checks that each backticked repository
path in `troubleshooting.md` and in the root `AGENTS.md` exists.
