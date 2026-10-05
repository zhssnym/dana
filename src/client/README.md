# The client's conventions

The rules every page and component in `src/client` is built inside. A rule
marked **Settled** is one the specification decides or an acceptance criterion
measures; changing it is a specification change. A rule marked **First pass**
is the client's best answer to a question nothing decides; extend or replace
it, and say so where you do.

The comments in the code carry the reasoning at the call site. Where this file
and a file's own header disagree, check the code: comments here state intent.

## Where things live

| Path | What it is |
| - | - |
| `api/` | The API client, the query layer, the query keys, the 8.3 policy |
| `tasks/` | Task-owned application logic shared by every task surface: the concept model, wire mapping, actions, writer and expanded-detail read |
| `state/` | Connectivity, the toast bus, the toast region |
| `components/` | The components, presentational; `components/ui/` is the component library of 11.4, and `components/README.md` is its own index |
| `components/page/` | Shared page UI: identity controls, blocks, loading, empty and error states, and named regions |
| `shell/` | The global chrome of 9.1 and the overlay seam |
| `pages/` | One file per surface of 9.2 and 9.4 to 9.10: the data reads and the wiring |
| `screens/` | **Legacy presentational screens being retired.** Existing files stay presentational while they move into `components/`; do not add new files here. Their page beside them owns data reads and wiring |
| `views/` | **What every place-page shares**: the filter model and its store, the view strip and its preference, grouping, the Scheduled ladder, and the spine table 9.3's entry defaults are read from. `TaskBoard.tsx` is the board's *meaning*; the geometry is `components/task-board.tsx` |
| `views/group-mark.tsx` | The mark a group heading draws: `grouping.ts` says which kind the axis produced and this draws it, through the same resolvers every other surface uses |
| `pwa/` | Registration and the 10.6 update affordance |
| `public/` | The manifest icons, copied to the build root |
| `parts/` | **The page layer**: the row callbacks, and the presenters that map our API shapes onto the components' display props |
| `parts/person-tint.ts`, `parts/identity-colors.ts` | The two palettes that must name swatches. The ramp rule in `components/ui/foundation.test.ts` reads the whole client and names both files on its list; the literal-colour rule stops at `components/` and `lib/`. Whether the hexes in `identity-colors.ts` move to `tokens.css` is issue #41 |
| `styles/tokens.css` | The single token file of 11.4 |

