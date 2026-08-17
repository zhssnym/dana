# Agent instructions

Codex and other agent tools read `AGENTS.md` by convention; Claude Code reads
`CLAUDE.md`. This file exists so both kinds of session receive the same
grounding, and it adds no rules of its own, because a rule stated twice will
one day disagree with itself.

1. Read `CLAUDE.md` in full before doing anything else. All of it applies to
   you: the repository map, this machine's environment and commands, and the
   architecture sketch.
2. If your task touches `app/`, your opening instructions must include
   `docs/team/_shared-protocol.md` plus exactly one persona file from
   `docs/team/`. If they did not, say so and stop. `CLAUDE.md` states this
   rule; this file does not soften it.
3. `docs/team/_shared-protocol.md` is the operative rulebook: boundaries,
   definition of done, escalation, tests, writing conventions. Wherever two
   documents appear to differ, the protocol wins.
