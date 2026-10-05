import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import { getArchivedWorkResponse } from '../../shared/archive.js'
import type { GetArchivedWorkResponse } from '../../shared/archive.js'
import { folder } from '../../shared/folders.js'
import type { Folder } from '../../shared/folders.js'
import { getPlain, mutateApi } from './http.js'
import { queryKeys } from './keys.js'

export function useArchivedWork(): UseQueryResult<GetArchivedWorkResponse> {
  return useQuery({
    queryKey: queryKeys.archivedWork(),
    queryFn: () => getPlain(getArchivedWorkResponse, '/archive/folders'),
  })
}

export function useArchiveFolder(): UseMutationResult<void, Error, string> {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await mutateApi(null, { method: 'POST', path: `/folders/${id}/archive` })
      client.removeQueries({
        predicate: ({ queryKey }) => queryKey[0] === 'folders' && queryKey[1] === id,
      })
    },
  })
}

export function useRestoreArchivedFolder(): UseMutationResult<Folder, Error, string> {
  return useMutation({
    mutationFn: (id: string) => mutateApi(folder, {
      method: 'POST', path: `/archive/folders/${id}/restore`,
    }),
  })
}

export function useDestroyArchivedFolder(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (id: string) => mutateApi(null, {
      method: 'DELETE', path: `/archive/folders/${id}`,
    }),
  })
}
