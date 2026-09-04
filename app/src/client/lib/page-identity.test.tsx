// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { placeCover } from '../../shared/covers.js'
import { placeDescription } from '../../shared/place-descriptions.js'

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(() => Promise.resolve()),
  mutateApi: vi.fn(() => Promise.resolve({ place: 'today', description: null })),
  uploadFile: vi.fn(() =>
    Promise.resolve({ id: 'stored-1', bytes: 1, width: 1, height: 1 }),
  ),
  /* What `storedCover` reads. `savePageIdentity` is a plain function rather
     than a hook, so a reposition takes the cover it is moving out of the cache
     instead of out of a render; this is that cache. */
  cached: { covers: [] as unknown[] },
}))

vi.mock('../api/queries.js', () => ({
  useFolder: () => ({ data: undefined }),
  usePlaceCovers: () => ({ data: { covers: [] } }),
  usePlaceDescriptions: () => ({
    data: {
      descriptions: [{ place: 'today', description: 'My calm plan for today.' }],
    },
  }),
  useShelf: () => ({ data: undefined }),
}))

vi.mock('../api/http.js', () => ({
  mutateApi: mocks.mutateApi,
  uploadFile: mocks.uploadFile,
}))

vi.mock('../api/queryClient.js', () => ({
  queryClient: () => ({
    getQueryData: () => mocks.cached,
    invalidateQueries: mocks.invalidateQueries,
  }),
  writeFailureMessage: () => 'Nothing was saved.',
}))

vi.mock('../state/toasts.js', () => ({ showToast: vi.fn() }))

import {
  coverPhotoPicker,
  coverStoresPosition,
  coverTiersFor,
  coverUploader,
  savePageIdentity,
  usePageIdentity,
} from './page-identity.js'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.cached.covers = []
})

describe('native page descriptions', () => {
  it('reads a saved sentence even when the page has no cover', () => {
    let description: string | undefined

    function Harness(): null {
      description = usePageIdentity('today').description
      return null
    }

    render(<Harness />)

    expect(description).toBe('My calm plan for today.')
  })

  it('saves an edit without making a cover request', () => {
    savePageIdentity('today', { description: 'A clearer day.' })

    expect(mocks.mutateApi).toHaveBeenCalledOnce()
    expect(mocks.mutateApi).toHaveBeenCalledWith(placeDescription, {
      method: 'PUT',
      path: '/place-descriptions/today',
      body: { description: 'A clearer day.' },
    })
  })

  it('clears with null so Dana’s friendly sentence can return', () => {
    savePageIdentity('today', { description: undefined })

    expect(mocks.mutateApi).toHaveBeenCalledWith(placeDescription, {
      method: 'PUT',
      path: '/place-descriptions/today',
      body: { description: null },
    })
  })
})

