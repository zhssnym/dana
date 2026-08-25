/*
The unit tests for `copy.ts`, written at P8R session R11, the copy sweep.

**Why a second net exists for strings a criterion already reads.** AC-183 is a
regression criterion and RFC 0002 says so: its nine strings are exactly the
places a port from the designer's prototype is known to lose copy, they were
found by measurement rather than by review, and a criterion is the only thing
in this build that survives the session that learned them. Two of those nine
are rendered from this file, the failed-read line and the abandon confirm, and
this directory renders eleven more strings section 9 fixes that no criterion
reads as copy at all: it addresses most of them as accessible names, which a
paraphrase satisfies exactly as well as the specified word does whenever the
paraphrase happens to match the locator. Protocol section 8 makes a unit test
inside a role's own module that role's own, and this is the module where the
absence of one is expensive.

**Every expected string below is transcribed from the numbered section, never
imported from the module under test.** That is AC-183's own rule, applied one
level in: a test that reads the string it asserts out of the code under test
asserts that the code equals itself, which is precisely the check a copy
regression has to survive. Each case names the section the string comes from,
so a red says which sentence moved rather than that a constant changed.

**The prototype is committed in this repository and is the source a later
session ports from**, which is why the last two cases read
`state-patterns.tsx` rather than a constant. His `InlineError` renders 9.1's
global error toast where this one renders 9.1's failed-read line, and his own
states page annotates the substitution as an open copy decision. RFC 0002
closed it on 2026-08-13: the toast reports that a write did not land and this
line reports that a read did not arrive, so a page showing "Nothing was saved"
where nothing was being saved tells a person something false about their own
data. Reintroducing his line is a two-character edit and this is what fails
when somebody makes it.
*/
import { describe, expect, test } from 'vitest'

import statePatternsSource from '../state-patterns.tsx?raw'
import {
  ABANDON_CONFIRM,
  ABANDONED_CHIP,
  ADD_A_TASK,
  COLLAPSE_SIDEBAR,
  COMPLETE_TASK,
  DELETE_TASK_CONFIRM,
  EXPAND_SIDEBAR,
  MARK_AS_NOT_DONE,
  MORE_ACTIONS,
  OPEN_FULL_FORM,
  READ_FAILED,
  REMOVE_FROM_TODAY,
  RESTORE,
  STAR_OFF,
  STAR_ON,
  TRY_AGAIN,
} from './copy.js'

/** Comments quote the rejected wordings on purpose, so they are not source. */
function rendered(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
}

describe("9.1's inline state copy, which AC-183 reads as one text run", () => {
  test('the failed-read line is the page\'s own words', () => {
    expect(READ_FAILED).toBe("Couldn't load this. Nothing was changed.")
  })

  test('the control beside it is named by 9.1\'s names table', () => {
    // "The inline retry control (9.4) | 'Try again'". His reads "Retry".
    expect(TRY_AGAIN).toBe('Try again')
  })
})

describe("9.1's names table, the strings this directory renders", () => {
  test('an overflow menu is "More actions" and never "More options"', () => {
    // Four controls share it: a task row's, the task form's, a sidebar folder
    // row's and a folder group's. 9.3 spends "More options" on the form's
    // expander, and a page carrying both would otherwise have two different
    // controls answering to one name.
    expect(MORE_ACTIONS).toBe('More actions')
  })

  test('the inline quick-add is "Add a task", one name across both states', () => {
    // Not "Add task", which is the floating add button on the same page.
    expect(ADD_A_TASK).toBe('Add a task')
  })

  test('the quick-add\'s escalation control is "Open full form"', () => {
    // Added to the table at the P8R mid-package change control on 2026-08-13.
    // A fixed string, never interpolated with the folder it sits beside.
    expect(OPEN_FULL_FORM).toBe('Open full form')
  })

  test('the completion control carries one name per state', () => {
    expect(COMPLETE_TASK).toBe('Complete task')
    expect(MARK_AS_NOT_DONE).toBe('Mark as not done')
  })

  test('the sidebar rail control carries one name per state', () => {
    expect(COLLAPSE_SIDEBAR).toBe('Collapse sidebar')
    expect(EXPAND_SIDEBAR).toBe('Expand sidebar')
  })
})

describe('the confirmations and row copy of 9.3 to 9.5', () => {
  test("9.4's abandon confirm is one sentence", () => {
    // AC-183's fourth string. The prototype delivers it as an
    // AlertDialogTitle plus an AlertDialogDescription, which reads correctly
    // and is not this copy: a block boundary is where a reader stops hearing
    // one sentence, and this is the only thing that tells the person the task
    // stays everywhere else.
    expect(ABANDON_CONFIRM).toBe(
      'Abandon this task? It stops appearing in My Day but stays everywhere else.',
    )
  })

  test("9.3's delete confirm, which 9.4 also puts in a row's overflow", () => {
    expect(DELETE_TASK_CONFIRM).toBe("Delete this task? This can't be undone.")
  })

  test("9.4's un-pull control", () => {
    expect(REMOVE_FROM_TODAY).toBe('Remove from Today')
  })

  test("9.5's star names its own state off Important", () => {
    expect(STAR_ON).toBe('Important')
    expect(STAR_OFF).toBe('Mark as important')
  })

  test("9.5's abandoned treatment carries a chip and a restore control", () => {
    expect(ABANDONED_CHIP).toBe('Abandoned')
    expect(RESTORE).toBe('Restore')
  })
})

describe('the substitution RFC 0002 closed stays closed', () => {
  /** From `export function InlineError` to whatever is exported after it. */
  function inlineErrorBody(): string {
    const source = rendered(statePatternsSource)
    const opens = source.indexOf('export function InlineError')
    expect(opens, 'state-patterns.tsx no longer exports InlineError').toBeGreaterThan(-1)
    const rest = source.slice(opens + 1)
    const closes = rest.indexOf('export ')
    return closes === -1 ? rest : rest.slice(0, closes)
  }

  test('the inline failed-read state renders 9.1\'s line', () => {
    expect(inlineErrorBody()).toContain('READ_FAILED')
  })

  test('it never renders the global error toast instead', () => {
    // 9.1 gives the toast to a write that did not land. The prototype's
    // InlineError shows it for a read that did not arrive; AC-183's first
    // case is that substitution and this is the same assertion at the source.
    expect(inlineErrorBody()).not.toContain('Nothing was saved')
  })

  test('the offline banner of 9.1 is one sentence in this file', () => {
    // Rendered as JSX text rather than as a constant, so it is read here
    // rather than imported. AC-091 asserts it in the browser; this is what
    // fails first if a port rewords it.
    expect(rendered(statePatternsSource)).toContain(
      "You're offline. Dana needs a connection; changes can't be saved right now.",
    )
  })
})
