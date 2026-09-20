/*
One walk over the criterion registry, read by the two guards beside it.

**Why one module.** Issues #252 and #257 are the same registry read in two
directions. #252 is "a number that means two things": two branches spend
AC-481, git merges both files cleanly because the *filenames* differ, both
pass, and the only artefact is `npx vitest run -t "AC-481"` running somebody
else's criterion. #257 is "a number that means nothing": the 2026-09-20 cut
deleted 221 of 268 criterion files, section 12 was deliberately kept whole, and
nobody swept the sentences elsewhere that say those numbers *pin* something.
Both questions need the same three sets — what files exist, what section 12
defines, and who cites what — so they are gathered once here rather than walked
twice with two chances to disagree.

**What counts as a number.** `AC-` and three digits, plus the ranges this
repository writes constantly: `AC-005 to AC-010`, `AC-384–389`,
`AC-119 through AC-123`. A range is expanded because the repository uses it to
mean every number inside it — `app/src/server/auth/README.md` says the module
owns "AC-005 to AC-010, AC-105 to AC-115, and AC-119 to AC-123" and names no
number individually. A guard that could not read a range would report AC-006 as
uncited and AC-007 as unexecuted while both are plainly neither. Ranges wider
than forty are ignored, because at that width the two numbers are far more
likely to be an unrelated pair in one sentence than an allocation.
*/
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** `app/`, whatever the process's cwd is. Vitest runs from here; nothing relies on that. */
export const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** The repository root, one above `app/`. `docs/spec/` lives here. */
export const REPO_ROOT = path.resolve(APP_ROOT, '..')

/** A single `AC-NNN`. */
const ONE = /AC-(\d{3})/g

/** `AC-005 to AC-010`, `AC-384–389`, `AC-119 through AC-123`. */
const RANGE = /AC-(\d{3})\s*(?:to|through|[-–—])\s*(?:AC-)?(\d{3})/g

/** A range wider than this is read as two unrelated numbers rather than as an allocation. */
const WIDEST_RANGE = 40

/** `ac-481-shelf-wire-expand-and-contract.test.ts` and its Playwright sibling. */
const CRITERION_FILE = /^ac-(\d{3})-[a-z0-9-]+\.(?:test|spec)\.tsx?$/

/** Anything vitest or Playwright collects, anywhere under `app/`. */
const IS_TEST_FILE = /\.(?:test|spec)\.tsx?$/

/** `- AC-481 Given …`, the form section 12 states a criterion in. */
const BULLET = /^\s*[-*]\s+\*{0,2}AC-(\d{3})\*{0,2}(?![\d-])/

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.data', 'test-results'])

/** Every number a piece of text names, ranges expanded. */
export function numbersIn(text: string): Set<number> {
  const found = new Set<number>()
  for (const match of text.matchAll(ONE)) found.add(Number(match[1]))
  for (const match of text.matchAll(RANGE)) {
    const from = Number(match[1])
    const to = Number(match[2])
    if (to > from && to - from <= WIDEST_RANGE) {
      for (let n = from; n <= to; n += 1) found.add(n)
    }
  }
  return found
}

/** `AC-481`, the way every message here and every registry row spells it. */
export function label(n: number): string {
  return `AC-${String(n).padStart(3, '0')}`
}

function filesUnder(dir: string, found: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      filesUnder(path.join(dir, entry.name), found)
    } else if (entry.isFile()) {
      found.push(path.join(dir, entry.name))
    }
  }
  return found
}

/** A path as this repository writes it in a message: forward slashes, from the repository root. */
export function fromRoot(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/')
}

export interface CriterionFile {
  /** The number in the filename. */
  number: number
  /** `app/tests/criteria/ac-481-….test.ts`, from the repository root. */
  file: string
  /** `vitest` for `tests/criteria/`, `playwright` for `tests/e2e/`. */
  runner: 'vitest' | 'playwright'
}

/**
 * Every file under `app/tests/criteria/` and `app/tests/e2e/` whose name
 * carries a criterion number.
 *
 * Both directories, because the number is the address rather than the
 * directory: AC-229's text is deliberately not in section 12 and lives only in
 * its browser spec, and a vitest criterion and a browser spec claiming one
 * number would be the #252 collision wearing two runners.
 */
