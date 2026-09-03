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
| `pages/` | One file per surface of 9.2 and 9.4 to 9.8, and since S25 the wiring rather than the markup wherever a screen has been lifted | Frontend Architect |
| `screens/` | **Legacy lifted screens being retired.** Existing files stay presentational while they move into `components/`; do not add new files here. Their page beside them owns data reads and wiring | Frontend Architect |
| `views/` | **What every place-page shares** (S10): the filter model and its store, the view strip and its preference, grouping, the Scheduled ladder, and the spine table 9.3's entry defaults are read from. `TaskBoard.tsx` is the board's *meaning* since S25, the geometry having moved to the lifted `components/task-board.tsx` | Frontend Architect |
| `views/group-mark.tsx` | The mark a group heading draws, since S17a: `grouping.ts` says which kind the axis produced and this draws it, through the same two resolvers every other surface uses | Frontend Architect |
| `pwa/` | Registration and the 10.6 update affordance | Frontend Architect |
| `public/` | The manifest icons, copied to the build root | Frontend Architect, art is design's |
| `parts/` | **The page layer.** The row callbacks, and since P8R session R4 the presenters that map our API shapes onto the designer's display props | Frontend Architect |
| `parts/person-tint.ts`, `parts/identity-colors.ts` | The two palettes that must name swatches, kept out of `components/` for the reason the second records: the S8 foundation test forbids a ramp step or a literal colour there. The first is S17a's, a person's colour as a function of their name | Frontend Architect |
| `components/ui/` | The component library of 11.4 | Component and Design System |
| `styles/tokens.css` | The single token file of 11.4 | Component and Design System |
| the calendar, task form and search overlay directories | 9.3, 9.5's calendar, 9.9 | Complex Interaction |

`parts/` is not a component library and must not become one. It was the shell
session's holding pen for the least that let a page render, and it did shrink
to nothing once the component library landed. What it holds now is the page
layer: the code every page calls and no component does. Two files, the row
callbacks of `useRowActions.ts` and the presenters of `presenters.ts`, and
the section at the end of this file is what the second one is for.

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
8. **Set no page width, no page padding and no page scroll.** Those are the
   layout's, below, and thirteen pages each choosing their own is thirteen
   chances to disagree.

## The layout, and what it means for a page

**Settled**, by P8D session 2. Until then this file's shell was a bare `div`
holding a bare `main`, which is the recorded reason P8 shipped its sidebar as a
full-width block. The shape is the designer's, in the class vocabulary role 08
landed at P8D session 1 and indexed in `components/README.md`.

```
app-shell            the viewport-height box, and the app canvas colour
├── shell-sidebar    fixed 256px, scrolls on its own
└── shell-main       the content column
    ├── shell-topbar 9.1's top bar: app name, search, avatar menu
    ├── shell-pagebar    the designer's static current-page strip
    ├── the offline and update banners
    ├── main.shell-scroll    the ONE region that scrolls
    │   └── shell-content    the measure: capped, centred, padded
    │       └── the page
    └── the floating add button
```

Three consequences a page or an overlay has to know.

**The page is already inside its measure.** `shell-content` caps the column at
`--shell-content-max` and centres it, so a page renders its own content and
never a width, a horizontal padding or a max-width of its own.

**Only `shell-scroll` scrolls, and the document does not.** That is the
design's own rule and it is what keeps the top bar, the strip, the banners and
the floating action still while the page moves. A page that made itself a
scroll container would nest a second scrollbar inside the first.

**A floating layer opened inside the page is clipped by that scroll region, and
one of them is clipped today.** This is the honest cost of the fixed shell and
it is worth knowing before it is rediscovered: an `overflow` ancestor clips its
absolutely-positioned descendants, so a `menu-panel` that extends past the
column's left edge is sliced at `x = 256` and the sidebar is what is painted
underneath. Measured on the folder page, whose header menu opens leftward from
a trigger 40 pixels inside the column: the panel spans 148 to 340 and the
sidebar receives the pointer. Every other floating layer in `tokens.css` is
`position: fixed` and escapes this; `menu-panel` and `popover-panel` are the
two that are not. Raised to the Steward at that session's close with a
recommendation, and it is role 08's file rather than a page's to change.

## Named regions

**Settled**, by the sections ruling added to 9.1 on 2026-08-11. Every section a
page's structure names is a named region, and a control inside one is addressed
as that control within that region. Use `states/PageSection.tsx`:

- `PageSection` renders `<section aria-label={name}>` with an optional visible
  heading. The name is 9.1's table where the section fixes one, and the datum
  the section is generated from where it does not: a folder name, a day.
  **Since S17a it collapses whenever it has a heading**, on Imran's ruling of
  2026-08-22 that native and user-made sections are the same thing and only
  the capabilities differ; the control carries the section's name and its
  `aria-expanded` is the state, exactly as `CollapsibleSection`'s does
  (AC-245). A section with no heading has nothing to draw a control as and
  stays a region alone. It also takes `headingMedia`, a mark inline before
  the name, and `count`, the quiet figure after it and `aria-hidden` so the
  control's name stays the section's; `views/group-mark.tsx` builds the mark
  from the axis a group came from, so a folder heading draws that folder's
  glyph and a person heading that person's disc.
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

## Extended by the Complex Interaction session

Appended rather than woven in, on this file's own invitation, and by the same
rule the Component session followed: nothing above is reworded, and what
changed above is named here. Three directories arrived, `components/task-form/`,
`components/search/` and `components/calendar/`, each with a header stating
what it implements and why.

