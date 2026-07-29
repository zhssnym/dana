# Dana runbook

> **Audience:** the human operator running agent sessions. This file is never loaded
> into an agent's context. It describes how to drive the build, not what to build.

The contract lives in `specification.md`. The work to be done lives in the active
RFC under `rfcs/`. The roles live in `team/`. This document is how you put those
together and run them.

## Status

Skeleton. Content to be written once the stack is chosen and the repository is
scaffolded, since every instruction here names real paths and commands.

## What this document will cover

- **Session construction.** How to open a session for a work package: which
  persona, which files to load, the opening prompt, and what to leave out.
- **The three seats.** Implementer, adversarial tester, and integration steward,
  why the tester is always a separate session from the implementer, and how many
  run at once.
- **The merge ritual.** Branch naming, the verification gate before a merge, and
  who is allowed to merge into `main`.
- **Escalation.** What stops an agent, where it routes, and which decisions must
  reach a human.
- **Bug flow.** The triage question (does the code disagree with the spec, or does
  the spec disagree with reality) and where each answer leads.
- **The release ritual.** Choosing the version number, moving the changelog's
  Unreleased section, tagging, and marking RFCs implemented.
