# The client's conventions

Written by the Frontend Architect at P8, as the record of what landed rather
than of what was intended. Four sessions build inside these conventions and
none of them will see the session that set them, so this file is the contract:
if a rule is not here, it is not a rule.

Everything below is marked **Settled** or **First pass**. A settled rule is one
the specification decides or an acceptance criterion measures, and changing it
is a Steward escalation. A first pass is this session's best answer to a
question nothing has ruled on; extend or replace it, and say so where you do.
A convention stated as law that was really a guess is worse than one marked
provisional.

## Where things live

| Path | What it is | Whose |
| - | - | - |
| `api/` | The API client, the query layer, the query keys, the 8.3 policy | Frontend Architect |
| `state/` | Connectivity, the toast bus, the toast region | Frontend Architect |
| `states/` | The shared loading, empty, error states and the named regions | Frontend Architect |
| `shell/` | The global chrome of 9.1 and the overlay seam | Frontend Architect |
| `pages/` | One file per surface of 9.2 and 9.4 to 9.8 | Frontend Architect |
| `pwa/` | Registration and the 10.6 update affordance | Frontend Architect |
| `public/` | The manifest icons, copied to the build root | Frontend Architect, art is design's |
| `parts/` | **Provisional rows and inputs, to be replaced** | see below |
| `components/ui/` | The component library of 11.4 | Component and Design System |
| `styles/tokens.css` | The single token file of 11.4 | Component and Design System |
| the calendar, task form and search overlay directories | 9.3, 9.5's calendar, 9.9 | Complex Interaction |

`parts/` is not a component library and must not become one. It holds the least
that lets a page render: a task row, a quick-add row, and the row callbacks.
Its header says what it owes. When the Component engineer's library lands, the
pages should import from there and `parts/` should shrink to nothing.

## How a page declares its data

**Settled.** A page calls exactly one hook from `api/queries.ts` for its own
surface, and nothing below a page fetches anything. Components take rows as
props and callbacks as props.

```tsx
export function ImportantPage() {
  const view = useImportantView()
  const me = useMe()
  const actions = useRowActions()
  return (
    <PageBody query={view} isEmpty={(view.data?.rows.length ?? 0) === 0} emptyCopy={IMPORTANT_EMPTY}>
      <TaskList tasks={view.data?.rows ?? []} viewerId={me.data?.user.id ?? null} {...actions} />
    </PageBody>
  )
}
```

That is the whole shape. A page that needs a second read calls a second hook;
a component that needs data takes it as a prop. The rule exists because a
component that fetches is a component that cannot be rendered twice on one
page, and 9.5's All page renders the Tasks page's own regions inside itself.

**Settled.** Adding a read means adding a hook to `api/queries.ts`, not calling
`fetch` or `useQuery` in a page. Two obligations of section 7 are structural
there and nowhere else: `getView` appends `tz` to every view read (7.0, and its
absent half ruled on 2026-08-07), and `mutateApi` sets `X-CSRF-Token` on every
write (11.6). `tests/e2e/session-path.spec.ts` measures both from outside the
client, over a whole session rather than one endpoint.

**Settled.** `getView` for the view endpoints of 7.10 and anything else that
evaluates a date; `getPlain` for `/me`, `/me/settings`, `/folders`,
`/connections`, `/invites/pending`. 7.0 scopes its `tz` sentence to view
endpoints, so a plain read carries none: sending one anyway puts a parameter on
the wire the contract does not give that endpoint.

**Settled.** Responses are parsed with the schemas of `src/shared`. A response
that does not satisfy one is a finding, and it surfaces through the page's
error state rather than being rendered around.

## Loading, empty, error: the four states

**Settled.** They are `states/PageStates.tsx` and a page never writes one.
Section 9 gives every page five states and the fifth is the global banner; the
other four are `PageBody`, which takes the query, whether the successful result
is empty, and the normative empty copy of section 6.

- **Loading** is 9's skeleton rows: a `role="status"` message plus
  `aria-hidden` placeholder rows. The placeholders are hidden from the
  accessibility tree deliberately, so a skeleton is a skeleton and not a list
  of empty task rows a test can find.
