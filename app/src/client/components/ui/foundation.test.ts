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

**Scope, and it is no longer one scope. Widened 2026-09-04 by #148.** The
glob reads the whole client, `/src/client/**`, and the ramp rule below runs
over all of it outside `components/ui/`. It used to read `components/` and
`lib/` only, "what S8 owns plus what it adds", which left `pages/`, `shell/`,
`parts/`, `screens/`, `state/` and `views/` unread: 22 files and 263 ramp
spellings that the rule had never once looked at. A guard over three quarters
of a client is a lottery about which folder a file sits in rather than a rule,
and #135 is what that costs. #129 moved the prototype's
`screens/settings-screen.tsx` into `components/`; the file gained no ramp step
in the move and is byte-identical either side of it, but `screens/` was
outside the glob and `components/` inside it, so the rule met its thirty
spellings for the first time and read as a fresh violation by somebody who had
not written one.

**The other two rules in this file read `components/`, `lib/`, and the
task-owned `tasks/` directory added by #86**, through `S8_SCOPE` below. #86
extends the existing boundary with the modules it moved out of `lib/`; a path
move must not make those modules invisible to a rule that covered them before.
The remaining folders stay outside for the measured reasons each rule carries
below.
*/
import { describe, expect, test } from 'vitest'

const fsSpecifier = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsSpecifier)) as {
  readFileSync: (path: string, encoding: 'utf8') => string
}

