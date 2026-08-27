/*
The three standing rules of the S8 client foundation, as a test.

RFC 0004 gives S8 three acceptance lines: the tokens match the approved
prototype's, nothing imports `lucide-react` directly, and no raw ramp value is
written outside `components/ui/`. All three are the kind of rule that is true
on the day it is written and false four sessions later, because each is broken
by *adding* a file rather than by editing one anybody is looking at. So they
are checked here rather than trusted.

**How the sources arrive, because both routes are workarounds.** The `.ts` and
`.tsx` sources come through `import.meta.glob` with `?raw`, the way this
directory's `copy.test.ts` reads `state-patterns.tsx`: this file lives in the
client project, which has Vite's types and deliberately not Node's, and the
comment in `tsconfig.client.json` explains that split. The two CSS files
cannot come the same way: `vitest.config.ts` leaves Vitest's `css` at its
default, so any import of a `.css` file, `?raw` included, resolves to an empty
string, measured here at S8. Rather than asking Platform for a config change
that would put every CSS file in every test through the processor for the
sake of two reads, the two reads go through `node:fs` behind a dynamic import
whose specifier is a variable, which is the narrowest thing that typechecks in
a project without Node's types: TypeScript only resolves a literal specifier,
and Vitest runs this file in Node either way, so the import is ordinary at
runtime and invisible to the client project's typecheck.

**Why the exemption lists are exact rather than a floor.** Every list below is
asserted with `toEqual`, so the test fails in both directions: a new file that
breaks a rule is red, and an exempt file that stops breaking it is also red,
which forces the list to shrink as each package retires its v1 markup instead
of quietly outliving the debt it records. That is the whole mechanism. A file
appears on a list because it is v1 markup a later package replaces, never
because a rule was inconvenient.

**Scope is `components/` and `lib/`**, which is what S8 owns plus what it
adds. `pages/`, `shell/`, `parts/` and `states/` are outside it today and
break both rules freely; they come into scope as S9 to S13 replace them, and
widening this file's scope is part of the package that empties its own share
of the lists. Every list is empty when S13 closes.
*/
import { describe, expect, test } from 'vitest'

const fsSpecifier = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsSpecifier)) as {
  readFileSync: (path: string, encoding: 'utf8') => string
}

const modules = import.meta.glob(
  ['/src/client/components/**/*.{ts,tsx}', '/src/client/lib/**/*.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

/* '/src/client/components/ui/button.tsx' becomes 'components/ui/button.tsx',
   and test files are out: they are about the rules, not under them. */
const sources = Object.fromEntries(
  Object.entries(modules)
    .map(([path, source]) => [path.replace('/src/client/', ''), source] as const)
    .filter(([path]) => !/\.test\.tsx?$/.test(path)),
)
const files = Object.keys(sources).sort()

describe('the icon family is one decision in one file (DES-125)', () => {
  /*
  The v1 markup still importing lucide per icon. Each leaves with the package
  that replaces the surface it draws, which this list has said since S8.

  **Five left at S24, which is the shell**: the three folder dialogs, the
  folder row and the state patterns, exactly the set this comment named as
  going "with the shell". What remains are the calendar, the search overlay and
  the quick-add, whose surfaces are S25's, S27's and the row work's.
  */
  const V1_LUCIDE = [
    'components/calendar/PlannedCalendar.tsx',
    'components/quick-add.tsx',
    'components/search/SearchOverlay.tsx',
  ]

  test('only the icon module imports lucide-react, beside a named v1 list', () => {
    const importers = files.filter((path) => /from ['"]lucide-react['"]/.test(sources[path] ?? ''))
    expect(importers.filter((path) => path !== 'lib/icons.tsx')).toEqual(V1_LUCIDE)
    expect(importers).toContain('lib/icons.tsx')
  })
})

describe('the ramp is spelled where the ramp lives (11.4)', () => {
  /*
  A role token says what a value is for; a ramp step says only what colour it
  is. The primitives may reach for a step because they are where a role is
  defined, and `tokens.css` is where both are written. Everything else asks
  for the role.
  */
  const RAMP = /var\(--color-(graphite|dana-accent|folder|success|warning|danger|info)-/

  const V1_RAMP = [
    'components/calendar/PlannedCalendar.tsx',
    'components/comments.tsx',
    'components/folder-group-dialog.tsx',
    'components/folder-label-dialog.tsx',
    'components/folder-row.tsx',
    'components/history-sheet.tsx',
    'components/icon-action.tsx',
    'components/new-folder-dialog.tsx',
    'components/quick-add.tsx',
    'components/search/SearchOverlay.tsx',
    'components/state-patterns.tsx',
    'components/task-assignee-invite.tsx',
    'components/task-board.tsx',
    'components/task-card.tsx',
    'components/task-history-block.tsx',
    'components/task-pickers.tsx',
    'components/task-row.tsx',
    'components/task-section.tsx',
    'components/task-surface.tsx',
    'components/view-strip.tsx',
    'components/window-bar.tsx',
  ]

  test('no ramp step outside components/ui, beside a named v1 list', () => {
    const spellers = files
      .filter((path) => !path.startsWith('components/ui/'))
      .filter((path) => RAMP.test(sources[path] ?? ''))
    expect(spellers).toEqual(V1_RAMP)
  })

  test('no literal colour anywhere but the token file', () => {
    const literal = files.filter((path) => /#[0-9a-fA-F]{6}\b/.test(sources[path] ?? ''))
    expect(literal).toEqual([])
  })
})

describe("the tokens are the approved prototype's (RFC 0004, S8)", () => {
  /*
  Line-for-line rather than byte-for-byte over the whole file, and the
  difference is the point. This client's token file carries four `@import`s,
  an explicit `@source`, one fenced v1 variable and his `app.css` rules, none
  of which his `tokens.css` has; what it may not carry is a *value* he did not
  write. So the assertion is that every declaration of his appears in ours,
  which is false the moment somebody edits a hex here instead of in the design.
  */
  const fromHere = (relative: string) =>
    decodeURIComponent(new URL(relative, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

  const tokensCss = readFileSync(fromHere('../../styles/tokens.css'), 'utf8')
  const prototypeTokensCss = readFileSync(
    fromHere('../../../../../docs/design/prototype-v2/src/styles/tokens.css'),
    'utf8',
  )

  const declarations = (css: string) =>
    css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== '')

  test('every value the prototype writes is written here', () => {
    const prototype = declarations(prototypeTokensCss)
    const ported = new Set(declarations(tokensCss))
    expect(prototype.filter((line) => !ported.has(line))).toEqual([])
  })

  test('the one variable that is not his is fenced and named', () => {
    expect(tokensCss).toContain('v1 interim block')
    expect(tokensCss).toContain('--sharing-panel-width: 440px;')
  })
})
