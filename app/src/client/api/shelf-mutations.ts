import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'

import { shelf } from '../../shared/shelves.js'
import type { PostShelvesBody, Shelf } from '../../shared/shelves.js'
import { mutateApi } from './http.js'

/** Create one private Collection through the existing Shelf contract. */
export function useCreateShelf(): UseMutationResult<Shelf, Error, PostShelvesBody> {
  return useMutation({
    mutationFn: (body: PostShelvesBody) =>
      mutateApi(shelf, { method: 'POST', path: '/shelves', body }),
  })
}
