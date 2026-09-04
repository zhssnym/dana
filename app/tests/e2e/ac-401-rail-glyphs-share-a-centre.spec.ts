/*
AC-401: given the sidebar collapsed to its icon rail, then every glyph the
rail draws shares one centre line, each glyph's centre-x agreeing with every
other's rather than with a number this criterion fixes.

Written 2026-09-04 from issue #57, which is a handoff rather than a finding of
this suite's: the collapsed rail drew its glyphs at three different x
positions — 28, 24 and 20 in a 56px rail — for months, #56 put all of them on
28, and nothing anywhere would have stopped them drifting apart again. This is
the second recorded failure of that surface to be checked by anything. The
first is in CLAUDE.md, where a comment on `folder-row.tsx` claimed "one centred
glyph per folder in the rail" for a row that had never been centred, and a
session working from the comment concluded a reported misalignment was
impossible. A comment stood in for a test and was wrong for months, which is
the argument for spending a number on this rather than trusting the fix.

**The number is deliberately not pinned.** Asserting the centre is 28 would
fail on a rail resize that is nobody's defect: the width is a design value and
`styles/tokens.css` is where it is allowed to change. What makes a column of
glyphs a rail is that they agree with each other, so what is asserted is the
spread of the centres and not their value. The rail's own midpoint is not
asserted either, though it happened to be exactly 28 of 56 when this was
written: a scroll gutter appearing inside the rail would move every glyph off
that midpoint together, which is a layout question rather than the alignment
one, and this case would then be red for a reason it is not about.

**Centre-x rather than x, and that is load-bearing.** The rail's glyphs are
not one size — the app-name mark is 24px where the page entries are 16 — so
their left edges legitimately differ by four pixels while the column is
perfectly straight. A case reading `x` would have had to exempt the mark, and
an exemption is where the next drift hides.

**Only the glyphs the rail draws are measured, and the filter is stated rather
than silent.** The collapsed sidebar keeps the "More", "Library" and "More
actions" rows in the document with no box at all, zero-wide and zero-high at
the origin. An element with no box has no centre, so including one would
compare a glyph against a number that is not a position and fail this case on
every run for a reason that has nothing to do with alignment. The floor below
is what keeps that filter from being a way to pass: it fails if the filter has
left too few glyphs to be a rail.

**The settle is on the geometry and not on the sidebar's width, and that was
measured rather than assumed.** The first version of this case waited only for
the sidebar to be narrower than it was, which is AC-182's barrier, and it went
red three times out of three with the folder row's glyph at centre 17.89
against 28 for the other twenty-two. Nothing was misaligned: the collapse is
animated, and the folder rows reach the rail's centre after the sidebar has
finished narrowing, so the case was reading a position the interface was on
its way through. That is CLAUDE.md's AC-182 bullet exactly, and it arrived
wearing the defect's own clothes — a single row off by ten pixels is what
issue #57 describes. So the barrier here is that two readings of every centre,
150ms apart, agree: the rail has stopped moving, whatever it has stopped on,
and the alignment is then asserted once against a still layout rather than
polled until it happens to pass. A poll on the alignment itself would have
been a barrier that reports a genuinely crooked rail only at its timeout, and
a settle that cannot distinguish "not yet" from "never" is the thing this
suite has been bitten by twice.

**A component test cannot do this and that is why it is here.**
`vitest.config.ts` sets `environment: 'node'`, and jsdom has no layout engine
either, so the only assertion available off the browser leg is that a class
string is present — a test of the fix's spelling rather than of its effect.

Spec: 9.1 (the sidebar's collapsed icon rail, and that the collapsed state
"changes nothing about what the sidebar holds"), issue #57. Beside AC-182,
which collapses the same rail and asserts what it still reaches, where this
asserts how it is drawn.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  DEFAULT_PINS,
  patchBundle,
  routesV2,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
  V2_PAGE_NAMES,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/*
How far apart two centres may be and still be one line. Not zero, because a
browser lays out at device pixels and a fractional scale factor can put a box
on a half pixel; not larger, because the drift this exists to catch was four
pixels and eight, so half a pixel sits well inside the defect while leaving
the arithmetic room to be arithmetic.
*/
const CENTRE_TOLERANCE_PX = 0.5

/**
 * The control that collapses the sidebar to its icon rail. 9.1 names the
 * state and no control, so this is a description match, and it is AC-182's
 * locator character for character rather than a second answer to the same
 * question.
 */
function railControl(page: Page): Locator {
  return sidebar(page)
    .getByRole('button', { name: /sidebar|rail|collapse|expand/i })
    .or(page.getByRole('button', { name: /toggle sidebar/i }))
}

/*
How long two readings of the rail's geometry are held apart before they are
called the same layout. Long enough that a transition still running has moved
between them — the collapse measured about a fifth of a second here — and
short enough that the settle costs one blink on a case that is already still.
*/
const GEOMETRY_STABLE_MS = 150

/** The width the browser painted for an element, in whole pixels. */
async function widthOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()
  expect(box, 'the element is on the page and has a box').not.toBeNull()
  return Math.round(box?.width ?? 0)
}

