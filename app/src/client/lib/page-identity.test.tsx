// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { placeDescription } from '../../shared/place-descriptions.js'

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(() => Promise.resolve()),
  mutateApi: vi.fn(() => Promise.resolve({ place: 'today', description: null })),
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
  uploadFile: vi.fn(),
}))

vi.mock('../api/queryClient.js', () => ({
  queryClient: () => ({
    getQueryData: () => undefined,
    invalidateQueries: mocks.invalidateQueries,
  }),
  writeFailureMessage: () => 'Nothing was saved.',
}))

vi.mock('../state/toasts.js', () => ({ showToast: vi.fn() }))

import { savePageIdentity, usePageIdentity } from './page-identity.js'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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
