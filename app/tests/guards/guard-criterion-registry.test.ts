/*
The criterion registry, read forwards: one number means one thing, and the
allocator says which number is next.

**Why this file exists.** Issue #252. On 2026-09-20 three branches were open at
once holding 470–481, 480–493 and 490–507, and **AC-481, AC-490, AC-491 and
AC-492 were each claimed twice**. Every agent involved re-read
`docs/spec/12-acceptance-criteria/README.md` before allocating — one read it
twice, once before choosing and once before pushing — and it happened anyway,
because a registry read tells you what is *written down* and a branch that has
not pushed has written nothing anywhere the next reader can see.

**Nothing announced it, and that is the part worth understanding before
changing this file.** The collision is in the criterion *number*, not the
filename: `ac-481-shelf-wire-expand-and-contract.test.ts` and
`ac-481-<other-slug>.test.ts` are different paths, so git merges both with no
conflict, both files run, both pass, the suite's file count rises by exactly
the expected amount, and `scripts/run-suite.mjs`'s accounting guard is
satisfied because every file it collected is accounted for. The only artefact
is a registry in which one number means two things, and
`npx vitest run -t "AC-481"` then running somebody else's criterion — which is
how the number stops being an address, and the number is how this repository
refers to a criterion in the registry, in commit messages, in pull request
bodies and in `CLAUDE.md`'s own examples.

**A guard sees one tree, so it cannot catch the cross-branch case before the
merge. That is the right place for it anyway**: the merge is the first moment
both claims exist together, and it is early enough to be a conflict to resolve
rather than a defect to discover.

Three things are checked here, because they are one walk over the same
registry and separating them would mean walking it three times with three
chances to disagree.

1. No two files claim one number.
2. Every criterion file's number is *defined* — it has a bullet in section 12.
   That gap was live on `backend/220` while #252 was written: AC-490 to AC-507
   were asserted by tests and defined nowhere, found by a human reading.
3. The allocator line is above everything this tree has spent. This is the
   one that was wrong on `main` when this file was written — the registry said
   "the next number to take from the tail is 423" while `app/tests/criteria/`
   carried `ac-481`, so the file every allocation is supposed to be read from
   was the least reliable thing in the loop.

The other direction — a *citation* of a number with no test file — is
`guard-criterion-citations.test.ts` beside this one, and is issue #257.
*/
import { readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  ALLOCATOR_HEADING,
  APP_ROOT,
  allocator,
  criterionFiles,
  label,
  sectionTwelveBullets,
} from '../support/criterion-registry.js'

/*
Numbers whose text is deliberately not in section 12.

AC-229 is the only one, and the registry says so in terms: "AC-229 is spent and
its text is not here. It was written into its own test file,
app/tests/e2e/ac-229-done-row-drops-the-due-echo.spec.ts, which is built, named
for the number and running." That spec was cut on 2026-09-20 with 112 of its
siblings, so the number currently resolves to nothing at all and this entry
costs nothing; it is kept because the ruling that put it here has not moved,
and an allowlist entry that stops being needed is cheaper than one that is
needed and missing.

An entry here is a decision, not a to-do. Adding one to make this file green is
the thing `docs/workflow/hard-stops.md` forbids in its seventh row.
*/
const DEFINED_ELSEWHERE = new Map<number, string>([
  [
    229,
    'the registry rules its text lives in its own test file rather than in section 12 ' +
      '(docs/spec/12-acceptance-criteria/README.md, the AC-229 bullet)',
  ],
])

