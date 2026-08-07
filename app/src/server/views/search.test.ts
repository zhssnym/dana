/*
The one part of Q8 that is a pure function: the pattern a typed query becomes.

The escaping was ruled at the P4 mid-package change control on 2026-08-07 and
is section 6's own text now. It is measured here as well as on the wire
because the ordering inside the replacement is invisible from outside: escape
the wildcards before the backslash and every escape this step adds is escaped
again, which turns "50%" into a pattern matching a literal backslash. A
round trip through Postgres would catch that, and so does this, in a
millisecond and with the reason in the message.
*/
import { describe, expect, test } from 'vitest'

import { searchPattern } from './search.js'

describe('Q8 builds its pattern from the literal a user typed', () => {
  test('the pattern surrounds the query with wildcards', () => {
    expect(
      searchPattern('report'),
      "6 Q8: pattern = '%' q '%', which is what makes a match in the middle of a word count",
    ).toBe('%report%')
  })

  test('a percent is escaped, so it matches a percent', () => {
    expect(
      searchPattern('50%'),
      'ruled 2026-08-07: a search for "50%" matches text containing those three characters rather than everything containing "50"',
    ).toBe('%50\\%%')
  })

  test('an underscore is escaped, so it matches an underscore', () => {
    expect(
      searchPattern('a_b'),
      'ruled 2026-08-07: "a_b" matches that literal underscore rather than any character between a and b',
    ).toBe('%a\\_b%')
  })

  test('a backslash is escaped first, so the escapes are not escaped', () => {
    expect(
      searchPattern('a\\b'),
      'the backslash is LIKE\'s own escape character, so an unescaped one silently means "ab"; escaping it after the wildcards would escape the escapes this step just added',
    ).toBe('%a\\\\b%')
  })

  test('all three at once', () => {
    expect(
      searchPattern('a\\_%b'),
      'each character is escaped exactly once, whatever order they arrive in',
    ).toBe('%a\\\\\\_\\%b%')
  })

  test('anything else is carried through untouched', () => {
    expect(
      searchPattern("O'Brien & co."),
      'only the three characters LIKE reads as syntax are escaped; the rest are bound as a parameter and need nothing',
    ).toBe("%O'Brien & co.%")
  })
})