export function criterionFiles(): CriterionFile[] {
  const found: CriterionFile[] = []
  for (const [dir, runner] of [
    [path.join(APP_ROOT, 'tests', 'criteria'), 'vitest'],
    [path.join(APP_ROOT, 'tests', 'e2e'), 'playwright'],
  ] as const) {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const match = CRITERION_FILE.exec(entry.name)
      if (match === null) continue
      found.push({ number: Number(match[1]), file: fromRoot(path.join(dir, entry.name)), runner })
    }
  }
  return found.sort((a, b) => a.number - b.number || a.file.localeCompare(b.file))
}

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g
const LINE_COMMENT = /(^|[^:\\])\/\/[^\n]*/g
const STRING_LITERAL = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g

/**
 * Every number a test file names **in a string literal** rather than in a
 * comment, anywhere under `app/`.
 *
 * **This is the definition of "the criterion runs", and it is as close to the
 * repository's own as a regular expression gets.** `app/tests/README.md` says
 * a criterion is run by its number, "which matches on the test name rather
 * than the file name": `npx vitest run -t "AC-105"`. Titles are the first half
 * of that; **assertion messages are the second**, and leaving them out was
 * measurably wrong. `app/src/shared/tasks.test.ts` and
 * `app/src/server/http/tasks-contract.test.ts` carry AC-149 only in the message
 * argument of an `expect` — and AC-149 is the criterion
 * `docs/workflow/hard-stops.md` names as the only thing that catches a
 * request-schema field the server never reads. A rule that called it dead would
 * have had this guard demand that three documents stop claiming the one
 * criterion this project most depends on, which is the opposite of the truth. A
 * string in a test file is a title, a message or a fixture; all three run.
 *
 * Wider than `criterionFiles()` on purpose, and the two answer different
 * questions. A file named for its number is how a criterion is *filed*; a
 * string is how it is *addressed*, and after the 2026-09-20 cut most surviving
 * coverage is a string rather than a file — `CLAUDE.md` records that the cut
 * took 221 criterion files and left the colocated tests under `app/src/**`
 * whole, so `app/src/server/auth/auth-flow.test.ts` carrying
 * `describe('sessions (AC-010, AC-110, AC-113)')` is what makes a spec sentence
 * about AC-010 a true one.
 *
 * **A number in a test's *comment* deliberately does not count, and that is the
 * decision this function turns on.** Reading any mention as coverage was the
 * first draft, and it let `app/src/shared/views.test.ts`'s own comment "AC-125
 * pins both refusals on the wire" stand as AC-125's proof — when that sentence
 * is itself one of the stale citations issue #257 names by number. A test's
 * comment about another criterion is a cross-reference; a string is part of
 * what runs.
 *
 * **One false negative is known and is left standing rather than hidden.**
 * `ac-397-authorization-sweep.test.ts` quotes AC-368 and AC-374 inside a string
 * in its expected-status table and asserts neither, so both count as running
 * here. Narrowing to titles alone is what kills AC-149, so this is the cheaper
 * of the two errors; read that table before believing a claim about either
 * number.
 *
 * **`tests/guards/` is excluded, and finding out why cost a run.** The two
 * guards beside this module name AC-429 and AC-430 in their own headers, as the
 * example of a number cited in code that was never allocated — and that alone
 * made both count as running, so the guard quoting them as its example stopped
 * reporting them. A guard is not a criterion.
 */
export function numbersRunByTests(): Map<number, string[]> {
  const guards = path.join(APP_ROOT, 'tests', 'guards') + path.sep
  const named = new Map<number, string[]>()
  for (const file of filesUnder(APP_ROOT)) {
    if (!IS_TEST_FILE.test(path.basename(file))) continue
    if (file.startsWith(guards)) continue
    const rel = fromRoot(file)
    const code = readFileSync(file, 'utf8')
      .replace(BLOCK_COMMENT, ' ')
      .replace(LINE_COMMENT, (_whole, before: string) => before)
    for (const literal of code.matchAll(STRING_LITERAL)) {
      for (const n of numbersIn(literal[0])) {
        const where = named.get(n)
        if (where === undefined) named.set(n, [rel])
        else if (!where.includes(rel)) where.push(rel)
      }
    }
  }
  return named
}

/**
 * Every number named anywhere inside a test file, title or prose.
 *
 * Not a coverage answer — `numbersRunByTests()` is that — but the right
 * width for "has the registry heard of this number at all", where a
 * cross-reference in a test's header is perfectly good evidence that the
 * number was once spent on something.
 */