const modules = import.meta.glob('/src/client/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/* '/src/client/components/ui/button.tsx' becomes 'components/ui/button.tsx',
   and test files are out: they are about the rules, not under them. */
const sources = Object.fromEntries(
  Object.entries(modules)
    .map(([path, source]) => [path.replace('/src/client/', ''), source] as const)
    .filter(([path]) => !/\.test\.tsx?$/.test(path)),
)
const files = Object.keys(sources).sort()

/* What the glob read until 2026-09-04, plus #86's task-owned successor to five
   modules formerly under `lib/`. Named rather than inlined so that a rule
   living inside this boundary has to say so at its call site, and so that
   retiring it is one edit rather than a search. */
const S8_SCOPE = files.filter(
  (path) =>
    path.startsWith('components/') || path.startsWith('lib/') || path.startsWith('tasks/'),
)

describe('the icon family is one decision in one file (DES-125)', () => {
  /*
  The v1 markup still importing lucide per icon. Each leaves with the package
  that replaces the surface it draws, which this list has said since S8.

  **Five left at S24, which is the shell**: the three folder dialogs, the
  folder row and the state patterns, exactly the set this comment named as
  going "with the shell". The search overlay left at S27, lifted whole. What
  remains are the calendar and the quick-add.
  */
  const V1_LUCIDE = [
    'components/calendar/PlannedCalendar.tsx',
    'components/quick-add.tsx',
  ]

  /*
  **This rule did not widen with #148 and still reads `S8_SCOPE`.** #86 only
  keeps the task modules it moved from `lib/` inside that same scope. The count
  it would meet, measured over the whole client on 2026-09-04: eight more
  files import lucide per icon, `pages/DonePage.tsx`, `pages/FolderPage.tsx`,
  `pages/FolderSharingPanel.tsx`, `pages/InviteGate.tsx`,
  `pages/NotFoundPage.tsx`, `pages/PeoplePage.tsx`,
  `shell/FloatingAddButton.tsx` and `state/ToastRegion.tsx`. #148 is about the
  ramp rule, asks for the ramp rule, and its reviewers will be reading a diff
  about the ramp rule; widening this one in the same change would be a second
  decision taken quietly under cover of the first. The number is written down
  so that whoever takes it starts from a count rather than from a grep.
  */
  test('only the icon module imports lucide-react, beside a named v1 list', () => {
    const importers = S8_SCOPE.filter((path) =>
      /from ['"]lucide-react['"]/.test(sources[path] ?? ''),
    )
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

  **The list below is three kinds of file now, and its name says none of
  them.** It began as v1 markup awaiting the package that replaces it. Since S23 it
  also holds files lifted verbatim from `prototype-v2`, which spell the ramp
  because the original does and because RFC 0004's lift discipline is that a
  lifted file diffs empty against its original: rewriting its class strings to
  reach for roles would be the rewrite that strategy forbids. So a lift adds an
  entry here rather than removing one, which is what `view-strip.tsx` and
  `window-bar.tsx` did at S23, `undo-bar.tsx` did at S24, and `folder-cover`,
  `page-cover` and `page-head` did at S25, `page-image` did at S26, and
  `search-overlay` does at S27, replacing the port's entry with the lift's. The
  bell is the same entry for the opposite reason: it was always the prototype's
  class strings and it moved into this directory at S26, where the rule reaches
  it for the first time. Whether the prototype should be
  asking for roles is a question for the design record.

  **The third kind arrived on 2026-09-04 with #148**, and it is neither of the
  other two: files that never moved and were never lifted, on the list only
  because the glob was widened to the folder they have always sat in. The block
  that names them says so at the point they begin.
  */
  const RAMP = /var\(--color-(graphite|dana-accent|folder|success|warning|danger|info)-/

  const V1_RAMP = [
    'components/calendar/PlannedCalendar.tsx',
    'components/comments.tsx',
    'components/folder-cover.tsx',
    'components/folder-group-dialog.tsx',
    'components/folder-label-dialog.tsx',
    'components/folder-row.tsx',
    'components/history-sheet.tsx',
    'components/icon-action.tsx',
    'components/new-folder-dialog.tsx',
    'components/notifications-bell.tsx',
    'components/page-cover.tsx',
    'components/page-head.tsx',
    'components/page-image.tsx',
    'components/quick-add.tsx',
    'components/search-overlay.tsx',
    /* Moved into scope rather than newly offending, 2026-09-03 (#135). This is
       the prototype's `screens/settings-screen.tsx`, and `screens/` is outside
       this test's glob, as the Scope note above says. #129 moved it to
       `components/`, where the rule reached its thirty-odd v1 spellings for the
       first time. So it belongs on this list for the reason the list exists —
       v1 code the rule was introduced around — and not as an exemption anybody
       chose. The alternative tried first was substituting roles, and it is the
       wrong trade: six steps map exactly, five have no role and would render a
       step off, and nobody can see that from a terminal. #148 is the real gap,
       which is that `screens/`, `pages/` and `shell/` are unguarded. Closed
       2026-09-04: the glob reads the whole client now, and this entry stays
       for the reason it was written rather than for the folder it sits in. */
    'components/settings-page-content.tsx',
    'components/state-patterns.tsx',
    'components/task-assignee-invite.tsx',
    'components/task-board.tsx',
    'components/task-card.tsx',
    'components/task-history-block.tsx',
    'components/task-pickers.tsx',
    'components/task-row.tsx',
    'components/task-section.tsx',
    'components/task-surface.tsx',
    'components/undo-bar.tsx',
    'components/view-strip.tsx',
    'components/window-bar.tsx',
    /* Everything below this line arrived on 2026-09-04 with #148, which widened
       the glob from `components/` and `lib/` to the whole client. It is 22
       files carrying 263 ramp spellings, in six folders the rule had never
       read: `pages/` 9 files and 89 spellings, `shell/` 5 and 77, `screens/` 3
       and 41, `parts/` 3 and 3, `state/` 1 and 3, `views/` 1 and 50. Counted
       first, as #148 asks, because the number decides the shape of the change:
       50 files and 860 spellings over the whole client is a project rather than
       an afternoon, so the offenders are named here in the same commit that
       widens the glob. Not one line of client code changed, and none of these
       files is new — the rule simply looked at them for the first time.

       Substituting roles was not attempted here, on the #135 entry's finding
       twenty lines above: where a step has no role the substitution renders a
       step off, and nobody can see that from a terminal.

       **This list only ever shrinks.** `toEqual` fails in both directions, so a
       file that stops spelling the ramp must leave the list in the same change
       that fixes it, and a file may join only by being markup that already
       shipped — never because the rule was inconvenient. Cheapest first for
       whoever takes a bite: `pages/NotFoundPage.tsx`,
       `screens/important-screen.tsx` and all three `parts/` files carry exactly
       one spelling each. */
    'pages/AllPage.tsx',
    'pages/FolderPage.tsx',
    'pages/FolderSharingPanel.tsx',
    'pages/InviteGate.tsx',
    'pages/LandingPage.tsx',
    'pages/LegalPage.tsx',
    'pages/NotFoundPage.tsx',
    'pages/PeoplePage.tsx',
    'parts/identity-colors.ts',
    'parts/person-tint.ts',
    'parts/presenters.ts',
    'screens/important-screen.tsx',
    'screens/shelf-page.tsx',
    'screens/trash-screen.tsx',
    'shell/FloatingAddButton.tsx',
    'shell/SidebarResizeHandle.tsx',
    'shell/TabStrip.tsx',
    'shell/app-shell.tsx',
    'shell/app-sidebar.tsx',
    'state/ToastRegion.tsx',
    'views/FilterControl.tsx',
  ]

  test('no ramp step outside components/ui, beside a named v1 list', () => {
    const spellers = files
      .filter((path) => !path.startsWith('components/ui/'))
      .filter((path) => RAMP.test(sources[path] ?? ''))
    expect(spellers).toEqual(V1_RAMP)
  })

  /*
  One file writes hexes, and it is the first exemption this rule has ever
  taken (S25).

  `components/folder-cover.tsx` is `prototype-v2`'s cover picker, lifted whole
  for item 44's B1. Its nine gradients are the token palette's own hexes, which
  its author says in terms and which was checked stop by stop against
  `styles/tokens.css` at the lift: "No colour enters the product here that the
  tokens do not already own, which is what makes them brand rather than
  decoration."

  **What makes it an exemption rather than a fix is the mark tier.** Six of the
  covers are built by `markCover`, which assembles an SVG document as a string
  and hands it to `background-image` as a `data:` URI. A `var(--color-...)` is
  read from the element it is set on, and there is no element inside a data URI
  to read one from, so those six stops cannot be anything but literals. Moving
  the nine gradients alone would leave the rule half kept and the file half
  rewritten, which is the rewrite the lift discipline forbids for no gain.

  11.4's own recorded reading is the ground: the rule "governs the values the
  design fixes", and these are that file's transcription of exactly those. The
  hazard the rule exists to prevent, a design that cannot be changed in one
  place, is the one thing to watch here, so the entry is named rather than the
  test loosened, and a second file joining it is a question rather than a
  precedent.
  */
  const LITERAL_HEX = ['components/folder-cover.tsx']

  /*
  **This rule did not widen with #148 either, and the reason is specific
  rather than the one above.** #86 only keeps the task modules it moved from
  `lib/` inside the existing scope. Over the whole client on 2026-09-04 exactly one
  further file writes a six-digit hex: `parts/identity-colors.ts`, eleven of
  them. #41 records that the two palettes in `parts/` are there *because* this
  rule does not reach that folder, and the owner's comment on that issue
  reserves the choice to himself: either the palettes belong in `tokens.css`
  and he takes them, or they genuinely need to be TypeScript and he widens
  this test to allow a named location. Listing the file below would settle
  that by default, in the direction of the second answer, inside a change
  about a different rule. The note above already says a second entry here "is
  a question rather than a precedent", which is this file instructing its
  reader to ask, so it is left as the question it is.
  */
  test('no literal colour anywhere but the token file, beside one named lift', () => {
    const literal = S8_SCOPE.filter((path) => /#[0-9a-fA-F]{6}\b/.test(sources[path] ?? ''))
    expect(literal).toEqual(LITERAL_HEX)
  })
})

describe('the token file is the source of the values (11.4)', () => {
  /*
  This block used to compare `tokens.css` line for line against
  `docs/design/prototype-v2`, which was the approved design source: every
  declaration of his had to appear here, so nobody could edit a hex in the
  client instead of in the design.

  That prototype is deleted and the workflow now forbids standalone prototypes
  outright, so there is no second file to agree with. `tokens.css` is itself
  the source of a value, and editing one is a change to the design rather than
  a drift from it. What survives is the fence around the one variable that was
  never the prototype's.
  */
  const fromHere = (relative: string) =>
    decodeURIComponent(new URL(relative, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

  const tokensCss = readFileSync(fromHere('../../styles/tokens.css'), 'utf8')

  test("the one variable that was never the prototype's is fenced and named", () => {
    expect(tokensCss).toContain('v1 interim block')
    expect(tokensCss).toContain('--sharing-panel-width: 440px;')
  })
})