`tasks/` exists (issue #86) because these modules follow a task across a row,
card, dialog, panel, tab and task page; putting them beside any one surface
would give that surface ownership it does not have, while leaving them in
`lib/` would call feature behaviour a generic helper. `row-detail.ts` belongs in
the same directory because its only caller is the task row and its only answer
is the `ConceptTask` for an opened task. Folder lookup, navigation, time-format
preference, people and conversation modules remain outside this boundary.

`parts/` is not a component library and must not become one. It holds the page
layer: the code every page calls and no component does — the row callbacks of
`useRowActions.ts`, the presenters of `presenters.ts` and its
`format-dates.ts`, and the two palettes above. `presenters.ts`'s own header is
what it is for.

## How a page declares its data

**Settled.** A page calls one hook from `api/queries.ts` per read it needs, and
components take rows as props and callbacks as props.

```tsx
export function ScheduledPage() {
  const view = useFocusView({ when: 'upcoming', group: 'none' })
  const rows = (view.data?.groups ?? []).flatMap((group) => group.rows)
  const me = useMe()
  const actions = useRowActions()
  return (
    <PageBody query={view} isEmpty={rows.length === 0} emptyCopy={PLANNED_EMPTY}>
      <TaskList tasks={rows} viewerId={me.data?.user.id ?? null} {...actions} />
    </PageBody>
  )
}
```

The rule exists because a component that fetches is a component that cannot be
rendered twice on one page. Stated precisely: **a component that observes a query may be
mounted once and only by a page that cannot render it twice; everything else
takes rows as props.** `PlannedCalendar` calls the Q3C hook itself for that
reason (the range it asks for is the range its own grid laid out), and a
mutation observes no query, so a component may call one.

**Settled.** Adding a read means adding a hook to `api/queries.ts`, not calling
`fetch` or `useQuery` in a page. Two obligations of section 7 are structural
there and nowhere else: `getView` appends `tz` to every view read (7.0), and
`mutateApi` sets `X-CSRF-Token` on every write (11.6).

**Settled.** `getView` for the view endpoints of 7.10 and anything else that
evaluates a date; `getPlain` for `/me`, `/settings`, `/folders`,
`/connections`, `/invites/pending`. 7.0 scopes its `tz` sentence to view
endpoints, so a plain read carries none: sending one anyway puts a parameter on
the wire the contract does not give that endpoint.

**Settled.** Responses are parsed with the schemas of `src/shared`. A response
that does not satisfy one is a finding, and it surfaces through the page's
error state rather than being rendered around.

## Loading, empty, error: the four states

**Settled.** They are `components/page/PageStates.tsx` and a page never writes
one. Section 9 gives every page five states and the fifth is the global banner;
the other four are `PageBody`, which takes the query, whether the successful
result is empty, and the normative empty copy of section 6.

- **Loading** is 9's skeleton rows: a `role="status"` message plus
  `aria-hidden` placeholder rows. The placeholders are hidden from the
  accessibility tree deliberately, so a skeleton is a skeleton and not a list
  of empty task rows a test can find.
- **Empty** is the copy of section 6, transcribed once in
  `pages/empty-states.ts`. Copy in these sections is normative: restyle, never
  reword.
- **Error** is 9.4's "global toast plus inline retry". The toast is raised by
  the query cache for every failed read in the client; what `PageBody` renders
  is the retry, beside the thing that failed, with 9.1's inline state copy.
- **A 404 is not an error, it is an answer.** 10.2 makes every inaccessible
  resource read as nonexistent, and the client's half is showing a missing
  thing rather than a broken application. `PageBody` renders that case
  separately.
- **A truncated list says so.** `PageBody` takes an optional `truncated` flag,
  carried by the capped bodies of 7.10, and draws 9.1's truncation notice. The
  number is deliberately not interpolated: the flag says rows were dropped and
  never how many.

**Settled.** Offline reads get no page-level copy. 9.1 makes the banner the
persistent, global statement of that condition; a second offline message per
page would be two answers to one question.

## The offline banner and the toasts

**Settled.** The banner is `shell/OfflineBanner.tsx`, rendered once by the
shell, as a persistent notice in the one notice column (`state/ToastRegion.tsx`). It is global because 10.6's fallback opens every `/app`
path from the cached shell, and a banner a page rendered would be missing on
exactly the pages reached while the connection is down.

**Settled, and the least obvious thing in this client.** Whether Dana is
offline is `state/connectivity.ts`, not `navigator.onLine`. A document served
from the service worker's cache with no connection reports `navigator.onLine`
as `true`, because the flag is set from the network stack at document creation
and a cache hit never asks it. So the store is fed by, in order of authority: a
request that did not complete, a response of any status, and the window's own
`online`/`offline` events. `api/http.ts` reports every request either way. Do
not reintroduce a bare `navigator.onLine` read; it is wrong on the one load
10.6 exists for.

**Settled.** Toasts are `state/toasts.ts`, a subscribable store rather than a
context, because the only thing that raises them is the query client, which is
constructed above React. Which toast a failure earns is decided once, in
`api/queryClient.ts`:

| Failure | Toast |
| - | - |
| Offline write | "Couldn't save. You're offline." (9.1) |
| 409 | the server's own message, verbatim (9.1 requires 5.1's copy) |
| Any other failed write | "Something went wrong. Nothing was saved. Try again." (9.1) |
| Failed read, offline | none; the banner is the surface |
| Any other failed read | the general error toast |

**Settled.** A page never catches its own request error to show its own
message. The one case that looks like an exception is not: the People screen's
refusal for an already-connected address is 7.5's 409, and the server's message
is 9.8's copy character for character, so the 409 row above renders it.

**First pass.** The toast's Dismiss control; 9.1 gives a toast no action and no
timer.

## Mutations and invalidation

**Settled.** Every write goes through a hook in `api/mutations.ts`, and a hook
there invalidates nothing and reports nothing. `api/queryClient.ts` calls
`invalidateQueries()` with no filter on every mutation success, which marks
everything stale and refetches the queries with live observers: exactly "the
active view" of 8.3 and nothing else.

**Settled, and do not replace it with a key map.** A per-mutation map of which
keys to invalidate is a list of the things somebody remembered, and what it
produces is a shared folder that looks wrong after another member's edit. Finer
invalidation is a specification question, not a local optimisation.

