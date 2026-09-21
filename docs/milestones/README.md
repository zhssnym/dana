# Milestones

What Dana is building, and why. One brief file per milestone.

## What a milestone file is

**A wishlist: what we want, and what it is for.** Not a specification, and not a
progress tracker.

| The question | Where it is answered |
| - | - |
| What are we building next, and why | A milestone file here |
| How far along is it | The GitHub issue that coordinates the milestone |
| What exactly does it do | `docs/spec/`, which each milestone amends as it lands |
| How was it implemented | The issue, and then the code. Discarded when the issue closes |

A live milestone is written in future tense and names its coordinating issue. It is
rewritten once, in past tense, on the day it closes. That is the only moment a
milestone file changes tense, and no milestone file ever records progress: the issue
does that and updates itself.

Milestone files never restate `docs/spec/`. Read `../README.md` before writing one.

## The milestones

| | Phase | Window | Status |
| - | - | - | - |
| [M0](M0.md) — MVP | none | to 2026-09-14 | Closed |
| [M1](M1.md) — Dana Core Work Model | 1 | 2026-09-14 to | Open ([#203](https://github.com/zhssnym/dana/issues/203)) |

M0 is retroactive. It names the work that predates the numbering, so it is the one
milestone written as a record rather than a wishlist, and it sits in no phase: #202
puts only M1, M2 and M3 inside Phase 1, and M0 finished before #202 was approved.

## Phases

**Milestone numbers are global and do not restart per phase.** Issue #202, approved
2026-09-14, sets five phases:

| Phase | | Milestones |
| - | - | - |
| 1 | Build and prove Dana internally | M1, M2, M3 |
| 2 | Prepare the company and product | none yet |
| 3 | Controlled private alpha | none yet |
| 4 | Private beta | none yet |
| 5 | Public product | none yet |

M2 and M3 have no file here yet. Their direction is in #202 and it is deliberately
revisable; only the current milestone receives implementation-level detail.

## What is not here

**Not every change belongs to a milestone.** Milestones name feature direction.
Defect, infrastructure and workflow work runs continuously beside them and is tracked
in issues alone. A milestone file that grew a list of fixes would be a changelog, and
this project does not keep one: releases are tagged (`v1.0.0`, `v2.0.0`, `v2.1.0`,
`v2.2.0`) and git holds what changed between them.
