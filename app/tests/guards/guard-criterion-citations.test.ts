/*
The criterion registry, read backwards: a number cited as a proof has to be a
proof, and a number cited at all has to exist.

**Why this file exists.** Issue #257. The 2026-09-20 cut deleted 221 of 268
criterion files and 113 of 119 browser specs. Section 12 was deliberately not
cut, and that was right — its own README rules that "a number that resolves to
no file under `app/tests/` is still the specification of Dana's behaviour".
What nobody swept is the **citations**. Sentences across `docs/spec/` and
`app/src/` say things like "AC-370, AC-371 and AC-372 assert it", and for a
criterion whose file is gone that sentence is false in the way that matters: it
tells the next reader the rule is *defended*, so they change the code beside it
with more confidence than the evidence supports, and nothing goes red, because
the thing that would have gone red was deleted.

It is the failure `CLAUDE.md` opens by warning about, one level up: not a
comment stating intent as behaviour, but a **document stating coverage as
fact**. AC-370 is the proof that it costs something — its text had also become
factually wrong after #220 widened the folder-less kinds, and nothing caught
that, because the test was gone.

**What this guard refuses, and what it deliberately does not.** Naming a
criterion is fine and stays fine for a number with no test: that is the
standing ruling above, and a guard that fired on every mention would fire on
several hundred sentences in this tree, which is the shape of guard that
teaches people to add allowlist entries without reading. What is refused is a
sentence that says the criterion **does** something — pins, asserts, proves,
covers, enforces, guards, exercises — over a number nothing runs. That verb
list is #257's own words and is deliberately short; the weaker ones this
repository also uses ("AC-158 reads that absence") are left alone, and
`tests/support/criterion-registry.ts` carries the measurement behind that.

**"Runs" is the repository's own definition rather than one invented here.**
`app/tests/README.md` says a criterion is run by its number, "which matches on
the test name rather than the file name": `npx vitest run -t "AC-105"`. So a
criterion runs when a **string literal** in a test file under `app/` carries
its number — a title, an assertion message or a fixture — or when a file under
`app/tests/criteria/` or `app/tests/e2e/` is named for it. A number that
appears only in a test's **comment** does not count: that is a
cross-reference, and reading it as coverage let
`app/src/shared/views.test.ts`'s own comment "AC-125 pins both refusals on the
wire" stand as AC-125's proof, when that sentence is one of the stale
citations #257 names by number. `tests/support/criterion-registry.ts` carries
why assertion messages had to be in and why titles alone were not enough: it
is AC-149, the one criterion `docs/workflow/hard-stops.md` leans on, which
lives in two `expect` messages and in no title at all.

**The fix for a violation is a reword, not an allowlist entry.** #257 names the
three verdicts, in order of preference: another criterion covers it now — name
that one, after checking it genuinely does; the decision stands and the
executable form is gone — cite it as a decision rather than as a proof; or
nothing covers it and it matters — say so plainly in the section. The third is
a real answer and the reclaim sweep is the standing example.

The other direction — two test files claiming one number, and a stale
allocator — is `guard-criterion-registry.test.ts` beside this one, and is
issue #252.
*/
import { describe, expect, test } from 'vitest'

import {
  citations,
  criterionFiles,
  exists,
  label,
  numbersKnownToRegistry,
  numbersMentionedInTests,
  numbersRunByTests,
} from '../support/criterion-registry.js'

interface Exception {
  /** The file, from the repository root, whose citation of this number is deliberate. */
  file: string
  /** The number it cites. */
  number: number
  /** Why the sentence is allowed to read as a proof over a criterion nothing executes. */
  because: string
}

/*
The deliberate ones.

**An entry here is a decision about a sentence, not a to-do.** It is keyed by
file and number rather than by number alone, because the same criterion is
routinely cited well in one place and badly in another, and by file rather than
by line so that an ordinary edit above it does not rot the entry.

Adding one to make this file green, without having read the sentence it
excuses, is the move this guard exists to make unnecessary — and it is what
`docs/workflow/hard-stops.md` forbids in its seventh row, which is about a
criterion but is the same rule: the registry must not be edited to agree with
the code on request.

One entry, and it is the shape everything else in the 2026-09-20 sweep had to
avoid becoming: every other violation that sweep found was reworded rather than
excused, because for every one of them one of #257's three verdicts applied.
*/
const EXCEPTIONS: Exception[] = [
  {
    file: 'docs/spec/06-queries/06.1-partition-proof.md',
    number: 70,
    because:
      'the sentence is the correction rather than the claim. 06.1 quotes its own superseded ' +
      'text — `This read "acceptance tests AC-070 and AC-451 pin those" when issue #216 ' +
      'landed` — and then says in bold that AC-070 has no test file and names the weaker ' +
      'thing standing in for it. That paragraph is issue #251 doing exactly what #257 asks ' +
      'for, and a guard that made it unwriteable would forbid recording the fix beside the ' +
      'defect. Quoting a stale claim in order to retire it is the one case where the words ' +
      'and the truth are allowed to disagree',
  },
]

