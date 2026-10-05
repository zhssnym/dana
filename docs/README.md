# What belongs in this folder

Write a document here only when the code cannot give the answer.
If you can find the answer when you read or run the code in one minute, do not write it.

## What is here

| Path | What it is for |
| - | - |
| `spec/` | Product rules and contracts, in numbered sections. Section 12 has the acceptance criteria. |
| `troubleshooting.md` | Traps that fail silently, flaky test classes, and machine setup. |
| `milestones/` | What Dana builds next, and why. One short file for each milestone. |

## Rules

- Do not describe what the code does. Read the code.
- Do not copy schemas, constants, routes or UI text into a document.
- Do not add notes, plans or open questions here. Put them in the issue or the PR.
- A new trap goes in `troubleshooting.md` as symptom, cause, fix.

`app/tests/guards/guard-agent-instructions.test.ts` checks that each backticked repository
path in `troubleshooting.md` and in the root `AGENTS.md` exists.