describe('one criterion number means one criterion (issue #252)', () => {
  test('no two test files claim the same number', () => {
    const byNumber = new Map<number, string[]>()
    for (const file of criterionFiles()) {
      const held = byNumber.get(file.number)
      if (held === undefined) byNumber.set(file.number, [file.file])
      else held.push(file.file)
    }

    const collisions = [...byNumber.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([number, files]) => `${label(number)} is claimed by ${files.join(' and ')}`)

    expect(
      collisions,
      'two files carry one criterion number. git merged them cleanly because the ' +
        'filenames differ, both run and both pass, and the only symptom is that ' +
        '`npx vitest run -t "AC-NNN"` now runs two unrelated criteria. Renumber one of ' +
        'them from the tail — docs/spec/12-acceptance-criteria/README.md, ' +
        `"${ALLOCATOR_HEADING}" — and move its bullet in section 12 with it`,
    ).toEqual([])
  })

  /*
  A number can only collide if it is where the walk can see it. A file named
  anything else is a criterion nothing above this line is looking at, so the
  shape is asserted rather than assumed.
  */
  test('every file under tests/criteria is named for the criterion it asserts', () => {
    const dir = path.join(APP_ROOT, 'tests', 'criteria')
    const wrong = readdirSync(dir)
      .filter((name) => /\.(?:test|spec)\.tsx?$/.test(name))
      .filter((name) => !/^ac-\d{3}-[a-z0-9-]+\.test\.tsx?$/.test(name))

    expect(
      wrong,
      'tests/criteria holds one file per criterion, named ac-NNN-short-slug.test.ts. ' +
        'A file named anything else is invisible to the collision check above, which ' +
        'reads the number out of the filename',
    ).toEqual([])
  })

  test('every criterion a test asserts is defined in section 12', () => {
    const defined = new Set(sectionTwelveBullets().map((bullet) => bullet.number))
    const undefined_ = criterionFiles()
      .filter((file) => !defined.has(file.number) && !DEFINED_ELSEWHERE.has(file.number))
      .map((file) => `${label(file.number)} (${file.file})`)

    expect(
      [...new Set(undefined_)],
      'these criteria are asserted by a test and stated nowhere in ' +
        'docs/spec/12-acceptance-criteria/. A number with a test and no bullet is a ' +
        'behaviour the suite enforces that the specification does not claim, which is ' +
        'the gap #252 found live on backend/220 — eighteen of them, caught by a person ' +
        'reading. Write the bullet, or allowlist the number here with the ruling that ' +
        'put its text somewhere else',
    ).toEqual([])
  })

  /*
  The reverse direction is deliberately not checked.

  A bullet with no test file is the ordinary state of this repository and has
  been since the 2026-09-20 cut took 221 of 268 criterion files: section 12's
  own README rules that "a number that resolves to no file under `app/tests/`
  is still the specification of Dana's behaviour". Failing on that would be a
  guard arguing with a standing decision, and it would fire on three hundred
  numbers at once, which is the shape of guard that teaches people to disable
  guards.
  */
})

describe('the allocator line is true (issue #252, the process half)', () => {
  test('the registry names exactly one next number, in one place', () => {
    const { next, matches, sectionFound } = allocator()

    expect(
      sectionFound,
      `docs/spec/12-acceptance-criteria/README.md has no "${ALLOCATOR_HEADING}" section. ` +
        'That section is the allocator — the thing read immediately before every ' +
        'allocation — and this guard reads it and no other part of the file, because ' +
        'the history below it carries four superseded sentences of the same shape ' +
        '(401, then 403, then 423), each true of the list its author could read',
    ).toBe(true)

    expect(
      matches,
      `"${ALLOCATOR_HEADING}" must carry exactly one sentence of the form ` +
        '"**The next number to take from the tail is NNN.**". Two of them is a tie ' +
        'nobody can break, and none is a section that reads like an allocator and ' +
        'allocates nothing',
    ).toBe(1)

    expect(next).not.toBeNull()
  })

  /*
  The loop this closes.

  Without it, a stale allocator is a trap rather than a red: it is read before
  every allocation and re-derived after none, so the failure it causes lands on
  whoever reads it next rather than on whoever left it stale. With it, the
  branch that spends a number above the line cannot merge without moving the
  line, which is exactly when the person who knows what was spent is the one
  holding the pen.

  Strictly greater, and over both files and bullets: a number is spent the
  moment either exists, and on this repository's branches the bullet routinely
  lands first.
  */
  test('nothing in this tree has spent the number the allocator offers, or anything above it', () => {
    const { next } = allocator()
    if (next === null) return

    const spent = [
      ...criterionFiles().map((file) => ({ number: file.number, where: file.file })),
      ...sectionTwelveBullets().map((bullet) => ({
        number: bullet.number,
        where: `${bullet.file}:${bullet.line}`,
      })),
    ].filter((entry) => entry.number >= next)

    expect(
      spent.map((entry) => `${label(entry.number)} at ${entry.where}`),
      `the registry offers ${label(next)} as the next free number and this tree has ` +
        'already spent it, or spent something above it. Move the line under ' +
        `"${ALLOCATOR_HEADING}" in docs/spec/12-acceptance-criteria/README.md past ` +
        'everything named here, in the commit that spent it. A stale allocator does not ' +
        'fail for the branch that leaves it stale; it fails for whoever reads it next, ' +
        'which is how AC-481, AC-490, AC-491 and AC-492 were each spent twice',
    ).toEqual([])
  })
})
