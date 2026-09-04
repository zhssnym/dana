// @vitest-environment jsdom

/*
The saved-view race of issue #47, made deterministic.

**What went wrong in the product.** A person opened a saved view, cleared the
filter, and watched the clear undo itself about half a second later. The CI
trace of run 33463476505 has the three frames: the chip goes, the chip comes
back, nobody touched anything in between. Two pieces of `usePlace.tsx`
disagreed about what the address said, because both read `useSearchParams()`
and `BrowserRouter` commits its location inside `React.startTransition`. The
address bar was updated by the navigation at once; React's copy of it arrived
whenever the scheduler got there, measured at over 400 ms behind on a loaded
machine.

**Why the test mocks `useSearchParams` rather than driving a real router.**
The lag is a scheduling accident, so a real `BrowserRouter` reproduces it only
by winning a race, and the issue records that it will not: AC-332 passed 5 of 5
locally, under 20x CPU throttling, and under a starved scheduler. Holding
React's copy of the search still while `window.location` moves is exactly what
the scheduler does to this code, and it is the only way to state the sequence
as four ordinary assertions. `routerSearch` below is React's copy; the address
bar is set with `history.replaceState`, which is what a navigation does to it
synchronously.

**What that costs, said plainly.** These tests cannot catch a change in React
Router's own behaviour, because React Router is not running. What they pin is
that this file reads the address bar rather than a value handed to it, and the
four cases that mechanism has to keep apart. The browser leg's AC-332 is the
end-to-end guard, and it can only fail when the race is lost.
*/

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { SavedView } from '../../shared/bundle.js'
import { NO_FILTER, viewDefinition } from './filter.js'
import { writeFilter } from './filter-store.js'
import { PLACES } from './place-pages.js'
import { writeViewMode } from './view-mode.js'
import { WindowBar } from '../components/window-bar.js'
import { PlaceChrome, usePlace } from './usePlace.js'

/*
The two halves of the location, kept apart on purpose.

`routerSearch` is what `useSearchParams()` answers, which is React's copy and
the thing that lags. The address bar is `window.location`, moved with
`history.replaceState`. Setting one without the other is the whole point:
production sets the address first and React's copy later.
*/
const router = vi.hoisted(() => ({
  search: '',
  navigate: vi.fn(),
}))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(router.search), vi.fn()],
    useNavigate: () => router.navigate,
  }
})

const VIEW_ID = 'view-big-rocks'

const savedView: SavedView = {
  id: VIEW_ID,
  name: 'Big rocks',
  definition: viewDefinition({ ...NO_FILTER, important: true }, 'all'),
  pinned: false,
  created_at: '2026-09-01T00:00:00.000Z',
}

vi.mock('../api/queries.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/queries.js')>()
  return {
    ...actual,
    useMe: () => ({ data: undefined }),
    useSavedViews: () => ({ data: [savedView] }),
  }
})

vi.mock('../api/mutations.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/mutations.js')>()
  const stub = (): { mutate: () => void } => ({ mutate: () => undefined })
  return { ...actual, useCreateTask: stub, useCreateSavedView: stub, usePullIntoMyDay: stub }
})

afterEach(cleanup)

/*
The filter is `sessionStorage` behind a module-level cache (`filter-store.ts`),
so a key shared between tests would carry one test's narrowing into the next.
A key per test is cheaper than reaching into that cache.
*/
let filterKey = ''
let nextKey = 0

/** Puts the address bar where a navigation would have put it, synchronously. */
function address(path: string): void {
  window.history.replaceState(null, '', path)
}

function Harness(): React.JSX.Element {
  const place = usePlace(PLACES.all, [], { filterKey })
  return (
    <>
      <span data-testid="important">{place.filter.important ? 'on' : 'off'}</span>
      {/* Issue #48's second seed. `?mode=` writes the one preference of 9.1
          rather than a per-page record, so what is read back here is the
          store's answer for this page. */}
      <span data-testid="mode">{place.mode}</span>
      <WindowBar />
      <PlaceChrome place={place} />
    </>
  )
}

