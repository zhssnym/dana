# Dana

A collaborative to-do PWA, specification-first, built by role-scoped agent
sessions. Pre-release.

- `docs/spec/` is the single source of truth for what Dana must do. It is one
  contract split by numbered section; `00-index.md` maps section numbers to files.
  It is law; its sections 4 and 7 are frozen and change only by human decision.
- `docs/rfcs/` holds the change process and the active build plan (RFC 0001).
  The process rules are the preamble of `0000-template.md`.
- `docs/team/` holds the shared protocol and thirteen role personas.
- `docs/design/` is human-committed design material; read it, never write it.
- `docs/runbook.md` is for the human operator; do not load it into your
  reasoning.

If your task is implementation work and your opening instructions did not give
you `docs/team/_shared-protocol.md` plus exactly one persona file, say so and
stop; that pairing is required for any change to `app/`.

For any writing in this repository, follow the conventions in
`docs/team/_shared-protocol.md` section 7, and verify on this machine per its
section 5. This file is a map; where it appears to differ from the shared
protocol, the protocol wins.