interface Glyph {
  /** What the glyph is for, so a failure names the row rather than an index. */
  readonly of: string
  readonly centre: number
}

/**
 * Every glyph the rail actually draws, with the centre-x of its box and the
 * name of the link or button it sits in.
 *
 * Read in one pass inside the page rather than one `boundingBox()` per
 * element: the whole question is where these boxes are relative to each
 * other, and a measurement taken across thirty round trips is thirty
 * measurements of a layout that is free to move between them.
 */
async function railGlyphs(bar: Locator): Promise<Glyph[]> {
  return bar.locator('svg').evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const box = node.getBoundingClientRect()
        const owner = node.closest('a,button')
        const named = owner?.getAttribute('aria-label') ?? (owner?.textContent ?? '').trim()
        return {
          of: named === '' ? 'a glyph in no named control' : named.slice(0, 40),
          centre: box.x + box.width / 2,
          drawn: box.width > 0 && box.height > 0,
        }
      })
      .filter((glyph) => glyph.drawn)
      .map(({ of, centre }) => ({ of, centre })),
  )
}

/**
 * The rail's glyphs once it has stopped moving: the same reading twice,
 * `GEOMETRY_STABLE_MS` apart, returned as the reading to assert on.
 *
 * This waits for the layout to be still and asserts nothing about where it
 * came to rest, which is the whole point. A poll on the alignment would pass
 * the moment the rail happened to be straight and could only report a
 * genuinely crooked one at its own timeout; this reports it on the first
 * still frame, with every centre in the message.
 */
async function settledRailGlyphs(bar: Locator): Promise<Glyph[]> {
  let previous: Glyph[] | null = null
  let still: Glyph[] = []
  await expect
    .poll(
      async () => {
        const now = await railGlyphs(bar)
        const same =
          previous !== null &&
          previous.length === now.length &&
          now.every((glyph, index) => glyph.centre === previous?.[index]?.centre)
        previous = now
        if (same) still = now
        return same
      },
      {
        message:
          'the rail stops moving. Two readings of every centre in it, taken ' +
          `${GEOMETRY_STABLE_MS}ms apart have to agree before the alignment below is read, ` +
          'because the collapse is animated and a glyph caught in flight is not where the ' +
          'rail put it',
        intervals: [GEOMETRY_STABLE_MS],
      },
    )
    .toBe(true)
  return still
}

test('AC-401: every glyph the collapsed rail draws shares one centre line', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  // The whole page block present, as AC-182 sets it up, so that the rail is
  // measured with everything 9.1 puts in it drawn rather than with whichever
  // subset this account happened to have pinned.
  await patchBundle(page, { pinned_views: [...DEFAULT_PINS, 'done'] })
  await page.goto(routesV2.desk)

  const bar = sidebar(page)
  const open = await widthOf(bar)
  await clickControl(
    railControl(page).first(),
    'spec 9.1: "whether it is collapsed to an icon rail" is the viewer\'s, so there is a ' +
      'control that collapses it',
  )
  /* The collapse is what makes the rest of this case about a rail, so it is
     waited for rather than assumed: a case that measured the open sidebar
     would be asserting the alignment of a surface this criterion is not
     about, and it would probably pass, an open sidebar's glyphs being a
     straight column too. This is only half the barrier — it says the
     narrowing has started, and the glyphs arrive after it — and the other
     half is `settledRailGlyphs` below. */
  await expect
    .poll(async () => widthOf(bar), {
      message: 'spec 9.1: an icon rail is narrower than the sidebar it collapses',
    })
    .toBeLessThan(open)

  const glyphs = await settledRailGlyphs(bar)
  /*
  The floor, and it is what stops the assertion below passing on nothing. A
  spread over an empty or one-element list is zero, so a rail that drew no
  glyphs, or a filter that removed them all, would read as a perfectly
  aligned one. 9.1's page block alone is six entries and each draws a glyph,
  so a count under that is the rail not drawing the block — which is AC-182's
  defect rather than this one's, and this case says so and stops rather than
  reporting an alignment it never measured.
  */
  expect(
    glyphs.length,
    "the rail draws at least one glyph per page in 9.1's page block. Fewer than that " +
      'means the collapsed sidebar has dropped what it holds, which 9.1 forbids and ' +
      'AC-182 asserts; the alignment below cannot be read until that is true',
  ).toBeGreaterThanOrEqual(V2_PAGE_NAMES.length)

  const centres = glyphs.map((glyph) => glyph.centre)
  const spread = Math.max(...centres) - Math.min(...centres)
  expect(
    spread,
    'issue #57: the glyphs of a rail are one column, so every centre-x is the same ' +
      "number. The number is not this criterion's to fix — a rail may be any width — but " +
      `the agreement is. Measured: ${glyphs
        .map((glyph) => `${glyph.of} at ${glyph.centre}`)
        .join(', ')}`,
  ).toBeLessThanOrEqual(CENTRE_TOLERANCE_PX)
})
