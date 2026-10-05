/*
 * The client half of spec 8.3: refetch the active view on focus and after each own mutation.
 * `staleTime: Infinity` needs `refetchOnWindowFocus: 'always'`; `true` would never refetch.
 * `networkMode: 'always'` and `retry: 0`: no offline write queue (spec 10.6). Nothing persists the cache
 * (AC-091).
 */
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { ERROR_TOAST, OFFLINE_WRITE_TOAST, showToast } from '../state/toasts.js'
import { ApiError, OfflineError } from './http.js'

/**
 * Which toast a failed write earns. Exported for `lib/page-identity.ts`, whose write bypasses the mutation
 * cache. A 409 shows the server's copy verbatim.
 */
export function writeFailureMessage(error: unknown): string {
  if (error instanceof OfflineError) return OFFLINE_WRITE_TOAST
  if (error instanceof ApiError && error.status === 409) return error.message
  /* A 403 sentence is written for a person, so show it rather than "nothing was saved". */
  if (error instanceof ApiError && error.status === 403) return error.message
  /*
   * A 413 `quota_exceeded` always shows the server's sentence: it has one cause and one wording. A 422 needs
   * opt-in because its message names a field.
   */
  if (
    error instanceof ApiError &&
    error.status === 413 &&
    error.code === 'quota_exceeded'
  ) {
    return error.message
  }
  return ERROR_TOAST
}

/**
 * Limits a write's refresh to the query keys this predicate matches. Used for chat, where one post refetched
 * ~19 reads.
 */
export const INVALIDATES_META = 'invalidates'
export type InvalidatesMeta = (variables: unknown) => (queryKey: readonly unknown[]) => boolean

/** A mutation carrying this metadata asks for a validation response whose
 * message is already written for the person to correct their input. */
export const VALIDATION_ERROR_TOAST_META = 'validationErrorToast'

/** Marks a mutation that draws its own 422 inline, so no toast repeats it. */
export const INLINE_VALIDATION_META = 'inlineValidation'

export function mutationFailureMessage(
  error: unknown,
  meta: Readonly<Record<string, unknown>> | undefined,
): string {
  if (
    meta?.[VALIDATION_ERROR_TOAST_META] === true &&
    error instanceof ApiError &&
    error.status === 422
  ) {
    return error.message
  }
  return writeFailureMessage(error)
}

function isOffline(error: unknown): boolean {
  return error instanceof OfflineError
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        // Offline read failures are reported by the banner, not a toast.
        if (isOffline(error)) return
        // A 404 read is an answer: the page shows its not-found state, so no toast.
        if (error instanceof ApiError && error.status === 404) return
        showToast(ERROR_TOAST)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (
          mutation.meta?.[INLINE_VALIDATION_META] === true &&
          error instanceof ApiError &&
          error.status === 422
        ) {
          return
        }
        showToast(mutationFailureMessage(error, mutation.meta))
      },
      onSuccess: (_data, variables, _onMutateResult, mutation) => {
        const narrow = mutation.meta?.[INVALIDATES_META]
        if (typeof narrow === 'function') {
          const changed = (narrow as InvalidatesMeta)(variables)
          void queryClientRef?.invalidateQueries({ predicate: (query) => changed(query.queryKey) })
          return
        }
        // Dana Link chip labels keep their own staleTime; invalidating them refetched every chip on each
        // autosave.
        void queryClientRef?.invalidateQueries({
          predicate: (query) =>
            !(query.queryKey[0] === 'references' && query.queryKey[1] !== 'search'),
        })
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: 'always',
        refetchOnReconnect: 'always',
        networkMode: 'always',
        retry: 0,
      },
      mutations: {
        networkMode: 'always',
        retry: 0,
      },
    },
  })
}

/* The mutation cache must reach the client it is passed into, so main.tsx hands the one instance back here. */
let queryClientRef: QueryClient | undefined

export function setQueryClient(client: QueryClient): void {
  queryClientRef = client
}

/** For writes outside a component (`lib/page-identity.ts`). Undefined only before main.tsx builds the client. */
export function queryClient(): QueryClient | undefined {
  return queryClientRef
}
