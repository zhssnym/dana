// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }))
vi.mock('./http.js', () => ({ getPlain: mock.get, mutateApi: mock.mutate }))

import { useWearFilterLabel } from './labels.js'

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('assigns the current Work filter label to a created task, but not an archived label', async () => {
  mock.get.mockResolvedValue({ rows: [
    { id: 'active', scope: 'folder', folder_id: 'work', archived: false },
  ] })
  mock.mutate.mockResolvedValue({})
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useWearFilterLabel('work'), { wrapper })
  act(() => {
    result.current('new-task', 'active')
    result.current('other-task', 'archived')
  })
  await waitFor(() => expect(mock.mutate).toHaveBeenCalledTimes(1))
  expect(mock.get).toHaveBeenCalledWith(expect.anything(), '/labels', {
    state: 'active', scope: 'all', folder_id: 'work',
  })
  expect(mock.mutate).toHaveBeenCalledWith(expect.anything(), {
    method: 'PUT', path: '/tasks/new-task/labels/active',
  })
})
