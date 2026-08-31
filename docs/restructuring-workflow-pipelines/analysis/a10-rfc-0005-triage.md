# A10 — RFC 0005 triage

What to cut from `docs/rfcs/0005-v2-specification.md` (6,763 lines) and what must survive.

Read-only analysis. Nothing in `docs/rfcs/` or `docs/spec/` was changed.

---

## The short version

**About 95% of this file is disposable.** Roughly 330 lines earn their place. The rest is
either already in `docs/spec/` word for word, or it is bookkeeping about a build that
finished on 2026-08-30.

The document's own process rules say so. `docs/rfcs/0000-template.md:53-66`:

> When an RFC is implemented, its content splits:
> - The **Specification delta** merges into the specification verbatim, and the
>   specification becomes the only authority on that behavior. **The RFC's copy is a
>   historical snapshot.**
> - The **Implementation plan** never merges. It is a one-time work order, and **once
>   executed it is history.**
>
> The payoff this structure buys: an implementer needs only the current specification plus
> the one RFC being implemented, **never the RFCs before it.**

RFC 0005's own status line reads **"Implemented 2026-08-30 (S30), released as 2.0.0"**
(line 3). By its own rules it became a historical snapshot the day it landed, and the
snapshot is in git — `git show v2.2.0:docs/rfcs/0005-v2-specification.md` returns all
6,763 lines, and the file has not changed since the tag (verified).

One more thing worth saying plainly: **`## Change control` is not a section the template
has.** The template's skeleton is Summary, Motivation, Specification delta, Compatibility
and migration, Alternatives considered, Open questions, Implementation plan. The string
"change control" appears nowhere in `0000-template.md`. The 5,167-line section that is 76%
of this file is an accretion, not a required part of an RFC.

---

## 1. The verdict on scale

### Line accounting

| Region | Lines | Count | Verdict |
| - | - | - | - |
| Title, status header, draft note | 1–54 | 54 | Dead. 34 lines explain why a status line changed |
| Summary | 55–68 | 14 | Keep, trimmed to ~8 |
| Motivation | 69–80 | 12 | Keep, trimmed to ~6 |
| **Specification delta** | 81–1388 | **1,308** | **66% byte-identical to the spec.** ~190 lines of rationale survive |
| Compatibility and migration | 1389–1414 | 26 | Dead. Migrations executed; consequences folded |
| **Alternatives considered** | 1415–1435 | **21** | **Keep all of it.** Highest value per line in the file |
| Open questions | 1436–1447 | 12 | Dead. Two struck through as resolved; the third is spent |
| Late frozen delta units | 1448–1586 | 139 | 52% byte-identical to the spec |
| **Change control** | 1587–6753 | **5,167** | **88.5% dead process.** ~150 lines survive, plus a 61-line index |
| Implementation plan | 6754–6763 | 10 | Dead. One row pointing at RFC 0004 |

**Total 6,763. Survives: ~330 lines (5%).**

### How I established the general rule

Three checks, in order of strength.

**Check 1 — every proposed section exists in the spec.** The RFC inserts sections 4.13–4.21,
7.12–7.20, 9.10–9.13 and 10.8. Every one is present in `docs/spec/` today:
`04-data-model.md` runs 4.13 events through 4.21 sample_objects; `07-api.md` runs 7.12
through 7.20; `09-ui.md` runs 9.10 through 9.13; `10-non-functional.md:69` is 10.8. Not one
proposed section is missing.

**Check 2 — the text is byte-identical, not merely equivalent.** RFC lines 173–197 (the
4.13 `events` payload) and `docs/spec/04-data-model.md:205-228` are the same characters,
table rows and index sentences included. I then did this mechanically for the whole delta:
grouped it into paragraphs, normalised whitespace, dropped fence markers and instruction
headings, and looked for each paragraph in the concatenated spec.