const exceptionFor = (file: string, number: number): Exception | undefined =>
  EXCEPTIONS.find((entry) => entry.file === file && entry.number === number)

describe('a criterion cited as a proof is a proof (issue #257)', () => {
  test('every citation that says a criterion asserts something names one that runs', () => {
    const runs = new Set<number>([
      ...criterionFiles().map((file) => file.number),
      ...numbersRunByTests().keys(),
    ])

    const stale = citations()
      .filter((citation) => citation.claimsProof)
      .filter((citation) => !runs.has(citation.number))
      .filter((citation) => exceptionFor(citation.file, citation.number) === undefined)
      .map((citation) => `${citation.file}:${citation.line} — ${label(citation.number)}: ${citation.text}`)

    expect(
      stale,
      'these sentences say a criterion pins, asserts or proves something, and nothing ' +
        'under app/ executes that criterion. A stale citation is worse than no citation: ' +
        'it tells the next reader the rule is defended, and nothing goes red because the ' +
        'thing that would have gone red was deleted. Reword it as one of issue #257\'s ' +
        'three verdicts — another criterion covers it now and is named after being ' +
        'checked; the decision stands and its executable form is gone; or nothing covers ' +
        'it and the section says so plainly',
    ).toEqual([])
  })

  /*
  The weaker half, and it catches a different mistake.

  A number cited nowhere in the registry is not a stale claim, it is a claim
  about a criterion that was never written. Two were live when this guard was
  written: `app/src/server/domain/references.ts` says "AC-429 asserts the
  agreement behaviourally" and `app/src/server/routes/references.ts` says
  "AC-430 asserts that from the outside", and neither number exists anywhere —
  no bullet in section 12, no test file, no row in the registry. The branch
  that wrote them landed AC-424 to AC-428 and the comments were written against
  a plan that moved.

  This is checked over every citation rather than only over the ones that claim
  proof, because an invented number misdirects a reader whatever the verb
  around it: `npx vitest run -t "AC-430"` answers "No test files found", which
  reads as a suite problem rather than as a number that was never spent.
  */
  test('every criterion cited anywhere is one the registry has heard of', () => {
    const known = new Set<number>([
      ...numbersKnownToRegistry(),
      ...criterionFiles().map((file) => file.number),
      ...numbersMentionedInTests(),
    ])

    const invented = [
      ...new Set(
        citations()
          .filter((citation) => !known.has(citation.number))
          .map((citation) => `${label(citation.number)} at ${citation.file}:${citation.line}`),
      ),
    ]

    expect(
      invented,
      'these numbers are cited and the registry has never heard of them: no bullet in ' +
        'docs/spec/12-acceptance-criteria/, no file under app/tests/, nothing. Either the ' +
        'criterion was planned and never written — say what is true instead — or the ' +
        'number is a typo for one that exists',
    ).toEqual([])
  })

  /*
  The allowlist, asserted in both directions, on the pattern ac-236 and ac-397
  already use for theirs.

  An entry naming a file that has been deleted or renamed is an excuse still in
  force over a sentence nobody can read, and an entry whose violation has since
  been reworded is an excuse over nothing. Both go quiet on their own and both
  are worth being told about, because the next person to meet the list should
  meet only entries that are still doing something.
  */
  test('no exception outlives the sentence it excuses', () => {
    const missing = EXCEPTIONS.filter((entry) => !exists(entry.file)).map((entry) => entry.file)
    expect(missing, 'an exception names a file that no longer exists').toEqual([])

    const runs = new Set<number>([
      ...criterionFiles().map((file) => file.number),
      ...numbersRunByTests().keys(),
    ])
    const cited = citations().filter((citation) => citation.claimsProof)
    const idle = EXCEPTIONS.filter(
      (entry) =>
        runs.has(entry.number) ||
        !cited.some(
          (citation) => citation.file === entry.file && citation.number === entry.number,
        ),
    ).map((entry) => `${entry.file} / ${label(entry.number)}`)

    expect(
      idle,
      'these exceptions excuse nothing: either the criterion runs again, or the sentence ' +
        'that claimed it no longer reads as a claim. Delete the entry',
    ).toEqual([])
  })
})
