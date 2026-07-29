# Dana swarm: team definition

Thirteen agent personas for building Dana against `../specification.md`. Each file is self-contained enough to become one agent.

## How to use these

An agent's system prompt is **`_shared-protocol.md` followed by its own persona file**. The shared protocol carries the rules that are identical for everyone: the contract is law, state comes from artifacts, boundaries are hard, what done means, how to verify on this machine, when to escalate, and the writing conventions. Do not give an agent a persona without it.

## The roster

This table is a navigation index and nothing more. Ownership of spec sections, packages, paths, and acceptance criteria is stated in each persona's Owns section and nowhere else, so there is exactly one place to change when ownership moves. Do not add ownership columns back to this table; the drift they cause is why they were removed. The package-to-owner view at a glance belongs to the active RFC's implementation plan.

| # | File | Role | What it is for |
| - | - | - | - |
| 1 | `01-data-and-invariants.md` | Data and Invariants | The schema, its migrations, and the constraints that make bugs fail loudly |
| 2 | `02-scheduling-and-time.md` | Scheduling and Time | Dates, timezones, recurrence, and reminder instants |
| 3 | `03-collaboration-and-permissions.md` | Collaboration and Permissions | Multi-actor correctness: membership, invites, tasks core, cleanup |
| 4 | `04-api-and-contract.md` | API and Contract | One HTTP dialect across forty endpoints |
| 5 | `05-query-and-read-path.md` | Query and Read-Path | The twelve queries, their exact orders, and their indexes |
| 6 | `06-security-and-privacy.md` | Security and Privacy | Authentication, the authorization chokepoint, limits, and logging |
| 7 | `07-frontend-architect.md` | Frontend Architect | Client structure, the data layer, page assembly, and the PWA shell |
| 8 | `08-component-and-design-system.md` | Component and Design System | The component library, the design tokens, copy fidelity, accessibility |
| 9 | `09-complex-interaction.md` | Complex Interaction | The calendar, the task form, and the search overlay |
| 10 | `10-platform.md` | Platform | Deploys, CI, the scheduler tick, email, backups, monitoring |
| 11 | `11-adversarial-test.md` | Adversarial Test | Writes all 115 acceptance tests; never implements |
| 12 | `12-integration-steward.md` | Integration Steward | Merges, specification change control, and the seams |
| 13 | `13-dispatcher.md` | Dispatcher | Computes what is startable from artifacts; never judges |

Coverage rule: specification sections 1 and 2 are shared context with no implementing owner, changed only through the Steward's change control like all spec text. Every other numbered section is owned by exactly one persona, named in that persona's Owns section.

## Three structural rules

These are the parts that make the difference between a swarm and a mess.

**Role 11 never implements.** The agent that writes a feature must never write that feature's acceptance tests, or it will test its own misunderstanding and report green. This separation is the swarm's only source of independent truth.

**Role 12 never writes feature code.** An integrator reviewing their own work is not an integrator. Its independence is the whole value.

**Role 13 never judges.** The dispatcher assigns from artifacts and never accepts work as done. State derived from agents' self-reports is rumor, not state.

## Seams that need naming

Six ownership boundaries are genuinely shared, and each has a stated tiebreaker so it does not become a silent conflict:

- **My Day and calendar queries**: the Query engineer writes the SQL and orderings; the Scheduling engineer owns the date predicates inside them and must approve changes to those predicates.
- **Reminders and the scheduler pass**: the Scheduling engineer computes fire instants; the Platform engineer runs the delivery loop, owns email infrastructure, and invokes the Security engineer's session-pruning function from the same pass; the Component engineer builds the reminder input control.
- **Storage formats and indexes (4.11, 4.12)**: the Data engineer owns the DDL; the Scheduling engineer owns the 4.11 format semantics; the Query engineer owns each 4.12 index's justification. A change to any of the three needs the affected owners' agreement.
- **Status transitions**: the Collaboration engineer owns the transition endpoints; the Scheduling engineer owns the generation hook invoked inside them.
- **Account deletion**: the Security engineer owns the DELETE /me route and session destruction; the Collaboration engineer owns the 8.10 transaction it calls.
- **The OIDC test stub**: the Adversarial Test engineer owns the stub identity provider in `app/tests/`; the Security engineer's real module must pass against it unmodified.

Any other overlap that appears in practice is an escalation to the Integration Steward, not something two agents settle between themselves.

## Where the human stays in the loop

Everything runs unattended except amendments to the frozen interfaces: spec section 4 (schema) and section 7 (API). Those invalidate acceptance criteria by number and ripple across every package, so the Steward packages the decision and routes it to you. Local decisions inside a package are the Steward's to settle.