- **Empty** is the copy of section 6, transcribed once in
  `pages/empty-states.ts`. Copy in these sections is normative: restyle, never
  reword.
- **Error** is 9.4's "global toast plus inline retry". The toast is raised by
  the query cache for every failed read in the client; what `PageBody` renders
  is the retry, beside the thing that failed.
- **A 404 is not an error, it is an answer.** 10.2 makes every inaccessible
  resource read as nonexistent, and the client's half is showing a missing
  thing rather than a broken application. `PageBody` renders that case
  separately.

**First pass.** The two inline strings, "Couldn't load this. Nothing was
changed." and the not-found sentence, are this session's. Section 9 specifies
the toast and the retry and spells no inline copy for either, which is recorded
as an open silence below. Design may reword them without a spec change until
something rules otherwise.

**Settled.** Offline reads get no page-level copy. 9.1 makes the banner the
persistent, global statement of that condition; a second offline message per
page would be two answers to one question.

## The offline banner and the toasts

**Settled.** The banner is `shell/OfflineBanner.tsx`, rendered once by
`shell/AppLayout.tsx`, above the outlet. It is global because 10.6's fallback
opens every `/app` path from the cached shell, and a banner a page rendered
would be missing on exactly the pages reached while the connection is down.

**Settled, and the least obvious thing in this client.** Whether Dana is
offline is `state/connectivity.ts`, not `navigator.onLine`. Measured under the
browser the Playwright leg drives: a document served from the service worker's
cache with no connection reports `navigator.onLine` as `true`, because the flag
is set from the network stack at document creation and a cache hit never asks
it. So the store is fed by, in order of authority: a request that did not
complete, a response of any status, and the window's own `online`/`offline`
events. `api/http.ts` reports every request either way. Do not reintroduce a
bare `navigator.onLine` read; it is wrong on the one load 10.6 exists for.

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

**First pass.** The toast's Dismiss control is this session's; 9.1 gives a toast
no action and no timer. Replace it with the designed treatment.

## Mutations and invalidation

**Settled.** Every write goes through a hook in `api/mutations.ts`, and a hook
there invalidates nothing and reports nothing. `api/queryClient.ts` calls
`invalidateQueries()` with no filter on every mutation success, which marks
everything stale and refetches the queries with live observers: exactly "the
active view" of 8.3 and nothing else.

**Settled, and do not replace it with a key map.** A per-mutation map of which
keys to invalidate is a list of the things somebody remembered, and what it
produces is a shared folder that looks wrong after another member's edit. If a
future package needs finer invalidation, that is a Steward escalation, not a
local optimisation.

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

**Settled.** `tz` on a mutation is the call site's, not `mutateApi`'s, and
exactly two mutations carry one: `complete` and `abandon` (7.6, ruled
2026-08-10) and the My Day pull (7.8, ruled 2026-08-08). Sending it on a
transition that evaluates no date would put a parameter on the wire the
contract does not give it.

## What a page must do to behave like every other page

1. One hook per surface from `api/queries.ts`. No `fetch`, no `useQuery`.
2. Wrap its rows in `PageBody` with the section 6 empty copy for that page.
3. Render every section 9 names as a named region (below), never a bare `div`.
4. Raise no toast, catch no request error, and write no loading or error markup.
5. Add no offline treatment. The banner is the layout's.
6. Take row callbacks from `useRowActions()` rather than calling mutations
   directly, so every row action invalidates and reports the same way.
7. Put nothing global on the page. The top bar, sidebar, banner, floating add
   button, toasts and update affordance are all `AppLayout`'s.

## Named regions

**Settled**, by the sections ruling added to 9.1 on 2026-08-11. Every section a
page's structure names is a named region, and a control inside one is addressed
as that control within that region. Use `states/PageSection.tsx`:

- `PageSection` renders `<section aria-label={name}>` with an optional visible
  heading. The name is 9.1's table where the section fixes one, and the datum
  the section is generated from where it does not: a folder name, a day.