**The overlay seam kept its shape and gained one arm.** The question this file
marked as this role's call is answered: `shell/overlays.ts` stays the chrome's
and stays exactly as written, and the edit arm is a second, narrower bus in
this role's own directory, `components/task-form/open.ts`. `openTaskForm`
carries 9.3's entry-point defaults and no identity, because the chrome decides
those; `openTask(taskId, { upcoming })` carries an identity and no defaults,
because a row, a calendar cell and a search result each open a task that
exists. The `upcoming` flag is 9.5's ghost path and rides that path alone.

**Both overlays are mounted once, last, by `AppLayout`.** Once, because each
opens over whatever page is beneath it and a per-page copy would be two of
each on the All page. Last, because both are modal and a control inside one
has to be the page's last in reading order, which is what makes
`getByRole('button', { name: 'More actions' }).last()` name the form's menu
rather than a row's.

**A surface is a page for the purposes of the one-hook rule.** The form
overlay and the search overlay read, and the components below them take values
and callbacks as props: `TaskFormOverlay` holds every read and write of 9.3,
`SearchOverlay` holds the one read of 9.9, and `TaskForm`, `StepsEditor` and
the calendar's own pieces fetch nothing. `PlannedCalendar` is the one
exception in kind and not in spirit: it is mounted by a page and calls the
Q3C hook itself, because the range it asks for is the range its own grid laid
out and no page can know that before the grid renders.

**Four reads and seven writes were added to `api/`**, because this file
settles that every read and every write in this client lives there:
`usePlannedCalendarView`, `useTask`, `useDeleteTask`, `useAddStep`,
`useUpdateStep`, `useDeleteStep` and `useDeleteFolder`. None of them
invalidates or reports anything, which is this file's settled rule and stays
so.

**`parts/useRowActions.ts` gained `onOpenTask` and `onDelete`**, the two
entries `components/README.md` recorded as owed. Both are additive, so every
page that spreads the actions got them with no page edit.

**One thing changed in `components/ui/` that is not that role's to have
foreseen.** `StarButton` now carries its accessible name as content rather
than as `aria-label`. The name is identical, `aria-pressed` is unchanged, and
every criterion that asks for the star by role and name is unaffected. What
changed is that an `aria-label` is a *label* to the acceptance suite's
`formField` helper, which addresses 9.3's ten fields by accessible name across
roles because those fields are ten different roles. 9.3's own important toggle
is one of them, and the seed puts a starred row on five of the six pages
AC-093 opens the form from, so the two collided and the criterion could not be
asserted at all. Measured, not reasoned: Playwright's label engine reads
`aria-label` off any element.

### Readings recorded, and what would let the client stop making them

Three, each at its call site as well as here. Each is a place where the
specification asks the client to render something no response reports.

- **The G-SERIES branch on a Done row.** 9.5 confirms before an un-complete
  that takes the successor branch and 5.1 defines that branch by a pending
  sibling. `pages/DonePage.tsx` reads the row through 7.6 on the click and
  derives it from two TaskDetail fields: 8.5 moves the rule onto the successor
  and 5.1's exhausted-series clause leaves it on the last row, so a completed
  row has a successor exactly when it carries a `series_id` and no rule. The
  transition response already carries `deleted_successor_id`, so the server
  knows this before it acts. Recommendation: a field saying whether the branch
  applies, or the confirm's condition stated in 9.5.
- **The abandoned count in 9.6's folder confirm.** The copy names three counts
  and 7.4's Folder carries two, 8.11 putting abandoned rows on neither side.
  `pages/FolderPage.tsx` counts them off the open sections, which carry every
  abandoned row in the folder by Q2's and Q3's predicates. Recommendation:
  7.4's counts carry the number the copy asks for.
- **"Unassigned" is not offered by the assignee dropdown.** 9.3 says the
  dropdown lists the folder's members plus "Invite by email", and AC-094
  asserts that by counting, so a null option would make the count wrong. INV-5
  permits a null assignee in a multi-member folder, so this narrows what the
  form can express: the field falls back to the viewer where they are a
  member, which is also 9.3's own default. Recommendation: 9.3 say whether the
  dropdown offers unassignment.

### Owed by this role, and marked in the code

- **The reminder is held and never saved.** 7.9's endpoint arrives with P7 and
  there is no reminder route in this tree, so the control implements 9.3's two
  modes and its dependency on the date, and nothing writes it. AC-092 is about
  the form's state rather than a stored row and says so itself. The write arm
  is one hook and one call site.
- **The sharing panel of 9.6**, and with it the folder header's rename, label
  and leave. The header's delete and its confirm are in place; the other three
  each need a mutation this client does not carry.
- **The calendar's week and day zooms are wired and undesigned.** Both views
  render and both request their own range; what 9.5 calls the all-day banner
  lane and the timed lane is FullCalendar's own, and the token file that would
  style either has not been transcribed.

### Two criteria that cannot pass as written, reported rather than worked around

Both are the pattern `components/README.md` already reported twice and
`app/tests/` is no phase's to edit.

- **AC-098's second and third cases.** The file's `beforeEach` creates a task
  titled `ac-098 daily series` before every case, against a database the
  runner seeds once, so the second case sees two series and the title locator
  resolves to two elements. Measured: each of the three passes alone against a
  fresh seed.
- **AC-156's fourth case.** It creates `ac156token pending row`, which its own
  third case already created, and then asserts that title is visible. Same
  cause, same one-line fix.

