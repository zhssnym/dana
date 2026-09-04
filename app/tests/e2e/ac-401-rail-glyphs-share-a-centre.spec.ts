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
issue #57 describes.

So the barrier is stillness, and it is a *duration* rather than a pair of
readings. Two samples that agree cannot tell finished from stalled: a main
thread blocked for longer than the gap between them hands back identical
rectangles from the middle of the animation, and the false red then names one
row off by ten pixels, which is #57's own sentence. What is required instead is
that every sample across a 600ms span agrees with the one before it, five
samples at 150ms, and that the sidebar's own width is the same number for the
whole of that span — a rail that is still moving cannot hold both, and a stall
long enough to fake it would have to be four intervals long rather than one.
The alignment is then asserted once against the still layout. A poll on the
alignment itself was rejected: it would report a genuinely crooked rail only at
its timeout, and a settle that cannot distinguish "not yet" from "never" is the
thing this suite has been bitten by twice.

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
The two halves of the stillness barrier. `SAMPLE` is how far apart two readings
are taken: long enough that a transition still running has moved between them,
the collapse measuring about a fifth of a second here. `STILL_FOR` is how long
that agreement has to hold before the layout is called finished, and it is the
half that matters — one agreeing pair is also what a blocked main thread hands
back from the middle of the animation, where four consecutive intervals of it
would need a stall of most of a second lined up with a read.
*/
const SAMPLE_MS = 150
const STILL_FOR_MS = 600

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

/** One measurement of the rail: its own width, and every glyph it draws. */
interface Reading {
  readonly width: number
  readonly glyphs: Glyph[]
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
async function railReading(bar: Locator): Promise<Reading> {
  return bar.evaluate((element) => {
    const glyphs = [...element.querySelectorAll('svg')]
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
      .map(({ of, centre }) => ({ of, centre }))
    return { width: element.getBoundingClientRect().width, glyphs }
  })
}

/** Two readings of the same layout: same width, same glyphs, same centres. */
function same(a: Reading | null, b: Reading): boolean {
  return (
    a !== null &&
    a.width === b.width &&
    a.glyphs.length === b.glyphs.length &&
    b.glyphs.every((glyph, index) => glyph.centre === a.glyphs[index]?.centre)
  )
}

/**
 * The rail's glyphs once it has stopped moving, and "stopped" means stayed
 * stopped: every sample across `STILL_FOR_MS` agreeing with the one before it,
 * width included.
 *
 * This waits for the layout to be still and asserts nothing about where it came
 * to rest, which is the whole point. A poll on the alignment would pass the
 * moment the rail happened to be straight and could only report a genuinely
 * crooked one at its own timeout; this reports it on the first still reading,
 * with every centre in the message.
 *
 * The width travels with the glyphs and is compared with them because it is the
 * cheapest independent witness that the collapse has finished: the animation
 * that moves the glyphs is the one that narrows the sidebar, so a reading taken
 * mid-flight has to differ in one or the other.
 */
async function settledRailGlyphs(bar: Locator): Promise<Reading> {
  let previous: Reading | null = null
  let stillSince: number | null = null
  let still: Reading | null = null
  await expect
    .poll(
      async () => {
        const now = await railReading(bar)
        if (same(previous, now)) {
          stillSince ??= Date.now() - SAMPLE_MS
          still = now
        } else {
          stillSince = null
        }
        previous = now
        return stillSince !== null && Date.now() - stillSince >= STILL_FOR_MS
      },
      {
        message:
          'the rail stops moving and stays stopped. Every reading of its width and of ' +
          `every centre in it, taken ${SAMPLE_MS}ms apart, has to agree with the one before ` +
          `it for ${STILL_FOR_MS}ms before the alignment below is read: the collapse is ` +
          'animated, a glyph caught in flight is not where the rail put it, and one agreeing ' +
          'pair is also what a blocked main thread hands back from the middle of the same ' +
          'animation',
        intervals: [SAMPLE_MS],
        timeout: 20_000,
      },
    )
    .toBe(true)
  if (still === null) throw new Error('unreachable: the poll above returned true')
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

  const reading = await settledRailGlyphs(bar)
  const glyphs = reading.glyphs
  expect(
    reading.width,
    'spec 9.1: the width the rail settled on is still a rail width, so the reading above ' +
      'is of the collapsed sidebar and not of one that reopened while it was being taken',
  ).toBeLessThan(open)
  /*
  The floor, and it is what stops the assertion below passing on nothing. A
  spread over an empty or one-element list is zero, so a rail that drew no
  glyphs, or a filter that removed them all, would read as a perfectly
  aligned one.

  **It is a floor and not an inventory, and the number is a lower bound rather
  than a claim about which glyphs are there.** Folder rows draw glyphs in the
  rail too and count toward this, so six is reachable without the page block
  being drawn at all: what this fails on is a rail with almost nothing in it,
  not a rail that dropped what 9.1 says it holds. That second thing is AC-182's
  and is asserted there by name.
  */
  expect(
    glyphs.length,
    'the rail draws enough glyphs for their agreement to mean anything, at least as many ' +
      `as 9.1's page block has entries (${V2_PAGE_NAMES.length}). Folder rows count toward ` +
      'this too, so it is a floor and not a check that the block is present, which is ' +
      "AC-182's; what a failure here means is that the rail is drawing almost nothing and " +
      'the spread below would be measuring a list too short to have one',
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