**Settled.** The rest of 8.3: `staleTime: Infinity` (nothing refetches because
time passed, because 8.3 says nothing does) and `refetchOnWindowFocus:
'always'`. The `'always'` is required rather than stylistic: plain `true`
refetches only a stale query, and under `staleTime: Infinity` nothing ever is,
so the boolean would silently turn the policy off.

**Settled.** `networkMode: 'always'` on both queries and mutations. TanStack
Query's default pauses a mutation while the browser is offline and runs it when
the connection returns, which is an offline write queue by another name and
10.6 forbids one. `retry: 0` for the same reason on writes and so an offline
read fails rather than sitting in a backoff.

**Settled.** Nothing persists the query cache, and nothing may. A persisted
cache answers an offline read from disk, which is the failure AC-091's third
case exists to catch: the page comes up offline showing yesterday's tasks with
the banner beside them, satisfying every word of the criterion while telling
the person something false.

**Settled.** `tz` on a mutation is the call site's, not `mutateApi`'s: `complete`
and `abandon` (7.6), the My Day pull (7.8), and the other writes whose section
7 entry names it. Sending it on a write that evaluates no date would put a
parameter on the wire the contract does not give it.

## What a page must do to behave like every other page

1. Its reads are hooks from `api/queries.ts`. No `fetch`, no `useQuery`.
2. Wrap its rows in `PageBody` with the section 6 empty copy for that page.
3. Render every section 9 names as a named region (below), never a bare `div`.
4. Raise no toast, catch no request error, and write no loading or error markup.
5. Add no offline treatment. The banner is the shell's.
6. Take row callbacks from `useRowActions()` rather than calling mutations
   directly, so every row action invalidates and reports the same way.
7. Put nothing global on the page. The sidebar, tab strip, window bar, banner,
   floating add button, toasts and update affordance are all the shell's.
8. **Set no page width, no page padding and no page scroll.** Those are the
   layout's, below, and every page choosing its own is a chance to disagree.

## The layout, and what it means for a page

```
div.h-svh                        the viewport-height box
└── SidebarProvider              carries the sidebar width and the rail's
    ├── [role=navigation]        the sidebar: header, pages, Library, footer
    └── SidebarInset             the `main` landmark
        ├── the tab strip and the window bar
        ├── the offline banner
        ├── div[data-shell-scroll]   the ONE region that scrolls
        │   └── the measure: capped at --shell-content-max, centred, padded
        │       └── the page
        └── the floating add button
```

**There is no top bar.** The app name and the global search control are in the
sidebar header, and the avatar menu is in its footer. AC-174 states this as the
absence of a banner landmark on every page, so **a page's own `header` must
stay inside `main`**, which it does, `SidebarInset` being the `main` landmark
and the outlet sitting inside it.

**The page is already inside its measure**, so a page renders its own content
and never a width, a horizontal padding or a max-width of its own; a screen
that carries its own centring-and-padding wrapper is padded twice.

**Only `data-shell-scroll` scrolls, and the document does not.** That keeps the
chrome, the banners and the floating action still while the page moves. A page
that made itself a scroll container would nest a second scrollbar inside the
first. Every floating layer is a base-ui portal, which escapes the scroll
container by construction.

## The two view preferences of 9.1

**Settled by 9.1** (AC-182). The sidebar's width and whether it is collapsed to
a rail are the viewer's and persist. Both are `localStorage`, one key each,
read synchronously at the first render so the sidebar paints at the width it
was left at rather than jumping to it. `shell/preferences.ts` carries the
argument.

**Not a cookie.** The shadcn primitive mirrors the collapsed state into a
`sidebar_state` cookie because that distribution is built for a server-rendered
host that reads it before painting. Nothing on our server reads it, it would
ride every request to the section 7 API, and 11.6 leaves exactly one readable
cookie in this browser. `app-shell.tsx` clears it after every toggle.

**The default width stays in `tokens.css`.** The custom property is set to
`var(--shell-sidebar-width)` until this viewer has chosen a width of their own,
and only their own choice is ever written as a number: a chosen width is data,
the way a folder's colour is, and 11.4's rule governs the values the design
fixes.

**The sidebar's width transition is off.** The distribution animates the same
property both preferences set, so a drag would lag the pointer by a fifth of a
second and the rail would arrive long after the click.