/*
The seam issue #118 changed, held from this side as well as from the browser.

AC-406 and AC-407 drive the whole act through a real server and are the
evidence that it works; these are the fast guard on the three answers that
*decide* what a person is offered, and on the two writes whose shape used to
differ by page kind. The one thing no browser case can cheaply say is the
negative: that `link` is offered nowhere, which is the tier #115 holds and the
one a future round is most likely to switch on by accident.
*/
describe('the cover seam answers the same for three kinds of page', () => {
  const pages = ['folder:f-1', 'shelf:s-1', 'today'] as const

  it('offers gallery, upload and photos everywhere, and link nowhere', () => {
    for (const page of pages) {
      expect(coverTiersFor(page)).toEqual(['gallery', 'upload', 'photos'])
      expect(coverTiersFor(page)).not.toContain('link')
    }
  })

  it('keeps a crop everywhere, all three stores having a column for one', () => {
    for (const page of pages) expect(coverStoresPosition(page)).toBe(true)
  })

  it('scopes an upload to a folder and omits the folder for the other two', () => {
    const picture = new File(['x'], 'cover.png', { type: 'image/png' })
    for (const page of pages) coverUploader(page)?.(picture)

    /* Null and never the empty string: 7.15 reads an empty `folder_id` part as
       a malformed uuid and refuses it, so omission is the only spelling that
       means "no folder". */
    expect(mocks.uploadFile).toHaveBeenNthCalledWith(1, 'cover', 'f-1', picture)
    expect(mocks.uploadFile).toHaveBeenNthCalledWith(2, 'cover', null, picture)
    expect(mocks.uploadFile).toHaveBeenNthCalledWith(3, 'cover', null, picture)
  })

  it('stores a chosen photograph through the route the page has', () => {
    for (const page of pages) coverPhotoPicker(page)?.('photo-1')

    expect(mocks.mutateApi).toHaveBeenNthCalledWith(1, expect.anything(), {
      method: 'POST',
      path: '/folders/f-1/cover/photo',
      body: { photo_id: 'photo-1' },
    })
    for (const nth of [2, 3]) {
      expect(mocks.mutateApi).toHaveBeenNthCalledWith(nth, expect.anything(), {
        method: 'POST',
        path: '/covers/photo',
        body: { photo_id: 'photo-1' },
      })
    }
  })

  it('writes a place page’s picture as 7.19’s file_id, where it used to drop it', () => {
    savePageIdentity('today', { cover: 'link:/api/v1/files/f-9', coverPos: 50 })

    expect(mocks.mutateApi).toHaveBeenCalledWith(placeCover, {
      method: 'PUT',
      path: '/place-covers/today',
      body: { file_id: 'f-9', focal_y: 50 },
    })
  })

  it('writes a shelf’s gradient as a preset with a crop, where only a file crossed', () => {
    savePageIdentity('shelf:s-1', { cover: 'gradient:cobalt-deep', coverPos: 50 })

    expect(mocks.mutateApi).toHaveBeenCalledWith(null, {
      method: 'PATCH',
      path: '/shelves/s-1',
      body: { cover_preset: 'gradient-cobalt-deep', cover_focal_y: 50 },
    })
  })
})

/*
The reposition-only write, which is the arm with no other guard on either leg.

A drag on a place page's band sends `{ coverPos }` and nothing else, and 7.19's
PUT is idempotent over the whole entry rather than a partial update, so the
cover being moved has to be re-sent with it. That re-send is read out of the
query cache — `savePageIdentity` is a plain function and has no render to read
from — and for a picture it must be spelled `file_id`. It was spelled as a
preset until issue #118, which is the same `return` that stopped a place page
holding a picture at all: the drag went nowhere and the band snapped back on
the next read. AC-406 drives the gesture in a browser; these two are the shape
of the body, which a browser cannot see.
*/
describe('repositioning a place page’s cover re-sends the cover it is moving', () => {
  it('re-sends a picture as file_id with the new crop, never as a preset', () => {
    mocks.cached.covers = [
      { place: 'today', file_id: 'f-9', preset: null, focal_y: 50 },
    ]

    savePageIdentity('today', { coverPos: 72 })

    expect(mocks.mutateApi).toHaveBeenCalledWith(placeCover, {
      method: 'PUT',
      path: '/place-covers/today',
      body: { file_id: 'f-9', focal_y: 72 },
    })
    const [, options] = mocks.mutateApi.mock.calls[0] as unknown as [
      unknown,
      { body: object },
    ]
    expect(
      Object.keys(options.body),
      '4.20 admits exactly one source and 7.19 refuses a body naming both',
    ).not.toContain('preset')
  })

  it('re-sends a gradient as its preset key with the new crop', () => {
    mocks.cached.covers = [
      { place: 'today', file_id: null, preset: 'gradient-fern', focal_y: 50 },
    ]

    savePageIdentity('today', { coverPos: 20 })

    expect(mocks.mutateApi).toHaveBeenCalledWith(placeCover, {
      method: 'PUT',
      path: '/place-covers/today',
      body: { preset: 'gradient-fern', focal_y: 20 },
    })
  })

  it('sends nothing where the page is wearing no cover to move', () => {
    savePageIdentity('today', { coverPos: 72 })

    expect(mocks.mutateApi).not.toHaveBeenCalled()
  })
})