/*
Each render builds a new element rather than reusing one. React bails out of
re-rendering a subtree whose element is referentially identical and has no
update of its own scheduled, so a reused element makes `rerender` a no-op and
every assertion after it measures the previous render.
*/
function mount(): { rerender: () => void } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = (): React.JSX.Element => (
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  )
  const view = render(tree())
  return { rerender: () => { view.rerender(tree()) } }
}

const importantIs = (): string => screen.getByTestId('important').textContent ?? ''
const modeIs = (): string => screen.getByTestId('mode').textContent ?? ''

beforeEach(() => {
  nextKey += 1
  filterKey = `test-place-${String(nextKey)}`
  router.search = ''
  router.navigate.mockReset()
  address('/app/all')
  /* One preference across every page, held in a module-level cache over
     `localStorage`, so it is the one piece of state here that is not keyed per
     test. Written rather than cleared, because writing is what resets the
     cache as well as the storage. */
  writeViewMode('list')
})

describe('usePlace: a saved view seeds the filter, and a hand edit outlives a late seed', () => {
  test('arriving at ?view=<id> seeds the page filter from the stored definition', () => {
    address(`/app/all?view=${VIEW_ID}`)
    router.search = `view=${VIEW_ID}`

    mount()

    expect(importantIs()).toBe('on')
  })

  test('opening a saved view on a page already open seeds it too', () => {
    const { rerender } = mount()
    expect(importantIs()).toBe('off')

    /* The panel's own navigation: `setSearchParams({ view })`, which writes
       the address bar synchronously and React's copy some time after. Both
       are in place by the time this render happens. */
    address(`/app/all?view=${VIEW_ID}`)
    router.search = `view=${VIEW_ID}`
    rerender()

    expect(importantIs()).toBe('on')
  })

  /*
  The failure the issue was opened for, in the order the trace shows it.
  */
  test('clearing the filter strips a view id React has not seen yet, and the late seed does not undo it', () => {
    /* The state the trace starts in: the person narrowed this page to
       important, saved that as a view, and has just opened the view. The
       address carries the id; React's copy of the location does not yet. */
    writeFilter(filterKey, { ...NO_FILTER, important: true })
    address(`/app/all?view=${VIEW_ID}`)
    router.search = ''

    const { rerender } = mount()
    expect(importantIs()).toBe('on')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Important only' }))

    /* Half one: the id leaves the address even though React's `search` never
       had it. Before the fix this navigation did not happen at all, and the
       address went on claiming the view was open. The pathname is read from
       the address bar beside the search, so a navigation cannot pick up a
       page the person has already left. */
    expect(importantIs()).toBe('off')
    expect(router.navigate).toHaveBeenCalledWith(
      { pathname: '/app/all', search: '' },
      { replace: true },
    )
    address('/app/all')

    /* Half two, and the one a person feels: React's location finally commits,
       carrying the view id the address gave up hundreds of milliseconds ago.
       The seeding effect re-runs on it. It must not put the filter back. */
    router.search = `view=${VIEW_ID}`
    rerender()

    expect(importantIs()).toBe('off')
  })

  /*
  The case that rules out the obvious cheaper guard. A ref remembering which
  ids have been seeded would pass every test above and fail this one, leaving
  a view that can be opened once per page load and silently does nothing
  afterwards.
  */
  test('opening the same view again after leaving it by hand seeds it again', () => {
    writeFilter(filterKey, { ...NO_FILTER, important: true })
    address(`/app/all?view=${VIEW_ID}`)
    router.search = `view=${VIEW_ID}`

    const { rerender } = mount()
    expect(importantIs()).toBe('on')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Important only' }))
    address('/app/all')
    router.search = ''
    rerender()
    expect(importantIs()).toBe('off')

    address(`/app/all?view=${VIEW_ID}`)
    router.search = `view=${VIEW_ID}`
    rerender()

    expect(importantIs()).toBe('on')
  })
})

