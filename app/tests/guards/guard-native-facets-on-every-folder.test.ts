/*
Every path that writes a `folders` row writes its four native facets in the
same transaction (issue #210, spec 4.30).

## Why this file exists

4.30 says natives are created **with** the Folder and never lazily, and the
ruling gives three reasons: a lazy read would write, two members would race
`folder_facets_folder_native_kind_idx`, and a Can-view member's read would
either create rows or answer differently from a Can-edit member's. That makes
"the four exist" an invariant of the table rather than a step in one handler.

**There is no one place to enforce it.** `INSERT INTO folders` appears in
seven modules -- `POST /folders`, sign-in provisioning, the sample workspace,
Folder duplication, workflow import, the seed and the query-plan corpus -- and
no foreign key, CHECK or trigger can say "and four rows in another table came
with you". It was measured rather than assumed: the first run of AC-830's
whole-database case, written before this guard, found **two** Folders with no
facets, and both were sign-in's default Desk. The handler `#210` was actually
about had the call and the six other paths did not.

So there are two watchers, and they watch different things. **AC-830 asserts
the rows**, over every Folder in its worker's database, which is what catches a
path that inserts and forgets. **This asserts the source**, which is what
catches a path added tomorrow in a module no criterion happens to exercise --
the `explain` corpus is exactly that module today, and it writes Folders that
no test in this suite reads.

## What it can and cannot see

It reads source text for two strings in one module and knows nothing about
control flow: a module could insert a Folder in one branch and create facets in
another, and this would be green. That is the same bargain
`guard-reclaim-reference-arms` strikes with its own list, and the answer is the
same -- the behavioural criterion is the one that proves it, and this one is
what stops the *file* being forgotten.

**Widen it by adding the module to the expected list**, never by deleting the
list: the count and the names are both asserted, so a new inserter is red here
until somebody writes it down, which is the whole point.
*/
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { APP_ROOT } from '../support/criterion-registry.js'

/** Every source file under `app/src/` and `app/db/`, tests excluded: a test
 * that seeds a Folder directly is a fixture and is not a product path. */
function sourceFiles(): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!full.endsWith('.ts') && !full.endsWith('.tsx')) continue
      if (full.endsWith('.test.ts') || full.endsWith('.test.tsx')) continue
      found.push(full)
    }
  }
  walk(path.join(APP_ROOT, 'src'))
  walk(path.join(APP_ROOT, 'db'))
  return found
}

const INSERTS_A_FOLDER = /INSERT INTO folders\b/
/** The call, or -- for `db/seed.ts`, which imports nothing from `src/server`
 * -- the equivalent statement, recognised by the table it writes. */
const CREATES_THE_NATIVES = /createNativeFacets\(|INSERT INTO folder_facets\b/

/**
 * The seven modules that may write a `folders` row, each with the reason it
 * does. A module not on this list that starts inserting Folders is red here,
 * and so is a name on this list that stops inserting them.
 */
const EXPECTED = new Map<string, string>([
  ['src/server/domain/folders.ts', '7.4: POST /folders, the ordinary create'],
  [
    'src/server/auth/provisioning.ts',
    "7.1: the account's default Desk, written at first sign-in. **This is the one the guard was written for** -- it is the path every account takes and it is nobody's feature, so it is the easiest to forget",
  ],
  [
    'src/server/sample/workspace.ts',
    "item 60: the sample workspace a new account is offered, whose folders are the person's own",
  ],
  [
    'src/server/domain/acts.ts',
    '7.16: Folder duplication and workflow import, two inserts in one module. Neither copies the source\'s facets -- a duplicate and an import are new Folders whose only member is their maker -- so each gets four fresh natives',
  ],
  [
    'db/seed.ts',
    'the local seed. It imports nothing from `src/server`, so it writes the four in SQL; AC-830 holds the two spellings together',
  ],
  [
    'src/server/views/explain.ts',
    'the query-plan corpus. It is a diagnostic and no criterion reads its Folders, which is exactly why a source guard and not only a behavioural one',
  ],
])

describe('every path that inserts a folder creates its four native facets (issue #210)', () => {
  test('the modules that insert a folder are the ones this guard expects', () => {
    const inserters = sourceFiles()
      .filter((file) => INSERTS_A_FOLDER.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(APP_ROOT, file).split(path.sep).join('/'))
      .sort()

    expect(
      inserters,
      'a module that inserts a `folders` row and is not on this guard\'s list. Add it with the reason it creates Folders, and give it its `createNativeFacets` call in the same change -- 4.30 makes the four an invariant of the table rather than a step in one handler',
    ).toEqual([...EXPECTED.keys()].sort())
  })

  test('each of them creates the four in the same module', () => {
    const missing: string[] = []
    for (const relative of EXPECTED.keys()) {
      const source = readFileSync(path.join(APP_ROOT, relative), 'utf8')
      if (!CREATES_THE_NATIVES.test(source)) missing.push(relative)
    }
    expect(
      missing,
      'these modules insert a `folders` row and never create its native facets. 4.30: "natives are created with the Folder and never lazily" -- a Folder without them answers an empty facet listing to every member and has no Main to be first',
    ).toEqual([])
  })
})