## Extended by the page assembly session, and the owner's review of two others

The second session of this role at P8, and the last one to write pages. Two
sessions ran between it and the shell: they extended this file, and this
section both extends it again and answers, as the owner of most of the files
they touched, whether what they did was a hole filled or a convention broken.
Nothing above is reworded, and everything below that changes something above
says which.

### The owner's review, first

**Both sessions filled holes, and neither broke a convention.** Every edit
inside `shell/`, `pages/`, `parts/` and `api/` cited a committed comment of
this role's that named the role to fill it, and each landed in the shape the
comment described: the calendar in the slot `PlannedPage` left for it, the
folder header's delete and its confirm, the Done page's G-SERIES probe, the
two overlays mounted by `AppLayout`, and eleven hooks in `api/` that
invalidate nothing and report nothing, which is this file's settled rule and
stays so. Reviewed as the owner and kept.

**Three things are corrected rather than kept, and none is a rewrite.**

- **The sentence "both overlays are mounted once, last, by `AppLayout`" is
  wrong about one of the two, and the code is right.** `SearchOverlay` is
  mounted third, above the page; `TaskFormOverlay` is mounted last. The
  reason for last is stated in that section and holds for the form alone,
  that `getByRole('button', { name: 'More actions' }).last()` must find the
  form's menu rather than a row's. The search overlay has the opposite
  obligation and `AppLayout`'s own comment gives it: its input has to be the
  document's first text entry, since AC-158 reaches for the first textbox on
  a page that also carries quick-add rows. So the rule is **the form is last
  and the search is first**, and the earlier sentence is corrected here
  rather than in place, by this file's own convention for extensions.

- **"Nothing below a page fetches" is narrowed to what it was always
  protecting.** `PlannedCalendar` calls the Q3C hook itself and
  `components/ui/QuickAddRow` calls `useCreateTask` itself, and both were
  recorded as departures. Reviewed, they are not: what the rule exists to
  prevent is a component that cannot be rendered twice on one page, which is
  9.5's All page rendering the Tasks page's regions inside itself. A mutation
  observes no query, and the calendar is mounted once by one page because 9.5
  gives Planned one grid. The rule as it should have been written: **a
  component that observes a query may be mounted once and only by a page that
  cannot render it twice; everything else takes rows as props.** Anything
  broader would have made the two departures above into defects, and they are
  not.

- **`parts/` is gone except for one file.** The two re-export files are
  deleted and the five pages import from `components/ui` directly, which is
  the request `components/README.md` filed against this role.
  `parts/useRowActions.ts` stayed, and moving it into `api/` was refused
  rather than deferred: it reaches for `openTask` and for `StarTooltipMode`,
  so `api/` would point at `components/` for the first time in this client.
  The reason is at the file.

### What this session added

**Q6 pages, and it is one hook body for one order.** `useDoneView` and
`useFolderCompletedTasks` are both `useInfiniteQuery` over the same shape,
because section 6 defines Q7's third section as "Q6 predicate, order, and
pagination, folder_id = F" and 7.10 settled on 2026-08-07 that a cursor's kind
names the order it pages rather than the endpoint that issued it. The cursor
is opaque and is handed back byte for byte; a null `next_cursor` is the only
end-of-list signal, and nothing counts rows to decide whether to stop.

**A day is not a page**, so `mergeCompletedDays` in `api/queries.ts` puts a
day split across a page boundary back into one group. Two regions cannot carry
one name, and 9.1 names Done's regions by the day each one groups. It merges
and never reorders, which section 6's preamble forbids.

**`MorePages` in `states/PageStates.tsx` is the end of an infinite list**, and
it is one control doing two jobs deliberately: a button, so the next page is
reachable by keyboard and addressable at all, and an intersection observer on
that button, so an ordinary reader never sees it and 9.5's "infinite scroll"
is what actually happens. Section 9 names no control here, so its label is a
**first pass**.

**The truncation notice is `PageBody`'s**, on a new optional `truncated` prop,
carried by the six capped bodies of 7.10 and by no other page. The cap is per
response rather than per array (ruled 2026-08-07), so one flag serves My Day's
three sections and All's two, and the notice sits above all of them. The copy
is a **first pass** and is recorded as an open silence below: section 6
requires the notice and writes no words for it, unlike the eight empty states
it writes sentence by sentence. The number is deliberately not interpolated,
the flag reporting that rows were dropped and never how many.

**9.6's sharing panel is `pages/FolderSharingPanel.tsx`**, behind the Share
button 9.6 puts in the header, and it is a named region called "Sharing
panel". That name is 9.6's own words rather than an invention, and it is a
region by the sections ruling read past its own table: the table enumerates
the folder page's three task sections because it was written against Q7's
body, and the ruling's sentence is about every section a page's structure
names. It matters here because the panel carries a field labelled "Invite by
email", which is also the last option of 9.3's assignee dropdown.

**The folder header now carries all four entries of 9.6**, each conditioned on
the actor 5.4 permits and each refused again server-side (7.11). Rename is
inline, on the heading. Two confirms in this area are **first passes**: the
one before an owner removes a member and the one before a member leaves.
Section 9 writes four confirmations word for word and neither of these is one,
while 5.3's R-CLEAN gives both exactly the invisible consequence those four
exist to state.