export function numbersMentionedInTests(): Set<number> {
  const guards = path.join(APP_ROOT, 'tests', 'guards') + path.sep
  const named = new Set<number>()
  for (const file of filesUnder(APP_ROOT)) {
    if (!IS_TEST_FILE.test(path.basename(file))) continue
    if (file.startsWith(guards)) continue
    for (const n of numbersIn(readFileSync(file, 'utf8'))) named.add(n)
  }
  return named
}

export interface Bullet {
  number: number
  file: string
  line: number
}

/** `docs/spec/12-acceptance-criteria/`, the registry itself. */
export const SECTION_TWELVE = path.join(REPO_ROOT, 'docs', 'spec', '12-acceptance-criteria')

/** Every `- AC-NNN …` bullet in section 12: the numbers that have a definition. */
export function sectionTwelveBullets(): Bullet[] {
  const bullets: Bullet[] = []
  for (const file of filesUnder(SECTION_TWELVE)) {
    if (!file.endsWith('.md')) continue
    const rel = fromRoot(file)
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, index) => {
        const match = BULLET.exec(text)
        if (match !== null) bullets.push({ number: Number(match[1]), file: rel, line: index + 1 })
      })
  }
  return bullets.sort((a, b) => a.number - b.number || a.file.localeCompare(b.file))
}

/**
 * Every number section 12 names *anywhere*, bullet or prose.
 *
 * Wider than `sectionTwelveBullets()` and it answers a different question: not
 * "is this criterion defined" but "has the registry heard of this number at
 * all". `docs/spec/README.md` cites AC-403 while pointing out that 403 is free
 * — a number the registry names at length in its own free list and has
 * deliberately never defined — and a check that read only the bullets would
 * report that sentence as naming a criterion nobody wrote.
 */
export function numbersKnownToRegistry(): Set<number> {
  const known = new Set<number>()
  for (const file of filesUnder(SECTION_TWELVE)) {
    if (!file.endsWith('.md')) continue
    for (const n of numbersIn(readFileSync(file, 'utf8'))) known.add(n)
  }
  return known
}

export interface Citation {
  number: number
  file: string
  line: number
  /** The line as written, for a failure message that can be read without opening anything. */
  text: string
  /** True when the sentence says the criterion *does* something: pins, asserts, proves. */
  claimsProof: boolean
}

/*
The verbs that turn naming a criterion into claiming it is a proof.

#257's title is the whole rule: the spec "says they **pin** things". Naming a
criterion is fine and stays fine for a number with no test — section 12's own
README rules that "a number that resolves to no file under `app/tests/` is
still the specification of Dana's behaviour", so a guard that fired on every
mention would be arguing with a standing decision and would fire on more than a
hundred sentences. What is not fine is a sentence that tells the next reader the
rule is *defended*, because they then change the code beside it with more
confidence than the evidence supports and nothing goes red.

**This list is exactly #257's words and is deliberately short.** The weaker
verbs this repository also uses about criteria — "AC-158 reads that absence",
"AC-225 watches the wire", "AC-410 drives all" — are left alone, and the
reason is measured rather than aesthetic: adding `reads` alone takes the sweep
from 73 sentences to 154, all but a handful of them comments in
`app/src/client/**` about browser specs the 2026-09-20 cut took, and a guard
whose first run asks for 154 rewordings is one that gets an allowlist instead
of a reading. A weaker verb over a dead number is still worth fixing where it
is met; it is not worth being told about by a test.

**`covers`, `guards` and the bare singular `pin` were in the list and came out,
against measurement.** All three are nouns in this domain far more often than
verbs — a page's cover image, a cover file's lifetime, a guard clause, 5.2's
state guard, the **pin list** of 4.19 — and each was producing sentences this
guard called stale that were nothing of the kind: `app-sidebar.tsx` was
reported for "AC-095's third case generalised to the pin list". Taking the
first two out costs four of eighty-three sites and the third costs none;
leaving them in costs the guard's credibility, which is worth more. `pins`,
`pinned` and `pinning` stay, and `pinned_views` and `pinnedViews` do not match
them, `_` and `V` both being word characters.
*/
const PROOF = new RegExp(
  '\\b(?:' +
    'pins|pinned|pinning|' +
    'asserts?|asserted|asserting|' +
    'proves?|proved|proven|proving|' +
    'enforces?|enforced|enforcing|' +
    'exercises?|exercised|exercising' +
    ')\\b',
  'i',
)

