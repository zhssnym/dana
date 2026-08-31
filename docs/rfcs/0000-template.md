# RFC process and template

This file is two things: the rules of the RFC process (this preamble, which is
never copied), and the template itself (everything from the heading `# RFC NNNN:
Title` to the end of the file, which is copied verbatim to start a new RFC).

## Does your change need an RFC?

An RFC is required exactly when the change alters specified behavior: anything
that would make the specification say something different about what the system
does. That includes new behavior, changed or removed behavior, new limits, new
operational contracts, and architecture changes (section 11 is specification
text, so swapping a library or a host is a spec change and takes an RFC).

No RFC for:

- Code that disagrees with the spec. That is a bug; fix it in a pull request
  citing the section the code violates.
- Typos or wording in documents, with no behavioral meaning. Route to the
  Integration Steward.
- Refactors with no behavioral delta. Pull request.
- Process and tooling changes that alter no contract recorded in the spec.

Two special cases: any change to the frozen interfaces (schema, section 4; API,
section 7) is always an RFC and always a human decision. And if you are unsure
whether something is behavioral, it is; the cost of a small RFC is one page.

## Numbering and naming

Files are `NNNN-short-slug.md`: the next unused four-digit number, zero-padded,
and a kebab-case slug. Numbers are never reused; a rejected RFC keeps its number
forever. This preamble is the recorded home of these rules.

## Status lifecycle

`Draft` to `Accepted` to `Implemented`, with two exits: `Draft` to `Rejected`,
and `Implemented` to `Superseded by NNNN`.

- **Draft**: freely editable by its author.
- **Accepted**: the human owner accepts it; the Steward records the status
  change and assigns final acceptance criterion and section numbers (numbers in
  a Draft are provisional; the Steward renumbers at acceptance if another RFC
  claimed them first). After acceptance, a change to the specification delta
  returns the RFC to Draft for re-acceptance; the implementation plan may still
  be adjusted.
- **Implemented**: the Steward has folded the delta into the specification and
  recorded the change in `CHANGELOG.md`. From this moment the only edit an RFC
  ever receives is a status change to Superseded.
- **Rejected**: the human owner declines it; the Steward records the status and
  appends a one-line reason. The file is then frozen.

## The two fates of an RFC's content

When an RFC is implemented, its content splits:

- The **Specification delta** merges into the specification verbatim, and the
  specification becomes the only authority on that behavior. The RFC's copy is
  a historical snapshot.
- The **Implementation plan** never merges. It is a one-time work order, and
  once executed it is history.

The payoff this structure buys: an implementer needs only the current
specification plus the one RFC being implemented, never the RFCs before it.
Everything about the template serves that property.

The merge is the Steward's, and it is mechanical by design: for each delta unit,
copy the fenced body into the specification at the stated location, append the
changelog entry, flip the status. The specification is the `../spec/` directory:
a section number resolves to the file whose name begins with that number, so
"Replace section 8.5" names its target file unambiguously. If a merge ever requires interpretation, the
delta was written wrong; fix the writing, not the process.

## Removing behavior

Two granularities, one rule each:

- **Removing a rule inside a section** is just a Replace: the new section text
  no longer contains the rule. Nothing special is needed.
- **Removing a whole numbered section is disallowed as deletion.** Numbered
  sections are identifiers, and the specification, the persona files, and the
  acceptance criteria all cite them by number; deleting one would renumber
  everything after it and break references across three document types at once.
  Instead, a Replace unit substitutes the section with a tombstone: the heading
  stays, the body becomes one or two sentences saying the behavior was removed,
  by which RFC, and where it went if deferred. For example:

```markdown
### 8.12 Removed: task duplication

Removed by RFC 0017; duplication returned too little for its edge cases and is
deferred without a date (section 1.3). History: git and RFC 0017.
```

The same principle covers acceptance criteria: an invalidated criterion is
never deleted or renumbered; a Replace unit names it and rewrites it, either as
the corrected criterion or as the line `AC-NNN Removed by RFC NNNN.` Numbers
are append-only everywhere: sections, criteria, and RFC files alike.

## How it scales

Mandatory in every RFC: the header, Summary, Motivation, Specification delta,
Alternatives considered, Implementation plan. Omittable when irrelevant, with a
one-line reason left in place: Compatibility and migration, Open questions.

A small change scales down, not out. Adding one nullable column and one endpoint
is: a two-sentence Summary, a three-sentence Motivation, a delta with three
units (replace the affected 4.x table, replace the affected 7.x entry, append
two criteria to section 12), two bullets of alternatives, and a one-row
implementation plan. One page total. If your RFC is longer than its delta
justifies, cut the prose, never the delta.

One known exception: a bootstrap RFC building a system that does not yet exist
has no "before" and therefore no delta; it says so in the delta section and
points at the specification itself. This has happened once (RFC 0001) and by
construction cannot happen again.

# RFC NNNN: Title

- **Status:** Draft
- **Created:** YYYY-MM-DD
- **Target release:** *the release planned to carry this change, or "undecided"; a plan, not a promise*
- **Spec sections touched:** *every numbered section the delta changes, or "none"*
- **Frozen interfaces touched:** *none, or name section 4 or 7 (human decision required)*

## Summary

*Two to four sentences: what changes and for whom. No normative content here;
authority lives in the delta alone.*

## Motivation

*The problem, the evidence it is real, and why now. Written for a reader
deciding whether to accept, not for the implementer.*

## Specification delta

*The actual replacement text, in the specification's own voice and formatting.
This section merges verbatim; everything outside it is context and carries no
authority. One unit per touched location, using exactly the three operations
below (removal is a Replace; see the preamble's Removing behavior rules). A
section not named here is untouched. Every behavioral change must appear as
delta text; if a reviewer would need to ask a question, the answer belongs in
the text below, not in a comment thread that does not exist.*

### Replace section X.Y

```markdown
(the complete new text of section X.Y, heading included)
```

### Insert new section X.Y after X.Z

```markdown
(the complete text of the new section, heading included)
```

### Append to section 12

*Acceptance criteria in Given/When/Then voice, numbered from the next free
number so the merge is append-only and never renumbers anything. If an existing
criterion must change, use a Replace unit naming it, and say so in
Compatibility.*

```markdown
- AC-NNN Given ..., when ..., then ...
```

### Append to section 13

*Only questions that survive acceptance: external facts the implementation must
verify. Anything resolvable before acceptance belongs in Open questions below
and must be resolved there.*

## Compatibility and migration

*Mandatory when the delta touches section 4 or stored data, otherwise omit with
a reason. State the expand-and-contract steps per 11.5, any backfill, and every
existing acceptance criterion invalidated or reworded, by number.*

## Alternatives considered

*Mandatory. Each alternative with the reason it lost, sharply enough that a
future agent cannot confidently reintroduce it. If a decision was close, say
so. This section is the record that prevents relitigating.*

## Open questions

*Questions that block acceptance, each with what would resolve it. This section
must be empty at acceptance: resolved items move into the delta or die; open
external facts move to the Append-to-13 unit. Omit with a reason if none.*

## Implementation plan

*Never merges. Packages sized for one agent session each; a small RFC has one
row. Owners come from `CODEOWNERS`, which is the authority on who
owns what; this table repeats their claims for scheduling only. If the delta
touches section 9, name the screens affected and attach before and after images
before the UI package starts. Name file boundaries wherever two agents could
touch adjacent code.*

| ID | Delivers | Depends on | Blocks | Owner | Acceptance |
| - | - | - | - | - | - |

*State the critical path and what may run in parallel.*
