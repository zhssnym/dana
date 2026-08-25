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
import { NotFoundPage } from './pages/NotFoundPage.js'
import { PeoplePage } from './pages/PeoplePage.js'
import { ScheduledPage } from './pages/ScheduledPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import { TodayPage } from './pages/TodayPage.js'
import { TrashPage } from './pages/TrashPage.js'
import { paths, retiredPaths } from './routes.js'
import { AppShell } from './shell/app-shell.js'

export function Router(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={paths.landing} element={<LandingPage />} />
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
          <Route path="settings" element={<SettingsPage />} />
          <Route path="people" element={<PeoplePage />} />
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
