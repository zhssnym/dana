import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { getStatsResponse } from '../../shared/stats.js'
import type { GetStatsResponse } from '../../shared/stats.js'
import { ApiError, getPlain } from './http.js'
import { queryKeys } from './keys.js'

export function useStats(): UseQueryResult<GetStatsResponse> {
  return useQuery({
    queryKey: queryKeys.stats(),
    queryFn: () => getPlain(getStatsResponse, '/stats'),
    // A 404 means "not an operator", and asking again will not change that.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
}
