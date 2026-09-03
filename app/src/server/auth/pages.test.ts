/*
The refusal page's composition, pinned to `prototype-v2`.

**Why here and not in section 12.** AC-257 was claimed for this surface at RFC
0005 change control item 34 and released rather than spent. What the page owed
was nine values, and a criterion asserting a radius and a letter-spacing would
pin an acceptance number to a stylesheet nobody could change without editing
the criterion, which is not what section 12 is for. AC-008 already asserts
9.2's copy exactly, against the words a reader would see rather than the
markup, and it goes on asserting them through this rework. Protocol section 8
puts a module's own unit tests in that module's role's hands, and this is one.

**What is pinned and why those things.** Not every declaration: the nine
values that were v1's and are v2's, plus the three structural facts that make
this a gate card rather than a document. A future transcription that reaches
for the v1 prototype again, which is the mistake this package found, fails
here rather than shipping.

**And what must never move.** One action link, no stylesheet link, and no
script: this page is served without the client bundle by design, and a page
that fetched anything would be a page that could arrive blank on the one
request where a person is already being turned away.

Spec: 9.2 (the copy, which AC-008 owns), 11.1 (a page the server may render),
11.4 as read at RFC 0005 change control item 34, 11.13 (prototype-v2 as the
source), 10.8.
*/
import { describe, expect, test } from 'vitest'

import { SUPPORT_EMAIL } from '../../shared/support.js'
import { emailAlreadyClaimedPage, unverifiedEmailPage } from './pages.js'

const page = unverifiedEmailPage()
const claimed = emailAlreadyClaimedPage()

describe('the unverified-email page draws prototype-v2 gate card', () => {
  test('the nine values v2 moved', () => {
    const pinned: [string, string][] = [
      ['the card radius', 'border-radius: 18px'],
      ['the card hairline', 'border: 1px solid #dddee2'],
      ['the card shadow', 'box-shadow: 0 30px 90px rgb(24 24 27 / 12%)'],
      ['the dark panel padding', 'padding: 36px'],
      ['the mark size', 'width: 36px'],
      ['the icon tile shadow', 'box-shadow: 0 6px 18px rgb(24 24 27 / 7%)'],
      ['the heading size', 'font-size: 36px'],
      ['the heading tracking', 'letter-spacing: -0.035em'],
      ['the body leading', 'line-height: 28px'],
    ]
    for (const [what, declaration] of pinned) {
      expect(
        page,
        `${what} is prototype-v2's, not the v1 card's (spec 11.13, RFC 0005 change control items 20 and 34)`,
      ).toContain(declaration)
    }
    expect(
      page,
      "the panel closes on v2's hairline, which the v1 card had nothing in place of",
    ).toContain('rgb(255 255 255 / 15%)')
  })

  test('every colour is a graphite token written out, and no other value is', () => {
    const ramp = new Set([
      '#ffffff',
      '#fafafb',
      '#dddee2',
      '#585a60',
      '#44464c',
      '#2f3136',
      '#1b1c20',
      '#0a0a0a',
      // The focus ring, which is the accent rather than the ramp.
      '#3c5bbf',
    ])
    const used = new Set(page.match(/#[0-9a-f]{6}\b/g) ?? [])
    for (const colour of used) {
      expect(
        ramp.has(colour),
        `${colour} is in this page and in no token: 11.4 keeps values in one file, and a server template that cannot import it must still write that file's values and no others (RFC 0005 change control item 34)`,
      ).toBe(true)
    }
    expect(used.size, 'the page paints from the ramp at all').toBeGreaterThan(3)
  })

  test('it is a gate card: two panels, the mark, and one action', () => {
    expect(page, 'the dark panel carrying the mark').toContain('class="brand"')
    expect(page, 'the light panel carrying the words').toContain(
      'class="content"',
    )
    expect(
      page.match(/<a\s/g) ?? [],
      'one action and no second one, which is the whole of what this page offers',
    ).toHaveLength(1)
    expect(page, 'and it goes back to the landing page').toContain('href="/"')
  })

  test('it fetches no stylesheet and runs no script', () => {
    expect(
      page,
      'this page is served without the client bundle, so it carries everything it needs inline (11.1)',
    ).not.toMatch(/<link\b/i)
    expect(page, 'and executes nothing').not.toMatch(/<script\b/i)
  })

  test('every interpolated value is escaped', () => {
    // Today's callers pass literals. The rule exists before the day one of
    // them passes a provider-supplied string, which is the day it is needed.
    expect(page, "9.2's apostrophe is served escaped").toContain('&#39;')
    expect(page).not.toContain("can't sign you in")
  })
})

/*
The second gate card, added for issue #17. It shares the template above, so
what is pinned here is only what differs: the extra action, and the fact that
the support address is one constant rather than a literal typed twice.

AC-346 owns the copy, as AC-008 owns the other page's, and it is deliberately
not repeated here.
*/
describe('the claimed-email page is the same card with one more action', () => {
  test('it draws the gate card', () => {
    expect(claimed, 'the dark panel carrying the mark').toContain('class="brand"')
    expect(claimed, 'the light panel carrying the words').toContain('class="content"')
    expect(claimed, 'and it goes back to the landing page').toContain('href="/"')
  })

  test('it offers exactly two actions, the second being support', () => {
    expect(
      claimed.match(/<a\s/g) ?? [],
      "Imran's ruling gives this page a way back and a way to reach a person, and no third thing",
    ).toHaveLength(2)
    expect(
      claimed,
      'the support action is a mailto to the one address the product uses (issue #23)',
    ).toContain(`href="mailto:${SUPPORT_EMAIL}"`)
    expect(
      claimed,
      'and the address is legible in the words too, for a reader who cannot follow the link',
    ).toContain(SUPPORT_EMAIL)
  })

  test('it fetches no stylesheet and runs no script either', () => {
    expect(claimed).not.toMatch(/<link\b/i)
    expect(claimed).not.toMatch(/<script\b/i)
  })

  test('every colour is still a graphite token written out', () => {
    const ramp = new Set([
      '#ffffff',
      '#fafafb',
      '#dddee2',
      '#585a60',
      '#44464c',
      '#2f3136',
      '#1b1c20',
      '#0a0a0a',
      '#3c5bbf',
    ])
    for (const colour of new Set(claimed.match(/#[0-9a-f]{6}\b/g) ?? [])) {
      expect(
        ramp.has(colour),
        `${colour} is in this page and in no token (spec 11.4, RFC 0005 change control item 34)`,
      ).toBe(true)
    }
  })
})
