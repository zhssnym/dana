// @vitest-environment jsdom

/*
The calendar zoom's mirror, its write queue and its rollback (issue #140).

**Why this file exists at all**, when the Playwright leg already has AC-405.
That criterion proves the preference follows the person: a zoom chosen, a
reload, a second browser context, and a reveal that changes nothing. What it
cannot reach is what this module does when a write **fails** or when two writes
**race**, because neither is reproducible from a browser driving a healthy
server. Those are exactly the paths where a preference module goes wrong, and
both are silent: an out-of-order pair leaves the account on the older choice
while the interface shows the newer, and a failed write leaves the interface
showing a choice the account never took.

**jsdom rather than node, on line 1 and per file**, which is what
`components/person-face.test.tsx` records as the price of rendering anything in
this suite: `vitest.config.ts` runs everything under `environment: 'node'`, and
this module reads `localStorage` and one of its exports is a hook.

**The seams are mocked and the module is not.** `mutateApi` is the wire,
`queryClient` is the cache and `showToast` is 9.1's failure surface; all three
belong to other modules with their own guards. What is under test is the
ordering, the ranking and the rollback this file owns.

**The mocked `useBundle` reads the mocked cache**, rather than a value the test
holds still. That is not extra fidelity for its own sake: `setCalendarZoom`
writes the new bundle into the cache optimistically, and in the product that is
what the hook reads back. A `useBundle` frozen at its initial value would make
the "a choice ends a reveal" case assert the wrong number and pass for the wrong
reason.

**Module state is the reason for `resetModules`.** `current` and `revealed` are
module-level and `current` is read from storage once at import, so each case
re-imports rather than sharing a store with the one before it.
*/

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { GetSettingsResponse } from '../../shared/bundle.js'

const wire = vi.hoisted(() => ({
  patch: vi.fn<(body: { calendar_zoom: string }) => Promise<GetSettingsResponse>>(),
}))
const cache = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  invalidated: 0,
}))
const toasts = vi.hoisted(() => ({ shown: [] as string[] }))

vi.mock('../api/http.js', () => ({
  mutateApi: (_schema: unknown, options: { body: { calendar_zoom: string } }) =>
    wire.patch(options.body),
}))

vi.mock('../api/queryClient.js', () => ({
  queryClient: () => ({
    getQueryData: (key: readonly string[]) => cache.data.get(key.join(':')),
    setQueryData: (key: readonly string[], next: unknown) => {
      const at = key.join(':')
      cache.data.set(at, typeof next === 'function' ? next(cache.data.get(at)) : next)
    },
    invalidateQueries: () => {
      cache.invalidated += 1
      return Promise.resolve()
    },
  }),
  writeFailureMessage: () => 'write failed',
}))

vi.mock('../api/queries.js', () => ({
  useBundle: () => ({ data: cache.data.get('settings:bundle') }),
}))

vi.mock('../state/toasts.js', () => ({
  showToast: (message: string) => toasts.shown.push(message),
}))

const KEY = 'dana.calendarZoom'
const BUNDLE = 'settings:bundle'

/** A bundle as the server answers it, with the one field these cases read. */
function bundleWith(zoom: 'day' | 'week' | 'month'): GetSettingsResponse {
  return {
    theme: 'system',
    row_density: 'comfortable',
    clock: '12h',
    task_open: 'dialog',
    calendar_zoom: zoom,
    pinned_views: [],
    sidebar_order: [],
    arrangements: {},
  }
}

function storedZoom(): string | undefined {
  return (cache.data.get(BUNDLE) as GetSettingsResponse | undefined)?.calendar_zoom
}

/** A fresh copy of the module, so no case inherits another's module state. */
async function load(): Promise<typeof import('./calendar-zoom.js')> {
  vi.resetModules()
  return import('./calendar-zoom.js')
}

