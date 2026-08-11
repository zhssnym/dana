/*
The client's entry point.

Three things happen here and nowhere else: the query client of 8.3 is
constructed, the router of 9.1 is mounted, and the root element of
`index.html` is claimed. Everything else is downstream of one of the three.

`StrictMode` stays. It double-invokes effects in development, which is exactly
how a service worker registration or a keyboard listener that does not clean
up after itself announces itself, and both live in this shell.
*/
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'

import { getPlain } from './api/http.js'
import { queryKeys } from './api/keys.js'
import { createQueryClient, setQueryClient } from './api/queryClient.js'
import { Router } from './Router.js'
import { getFoldersResponse } from '../shared/folders.js'
import { getMeSettingsResponse, meResponse } from '../shared/me.js'

const queryClient = createQueryClient()
// The mutation cache invalidates through this handle; see queryClient.ts for
// why the client has to be handed back to the cache it was constructed with.
setQueryClient(queryClient)

/*
The chrome's three reads, started here rather than by the components that
consume them.

They are the same three on every route (AppLayout says why), so nothing about
them waits on routing, on a render, or on which page the person opened. This
module is a deferred script, so it runs before the document's load event,
which buys the sidebar its data roughly a render earlier than a component
effect would; on a sidebar whose folder list is data rather than structure,
that difference is the difference between a first paint with the folder list
and one without.

Failures are swallowed here and nowhere else: each of the three has an
observer that will report it, through the query cache's own error path and
9.1's toast. A rejection escaping this prefetch would be an unhandled one,
which is not how the error state is meant to arrive.
*/
void queryClient.prefetchQuery({
  queryKey: queryKeys.me(),
  queryFn: () => getPlain(meResponse, '/me'),
})
void queryClient.prefetchQuery({
  queryKey: queryKeys.settings(),
  queryFn: () => getPlain(getMeSettingsResponse, '/me/settings'),
})
void queryClient.prefetchQuery({
  queryKey: queryKeys.folders(),
  queryFn: () => getPlain(getFoldersResponse, '/folders'),
})

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('index.html no longer carries the root element')
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  </StrictMode>,
)
