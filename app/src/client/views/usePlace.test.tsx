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

beforeEach(() => {
  nextKey += 1
  filterKey = `test-place-${String(nextKey)}`
  router.search = ''
  router.navigate.mockReset()
  address('/app/all')
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
