# RFCs

An RFC is written for **one big feature**: weeks of work on both sides at once.
Anything smaller is a GitHub issue and no document at all.

Hassan writes them. Imran accepts or rejects them, so the opening of every RFC has
to be readable by someone who does not read code.

## How an RFC becomes work

1. A discussion reaches a conclusion, and the work is too big for one branch.
2. Hassan writes the RFC, copying [`TEMPLATE.md`](TEMPLATE.md).
3. Imran accepts it.
4. **A milestone is created, named for the RFC**, and the RFC's status becomes
   `accepted -> Milestone #N`.
5. The work is broken into issues, all of them in that milestone. Each is an
   ordinary issue: branch, pull request, review, merge.
6. The milestone reaches 100%. The RFC is implemented.

**The milestone is the only record of progress.** The RFC says why and what; it never
says how far along. Two places tracking one thing is how a document starts lying, and
the milestone is the one that updates itself.

[`../workflow/big-features.md`](../workflow/big-features.md) is the process the RFC
feeds: agree the contract, ship a stub, both sides build in parallel, merge in slices.

## Numbering

`NNNN-short-slug.md`, the next unused four-digit number. **Numbers are never reused.**
A rejected RFC keeps its number forever, and the file stays: the reasoning for a no is
worth as much as the reasoning for a yes.

## The five that exist

All five predate the milestone process and describe work that is finished. They were
cut down on 2026-09-01 from 8,134 lines to a fraction of that, because the product they
produced is the running application and the specification, and what a finished RFC still
owes a reader is the reasoning rather than the plan.

The full originals are in git: `git show v2.2.0:docs/rfcs/<file>`.

| RFC | What it was |
| - | - |
| [0001](0001-mvp.md) | The MVP: the whole product, packages P0 to P10 |
| [0002](0002-client-ui-replacement.md) | Replacing the hand-rolled client components with a component library |
| [0003](0003-axiom-log-retention.md) | Where application logs go, and for how long |
| [0004](0004-v2-port-and-build.md) | The v2 port, and why patching the v1 client failed twice |
| [0005](0005-v2-specification.md) | The v2 specification: navigation, day-level dates, roles, six systems |