**The Q12 login surface is `pages/PendingInviteList`, rendered first on My
Day.** 9.8 says the list "renders before anything else after callback" and 9.2
says where the callback lands: "first-run lands on My Day; pending invites,
when any exist, surface first as 9.8 describes". So the surface is the top of
My Day rather than a band above every page, which is the reading rejected, and
it is mounted on the People screen too, that being the screen 9.8 gives the
rest of this subject. Accepting a folder invite navigates into that folder,
from the full Folder object 7.5 answers with. Recorded as a reading, escalated
below.

**9.8's roster removal control** landed with that section's verbatim confirm,
and **Q6's star** landed on a Done row. Done's rows stay that page's own
rather than `TaskList`'s, and the reason is at the page: 9.5 gives the page a
differently named control, "Mark as not done", because on the G-SERIES branch
it confirms first, and a checkbox that sometimes opens a dialog would hide
that inside the one control every other page uses unconditionally.

**The sidebar's label groups are `CollapsibleSection`s**, which is what the
sections ruling makes them: it names them in its table and again in its first
consequence. Nothing about the control's name or its expanded state changed.

**9.2's landing page has a structure and placeholder copy in marked slots.**
The frame is this session's: a hero carrying the product sentence and the
single call to action, a block of points, a footer of links. Every string is
in one block at the top of the file so a rewrite is a diff over that block,
and section 13 item 14 makes the wording the designer's. The rule that
outlives the copy is the one about addition, which AC-159 reads off the whole
rendered body.

**`main.tsx` imports `styles/tokens.css`**, the request `components/README.md`
filed. The import in `components/ui/index.ts` is that role's to remove; while
both exist Vite emits one stylesheet either way.

### Still owed after this session

- **The truncation notice is never exercised.** Nothing in this repository
  produces a response over the 1000-row cap, so the notice is asserted by no
  test at any level and has been read rather than seen.
- **Q6's paging is likewise unexercised.** The seed carries one completed row,
  so `MorePages` renders nothing on any page this suite opens, and the merge
  across a page boundary is proved by construction rather than by measurement.
  A vitest-level unit test over `mergeCompletedDays` is the cheapest way to
  close that, and belongs to whoever writes this client's first unit test.
- **9.6's colour half.** "Label and color personal" is implemented as the
  label alone: 7.4 takes both on one body and `styles/tokens.css` is where a
  palette would come from, and neither that file nor the design brief carries
  one yet. The mutation already takes `color`.
- **The invite list has no region name.** 9.1's table names no region for the
  login surface, and a page with several invites has several controls named
  "Accept". Each row carries its own sentence, so a control is addressed
  inside the row that names the inviter and the folder, which is the same
  addressing a task row's controls get; a name here would have to be invented.

### Open silences added to the list above

- **The truncation notice's copy.** Section 6 requires it and spells nothing.
  Recommendation: section 6 either write the sentence beside the eight empty
  states it already writes, or say that the notice's wording is the design's.
- **The removal and leave confirms.** 9.6 names Leave and the sharing panel's
  remove controls and writes copy for neither, while writing four other
  confirmations word for word. Recommendation: 9.6 spell both, or state that
  the four it writes are the only confirmations whose copy is normative.
- **Where the Q12 surface lives.** 9.8's "before anything else after callback"
  and 9.2's "first-run lands on My Day" agree about the first load and say
  nothing about the second. Recommendation: 9.8 say whether the invite list is
  the first screen after callback or a standing surface until every invite is
  answered.

## `parts/presenters.ts`, added at P8R session R4

**Settled where a numbered section decides it, first pass where one does not,
and every first pass below is named as one.** RFC 0002 replaces what renders
the data and nothing that fetches it, so this client now has two halves
written against different objects: ours answers 7.0 and the designer's
components take what a row paints. This file is the whole of that mapping and
the only place it happens.

**No acceptance criterion reads it.** The criteria assert rendered roles,
names, regions and copy, and each would still pass if a due label here read
the wrong date, because they assert that a due badge exists and never what it
says. That is why the module is pure and why its unit tests, 54 of them beside
it, are the only check on it. Protocol section 8 makes them this role's.

**The module is pure and takes today as an argument.** `presenterToday()` is a
one-line pass-through to `api/tz.ts`, whose header records that it is the only
place this client evaluates a date; nothing else here constructs a `Date`, and
a unit test asserts the absence against the file's own source, because a
missing second clock is not something a call can assert. A page reads today
once and hands it to every row, so the answer is the one the `tz` parameter on
the request that fetched those rows was computed against.

**The three rules the module owns.**

| Rule | What it is | Where it comes from |
| - | - | - |
| Due label | "Due today"; "Due 6 Aug"; "Overdue · 6 Aug"; the time appended as 24-hour HH:MM when the task has one | Three cases from 8.10's boundary statement; the format is the design's, which 9.1 says outright ("the format of a date is the design's and this section has never spelled one"); the time from Q4's "due date and time like a Planned row" |
| Overdue | `status === 'pending' && due_date < today` | 8.10 "overdue when D < today(V)" and 9.4's due badge; the pending-only half is Q3C, "Pending renders normal (overdue styled on past dates), completed faded and checked, abandoned faded and struck" |
| Initials | First letter of the first word plus the first letter of the last, upper-cased, at most two, taken from the rendered name | **First pass.** The specification is silent at every section; brief section 6 gives an assigned row "a small avatar chip with their name" and the running prototype renders "S" beside "Sara" |

