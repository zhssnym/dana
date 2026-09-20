# A feature too big for one pull request

**Cut to a note, 2026-09-20, issue #249.** What stood here was a seven-step sequence for an
RFC-sized feature: Hassan writes an RFC, the RFC becomes a GitHub milestone, the work
becomes issues inside that milestone, schemas and a stub endpoint land on `main` first,
both sides then build in parallel and merge in slices.

**No work in this repository has ever gone through it**, which is why it is no longer
written as instructions. Measured 2026-09-20: this repository has never had a milestone
(`state=all` returns `[]`), the `rfc` label has never been applied to any issue, and M1 —
issues #202 to #230, the entire current programme — has no RFC. `docs/rfcs/` holds RFCs
0001 to 0005, every one of them a record of a build that was already finished.
`docs/README.md`'s rule is the reason this is a deletion rather than a reminder: a process
no branch has followed in a month is not a process.

**What actually happens is what [`how-we-work.md`](how-we-work.md) describes for every
other size of work.** The issue carries the design, the branch carries the code, the pull
request carries the gate record. A feature too big for one pull request becomes several
issues and merges as several pull requests. There is no separate process to start, nothing
to write first, and nobody to get permission from.

## The two things from that sequence that were real

They are here because they are the reason the v1 and v2 integrations went badly, and
neither is visible in the code once it has worked.

**The shape lands on `main` before either side builds against it.** The zod schema in
`app/src/shared/` is the contract, and it lands together with a working endpoint behind it
that returns empty or hardcoded data of the right shape — real URL, real method, real auth.
A schema with no endpoint behind it leaves the client building against fixtures of its own
invention, and the two shapes then diverge quietly. [`hard-stops.md`](hard-stops.md) carries
the rule that makes half of this a hard stop: a request-schema field the server does not
read is accepted, dropped and answered 200, so the field, the code that reads it and the
criterion that proves it arrives all land in the same change.

**The screen merges last.** Schema and stub, then the real implementation, then the screen —
each slice harmless on its own, so a long feature needs no long-lived branch and no feature
flag. Where a screen genuinely cannot be split, land it on a route the sidebar does not link
yet. **The test of whether this worked: at the end, nothing has to be connected.** A phase
for wiring the two sides together means the contract was never real.