/** How far either side of the number the claim may sit and still be the same sentence. */
const BEFORE = 90
const AFTER = 150

/**
 * Whether the sentence around a number claims the criterion executes.
 *
 * The window is the citing line joined with the one after it, because comments
 * in this repository wrap mid-sentence and the verb is routinely on the next
 * line — `app/src/server/domain/files.ts` writes "AC-371 asserts all three
 * arms." across a break. Two lines and a character window rather than a whole
 * paragraph: a paragraph reliably contains one of these verbs about something
 * else.
 */
function claimsProofAt(window: string, at: number): boolean {
  return PROOF.test(window.slice(Math.max(0, at - BEFORE), at + AFTER))
}

/** `docs/spec/` less the registry, plus `app/src/`, less anything a runner collects. */
function citationSources(): string[] {
  return [
    ...filesUnder(path.join(REPO_ROOT, 'docs', 'spec')),
    ...filesUnder(path.join(APP_ROOT, 'src')),
  ].filter(
    (file) =>
      !file.startsWith(SECTION_TWELVE + path.sep) && !IS_TEST_FILE.test(path.basename(file)),
  )
}

/**
 * Every `AC-NNN` named in `docs/spec/**` or `app/src/**`, one entry per number
 * per line, each marked with whether its sentence claims the criterion runs.
 *
 * Section 12 is excluded because it is the registry rather than a citation of
 * it, and test files are excluded because a test naming its own number is the
 * coverage rather than a claim about it.
 */
export function citations(): Citation[] {
  const found: Citation[] = []
  for (const file of citationSources()) {
    let lines
    try {
      lines = readFileSync(file, 'utf8').split('\n')
    } catch {
      continue
    }
    const rel = fromRoot(file)
    lines.forEach((text, index) => {
      if (!text.includes('AC-')) return
      const window = `${text}\n${lines[index + 1] ?? ''}`
      for (const n of numbersIn(text)) {
        const at = window.search(new RegExp(`AC-${String(n).padStart(3, '0')}`))
        found.push({
          number: n,
          file: rel,
          line: index + 1,
          text: text.trim(),
          claimsProof: claimsProofAt(window, at < 0 ? 0 : at),
        })
      }
    })
  }
  return found.sort(
    (a, b) => a.number - b.number || a.file.localeCompare(b.file) || a.line - b.line,
  )
}

/** `docs/spec/12-acceptance-criteria/README.md`, the allocator and the history in one file. */
export const REGISTRY_README = path.join(SECTION_TWELVE, 'README.md')

/** The heading the allocator lives under. The guard reads this section and no other. */
export const ALLOCATOR_HEADING = '## The next number'

/** The one line in that section the guard parses. */
export const ALLOCATOR_SENTENCE = /\*\*The next number to take from the tail is (\d{3})\.\*\*/g

export interface Allocator {
  /** The number the section names, or null when the section or the sentence is missing. */
  next: number | null
  /** How many lines in the section matched. More than one is as bad as none. */
  matches: number
  /** Whether the heading was found at all. */
  sectionFound: boolean
}

/**
 * What the registry's allocator section says the next free number is.
 *
 * Parsed from one section rather than from the whole file on purpose. The
 * history under `## Numbers` carries four superseded sentences of the same
 * shape — "the next number to take from the tail is 401", then 403, then 423 —
 * each true of the list its author could read and each now wrong. Reading the
 * file whole would match all of them; reading one section matches the one that
 * is meant to be current, and a second sentence appearing in that section is a
 * failure rather than a tie-break.
 */
export function allocator(): Allocator {
  const lines = readFileSync(REGISTRY_README, 'utf8').split('\n')
  const start = lines.findIndex((line) => line.trim() === ALLOCATOR_HEADING)
  if (start < 0) return { next: null, matches: 0, sectionFound: false }
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^## /.test(line))
  const section = (end < 0 ? rest : rest.slice(0, end)).join('\n')
  const matches = [...section.matchAll(ALLOCATOR_SENTENCE)]
  return {
    next: matches.length === 1 ? Number(matches[0]?.[1]) : null,
    matches: matches.length,
    sectionFound: true,
  }
}

/** Whether a path names a file that exists. Used to report a stale allowlist entry. */
export function exists(fromRepoRoot: string): boolean {
  try {
    return statSync(path.join(REPO_ROOT, fromRepoRoot)).isFile()
  } catch {
    return false
  }
}