**Three first passes inside those rules, each a silence this session closed
rather than a rule it found.** The year is appended only when it differs from
the reader's year, because the design's screens settle the same-year form and
say nothing about any other, and two dates twelve months apart would otherwise
render identically. The month names are a fixed twelve-entry table rather than
`Intl`, because a locale-driven formatter renders "août" beside section 9's
normative English. And a null `display_name` renders 4.1's own "Deleted user"
rather than the P8 client's "Someone", the first being this specification's
string and the second being nowhere in it.

**The folder colour is resolved by id and never by name.** 7.0's card carries
a folder stub of `{id, name, is_default}` and no colour, the colour being the
viewer's own `my_color` on 7.4's membership; his row takes a name and a colour
and no id. So `useFolders()` is the table, the id is the key, and the stub's
own name is the fallback for the window before that list arrives. A folder
whose viewer set no colour takes `var(--color-graphite-900)`, which is the
token the designer's own fixtures give every folder, so no raw colour is
written outside `tokens.css` (11.4).

**One relation of his really is keyed by a display name, and 4.3 does not make
names unique.** `FolderGroupDialog` hands back `onSubmit(label, folderNames)`
while the write is PATCH `/folders/:id/my-membership`. `folderIdsForNames`
resolves one name to *every* id that carries it, deliberately: the alternative
picks one of two identically named rows and writes to a folder the person did
not choose, with nothing on the screen to say which. Everything else about a
group needs no bridge, 9.1 making a group "the label of 7.4's my-membership
and nothing else", which is a string on both sides.

**Three orderings from his prototype are deliberately not here.**
`plannedServerOrder`, `importantServerOrder` and `doneGroups` exist in his
files because his screens run on `fixtures.ts` and have no server. Section 6's
preamble says "every view returns rows already ordered; clients never
re-sort", and 7.11 makes a rule found only in the client a specification
violation.

**One prop this module cannot fill, recorded as a request rather than filled
with an invention.** `task-row.tsx` renders the repeating glyph only when its
`recurrence` prop carries the rule as prose, announcing it as `Repeats
{recurrence}`. Frozen 7.0 gives a card `is_recurring: boolean` and puts
`recurrence_rule` on TaskDetail alone, so nothing a view hands this module can
fill that string. The glyph is therefore absent until that component admits
the boolean it can actually be given, which is the Component and Design System
engineer's file and this session's one open request.

## Extended by P8R session R5, the shell replacement

Appended rather than woven in, on this file's own invitation, and by the rule
the three sessions before this one followed: nothing above is reworded, and
everything above that stops being true is named here. This session replaced
the global chrome with the designer's, on our router and our data, under RFC
0002.

### What is in `shell/` now, and what left

| File | What it is |
| - | - |
| `app-shell.tsx` | His `app-shell.tsx`. The layout element of the `/app` route, the three chrome reads, the 9.1 shortcut, both view preferences and the two overlay mounts |
| `app-sidebar.tsx` | His `app-sidebar.tsx`. The navigation landmark, the six page links, the folder list, the three relocated controls |
| `SidebarResizeHandle.tsx` | His handle out of that file, named "Resize sidebar" by 9.1 |
| `preferences.ts` | The two persisted view preferences of 9.1, and the argument for where they are kept |
| `FloatingAddButton.tsx` | His floating action, named "Add task" by 9.1 |
| `OfflineBanner.tsx` | The connectivity read; the banner itself is R3's ported component |
| `overlays.ts` | Unchanged |

`AppLayout.tsx`, `Sidebar.tsx` and `TopBar.tsx` are gone. So is
`pwa/UpdatePrompt.tsx`: the offer renders inside the window bar, which takes
`showUpdate` and `onUpdate`, so what the shell needs is state rather than a
second banner. `pwa/useUpdateAffordance.ts` is that state and
`registerServiceWorker.ts` is untouched. `components/page-bar.tsx` held the
offer between P8R and S9 and was retired at S17a, dead since the window bar
took it.

**`shell/TopBar.tsx` is retired by a ruling and not by a refactor.** The owner
ruled on 2026-08-13 that the designer's shell wins here, and 9.1 was amended:
there is no top bar, the app name and the global search control are in the
sidebar header, and the avatar menu is in its footer. AC-174 asserts the
removal as the absence of a banner landmark on every page, which is what an
application header is. The consequence for every page: **a page's own
`header` must stay inside `main`**, which it is, `SidebarInset` being the
`main` landmark and the outlet sitting inside it.

### The layout, superseded

The shape drawn earlier in this file is the P8D one and no longer exists; its
three consequences survive almost unchanged and are restated against the shape
that replaced it.

```
div.h-svh                        the viewport-height box
└── SidebarProvider              carries the sidebar width and the rail's
    ├── [role=navigation]        the sidebar: header, pages, folders, footer
    └── SidebarInset             the `main` landmark
        ├── the offline banner
        ├── div[data-shell-scroll]   the ONE region that scrolls
        │   └── the measure: capped at --shell-content-max, centred, padded
        │       └── the page
        └── the floating add button
```

**The page is still already inside its measure**, so a page renders its own
content and never a width, a horizontal padding or a max-width of its own.
This matters more than it did, because the designer's screens each carry that
wrapper themselves: they have no shell to put it in, and ours does. **A screen
ported at R6 to R10 drops its own centring-and-padding wrapper**, or the page
is padded twice.

**Only `data-shell-scroll` scrolls, and the document does not.** Unchanged in
substance.

**The clipping note about `menu-panel` is void**, that vocabulary having left
with the old token file. Every floating layer in the ported set is a base-ui
portal, which escapes the scroll container by construction.

### The two view preferences of 9.1