## Named regions

**Settled**, by 9.1's sections rule. Every section a page's structure names is
a named region, and a control inside one is addressed as that control within
that region. Use `components/page/PageSection.tsx`:

- `PageSection` renders `<section aria-label={name}>` with an optional visible
  heading. The name is 9.1's table where the section fixes one, and the datum
  the section is generated from where it does not: a folder name, a day. **It
  collapses whenever it has a heading**, native and user-made sections being
  the same thing with different capabilities; the control carries the
  section's name and its `aria-expanded` is the state, exactly as
  `CollapsibleSection`'s does (AC-245). A section with no heading has nothing
  to draw a control as and stays a region alone. It also takes
  `headingMedia`, a mark inline before the name, and `count`, the quiet figure
  after it and `aria-hidden` so the control's name stays the section's;
  `views/group-mark.tsx` builds the mark from the axis a group came from, so a
  folder heading draws that folder's glyph and a person heading that person's
  disc.
- `CollapsibleSection` is a region plus a control carrying the same name, whose
  `aria-expanded` is what open and collapsed mean. Its children are absent
  while collapsed, not hidden: Q7 asserts the completed row is not on the page
  until the section is opened, and a hidden element is still on the page to
  everything but a screen reader.

A region with no visible heading still has a name: a region's name is announced
and addressed, not rendered. A sidebar label group is a named region too, which
is what makes its own "More actions" addressable.

## Accessible names

**Settled**, from 9.1's names table, and exact. Several names in that table
begin with "add" and several controls are "More actions", so a loose match puts
back precisely the collision the naming removed. A name in the table is a fixed
string and is never interpolated with the object the control acts on; the
region it sits in is what tells two instances apart.

| Control | Name | Role |
| - | - | - |
| Global search control | `Search` | button |
| The avatar menu | `Account` | button |
| The app name | its own text, `Dana` | link to `/app` |
| The sidebar's rail control | `Collapse sidebar`, `Expand sidebar` | button |
| The sidebar's resize handle | `Resize sidebar` | separator |
| Update affordance | `Update available, reload` | button |
| A sidebar page | its 9.1 name | link |
| A label group | the label alone | button, `aria-expanded` |
| A row's star, starred | `Important` | button, `aria-pressed` |
| A row's star, not starred | `Mark as important` | button, `aria-pressed` |
| The un-pull control | `Remove from Today` | button |

**Settled.** The star is a `button` with `aria-pressed` and deliberately not a
`switch`, and it carries its name as content rather than as `aria-label`: an
`aria-label` is a *label* to the suite's `formField` helper, which addresses
9.3's fields by accessible name, so a page holding a starred row and an open
task surface would have two elements answering to "Important".

## The overlay seam

**Settled.** `shell/overlays.ts` is how the chrome asks for the surfaces it does
not build: the search control and the Ctrl+K and `/` shortcuts call
`openSearch()`. There is no task form: `N`
and a calendar day each lead to an inline "New task" line. `components/task-open.ts`'s
`openTask(taskId, { upcoming })` carries an identity and no defaults, because a
row, a calendar cell and a search result each open a task that exists; the
`upcoming` flag is 9.5's ghost path and rides that path alone.

**Settled.** The entry-point defaults are read from one table,
`views/place-pages.ts`, by the row that captures.

**Settled.** Both surfaces are mounted once by the shell, because each opens
over whatever page is beneath it. **The search overlay is first in document
order and the task surface is last**: the search field has to be the
document's first textbox, and a control inside the task surface has to be the
document's last of its name.

## Dates

**Settled.** `api/tz.ts` is the only place this client evaluates a date. Every
grouping, every overdue badge and every today boundary is the server's answer to
the `tz` this same module reports. Do not filter, compare or group by a
client-computed date; that produces a page that contradicts the server for part
of every day. The exceptions are derived rather than invented and each argues
its case at the call site: 9.4's un-pull control reading Q1's automatic
disjunct in `parts/presenters.ts`, and the G-SERIES branch below.

## PWA

**Settled.** `pwa/registerServiceWorker.ts` registers `/sw.js`, watches for a
worker that installs while one already controls the page, and never calls
`skipWaiting` on its own. The reload is bound to the person's click and merely
waits for the controller to change, so an ordinary first visit does not reload
itself.

