/*
The whole of 8.3's client half, in one object.

"Clients refetch the active view on window focus and after each own mutation.
Staleness between those points is accepted." That is two rules and a licence,
and every line below is one of the three:

- `staleTime: Infinity` is the licence. Nothing refetches because time passed,
  because 8.3 says nothing does.
- `refetchOnWindowFocus: 'always'` is the first rule. It has to be `'always'`
  rather than `true`: `true` refetches a query only when it is stale, and
  under the line above nothing ever is, so the plain boolean would silently
  turn the policy off.
- The mutation cache's `onSuccess` is the second rule. `invalidateQueries()`
  with no filter marks everything stale and refetches the queries that have
  live observers, which is exactly "the active view" and nothing else. No
  per-mutation key map exists, deliberately: a map is a list of the things
  somebody remembered, and the failure it produces is a shared folder that
  looks wrong after another member's edit, which is this role's named hazard.
  The one exception is chat (r7): a post, edit, delete or like names the
  thread and lists it changed (`INVALIDATES_META`), because a conversation
  writes often and polls anyway.

`networkMode: 'always'` on both is the 10.6 contract rather than a
performance choice. TanStack Query's default, `'online'`, pauses a mutation
while the browser is offline and runs it when the connection returns, which is
an offline write queue by another name, and 10.6 forbids one ("no IndexedDB
mirror, no background sync"). AC-091 asserts the absence from the server side,
which is the only place a queue and a refusal look different. `'always'` makes
the request run, fail, and stay failed.

`retry: 0` for the same reason on the write side, and for honesty on the read
side: a retried read offline is a page that stays in its loading state for as
long as the backoff lasts, when 9.1 already has a banner saying why.

Nothing here persists the cache. A persisted cache would answer an offline
read from disk, which is precisely the failure AC-091's third case is written
to catch: the page comes up offline showing yesterday's tasks with the banner
beside them, satisfying every word of the criterion while telling the person
something false.
*/
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { ERROR_TOAST, OFFLINE_WRITE_TOAST, showToast } from '../state/toasts.js'
import { ApiError, OfflineError } from './http.js'

/**
 * Which of 9.1's two toasts a failed write earns, decided once.
 *
 * Exported for `lib/page-identity.ts`, whose write is a plain
 * function rather than a `useMutation` and therefore never reaches the
 * mutation cache's own `onError`. It calls this rather than deciding again,
 * so a failed cover write says what every other failed write says.
 *
 * 9.1 gives offline writes their own copy, so the general toast is not what an
 * offline write shows; AC-091 asserts that separation directly. A 409 shows
 * the state machine copy of 5.1 verbatim, which the server carries and this
 * function passes through rather than restates.
 */
export function writeFailureMessage(error: unknown): string {
  if (error instanceof OfflineError) return OFFLINE_WRITE_TOAST
  if (error instanceof ApiError && error.status === 409) return error.message
  /* A 403's sentence is written for a person too ("Only the folder owner can
     delete permanently."), and 7.13's permanent delete is the one act a
     person can see the row for and still be refused; the generic sentence
     would say nothing was saved about an act the server declined by rule. */
  if (error instanceof ApiError && error.status === 403) return error.message
  /*
  A 413 `quota_exceeded` is 10.3's storage ceiling, and it is the third
  refusal whose sentence is already written for a person: "You've used your
  1 GB of storage. Delete some files to add more." Section 9 fixes those words
  and every route that can answer 413 sends exactly them — `routes/files.ts`,
  `routes/bundle.ts`, `routes/cover-photos.ts` and `workshop.ts`'s `overQuota`,
  which is every 413 this API produces. Added 2026-09-04 for issue #117: a
  shelf duplicate that will not fit is refused this way, and the generic
  sentence would tell somebody at their gigabyte to try again, which is the one
  thing that cannot work.

  **Unconditional rather than opt-in, unlike the 422 below, and the difference
  is the shape of the message rather than a preference.** A 422 carries a field
  name and a rule — "name: must be 1 to 40 characters" — which is prose for
  whoever is looking at that field and noise beside any other control, so a
  mutation asks for it by name. A 413 has one producer, one cause and one
  sentence, and there is no surface on which it reads as anything but what it
  is.
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
 * A mutation carrying this metadata names what its write changed, as a
 * predicate over query keys built from its variables, and only those queries
 * are refreshed (r7). For chat, where one post is one small write the thread
 * already shows: the unfiltered rule below refetched about nineteen reads per
 * post. Everything else keeps the unfiltered rule.
 */
export const INVALIDATES_META = 'invalidates'
export type InvalidatesMeta = (variables: unknown) => (queryKey: readonly unknown[]) => boolean

/** A mutation carrying this metadata asks for a validation response whose
 * message is already written for the person to correct their input. */
export const VALIDATION_ERROR_TOAST_META = 'validationErrorToast'

/** A mutation carrying this metadata draws its own 422 inline, where the
 * person is looking, so the toast would say the same thing twice (#225). */
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
        // A failed read offline is already reported by the persistent banner
        // of 9.1, which is the surface that section gives the condition. The
        // error toast would say "Nothing was saved" about a read.
        if (isOffline(error)) return
        // A read answered 404 is an answer, not a failure: the page draws
        // 9.1's inline not-found state for it, and a toast saying nothing was
        // saved beside a page saying the thing does not exist is the false
        // sentence 9.1's own read-line rule forbids. Every other
        // failed read still toasts, as 9.1's first sentence asks.
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
        // A Dana Link chip's label (queryKeys.reference) is left to its own
        // staleTime: invalidating it on every save refetched one
        // GET /references per chip on each canvas autosave.
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

/*
The client refers to itself from inside its own mutation cache, which is a
knot the constructor cannot tie: the cache is an argument to the client, so
the client does not exist yet when the cache is built. Holding the instance
here is the smallest way through, and it is safe because this application
constructs exactly one client, in main.tsx, for the life of the document.
*/
let queryClientRef: QueryClient | undefined

export function setQueryClient(client: QueryClient): void {
  queryClientRef = client
}

/**
 * The same instance, for code that writes from outside a component.
 *
 * For `lib/page-identity.ts`, which is the adapter seam a lifted
 * `page-cover.tsx` crosses. The prototype's store is a plain function called
 * from an `onClick`, so making the client's counterpart a hook would mean
 * editing a lifted body, which is the one thing the lift discipline forbids.
 * It answers `undefined` only before `main.tsx` constructs the client, which
 * is a state no rendered surface can be in.
 */
export function queryClient(): QueryClient | undefined {
  return queryClientRef
}