**Settled by 9.1 and asserted by AC-182.** The sidebar's width and whether it
is collapsed to a rail are the viewer's and persist. Both are `localStorage`,
one key each, read synchronously at the first render so the sidebar paints at
the width it was left at rather than jumping to it.

**Not a cookie, and this is the part worth knowing.** The shadcn primitive
mirrors the collapsed state into a `sidebar_state` cookie because that
distribution is built for a server-rendered host that reads it before
painting. Nothing on our server reads it, it would ride every request to the
section 7 API, and 11.6 leaves exactly one readable cookie in this browser,
which the acceptance suite identifies by being the only one. `app-shell.tsx`
clears it after every toggle.

**The default width stays in `tokens.css`.** The custom property is set to
`var(--shell-sidebar-width)` until this viewer has chosen a width of their
own, and only their own choice is ever written as a number: a chosen width is
data, the way a folder's colour is, and 11.4's rule governs the values the
design fixes. The drag reads the width the browser painted rather than a
constant, so nothing here mirrors that token.

**The sidebar's width transition is off**, which is a correction rather than a
preference and is flagged for the visual review of section 13 item 33. The
distribution animates the same property both preferences set, so a drag lags
the pointer by a fifth of a second and the rail arrives long after the click.

### Accessible names, corrected here

The table earlier in this file has three rows that named `shell/TopBar.tsx`
and two that named `shell/Sidebar.tsx`. They are replaced rather than moved,
because two of the strings changed with them.

| Control | Name | Role | Where |
| - | - | - | - |
| Global search control | `Search` | button | `shell/app-sidebar.tsx` |
| The avatar menu | `Account` | button | `shell/app-sidebar.tsx` |
| The app name | its own text, `Dana` | link to `/app` | `shell/app-sidebar.tsx` |
| Floating add button | `Add task` | button | `shell/FloatingAddButton.tsx` |
| The sidebar's rail control | `Collapse sidebar`, `Expand sidebar` | button | `components/ui/sidebar.tsx` |
| The sidebar's resize handle | `Resize sidebar` | separator | `shell/SidebarResizeHandle.tsx` |
| Update affordance | `Update available, reload` | button | `shell/WindowBar.tsx` |
| A sidebar page | its 9.1 name | link | `shell/app-sidebar.tsx` |
| A label group | the label alone | button, `aria-expanded` | `shell/app-sidebar.tsx` |

`Account` is 9.1's names table as the P8R change control amended it, and the
row it replaces interpolated the viewer's display name. That table's own
reason: what the control opens is the viewer's account, there is exactly one
of it, and a name carrying the display name would be the one string in that
table a test cannot know before it reads the fixture. **AC-174's second and
third cases still address this control by the viewer's name and are red
because of it**; that is an escalation to the Adversarial Test Engineer and
the Steward, filed at this session's close, and the implementation follows the
specification.

### Owed after this session, and by whom

- **The pending count is rendered inside the folder row's link by a wrapper in
  `app-sidebar.tsx`**, because `components/folder-row.tsx` renders it as a
  sibling of the anchor and AC-155 has asserted since P8 that it is inside.
  The row is passed `pending` as zero so there is exactly one count. A request
  against that component: render its badge inside the link, and the wrapper
  here is deleted in one edit.
- **Below 768px there is no navigation at all.** The vendored `Sidebar`
  switches to an off-canvas sheet there, and the only control that opens it is
  inside the sheet. The designer's viewport floor is what hid this and section
  13 item 32 forbids the floor, so the gap is real and is not this file's to
  close: it wants either a rule in `tokens.css` or a ruling on what Dana does
  on a narrow window. The browser leg runs at 1280 and is unaffected.
- **A rail-width token.** The rail is set to the sidebar item height plus the
  header's padding, expressed against `--shell-sidebar-item-height` rather
  than as a number. A token of its own would say it once.
- **The folder row's menu, the folder group menus and the folder directory
  menu are not rendered**, each opening a dialog that RFC 0002's plan gives to
  R10. `folder-row.tsx` draws its action cluster only when a callback arrives,
  so this is a prop that is absent rather than markup that was removed.
- **The toast region is still P8's markup** and renders against a vocabulary
  that no longer exists. His `SystemToast` takes a `kind` and this client's
  toasts carry the server's own 409 message, so the two do not meet without a
  decision about that case; R11's copy sweep is where it belongs.

## Extended by P8R session R6, the six list screens