**Recorded deviation.** 11.4 names the flow as "vite-plugin-pwa with the
prompt-for-update registration flow (virtual:pwa-register with onNeedRefresh)".
The plugin builds the worker and the manifest; this client implements the flow
the virtual module implements, against the same generated worker, without
importing `virtual:pwa-register`. The file's own header gives the reason.

## `parts/presenters.ts`

The mapping between 7.0's shapes and what the components paint, and the only
place it happens. It is pure and takes today as an argument, and its unit tests
are the only check on it: the criteria assert that a due badge exists and never
what it says. Its header carries the rules it owns (the due label, overdue, the
initials, the folder mark) and where each comes from.

**The folder colour and mark are resolved by id and never by name**, from
`useFolders()`. One relation is keyed by a display name, `FolderGroupDialog`'s
`onSubmit(label, folderNames)`, and 4.3 does not make names unique, so
`folderIdsForNames` resolves one name to *every* id that carries it rather than
picking one of two identically named rows.

## The place pages

The surfaces of 9.4 and 9.5 and the machinery they share.

| Page | File | Reads | Views | Captures |
| - | - | - | - | - |
| Today (9.4) | `pages/TodayPage.tsx` | Q1 and Q1R | list, board | the floating button |
| Scheduled | `pages/ScheduledPage.tsx` | Q3, Q3C | list, board, calendar | its list foot, dated today |
| Assignments | `pages/AssignmentsPage.tsx` | Q5, composed | list, board | the floating button |

The folder page (9.6) is a place-page too; `views/place-pages.ts` says what it
supplies of its own.

**One table decides the entry defaults, and it is `views/place-pages.ts`.** If
the floating button, the quick-add and the board column each decided the
defaults for themselves, a task made on Today could fail to appear on Today.
They read one row, and a new capture point reads it too.

**The filter is `views/filter.ts` and it never asks the server for anything.**
Section 6 offers no parameter for any of its axes, so every function there
takes rows and returns rows; AC-167 measures that by counting requests. Its
state is `sessionStorage`, one key per page (`views/filter-store.ts`), which is
what lets AC-222 survive a full document load.

**The window bar's store has named slots.** 9.1 puts the chips at the bar's left
end and the tab's controls at its right, so a place-page renders into both;
`WindowBarActions` and `WindowBarLead` take which slot, so the registration,
the subscription and the absent-before-mount case are written once.

**Q6 readers are one hook body for one order.** `useDoneView` and
`useFolderCompletedTasks` are both `useInfiniteQuery` over the same shape,
because section 6 defines Q7's third section as "Q6 predicate, order, and
pagination, folder_id = F" and 7.10's cursor kind names the order it pages
rather than the endpoint that issued it. The cursor is opaque and is handed back
byte for byte; a null `next_cursor` is the only end-of-list signal.
`mergeCompletedDays` puts a day split across a page boundary back into one
group, and merges without reordering. `MorePages` in
`components/page/PageStates.tsx` is the end of an infinite list: a button, so
the next page is reachable by keyboard, with an intersection observer on it,
so an ordinary reader never sees it.

## Readings the client makes, and what would let it stop

Each is a place where the specification asks the client to render something no
response reports, and each is argued at its call site.

- **The G-SERIES branch on a completed row.** 9.5 confirms before an un-complete
  that takes the successor branch, and 5.1 defines that branch by a pending
  sibling. 8.5 moves the rule onto the successor and 5.1's exhausted-series
  clause leaves it on the last row, so a completed row has a successor exactly
  when it carries a `series_id` and no rule. `components/task-editing.tsx` reads it that way; asking whether the task
  "repeats" gets "no" from the one row where the confirm is owed. A field
  saying whether the branch applies would let the client stop.
- **9.4's un-pull control is hidden when the row also qualifies
  automatically**, and that is derived in `parts/presenters.ts` from Q1's
  automatic disjunct, because nothing on the wire reports why a row is on a
  page. The card carrying the reason would let the client stop.
- **The CSRF cookie's name.** 11.6 fixes that the token cookie is readable and
  fixes no name, so `api/csrf.ts` prefers `dana_csrf` and falls back to the sole
  readable cookie. The server holds that constant in `src/server/auth/`, which
  `src/client` cannot import; moving the two cookie names to `src/shared` would
  give both sides one definition.
