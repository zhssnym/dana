/*
9.1's route table as a router, in React Router's library mode and nothing else.

11.15 records that importing loader, action or framework-mode APIs is a
defect, and this file is where that would happen if it happened anywhere. So
the routing is `BrowserRouter`, `Routes` and `Route`: components, no data
APIs, nothing that could grow a loader by accident. Data belongs to the query
layer, and the query layer is `api/`.

**The v2 table landed at S9** (RFC 0005's replacement of 9.1). Three things
about it are worth reading before changing a line.

**Desk is the index of /app**, where My Day used to be, because 10.6 fixes the
installed app's start_url there. It renders the account's default folder,
which is what 9.1 means by "/app renders Desk, the account's default folder".
The folder's id is not in the path, so the page finds it from the folder list
rather than from the URL, and that is the one page in this table whose
identity is data rather than an address.

**The two retired paths redirect rather than 404**, which 9.1 states in terms
and gives its reason: bookmarks exist. `Navigate` with `replace` so the old
address does not sit in the history behind the new one, which would make the
back button bounce off it.

**Every path in the table now renders its own page (S10).** S9 left three of
them pointed at v1 pages as interim and left Assignments with no route at all,
which fell through to NotFound; the place pages of 9.4 and 9.5 replace all
four, and the three v1 pages are in git rather than beside their replacements.
The list, board and calendar of a page are `?mode=` and a client preference
rather than routes of their own, which `routes.ts` records and this table
therefore does not show.
*/
import { lazy, Suspense } from 'react'
import type { ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { AbandonedPage } from './pages/AbandonedPage.js'
import { AllPage } from './pages/AllPage.js'
import { AnytimePage } from './pages/AnytimePage.js'
import { AssignmentsPage } from './pages/AssignmentsPage.js'
import { DeskPage } from './pages/DeskPage.js'
import { DonePage } from './pages/DonePage.js'
import { FolderPage } from './pages/FolderPage.js'
import { ImportantPage } from './pages/ImportantPage.js'
import { LandingPage } from './pages/LandingPage.js'
import { LegalPage } from './pages/LegalPage.js'
import { NotFoundPage } from './pages/NotFoundPage.js'
import { PeoplePage } from './pages/PeoplePage.js'
import { ScheduledPage } from './pages/ScheduledPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import { ShelfPage } from './pages/ShelfPage.js'
import { TaskPage } from './pages/TaskPage.js'
import { TodayPage } from './pages/TodayPage.js'
import { TrashPage } from './pages/TrashPage.js'
import { paths, retiredPaths } from './routes.js'
import { AppShell } from './shell/app-shell.js'

/* Keep issue #145's research surface out of the production bundle as well as
   out of the production route table. Static-importing it behind a DEV check
   left the whole prototype in the main chunk even though no path reached it. */
const composerExplorationModule = '/src/client/pages/ComposerExplorationPage.tsx'
const composerExplorationModule2 = '/src/client/pages/ComposerExplorationPage2.tsx'
const ComposerExplorationPage = import.meta.env.MODE !== 'production'
  ? lazy(async () => {
      const module = (await import(
        /* @vite-ignore */
        composerExplorationModule
      )) as { readonly ComposerExplorationPage: ComponentType }
      return { default: module.ComposerExplorationPage }
    })
  : null
const ComposerStudyGate = import.meta.env.MODE !== 'production'
  ? lazy(async () => {
      const module = (await import(
        /* @vite-ignore */
        composerExplorationModule
      )) as { readonly ComposerStudyGate: ComponentType }
      return { default: module.ComposerStudyGate }
    })
  : null
const ComposerExplorationPage2 = import.meta.env.MODE !== 'production'
  ? lazy(async () => {
      const module = (await import(
        /* @vite-ignore */
        composerExplorationModule2
      )) as { readonly ComposerExplorationPage2: ComponentType }
      return { default: module.ComposerExplorationPage2 }
    })
  : null
const ComposerStudyGate2 = import.meta.env.MODE !== 'production'
  ? lazy(async () => {
      const module = (await import(
        /* @vite-ignore */
        composerExplorationModule2
      )) as { readonly ComposerStudyGate2: ComponentType }
      return { default: module.ComposerStudyGate2 }
    })
  : null

export function Router(): React.JSX.Element {
  const composerExploration = ComposerExplorationPage === null
    ? null
    : <Suspense fallback={null}><ComposerExplorationPage /></Suspense>
  const composerGate = ComposerStudyGate === null
    ? null
    : <Suspense fallback={null}><ComposerStudyGate /></Suspense>
  const composerExploration2 = ComposerExplorationPage2 === null
    ? null
    : <Suspense fallback={null}><ComposerExplorationPage2 /></Suspense>
  const composerGate2 = ComposerStudyGate2 === null
    ? null
    : <Suspense fallback={null}><ComposerStudyGate2 /></Suspense>

  return (
    <BrowserRouter>
      <Routes>
        <Route path={paths.landing} element={<LandingPage />} />
        {/*
        The two public pages of DES-032, added at S16.

        They sit here, beside the landing and outside the /app layout, and
        that placement is load-bearing rather than tidy. AC-239 sends any
        unauthenticated visit to an /app route to /, and these are pages read
        overwhelmingly with no session; Google's OAuth consent configuration
        fetches the privacy one with none at all. Under the shell they would
        redirect the audience they exist for, so a row in 9.1's route table
        would be a defect and not an improvement (change control items 29
        and 30).

        Until now neither path existed, so both fell through the catch-all
        below and answered with the not-found page: "That page does not
        exist. Everything Dana has is in the sidebar", shown to somebody
        looking for a privacy policy.
        */}
        <Route path={paths.privacy} element={<LegalPage page="privacy" />} />
        <Route path={paths.terms} element={<LegalPage page="terms" />} />
        {composerGate === null ? null : (
          /* The local entry only establishes the development session the
             existing shell requires, then replaces itself with the study's
             nested route. It is absent from production with the study. */
          <Route path="/labs/composer" element={composerGate} />
        )}
        {composerGate2 === null ? null : (
          <Route path="/labs/composer-2" element={composerGate2} />
        )}
        <Route path="/app" element={<AppShell />}>
          {/* Desk, the default folder and the installed app's start_url. */}
          <Route index element={<DeskPage />} />
          {/* Today: section 6's Q1, drawn by 9.4. */}
          <Route path="today" element={<TodayPage />} />
          {/* Scheduled: Q3 under 9.5's ladder; the calendar is Q3C. */}
          <Route path="scheduled" element={<ScheduledPage />} />
          {/* Assignments: not a query, a composition over Q5 (section 6). */}
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="important" element={<ImportantPage />} />
          <Route path="all" element={<AllPage />} />
          <Route path="done" element={<DonePage />} />
          {/* The two unpinned views of 9.5 that had no route before S10. */}
          <Route path="abandoned" element={<AbandonedPage />} />
          <Route path="anytime" element={<AnytimePage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="folders/:id" element={<FolderPage />} />
          {/* The S12 addresses: a shelf's page (9.10), and a task's own
              (7.17) — matched before the retired "/app/tasks" redirect
              below, which only claims the bare path. */}
          <Route path="shelves/:id" element={<ShelfPage />} />
          <Route path="tasks/:id" element={<TaskPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="people" element={<PeoplePage />} />
          {composerExploration === null ? null : (
            /*
            Issue #145's browser-only research surface. It deliberately has
            no entry in routes.ts: that file is the production route table
            from 9.1, while this path exists only in Vite development builds.
            The page uses local state and the real shell/components, so the
            interaction can be judged in Dana without creating a second app
            or widening any server contract.
            */
            <Route path="labs/composer" element={composerExploration} />
          )}
          {composerExploration2 === null ? null : (
            <Route path="labs/composer-2" element={composerExploration2} />
          )}
          {retiredPaths.map(({ from, to }) => (
            <Route
              key={from}
              // The table's paths are absolute and this Route is nested, so
              // the child path is what follows "/app/"; "/app/tasks" is
              // "tasks". Written from the table rather than spelled twice.
              path={from.slice('/app/'.length)}
              element={<Navigate to={to} replace />}
            />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