/*
The same lag under the two seeds `?view=` left behind (issue #48).

**They were latent and are not tested as though they were live.** Nothing in
this client generates either link — `lib/nav-links.ts`'s `parameterTarget`
maps `?task=` and nothing else — so neither could arrive except on a cold
load, where React's first render already holds the real location and there is
nothing to be behind. What these cases pin is the rule rather than a bug
report: the seed applies while the address carries it and never while it does
not, so the trap is closed before the first `<Link to="/app/today?state=important">`
that 9.4 explicitly invites turns it into the defect #47 was.

**The late echo is the whole of what "left this seed" means for these two.**
Unlike `?view=`, nothing takes `?state=` or `?mode=` out of the address, so
there is no hand-edit case to separate from a re-arrival: the address carries
the seed for as long as the person is on that page, and the only way for the
lagging copy to say something the address does not is for the person to have
gone somewhere else. Each pair below is therefore the arrival and that echo.
*/
describe('usePlace: the one-way seeds apply only while the address carries them', () => {
  test('arriving at ?state=important seeds the filter', () => {
    address('/app/all?state=important')
    router.search = 'state=important'

    mount()

    expect(importantIs()).toBe('on')
  })

  test('a ?state=important the address has already left does not seed on its late echo', () => {
    /* The person opened the seeded link, went somewhere without it, and the
       address moved synchronously. React's copy of the old location commits
       afterwards, which re-runs the effect with a `seedState` the address
       gave up. Before the guard this turned the switch on under them. */
    const { rerender } = mount()
    expect(importantIs()).toBe('off')

    address('/app/all')
    router.search = 'state=important'
    rerender()

    expect(importantIs()).toBe('off')
  })

  test('a ?state=important still in the address seeds on the render that first sees it', () => {
    /* The other half, and the one that keeps the case above from passing on a
       client that had simply stopped seeding. Same sequence, address left
       carrying the parameter. */
    const { rerender } = mount()
    expect(importantIs()).toBe('off')

    address('/app/all?state=important')
    router.search = 'state=important'
    rerender()

    expect(importantIs()).toBe('on')
  })

  /*
  The rule the dependency array is carrying on its own, written down as a case
  so that it stops being carried on its own.

  `?state=` is one-way: nothing takes it out of the address, so it is still
  there after the person turns the switch off by hand. What keeps the seed from
  putting the switch straight back is that `filter` is deliberately absent from
  the effect's dependency list, which is a comment and an omission rather than
  anything a reader can check. An `exhaustive-deps` autofix, or anybody
  "completing" that array, would re-lock the switch and every other case in
  this file would still pass: the guard added for #48 cannot catch it, the
  address genuinely does still carry the seed. So this is the case that goes
  red instead.

  It is the shape #47's own comment calls the difference between a starting
  point and a lock, asserted for the seed that has no way out of the address.
  */
  test('turning the switch off with ?state=important still in the address leaves it off', () => {
    address('/app/all?state=important')
    router.search = 'state=important'

    const { rerender } = mount()
    expect(importantIs()).toBe('on')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Important only' }))
    expect(importantIs()).toBe('off')

    /* Nothing about the location moves, because nothing takes `?state=` out of
       it: this is the ordinary next render of a page the person is still on. */
    rerender()

    expect(importantIs()).toBe('off')
  })

  test('arriving at ?mode=board seeds the view mode', () => {
    address('/app/all?mode=board')
    router.search = 'mode=board'

    mount()

    expect(modeIs()).toBe('board')
  })

  test('a ?mode=board the address has already left does not seed on its late echo', () => {
    const { rerender } = mount()
    expect(modeIs()).toBe('list')

    address('/app/all')
    router.search = 'mode=board'
    rerender()

    /* 9.1 makes this one preference across every page, so a seed honoured
       here would follow the person off this page as well: the mode is
       written to the store rather than held for the render that read it. */
    expect(modeIs()).toBe('list')
  })

  test('a ?mode=board still in the address seeds on the render that first sees it', () => {
    const { rerender } = mount()
    expect(modeIs()).toBe('list')

    address('/app/all?mode=board')
    router.search = 'mode=board'
    rerender()

    expect(modeIs()).toBe('board')
  })
})
