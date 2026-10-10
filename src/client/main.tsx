/*
 * The client entry point: builds the query client, mounts the router and claims the root element. `StrictMode`
 * stays: its double effects expose listeners that do not clean up.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'

import './styles/tokens.css'
import './styles/collaboration-surfaces.css'
import './observability/error-tracker.js'

import { getPlain } from './api/http.js'
import { queryKeys } from './api/keys.js'
import { createQueryClient, setQueryClient } from './api/queryClient.js'
import { TooltipProvider } from './components/ui/tooltip.js'
import { Router } from './Router.js'
import { installSearchShortcut } from './shell/overlays.js'
import { installNativeContextMenuGuard } from './lib/native-context-menu.js'
import { rememberSignupSource } from './lib/signup-source.js'
import { getFoldersResponse } from '../shared/folders.js'
import { getInvitesPendingResponse } from '../shared/invites.js'
import { meResponse } from '../shared/me.js'

rememberSignupSource()

const queryClient = createQueryClient()
// The mutation cache invalidates through this handle (see queryClient.ts).
setQueryClient(queryClient)

/*
 * Start the chrome's reads before the first render, so the sidebar gets its data sooner. Failures are
 * swallowed: each query's observer reports them.
 */
// Only under /app: on / (where sign-out lands), /privacy and /terms they are
// 401s nobody reads, and each one is a red line in a visitor's console.
const inApp = window.location.pathname.startsWith('/app')
if (inApp) {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.me(),
    queryFn: () => getPlain(meResponse, '/me'),
  })
  void queryClient.prefetchQuery({
    queryKey: queryKeys.folders(),
    queryFn: () => getPlain(getFoldersResponse, '/folders'),
  })
}
/* The invite read starts early too: the shell shows the invite gate in place of the app while it is non-empty. */
if (inApp) {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.pendingInvites(),
    queryFn: () => getPlain(getInvitesPendingResponse, '/invites/pending'),
  })
}

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('index.html no longer carries the root element')
}

/* Installed before the first render so a cold-load keypress is not lost. */
installSearchShortcut(document)
installNativeContextMenuGuard(document)

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
