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
 * Exported since S25 for `lib/page-identity.ts`, whose write is a plain
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
  return ERROR_TOAST
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
        showToast(ERROR_TOAST)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        showToast(writeFailureMessage(error))
      },
      onSuccess: () => {
        void queryClientRef?.invalidateQueries()
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
 * Added at S25 for `lib/page-identity.ts`, which is the adapter seam a lifted
 * `page-cover.tsx` crosses. The prototype's store is a plain function called
 * from an `onClick`, so making the client's counterpart a hook would mean
 * editing a lifted body, which is the one thing the lift discipline forbids.
 * It answers `undefined` only before `main.tsx` constructs the client, which
 * is a state no rendered surface can be in.
 */
export function queryClient(): QueryClient | undefined {
  return queryClientRef
}