- `CollapsibleSection` is a region plus a control carrying the same name, whose
  `aria-expanded` is what open and collapsed mean. Its children are absent
  while collapsed, not hidden: Q7 asserts the completed row is not on the page
  until the section is opened, and a hidden element is still on the page to
  everything but a screen reader.

Tasks' Inbox block is the shape to copy for a region with no visible heading: a
region's name is announced and addressed, not rendered.

## Accessible names fixed here

**Settled**, from 9.1's control table, and exact. Three of the eight names in
that table begin with "add" and two of them are "More actions", so a loose
match puts back precisely the collision the naming removed.

| Control | Name | Role | Where |
| - | - | - | - |
| Global search control | `Search` | button | `shell/TopBar.tsx` |
| Floating add button | `Add task` | button | `shell/FloatingAddButton.tsx` |
| Inline quick-add input | `Add a task` | textbox | `parts/QuickAddRow.tsx` |
| Update affordance | `Update available, reload` | button | `pwa/UpdatePrompt.tsx` |
| A row's star, starred | `Important` | button, `aria-pressed` | `parts/TaskRow.tsx` |
| A row's star, not starred | `Mark as important` | button, `aria-pressed` | `parts/TaskRow.tsx` |
| The un-pull control | `Remove from My Day` | button | `parts/TaskRow.tsx` |
| A sidebar page | its 9.1 name | link | `shell/Sidebar.tsx` |
| A label group | the label alone | button, `aria-expanded` | `shell/Sidebar.tsx` |
| A settings page toggle | the page's name | switch | `pages/SettingsPage.tsx` |

**Settled.** The star is a `button` with `aria-pressed` and deliberately not a
`switch`, because 9.4's important-only filter is the switch on that page and a
row full of switches named "Important" would collide with it.

**Settled.** A settings toggle's one-line description is `aria-describedby` and
never part of its label, so the name stays the page's name.

**First pass.** The important-only filter on My Day is a `switch` named
"Important only". 9.4 calls it an "important-only toggle switch" and spells no
name.

## The overlay seam

**Settled.** `shell/overlays.ts` is how the chrome asks for the two surfaces
this session does not build. The floating add button calls
`openTaskForm(defaults)` with the entry-point defaults of 9.3; the search
control and the Ctrl+K and `/` shortcuts call `openSearch()`. Subscribe with
`onOpenTaskForm` / `onOpenSearch`.

**Settled.** The entry-point defaults are the chrome's, because 9.3's table
keys them by where the person clicked. `shell/AppLayout.tsx` maps the route to
the defaults, including the folder page's, closed at the P8 change control: the
floating button sits on the page rather than in a section, so it opens with the
due date empty. The two quick-add rows on a folder page carry the section
contexts and live on that page.

**First pass.** Whether the overlays keep using this seam or become a context
is the Complex Interaction engineer's call. What must not change is that the
chrome decides the defaults.

## Dates

**Settled.** `api/tz.ts` is the only place this client evaluates a date, and it
does so for one purpose: pre-filling an entry-point default, which 7.11 lists
among the client conveniences with no authority. Every grouping, every overdue
badge and every today boundary is the server's answer to the `tz` this same
module reports. Do not filter, compare or group by a client-computed date; that
is this role's named hazard and it produces a page that contradicts the server
for part of every day.

## PWA

**Settled.** `pwa/registerServiceWorker.ts` registers `/sw.js`, watches for a
worker that installs while one already controls the page, and never calls
`skipWaiting` on its own. The reload is bound to the person's click and merely
waits for the controller to change, so an ordinary first visit does not reload
itself.