/** Lets the write queue and the `.then` chain behind it drain. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) await Promise.resolve()
}

function Probe({ hook }: { hook: () => string }) {
  return <output>{hook()}</output>
}

function drawn(): string | null {
  return screen.getByRole('status').textContent
}

beforeEach(() => {
  localStorage.clear()
  wire.patch.mockReset()
  cache.data.clear()
  cache.invalidated = 0
  toasts.shown.length = 0
})

afterEach(cleanup)

describe('the mirror', () => {
  test('a choice is mirrored at once, before the wire answers', async () => {
    const { setCalendarZoom } = await load()
    let release: (bundle: GetSettingsResponse) => void = () => undefined
    wire.patch.mockReturnValue(
      new Promise<GetSettingsResponse>((resolve) => {
        release = resolve
      }),
    )

    setCalendarZoom('week')
    expect(
      localStorage.getItem(KEY),
      'the mirror exists so the next cold load paints the right grid on its first frame, ' +
        'which it cannot do if it waits for a round trip',
    ).toBe('week')

    release(bundleWith('week'))
    await settle()
  })

  test('clearCalendarZoomMirror empties it', async () => {
    const { clearCalendarZoomMirror, setCalendarZoom } = await load()
    wire.patch.mockResolvedValue(bundleWith('day'))
    setCalendarZoom('day')
    await settle()
    expect(localStorage.getItem(KEY)).toBe('day')

    clearCalendarZoomMirror()
    expect(
      localStorage.getItem(KEY),
      'sign-out calls this: a shared device must not open the next person on the last ' +
        "person's zoom",
    ).toBeNull()
  })
})

describe('the write queue', () => {
  test('two quick choices leave the account on the later one, whatever order the wire answers in', async () => {
    const { setCalendarZoom } = await load()
    const answers: ((bundle: GetSettingsResponse) => void)[] = []
    wire.patch.mockImplementation(
      () =>
        new Promise<GetSettingsResponse>((resolve) => {
          answers.push(resolve)
        }),
    )

    setCalendarZoom('week')
    setCalendarZoom('day')
    await settle()

    expect(
      wire.patch.mock.calls.map((call) => call[0].calendar_zoom),
      'the queue serializes: the second request is not sent until the first has answered, ' +
        'which is what stops the server seeing two choices out of order',
    ).toEqual(['week'])

    answers[0]?.(bundleWith('week'))
    await settle()

    expect(
      localStorage.getItem(KEY),
      "a stale response must not repaint over a newer choice. 'week' here is the older " +
        'answer winning, which is the bug this guard exists for',
    ).toBe('day')
    expect(wire.patch.mock.calls.map((call) => call[0].calendar_zoom)).toEqual(['week', 'day'])

    answers[1]?.(bundleWith('day'))
    await settle()
    expect(localStorage.getItem(KEY)).toBe('day')
  })
})

describe('a failed write', () => {
  test('rolls the mirror and the cached bundle back, and says so', async () => {
    const { setCalendarZoom } = await load()
    wire.patch.mockResolvedValueOnce(bundleWith('week'))
    setCalendarZoom('week')
    await settle()
    expect(localStorage.getItem(KEY)).toBe('week')
    expect(storedZoom()).toBe('week')

    wire.patch.mockRejectedValueOnce(new Error('offline'))
    setCalendarZoom('day')
    expect(
      localStorage.getItem(KEY),
      'the interface changes on the press, which is what makes this a control rather than a ' +
        'request',
    ).toBe('day')
    expect(storedZoom()).toBe('day')

    await settle()
    expect(
      localStorage.getItem(KEY),
      'and it goes back when the write does not land, because a preference the account never ' +
        'took must not be what the browser paints on the next load',
    ).toBe('week')
    expect(storedZoom()).toBe('week')
    expect(toasts.shown, 'spec 9.1: a write that failed is told, never swallowed').toEqual([
      'write failed',
    ])
  })
})

describe('useCalendarZoom', () => {
  test('the bundle wins over the mirror once it lands, and the mirror answers until then', async () => {
    localStorage.setItem(KEY, 'day')
    const { useCalendarZoom } = await load()

    render(<Probe hook={useCalendarZoom} />)
    expect(
      drawn(),
      'the mirror is what the first frames have, which is the whole reason it exists',
    ).toBe('day')

    cleanup()
    cache.data.set(BUNDLE, bundleWith('week'))
    render(<Probe hook={useCalendarZoom} />)
    expect(
      drawn(),
      '4.10 is the record: a mirror left behind on this device must never outrank the column ' +
        'once it has answered',
    ).toBe('week')
    await waitFor(() => {
      expect(
        localStorage.getItem(KEY),
        'and reading the record refreshes the cache, which is the write-through half of ' +
          'RFC 0005 change control item 43',
      ).toBe('week')
    })
  })

  test('a reveal outranks the record, writes nothing, and is dropped by a choice or by leaving', async () => {
    const { clearRevealedZoom, revealCalendarZoom, setCalendarZoom, useCalendarZoom } =
      await load()
    cache.data.set(BUNDLE, bundleWith('month'))
    wire.patch.mockImplementation((body) => Promise.resolve(bundleWith(body.calendar_zoom as 'week')))

    render(<Probe hook={useCalendarZoom} />)
    expect(drawn()).toBe('month')

    revealCalendarZoom('day')
    await waitFor(() => {
      expect(
        drawn(),
        'spec 9.5: "+N more" draws the crowded day whole, so the reveal has to outrank the ' +
          'stored zoom while it lasts',
      ).toBe('day')
    })
    expect(
      localStorage.getItem(KEY),
      'Imran on the review of #140: peeking at a crowded day is a look, so it reaches neither ' +
        'the account nor the mirror. What the mirror holds is the record, month, put there by ' +
        "the hook's own write-through when the bundle was read; day would mean the reveal had " +
        'leaked into the cache the next cold load paints from',
    ).toBe('month')
    expect(wire.patch).not.toHaveBeenCalled()
    expect(storedZoom()).toBe('month')

    setCalendarZoom('week')
    await waitFor(() => {
      expect(
        drawn(),
        'an explicit choice ends the reveal, or pressing Week while peeking at a day would ' +
          'look like a control that did nothing',
      ).toBe('week')
    })

    revealCalendarZoom('day')
    await waitFor(() => {
      expect(drawn()).toBe('day')
    })
    clearRevealedZoom()
    await waitFor(() => {
      expect(
        drawn(),
        "9.5's leaves-the-page: PlannedCalendar calls this on unmount, so nothing a person " +
          'peeked at survives the page they peeked on',
      ).toBe('week')
    })
  })
})