The designer's six list screens are ported onto our view hooks through
`parts/presenters.ts`: `pages/MyDayPage.tsx`, `TasksPage.tsx`, `PlannedPage.tsx`
(its list mode alone; the calendar is R9's), `ImportantPage.tsx`, `AllPage.tsx`
and `DonePage.tsx`, plus the shared page states in `states/`.

Three files are new or changed beyond the six pages.

- `pages/task-rows.tsx` is one run of rows and the confirmations 9.3 and 9.4
  put behind two overflow entries. His screens carry six copies of that and his
  six already disagree about the abandon confirm's wording, which is one of the
  ten copy faults RFC 0002 measured; here the sentence is written once, as one
  text run in the dialog's title, with 9.1's "Continue" and "Cancel" beneath it.
- `pages/page-heading.tsx` is the glyph, name and subtitle every one of his six
  screens opens with. The subtitles are his own words and section 9 writes none.
- `states/PageStates.tsx` and `states/PageSection.tsx` are restyled onto his
  `SkeletonList`, `InlineError` and `Empty`, and onto his group heading. The
  rule they existed for did not move: a page renders rows and declares its
  empty copy, and no page writes a loading or an error treatment of its own.

**His per-screen centring wrapper is dropped from all six.** The measure is
`shell/app-shell.tsx`'s, verified there rather than taken on report.

**`main.tsx` mounts `TooltipProvider`**, which his `main.tsx` does and this port
had missed. The distribution's `Tooltip.Root` waits 600ms without it.

### Owed after this session, and by whom

- **`components/task-row.tsx` names its star with `aria-label`, and that takes
  AC-093's four cases red.** `components/ui/StarButton.tsx` carries the reason
  in its own header, measured at P8: an `aria-label` is a *label* to the
  suite's `formField` helper, which addresses 9.3's ten fields by accessible
  name across roles, so a page holding a starred row and an open task form has
  two elements answering to "Important". The repair is that file's: carry the
  name as `sr-only` content, exactly as `StarButton` does. The accessible name
  does not change.
- **The same file's star has no `title`, and AC-099's two outward cases read
  the tooltip immediately after a hover.** The suite's `tooltipText` names three
  faithful mechanisms, `title`, `aria-describedby` and `role="tooltip"`, and the
  distribution's tooltip supplies the last two only while it is open, which it
  is not yet when the read happens. Measured: with `TooltipProvider` mounted at
  zero delay the popup is still absent at that instant. The repair is one
  attribute, `title={starTooltip}` beside the existing `aria-label`.
- **The same file's completion checkbox is controlled by `status` alone**, so
  `locator.check()` fails when the server refuses the transition, which is
  AC-157's first case. The P8 row held an `asked` state until the answer
  arrived and its header gives the product reason: a box that snaps back while
  the request is in flight tells the person their click did nothing.
- **Four browser cases still reach for the quick-add's text box without opening
  the disclosure**, which 9.1 made a disclosure at the RFC 0002 change control
  and AC-166 now asserts in both states. They are AC-091's second case,
  AC-096's second, AC-157's third and `session-path.spec.ts`'s CSRF case. Each
  needs the collapsed control pressed first, or `quickAddControl` where it says
  `quickAddInput`; no criterion text moves.
- **AC-162's Done case addresses "Mark as not done" as a button** and 9.1's
  names table makes it the row's completion checkbox. `pages/DonePage.tsx`
  composes its own row so that both stay true today; the tension is the
  tester's and the Steward's to settle.
- **A long date for 9.4's header.** `parts/presenters.ts` formats "10 Aug" and
  his My Day header reads "Monday, 10 August". The page shows the presenter's
  format rather than computing a second one, which that module exists to
  prevent. A `formatHeaderDate` there would close it.
- **The pending-invite list is still on My Day** and 9.8 as amended says no
  page inside the application carries one. It goes with R10's gate.

## Extended by P8R session R10, the landing, the pre-app pages and the dialogs

Five surfaces, all of them the ones a person meets before the application or
beside it: `pages/LandingPage.tsx` with his product preview panel,
`pages/InviteGate.tsx`, `shell/folder-groups.tsx` with the folder-group dialogs
it opens, and `components/folder-label-dialog.tsx` for 9.6's "Label and color".
AC-159, AC-172, AC-180 and AC-181.

**9.2's landing copy is no longer a placeholder and no longer this client's.**
The owner ruled on 2026-08-13 that the designer's copy ships, which reopened
section 13 item 14 and closed it again the same day; the seven strings are in
one `COPY` block at the top of that file, exactly as the block of the owner's
copy it replaces was. The subheading's em dash is a comma, which is RFC 0002's
first open question closed by the owner on the ground that protocol section 7's
convention holds over copy adopted from outside this corpus. The eyebrow and
the preview panel's heading are written in capitals rather than lowercased and
uppercased in CSS, because the delta writes them in capitals and what a reader
of the document sees should be what that table spells.

**9.8's invite list is a gate and is mounted in `shell/app-shell.tsx`**, which
is what makes "every /app path" and "in place of the application" one condition
instead of a rule every page has to remember. It replaced the reading this
README recorded at P8 and the escalation beside it: the question "is the Q12
surface the first screen after callback or a standing surface" was answered by
the owner on 2026-08-13, and it is standing. `pages/PendingInvites.tsx` is
gone, and neither My Day nor People carries a list any more.

**The gate is conditioned on a non-empty answer and never on a pending read.**
A gate that waited for `/invites/pending` would be a client that shows nothing
until the network answers, and 10.6 opens every /app path from the cached shell
with no network at all, where AC-091 and AC-160 read the sidebar's links. So a
read in flight, a read that failed and an empty answer all render the
application. The cost is a window in which an account holding an invite sees
the shell, and `main.tsx` starts that read before the first render, beside the
three chrome reads, to make the window as small as this client can.

**A label group is a named region now**, `section aria-label={label}` in
`shell/app-sidebar.tsx`, which is 9.1's sections table applied where it always
reached and what makes the group's own "More actions" addressable: four
controls in this application answer to that name and the region that names
their object is the whole of what tells them apart.

### Readings recorded

- **The folder row's menu carries two of the five entries his prototype
  draws.** 9.1 gives the sidebar row the move and, since the P8R change
  control, "New folder group"; 9.6 gives rename, "Label and color" and delete
  to the folder page's header, which builds all three. Wiring them here as well
  would be two routes to one write with no section asking for either.
- **Inbox carries no row menu.** 9.1 pins it above the label groups and gives
  it a clause of its own, so a group action on that row would write a label the
  sidebar cannot render.
- **"New folder group" is on the folder row and not in a folder-directory
  menu.** His sidebar has that menu and R5 declined it, its other entry being a
  second "New folder" inside one landmark. 9.1 makes creating a group naming it
  on a folder, so the folder's own menu is where the action belongs and where
  AC-180 addresses it.
- **The create dialog opens with the folder whose menu opened it already
  checked.** The action was taken on that folder and it is what the label is
  written to; a dialog opening with nothing selected would ask a person to
  choose the folder they had just pointed at.

### Owed after this session, and by whom

- **9.6's colour half is a native colour control and not his seven swatches.**
  His picker's values are the design's folder tokens, and a membership colour
  is stored under 4.4's `#RRGGBB` check and sent through 7.4, so a CSS variable
  is a 422 rather than a colour; resolving those tokens here would either copy
  raw values out of `tokens.css`, which 11.4 forbids, or read the computed
  stylesheet to paint a control. What would close it is a swatch list in
  `styles/tokens.css` expressed as hexes a client may read, which is the
  Component and Design System role's file. Flagged for the visual review of
  section 13 item 33 as a real difference from his screen.
- **The unverified-email page of 9.2 renders the delta's copy exactly and none
  of the designer's design.** It is `src/server/auth/pages.ts`, a bare document
  the callback answers with, and 9.1 fixes it there: "the server's response to
  one request rather than a client route". Its heading, body and "Back to Dana"
  action are character for character what 9.2 writes, verified rather than
  assumed. Styling it as his screen draws it needs a file this role may not
  write; escalated to the Integration Steward rather than reached into.
- **The landing's two columns are `minmax(0,1fr)` where his are
  `minmax(560px,1fr)` and `minmax(620px,1fr)`.** That pair is a 1180px floor by
  arithmetic, and section 13 item 32 forbids exactly that number on exactly
  that ground. No breakpoint was added either, item 32 also refusing a mobile
  layout designed inside this package; what it requires is that a narrow
  viewport be no worse than before, and a column that shrinks satisfies it.
- **His landing footer's "© 2026 Dana" is not here.** 9.2 enumerates what that
  footer owes and the delta's copy table transcribes seven strings from his
  screen without it, so a copyright line is a legal statement no numbered
  section carries, and the one he wrote hardcodes a year.

## S10, the place pages

The eight surfaces of 9.4 and 9.5 and the machinery they share. Three of the
paths rendered v1 pages as interim and said so in `Router.tsx`, and
`/app/assignments` had no route at all; all four are drawn now, and the three
v1 pages are in git rather than beside their replacements.

| Page | File | Reads | Views | Captures |
| - | - | - | - | - |
| Today (9.4) | `pages/TodayPage.tsx` | Q1 and Q1R | list, board | the floating button |
| Scheduled | `pages/ScheduledPage.tsx` | Q3, Q3C | list, board, calendar | its list foot, dated today |
| Assignments | `pages/AssignmentsPage.tsx` | Q5, composed | list, board | the floating button |
| Important | `pages/ImportantPage.tsx` | Q4 | list, board | the floating button |
| All | `pages/AllPage.tsx` | Q5, and Q6 collapsed | list, board | its undated half |
| Done | `pages/DonePage.tsx` | Q6 | list | nothing (9.5) |
| Abandoned | `pages/AbandonedPage.tsx` | Q5, narrowed by status | list, board | nothing (9.5) |
| Anytime | `pages/AnytimePage.tsx` | Q2, ungrouped | list, board | its list foot, undated |

**One table decides the entry defaults, and it is `views/place-pages.ts`.**
DES-182 found the fault of not having one: a task made on Today never appeared
on Today, because the floating button, the quick-add and the board column each
decided the defaults for themselves and none of them matched the page's spine.
The three read one row now, and a fourth capture cannot be written without it.

**The filter is `views/filter.ts` and it never asks the server for anything.**
Section 6 offers no parameter for any of its axes, so every function there
takes rows and returns rows; AC-167 measures that by counting requests. Its
state is `sessionStorage`, one key per page, which is DES-179's ruling and the
only reason AC-222 can pass a full document load.

**The window bar's store gained a named slot rather than a sibling.** 9.1 puts
the chips at the bar's left end and the tab's controls at its right, so a
place-page renders into both; `shell/window-bar.ts` holds one store keyed by
slot and `WindowBarActions` takes which one, so the registration, the
subscription and the absent-before-mount case are written once.

### Owed after this session, and by whom

- **A board column receives no drop.** 9.1 gives one that writes the column's
  value; RFC 0004 assigns every drag engine to S11, and building a second one
  here is what moving the sidebar drag out of S9 was for. Recorded as change
  control item 9 in RFC 0005.
- **Done offers no board**, for the neighbouring reason: it draws `DoneRow`
  where every other page draws `TaskRow`, and 11.15's reunion of the two is
  S11's.
- **The filter has no created-by axis and an Assignments row has no "from"
  half.** Both want `created_by` on `TaskCard`, which frozen 7.0 does not
  carry. Escalated in change control item 9 with a recommendation.
- **A place-page has no cover and no editable description.** DES-141 and 9.4
  ask for both and nothing stores either for a native view. The head is
  waiting for a table, not for a component.
- **9.7's Settings is still v1's three booleans**, so "Save as view" writes a
  view already pinned: a view saved unpinned would have no address a person
  could reach, which is DES-189. RFC 0004 assigns the Settings rewrite to no
  package; whoever writes the pin list takes the default out with it, and no
  data moves when they do.