- Specification delta: **111 of 158 paragraphs (70%), 519 of 783 lines (66%)** appear in
  `docs/spec/` verbatim, as a reflowed match, or as a table whose rows are ≥70% present.
- Late frozen changes: 7 of 13 paragraphs, 42 of 80 lines (52%).

**Check 3 — where the spec differs, the spec is newer.** RFC line 663 and
`docs/spec/09-ui.md:127` both begin "There is no task form." The spec's copy carries an
extra clause the RFC does not have, recording a polish-round fix of 2026-08-30 about the
"tab" option opening a dialog. The RFC is not a second opinion; it is a stale one.

That is the general rule: **the delta is folded, and where the two disagree the spec has
moved on.**

### The 34% that is not in the spec

Of 47 unmatched paragraphs in the delta, they sort cleanly into two piles:

- **~110 lines of scaffolding** — the inventory list at lines 89–109 ("1. Replace section
  1.1's summary paragraph — **verbatim below**"), and italic editorial notes ("*Nine units,
  added 2026-08-26 by RFC 0004's S22a row*"). This is instructions to whoever performed the
  merge. The merge is done.
- **~190 lines of genuine rationale** — bolded reasoning paragraphs at lines 1026–1064,
  1078–1093, 1130–1151, 1174–1226, 1240–1270. These explain *why* a folded rule took the
  shape it did. The spec carries the rule and not the reason. **This is the keeper pile in
  the delta.**

---

## 2. The change-control section

**5,167 lines, lines 1587–6753, 61 numbered items, no subheadings.** This is the part
Hassan is describing. It is one `##` heading with 5,167 lines under it.

### What it actually contains

I classified every paragraph in it. A paragraph counts as dead process if it carries two or
more markers of the vanished build (`owner column`, `persona`, `Steward`, `protocol
section`, `RFC 0004`, `ledger`, `L-###`, `DES-###`, `docs/team`, `prototype-v2`, `Routed
to`, `Accepted as recommended`, a session id, a bare commit sha).

| Class | Lines | Share |
| - | - | - |
| Dead process | 4,152 | **88.5%** |
| Candidate rationale (no process marker, ≥2 reasoning markers) | 536 | 11.4% |

**536 is a generous upper bound, and about half of it is already elsewhere.** Spot-checking
the candidates:

| Candidate | Where it already lives | Verdict |
| - | - | - |
| L2539–2543, the email HTML amendment | `docs/spec/10-non-functional.md:65`, which carries the fuller reason including *why the plain-text rule was dropped* | Dead |
| L3842–3852, theme mirror is a cache | `docs/spec/09-ui.md:220` | Dead |
| L5125–5134, "re-run alone" is wrong for a UI race | `CLAUDE.md:299-314`, verbatim, citing this item back | Dead |
| L4026–4031, a step promotes and a task never demotes | `docs/spec/07-api.md:148` has the rule, **not the reason** | Keep the reason |
| L4725–4734, `pointer-events-none` on a hover-revealed control | Nowhere | Keep |
| L2843–2851, the CAN-SPAM transactional boundary | Nowhere | Keep |

So the honest number for change control is **about 150 lines of surviving reasoning**, plus
a 61-line index. **5,167 → ~210. A 96% cut.**

### Why the item numbers must still resolve

`docs/spec/` cites RFC 0005 change control items by number in about 50 places, and
`CLAUDE.md:314` cites item 51(n). Examples: `04-data-model.md:177` cites item 6,
`10-non-functional.md:65` cites item 26, `09-ui.md:220` cites items 43 and 52,
`07-api.md:149` cites item 58.

**Deleting the items outright breaks ~50 live citations.** But those citations are
provenance footnotes — the spec already states the substance beside them. So the items need
to remain *addressable*, not *readable at length*.

**The answer is an index: one line per item, 61 lines, replacing 5,167.** Every citation
resolves, nothing is lost that the spec does not already say.

### What the items are, plainly

The recurring subject matter, from the item titles themselves:

- **Items 12, 34, 46, 47(c), 48(a), 50(a), 51(a) are the same complaint seven times**: a
  plan table named the wrong agent role as owner of a directory. Item 48 is titled "the
  owner column wrong a sixth time", item 50 "a seventh time", item 51 "an eighth time". The
  roles lived in `docs/team/`, which was deleted on 2026-08-31.
- **Routing and ratification**: "Accepted as recommended, by Imran", "Routed to the Steward,
  not decided here", "Relayed, and more thinly than item 22's".
- **Estimates**: "About half a session", "three and a half sessions".
- **Measurements of a tree that no longer exists**: "Numbers, read at this writing on
  `v2-build` at `4dbe6fb`", "164 names in 210 declarations".

None of that survives the deletion of `docs/team/`, `SESSION-LOG.md` and the standalone
prototype process. **215 lines name a deleted artifact directly**; the paragraph-level
contamination is 4,152.

### The twelve biggest items are the worst offenders

Items 51 (498 lines), 49 (415), 50 (286), 48 (276), 47 (238), 44 (201), 41 (155), 35 (143),
34 (141), 9 (127), 58 (117), 57 (107) are **2,704 lines, 52% of change control**. Item 51
opens by settling which of four agent personas owned which directory. Inside those 498
lines there is one durable engineering sentence — *"a capability lifted ahead of its
consumer fails in neither half loudly"* — and it is worth keeping. One sentence from 498
lines is the trim ratio for this material.

---

## 3. Proposed structure

`docs/rfcs/0005-v2-specification/` — three files, ~330 lines total.

| File | Lines | Purpose |
| - | - | - |
| `README.md` | ~70 | What v2 changed, the status, and a table mapping each delta unit to the spec section that now owns it |
| `decisions.md` | ~190 | The reasoning the spec cannot carry: rejected alternatives, and the *why* behind non-obvious folded rules |
| `change-control.md` | ~75 | The 61-item index, one line each, so every spec citation resolves |

**Do not keep the delta text.** It is 1,447 lines that are 60%+ byte-identical to
`docs/spec/`, and where it differs it is older. The template already calls the RFC's copy "a
historical snapshot", and the snapshot is one command away:
`git show v2.2.0:docs/rfcs/0005-v2-specification.md`. Keeping a stale second copy of the
spec next to the spec is how the two come to disagree.

`README.md` should carry that command explicitly, so nobody has to guess where the full text
went.

**On applying this to the other RFCs**: `0001` (167 lines) and `0004` (369) are build plans,
not RFCs — they should be labelled as such rather than restructured. `0003` (66 lines) is
already the shape the template describes and needs nothing. `0002` (769 lines) is a real
delta and deserves the same triage, at maybe a third of the effort.

This agrees with `a5-docs-structure.md:585-590`, which says "Do not migrate all 61 — most
are spent." My measurement sharpens it: most are not merely spent, **they are already
folded**, and the spec states them better than the RFC does.

---

## 4. Worked sample

Four items in the form I am proposing. This is what the trim keeps.

### Sample A — `decisions.md`, the rejected alternatives

Source: lines 1415–1435, 21 lines. **This block is the single most valuable thing in the
file** and it survives almost intact. The spec carries every one of these decisions and none
of the rejections: `docs/spec/07-api.md:302` says "LWW per block, 409 on stale" and nowhere
in `docs/spec/` does the string "CRDT" appear. Trimmed to 13 lines, cutting only the
`DES-###` and `D#` register codes, which pointed into deleted files:

> **Alternatives rejected for v2, and why**
>
> - **Per-viewer folder identity** lost to folder-owned identity. A collaboration product
>   where every member sees a different page is two products; the per-member table also
>   doubles the sharing system.
> - **CRDTs for page blocks** lost to last-write-wins plus 409. Dana's concurrency is two
>   people occasionally, not documents-as-a-service, and the spec already had the conflict
>   vocabulary.
> - **Real-time push for comments** lost to refetch-and-poll. No new architecture, single
>   instance intact. Deferred by name, not denied.
> - **A reminders redesign** lost to the existing `time_of_day` mode. The schema already
>   answered day-level reminders; a new column would have been a worse copy of 4.8.
> - **Trash as its own table** lost to `deleted_at` columns. Users already soft-delete this
>   way, so it is one pattern, and restore is an UPDATE.

### Sample B — `decisions.md`, the task hand order

Source: lines 1026–1064, 39 lines. The spec's `04-data-model.md:103` carries the column —
`position | text | yes | none | COLLATE "C"; ... null until that folder is first arranged by
hand` — and none of the reasoning. Trimmed to 18 lines:

> **The hand order is a fractional index, not an integer**
>
> A plain integer renumbers every row below a drop. The stored value is a string of base-62
> digits in ASCII order, so a key strictly between any two keys can always be computed and a
> drop writes one row instead of a tail. The key carries its own integer part, whose first
> character encodes its length, because the plain midpoint fails on the least exotic gesture
> there is: dragging to the bottom appends after the last key and grows it by a digit every
> time. Notion, Linear and Figma use this shape.
>
> **`COLLATE "C"` is contract, not local optimisation.** Dana's suite runs on two engines. A
> hand order that reads one way on PGlite and another on a cluster with a different default
> breaks section 6's byte-identical guarantee, and breaks it invisibly. Byte order is byte
> order in every database that exists, so both legs and production agree by construction
> rather than by configuration.
>
> **Null means never arranged**, so no folder anybody has left alone reads differently. **No
> index ships with the column**: 4.12's rule is that an index with no named consumer in
> section 6 does not ship, the one query that reads it already has its predicate index, and
> it sorts one folder's undated open rows, capped at 1000.

### Sample C — `decisions.md`, the order endpoint

Source: lines 1192–1226, 35 lines. This one barely trims, because it is nearly all signal —
which is the point. It survives at 24 lines out of 5,167 in change control:

> **The order endpoint takes neighbours, and three things it refuses**
>
> The client names the two rows it dropped between; the server computes the key. A client
> sending an index would be sending a claim about a list it may have read a minute ago. A
> client sending a key would be an implementation of this contract living on the wrong side
> of it.
>
> **The first drag places the whole list.** Until a folder is arranged every position is
> null, and null leads, so a row dropped at the top would land below every unplaced row and
> the gesture would visibly fail. The call assigns keys to the rows that have none, in the
> order the list already reads, before placing the dragged one. Nothing a reader can see
> moves.
>
> **No `updated_at` moves, the moved task's included** — a deliberate deviation from 4.5's
> "touched on every mutation". That column has two consumers, the last-write-wins tiebreak
> and the search recency key, and a row's place in a list is evidence for neither. Touching
> it would push every task in a rearranged folder to the top of that person's search
> results: a visible defect produced by a bookkeeping habit.
>
> **Concurrency needs no lock on the read path.** Two people placing into one gap compute
> the same key and produce a tie, which section 6's final id tie-break resolves into one
> sequence both of them read. The transaction locks the folder so two first drags cannot
> both seed the list.

### Sample D — `change-control.md`, the index

This is what 5,167 lines becomes. One line per item: number, date, what was decided, where
it landed. Every spec citation resolves against this. Six real rows, from items I verified:

> **RFC 0005 change control — index**
>
> The full text of all 61 items is at
> `git show v2.2.0:docs/rfcs/0005-v2-specification.md`, lines 1587–6753. It is not
> reproduced here: the decisions below are stated in the specification, which is the
> authority on all of them. This index exists so that citations by item number resolve.
>
> | # | Date | Decided | Landed in |
> | - | - | - | - |
> | 4 | 2026-08-24 | Event fan-out happens at the authorization chokepoint in the mutation's own transaction, not on the scheduler tick | spec 11.7 |
> | 6 | 2026-08-24 | Sidebar pins derive from the three v1 visibility flags until first written, so two records of one fact are never both authoritative | spec 4.10 annotation |
> | 26 | 2026-08-25 | Email templates are HTML with a required text/plain alternative | spec 10.7 |
> | 36, 38 | 2026-08-26 | Trash gains a permanent delete that destroys the objects; folder deletion rules settled | spec 7.13, 9.11 |
> | 43, 52 | 2026-08-26 | Theme mirrors into the browser write-through; the 4.19 column stays the record | spec 9.7 |
> | 51(n) | 2026-08-27 | A browser case whose assertion races a UI transition fails *more* in isolation | `CLAUDE.md` |

---

## 5. What I am recommending you throw away

Blunt list, with why.

1. **The whole specification delta, 1,447 lines.** Folded, and older than the spec where
   they differ. Git has it.
2. **The change-control narrative, ~5,000 of 5,167 lines.** It records who owned which
   directory, who ruled what, what a session measured, and what was routed to whom, for a
   process whose files were deleted on 2026-08-31.
3. **The status header's 34-line explanation of its own re-acceptance** (lines 10–33). It
   explains why a signature was refreshed. The RFC is implemented; the signature question is
   closed.
4. **The "Draft note on baselines"** (lines 45–54). It describes `[STUB]` units still being
   authored. They were finished a year of build-time ago.
5. **Compatibility and migration, 26 lines.** The three data migrations ran. The
   consequences are in the spec.
6. **Open questions, 12 lines.** Two are struck through as resolved in the text itself; the
   third ("the criteria units are authored by S1") describes a session that has run.
7. **Implementation plan, 10 lines.** A table with one row saying "See RFC 0004".

**Do not throw away** the Alternatives considered block, the ~190 lines of delta rationale,
the ~150 lines of change-control reasoning, or the item index. That is the 330.

One live item that is **not** documentation and should not be filed as such: item 21 (lines
2264–2304) records that `app/.env` is tracked on `origin/main` and that
`GOOGLE_CLIENT_SECRET` sits in published git history at commit `bf90c0a`. It notes rotation
is the only act that changes the exposure, since untracking never removes it from history.
`CLAUDE.md` carries the *policy* (the file is committed deliberately) but not this fact.
**That belongs in a security to-do, not in an archived RFC**, and it should not be deleted
along with the item that carries it.

---

## What I could not verify

- **Whether the ~50 spec citations of item numbers are each accurate.** I confirmed the
  citations exist and sampled six against their items. I did not check all fifty. If any
  cites the wrong number, my index inherits the error. Item 34 in the RFC records exactly
  this happening once already — a citation that read 25 and should have read 26 — so the
  risk is real rather than theoretical.
- **The exact keeper line count.** My 536-line figure for change-control rationale is a
  mechanical upper bound from a keyword classifier, and my ~150-line estimate comes from
  spot-checking about a dozen of those 53 candidate paragraphs against the spec. Someone
  doing the actual trim should expect to land somewhere between 120 and 250, and I would not
  defend the midpoint to a decimal.
- **Whether any of the ~190 lines of delta rationale is contradicted by later work.** I
  verified they are absent from `docs/spec/`. I did not verify they are still true of the
  running code — the fractional-index and order-endpoint reasoning describes `app/` behaviour
  I did not read, and I was asked not to run the suite.
- **RFC 0002 (769 lines).** I recommend the same treatment on the strength of its size and
  its "specification delta" shape, which `a5-docs-structure.md:409` also reports. I did not
  triage it.
- **Whether Imran needs the narrative for anything.** My judgement is that the change-control
  items are agent-process bookkeeping with no product-owner audience. If he reads them as a
  record of decisions he personally ruled on, the index preserves the fact of each ruling but
  not his stated words, and several items do quote him directly.