**Recorded deviation.** 11.4 names the flow as "vite-plugin-pwa with the
prompt-for-update registration flow (virtual:pwa-register with onNeedRefresh)".
The plugin is still what builds the worker and the manifest, and it is
requested in `src/server/routes/README.md`. What this client does not do is
import `virtual:pwa-register`: that module exists only while the plugin is
configured, a static import of it fails the build outright, and this package's
gate had to be green on a tree where `vite.config.ts` (Platform's) is not wired
yet. The flow implemented is the flow the virtual module implements, against
the same generated worker. Escalated with the recommendation that 11.4's
parenthesis be read as naming the flow rather than the import; if the ruling
goes the other way, the swap is that one file.

## Owed, and marked in the code where it is owed

- The infinite arm of Done and of a folder's Completed section. Both render
  their first page. 7.10's cursor is opaque and is handed back byte for byte.
- 9.4's un-pull marker hides itself when the row also qualifies
  automatically, and that condition is **derived** in `parts/TaskRow.tsx` from
  Q1's automatic disjunct, because nothing on the wire reports why a row is on
  a page. It is the one date comparison in this client outside an entry-point
  default; the argument for why it is safe is at the call site. Escalated as a
  reading, with the recommendation that the card carry the reason.
- 9.5's abandoned row is struck (the `s` element, which computes a
  line-through with no stylesheet) and not faded. Fading is a token.
  **Closed** by the Component and Design System session: the row is
  `components/ui/TaskRow.tsx` and the fade is `styles/tokens.css`.
- Q4's outward star tooltip ("Also in Planned, due ..."), the row overflow menu
  ("More actions"), the sharing panel of 9.6, the folder overflow menu, the
  G-SERIES confirm before an uncomplete on Done, and every confirmation of 9.3
  to 9.9 with its "Continue" and "Cancel". **Partly closed** by the same
  session: the tooltip, the row's overflow menu, and `ConfirmDialog` with
  9.1's two names are in `components/ui/`. The folder overflow menu, the
  G-SERIES confirm and the sharing panel are those components applied to page
  markup that is not that role's; `components/README.md` says so by file.
- The Q12 login surface of 9.8: when pending invites exist, the invite list
  renders before anything else after callback. The read (`usePendingInvites`)
  is in place; the surface is not.
- Planned's calendar mode has a toggle and an empty slot for Q3C's grid.
- The truncation notice section 6's cap rule asks for. Every capped body
  carries `truncated` and nothing renders it yet.

## Open silences in section 9, escalated

- **Inline error copy.** 9.4 says "global toast plus inline retry" and spells
  the toast only. Two strings are this client's; recommendation is that section
  9 either spell them or say that it does not.
- **The CSRF cookie's name.** 11.6 fixes that the token cookie is readable and
  fixes no name, so `api/csrf.ts` prefers `dana_csrf` and falls back to the sole
  readable cookie. The server holds that constant in `src/server/auth/
  cookies.ts`, which `src/client` cannot import. Recommendation: move the two
  cookie names to `src/shared` so one definition serves both sides.

## Extended by the Component and Design System session

Appended rather than woven in, on this file's own invitation to extend a first
pass and say where. Three things above changed and nothing above was reworded.

**`parts/` is now two one-line re-exports and one hook.** The component library
of 11.4 is `components/ui/`, with `components/README.md` beside it as its own
ledger. `parts/TaskRow.tsx` and `parts/QuickAddRow.tsx` re-export from it, so
the five pages that import them kept working without an edit to a file that
role does not own; repointing those imports deletes both. `parts/useRowActions.ts`
stays, because row callbacks are the data layer's rather than a component, and
it belongs in `api/` whenever someone who owns that directory moves it.

**`RowActions` gained two members**, and both are additive, so every page that
spreads `{...actions}` gets them with no page edit. `onAbandon` is 9.4's
overflow entry, behind that section's confirmation. `starTooltipMode` is not a
callback: Q4 gives the star an outward tooltip on Important and an inward one
everywhere else, which is a property of the page rather than of the row, and
this hook is the page layer. The row takes it as a plain prop, so it behaves
the same wherever it is mounted.

**`styles/tokens.css` is imported by `components/ui/index.ts`.** Nothing else
in this client imports CSS, and `main.tsx` is not that role's file. Vite emits
one stylesheet for the entry chunk, so the tokens are global regardless of
which page is open. A first pass: one line in `main.tsx` is tidier and is
requested in `components/README.md`.
