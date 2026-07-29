# Dana swarm: team definition

Thirteen agent personas for building Dana against `docs/v1/dana_pdd_v1.md`. Each file is self-contained enough to become one agent.

## How to use these

An agent's system prompt is **`_shared-protocol.md` followed by its own persona file**. The shared protocol carries the rules that are identical for everyone: the contract is law, state comes from artifacts, boundaries are hard, what done means, how to verify on this machine, when to escalate, and the writing conventions. Do not give an agent a persona without it.

## The roster

| # | File | Role | Owns (spec) | Packages | Acceptance criteria |
| - | - | - | - | - | - |
| 1 | `01-data-and-invariants.md` | Data and Invariants | 3, 4 | P0 | AC-001 to AC-004 |
| 2 | `02-scheduling-and-time.md` | Scheduling and Time | 8.1, 8.2, 8.5, 8.6, 4.11 | P6, P7 | AC-071 to AC-090 |
| 3 | `03-collaboration-and-permissions.md` | Collaboration and Permissions | 5.2, 5.3, 5.4, 8.7 to 8.11 | P2, P3, P5 | AC-011 to AC-024, AC-059 to AC-069 |
| 4 | `04-api-and-contract.md` | API and Contract | 7 | all backend | review authority |
| 5 | `05-query-and-read-path.md` | Query and Read-Path | 6, 4.12 | P4 | AC-045 to AC-058, AC-070 |
| 6 | `06-security-and-privacy.md` | Security and Privacy | 10.1, 10.2, 10.4, 10.5 | P1, P9 | AC-005 to AC-010, AC-101 to AC-104 |
| 7 | `07-frontend-architect.md` | Frontend Architect | 9.1, 10.6 | P8 | AC-091, AC-095, AC-100 |
| 8 | `08-component-and-design-system.md` | Component and Design System | 9 (components) | P8 | AC-096, AC-097, AC-099 |
| 9 | `09-complex-interaction.md` | Complex Interaction | 9.3, 9.5, 9.9 | P8 | AC-092, AC-093, AC-094, AC-098 |
| 10 | `10-platform.md` | Platform | 10.7, 11, 8.6 delivery | P7, P10, CI | AC-089, AC-104 |
| 11 | `11-adversarial-test.md` | Adversarial Test | 13 | all | writes all 104 |
| 12 | `12-integration-steward.md` | Integration Steward | 15, 14 | all | merge gate |
| 13 | `13-dispatcher.md` | Dispatcher | 12 (reads) | none | none |

## Three structural rules

These are the parts that make the difference between a swarm and a mess.

**Role 11 never implements.** The agent that writes a feature must never write that feature's acceptance tests, or it will test its own misunderstanding and report green. This separation is the swarm's only source of independent truth.

**Role 12 never writes feature code.** An integrator reviewing their own work is not an integrator. Its independence is the whole value.

**Role 13 never judges.** The dispatcher assigns from artifacts and never accepts work as done. State derived from agents' self-reports is rumor, not state.

## Seams that need naming

Two ownership boundaries are genuinely shared, and both have a stated tiebreaker so they do not become silent conflicts:

- **My Day and calendar queries**: the Query engineer writes the SQL and orderings; the Scheduling engineer owns the date predicates inside them and must approve changes to those predicates.
- **Reminders**: the Scheduling engineer computes fire instants; the Platform engineer runs the delivery loop and owns email infrastructure; the Component engineer builds the reminder input control.

Any other overlap that appears in practice is an escalation to the Integration Steward, not something two agents settle between themselves.

## Where the human stays in the loop

Everything runs unattended except amendments to the frozen interfaces: spec section 4 (schema) and section 7 (API). Those invalidate acceptance criteria by number and ripple across every package, so the Steward packages the decision and routes it to you. Local decisions inside a package are the Steward's to settle.
