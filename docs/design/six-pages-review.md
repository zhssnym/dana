# The six system pages, questioned

Status: **research final and the question is settled.** Imran ruled the
navigation model on 2026-08-21 after this research, its addendum, and four
rounds of argument over naming. **The settled model is DES-152 in
`v2-decisions.md`, with its machinery in DES-153** — five pages (Desk, Today,
Scheduled, Assignments, Important, All) with Done shipped unpinned. What
remains is the `?nav=v2` drawing for his eye, then the RFC.

Read this file for *why*, not for what was decided; options A–C below were
offered and none was taken whole. The naming principle that finally settled it
arrived late and is worth having in one sentence: **there is a difference
between copying a coinage and using the common word** — "My Day" and "Assigned
to me" are Microsoft's inventions, while "Today", "Scheduled", "Important" and
"All" are ordinary English that Apple also uses because they are the plainest
words available.
Recorded 2026-08-19, session F3's second half, on Imran's instruction: *"I even
question the existence of the six default pages, they seem redundant and also
not MECE. Their names also sound like a copy of Microsoft To Do, and they're
redundant because most of the things can be done just by the filter feature in
the controls row under the tabs."*

Three claims, examined separately, because they are true to different degrees
and the proposal should stand on the ones that hold. Every quoted rule below
was read from the spec, not remembered. Nothing in `docs/spec` changes with
this document; the change it proposes is routed at the end, through the RFC
process, because it alters specified behaviour — which is exactly what the
RFC preamble says always takes an RFC and a human decision.

## Verdicts, first

1. **"Not MECE" — correct, precisely.** The sidebar presents six coordinate
   entries that answer four different questions. One starred, dated task
   pulled into My Day appears on four of the six pages at once.
2. **"A copy of Microsoft To Do" — correct on the names, four of six
   letter-for-letter.** With one honest caveat: Dana's My Day *mechanism*
   (carry-over, the "snowball") is deliberately not To Do's, whose My Day
   empties overnight. The names were copied; the behaviour underneath one of
   them was not.
3. **"Redundant, the filter covers it" — correct for three of the six, and
   the spec itself proves one of them.** Section 6.1 carries a formal proof
   that All = Tasks ∪ Planned, disjoint, pinned by property test AC-070.
   Important is one predicate the DES-140 filter already has as a switch. But
   two pages are *not* expressible as filters — My Day and Done — and the
   proposal must keep them.

## Where the six came from

The brief (`docs/design/brief.md`) is the origin: *"you never file a task on a
page. A task without a due date lives on the Tasks page. Give it a date and it
moves to Planned. My Day collects what needs attention today… Important, All,
and Done are different views of the same tasks."* The glossary formalised it:
**Home** (Tasks or Planned, derived from the date, never chosen) versus
**View** (My Day, Important, All, Done — queries over the same rows). The six
were never six independent inventions; they are two homes plus four lenses,
promoted to pages because in 2026's to-do genre that is what the furniture
looks like.

And the genre in question is specific. Microsoft To Do's smart lists, mapped:

| Dana | Microsoft To Do | Same name? | Same behaviour? |
| - | - | - | - |
| My Day | My Day | **identical** | No — To Do's empties daily; Dana's carries over until dealt with |
| Tasks | Tasks | **identical** | No — To Do's is the default list; Dana's means "undated" |
| Planned | Planned | **identical** | Yes — dated tasks |
| Important | Important | **identical** | Yes — starred tasks |
| All | All | near (optional smart list) | Yes — every open task |
| Done | Completed | synonym | Yes — completion history |

Six for six by function, four by exact name. For fairness: the *cluster* is
genre-standard — Apple Reminders ships Today / Scheduled / All / Flagged /
Completed, Todoist ships Today / Upcoming / Completed — but the specific
vocabulary Dana carries is To Do's, and nobody chose that on the record. No
DES entry, no brief paragraph, no spec rationale defends the *set*; the brief
defends only the home/view derivation idea, which is genuinely Dana's and
survives every option below.

## What each page actually is

What the research owes the proposal: for each page, its query, the mechanisms
only it has, and whether the v2 lenses (the DES-140 filter, the DES-137 view
strip) can already express it.

| Page | Query | Owns, uniquely | A lens can express it? |
| - | - | - | - |
| My Day | Q1 + Q1R | Membership (pull in / "Remove from My Day", the `my_day_entries` table), the carried/today split, the recap, the snowball rule (8.1–8.2) | **No.** It is curated state, not a predicate |
| Tasks | Q2 | Folder-grouped triage of the undated; the Inbox block; per-group quick-add | Yes — `due: without`; the grouping is a rendering rule |
| Planned | Q3 + Q3C | Date-ordered agenda; the calendar with ghosts, zooms, 42-day month | Mostly — `due: with` for the list; the calendar is a *view*, which DES-137 now models (F3 already made Planned's toggle a ViewStrip) |
| Important | Q4 | Nothing structural. The inverted star tooltip (AC-099) and the important-on entry default (9.3) | **Yes, entirely** — `importantOnly` is already a filter switch, and Q1's own text calls the same predicate "a client-side filter; it changes no query" |
| All | Q5 | Nothing. Q5's rendering rule is "Planned rendered exactly as Q3 orders it, then Tasks rendered exactly as Q2 groups it. No third scheme exists" | It **is** the others' union, proved in 6.1 |
| Done | Q6 | Keyset pagination by 50, day grouping, "Mark as not done" with the G-SERIES confirm, and the page-level rule that no capture exists on it (AC-096) | **No.** Different query shape, different page contract |

## The MECE finding, stated exactly

The six are collectively exhaustive — 6.1's coverage corollary says so in as
many words ("every task row is visible somewhere… no status escapes every
page") — but they are exhaustive *as a set*, while presenting themselves as
peers. They classify by four different schemes at once:

- **by due date** — Tasks / Planned (this pair alone is MECE over open tasks,
  and 6.1 proves it);
- **by union** — All (the pair, undone);
- **by flag** — Important (orthogonal to everything);
- **by status** — Done (orthogonal again);
- **by curation** — My Day (orthogonal a third way).

A person who stars a dated task and pulls it into My Day sees it on My Day,
Planned, Important, and All simultaneously — four sidebar entries, one row.
That is not a bug; each page answers its own question. But a flat list of six
implies six comparable places, and only a taxonomy of *questions* (when? /
flagged? / finished? / chosen for today?) makes them comparable. The sidebar
flattens the taxonomy, which is the "not MECE" feeling named precisely.

## The spec has been conceding this since v1

Four places the specification already treats half the sidebar as optional:

- 9.7 gives Settings three toggles — Important, All, Done — with the note "My
  Day, Tasks, and Planned are always shown."
- 4.10 defaults `show_done` to **false**: Done ships hidden. The default
  sidebar has been five pages all along.
- AC-095 requires hidden pages to keep rendering at their URLs — "visibility
  is navigation preference only."
- The brief: "the sidebar must look right with 3 to 6 pages."

A page that a toggle can remove without loss is a page the product already
believes is a lens. The toggles are the six-page question, asked politely and
answered "user's choice" instead of being designed.

## What changed since the spec was written

The six were specified before Dana had any general instrument for narrowing a
list. v2 built the instruments:

- **One filter, every place-page** (DES-140): due (any / with / without /
  overdue), assignee, important-only, show-abandoned — with an active count on
  the window bar and one-press clear.
- **Views as a strip** (DES-137): List / Board / Calendar switching on the
  page, one component everywhere; F3 already moved Planned's mode toggle onto
  it.
- **One page composition** (DES-149): every place wears the same head, so
  pages no longer differentiate by layout — only by *content*.
- **Pages as places** (DES-141): covers and identity, which cuts the other
  way — v2 invested in pages being worth keeping. The investment transfers to
  whichever pages survive.

With those in place, three of the six pages are a stored filter press each:
Important = important-only; Planned's list = due-with; Tasks = due-without.
That is Imran's redundancy claim, and it is now true *because of v2's own
work* — it was not true when the spec was written.

## The honest counter-case

What is lost by folding pages into lenses, so the proposal is chosen with the
costs on the table:

- **A page is a stable place; a filter is session state.** Sidebar-Important
  is a zero-configuration glance. A filter must be set, shows as a count, and
  clears. (Mitigation: the un-star behaviour survives for free — un-starring
  under an active important-only filter removes the row from view, which is
  AC-055's behaviour re-derived. A "pinned filter" affordance could come
  later; it is deliberately *not* part of this proposal.)
- **Entry defaults.** 9.3 seeds capture differently per page — Planned's FAB
  seeds today, Important's seeds important-on. A merged page loses two seed
  rows. (Mitigation: section-context seeding survives — the folder page
  precedent — a Scheduled section's quick-add seeds today. The Important seed
  dies; it was worth little.)
- **Empty states teach.** "Give any task a due date and it moves here" is
  pedagogy for the home/view model. Fewer pages, fewer teaching moments.
- **Familiarity is an onboarding feature.** A To Do migrant recognises the
  sidebar instantly. Copying is a strategy, just an unchosen one.
- **My Day's inbound links.** The app name links to My Day, start_url is
  /app = My Day (10.6). Untouched by every option below — My Day stays.

None of these outweigh a sidebar whose entries answer the same question the
filter answers two centimetres away. One might, if Imran weighs it so:
the stable-place argument for Important. Option A exists for that weighing.

## The options

**Option A — keep six, change the defaults.** `show_important` and `show_all`
default to false alongside `show_done`; the shipped sidebar becomes My Day,
Tasks, Planned. Cheapest possible RFC (one 4.10 defaults row… which is a
frozen-section change, so in fact *not* cheap — 4 is frozen and defaults edits
take the always-an-RFC path anyway). Does not answer the naming point, keeps
the four-scheme flat list for anyone who toggles them back.

**Option B — three pages: My Day, Tasks, Done. Recommended.**

- **Tasks becomes the union page.** It renders what Q5 already specifies —
  "Planned" section in Q3's order, then the undated in Q2's folder grouping —
  which means the merged page needs *no new query, no new rendering rule*:
  it is All, wearing the name Tasks. The word "Tasks" stops meaning "undated"
  (a trap in the current naming: everywhere else in software, Tasks means
  tasks) and starts meaning every open task.
- **The calendar becomes a view on Tasks.** The ViewStrip offers List |
  Calendar; calendar renders Q3C exactly as Planned's does today, ghosts and
  all; the 9.5 rule that the mode persists client-side carries over. F3
  already built this strip — it moves pages, nothing more.
- **Important becomes the filter press it already is.** The star stays on
  every row; the star tooltip inversion (AC-099's outward form) moves to
  rows under an active important-only filter or retires with the page —
  RFC's choice.
- **My Day and Done stay**, because they are the two the lens cannot express:
  curation and history. The sidebar reads as three different *kinds* of
  answer — what I chose for today / everything open / everything finished —
  which is MECE at the level that was actually broken: the level of
  questions.
- **The Microsoft echo dissolves without a rename campaign.** My Day, Tasks,
  Done are generic English. "My Day" is kept deliberately: its carry-over
  mechanism is Dana's own, the name is truer than "Today" would be (a carried
  item is precisely *not* today's), and the term is load-bearing in frozen
  sections (the `my_day_entries` table, `GET /views/my-day`) where a UI
  rename would buy cosmetics at the price of a vocabulary split.

**Option C — two pages: My Day, Tasks.** Done folds into a collapsed
Completed section at the foot of the union page, which is *exactly the folder
page's grammar* (Q7: Scheduled, Unscheduled, Completed-collapsed) applied
globally — DES-149 taken to its conclusion, one page grammar everywhere. The
API even supports it: section 7 rules a completed cursor "portable between
GET /views/done and section=completed" because they page the same order.
Rejected as the recommendation for two reasons: an infinite, keyset-paginated
history inside a collapsible section is a scroll inside a scroll; and Done is
the one page with an emotional job — a record of finished work — that a
collapsed foot-section demotes. C stays on the table if Imran wants maximal
consolidation.

## What Option B costs, measured

**Frozen sections: zero edits.** Section 4 untouched (Option B, unlike A,
needs no defaults change — the pages the toggles govern stop existing, which
is a section-9 fact). Section 7 untouched: `/views/all` serves the merged
page, `/views/planned/calendar` serves the calendar view, and
`/views/tasks`, `/views/planned`, `/views/important` simply stop being
called — a frozen contract obliges the server to keep answering, not the
client to keep asking. The `show_important` / `show_all` / `show_done`
booleans of 7.2 become inert fields the API still carries; the RFC records
them as vestigial. AC-070's partition property is server-side and stays true
and pinned.

**Spec sections that change (none frozen):**

| Section | Change |
| - | - |
| 1 (scope) | The pages sentence and the feature list name three pages, not six |
| 2 (glossary) | "Home" retires or becomes internal; "View" narrows to My Day, Done |
| 6 | Queries stay defined (they are the API's); Q2/Q3/Q4 gain a note that no page renders them alone; 6.1's proof keeps its subject but its section names change |
| 9.1 | Sidebar order (three pages); the routes table — /app/tasks is the union page; /app/planned, /app/important, /app/all keep rendering (AC-095's own principle) as the union page with the corresponding view or filter preset; the region table (Tasks gains "Planned" + the folder groups; Important's and All's rows retire); quick-add placement |
| 9.3 | Entry defaults: the six-row table loses the Planned-list and Important rows; section-context seeding (the folder-page cell's rule) covers the Scheduled section |
| 9.4 | Untouched (My Day unchanged) |
| 9.5 | Rewritten around one page: sections, views, filter; Done's paragraph survives nearly verbatim |
| 9.7 | The Pages toggles retire (or reduce to Done); the note under them goes |
| 12 | ~12 criteria touched: AC-051/052 reword to sections of one page; AC-053 rewords; AC-054/055 become filter criteria or retire into the filter's own; AC-070 unchanged; AC-093 loses two rows; AC-095 rewrites to the redirect/preset rule; AC-096/056 unchanged (Done stays); AC-099 rewords or retires the outward tooltip |

**Production:** v1.0.0 shipped six pages and its suite asserts them; this
lands with the v2 port (the plan already reserves RFC 0004 for that), either
inside it or as its own RFC accepted first. Its own RFC is recommended — the
page structure is a product decision that deserves its own accept/reject
line, not a rider on a restyle.

**Prototype:** nothing built yet, deliberately — this document is the
research the instruction asked for. If Imran rules for B (or C), the next
design session draws the merged page behind a URL flag (`?nav=v2`, the
`?folder-page=v1` pattern) so the two sidebars can be compared by looking,
which is the plan's own rule for decisions of this size. The merged page's
body already exists in parts: All's two sections got F3's GroupHeadings, the
ViewStrip is built, the filter is built.

## The recommendation, in one paragraph

Take Option B. The sidebar becomes My Day / Tasks / Done over the folders —
chose-for-today, open, finished — three different kinds of answer, no page
expressible as a press of the filter that sits in the same window's bar. The
union page already exists in the spec under the name All with a proof of its
own completeness; the calendar and the folder-grouped triage survive as a
view and a section of it; Important survives as the filter switch it already
is plus the star on every row. My Day is untouched. Done is untouched. The
Microsoft vocabulary reduces to three generic words without renaming anything
that frozen sections carry. And the RFC touches no frozen surface.

## Process from here

1. Imran reads this and rules a direction (A / B / C / keep six as they are).
2. If B or C: a design session draws it behind `?nav=v2`; Imran judges by
   looking; the register records it as a DES entry chain.
3. The spec change goes as its own RFC — Draft against the sections table
   above, Accepted by Imran — ~~sequenced before V9's reference set so the
   handoff captures one navigation, not two~~. **Superseded 2026-08-22: the
   RFC comes after the design phase, not before V9. Its own RFC still stands;
   only the timing was wrong. See the addendum at the foot of this file.**
4. Until the RFC is Accepted, the six pages stand in spec and prototype
   alike; DES-152 in the register carries the OPEN marker so no session
   mistakes this proposal for a decision.

## Addendum, 2026-08-21: Imran's answer — Option D, the axis sidebar

Imran read the options and answered with a fourth shape, his own, recorded
here in his structure with the studio's evaluation under it. His words,
compressed: rename My Day (it is the copied name), and widen it into a page
where a user views tasks *for this day, for tomorrow, for my week, my month,
even my year* — which absorbs Planned and removes that redundancy. A page for
the assignee axis: tasks assigned to me, or to another person in my circle.
Importance as another factor. One for totality. And the system pages exist
precisely so a person does *not* reach for the filter for the big questions —
"instead of adjusting filters, a user already has access to the tasks based
on the important factors."

**Option D — one page per axis, each page scoped within its axis:**

| Page (name open) | Axis | Inside the page | Today's pages it absorbs |
| - | - | - | - |
| *Agenda?* (renamed My Day) | **When** | Scope ladder: Today · Tomorrow · Week · Month · Year — list at every stop, calendar view where the zoom has one | My Day + Planned, list and calendar |
| *Assigned?* | **Who** | Scope: Me · each person in the circle · Unassigned | None — this page is new |
| Important | **Flag** | The starred set, as today | Important |
| *Everything?* | **Totality** | Every open task; the union grammar Q5 already specifies | All (and Tasks, as its undated half) |

Folders stay below as places. The filter (DES-140) stays on every page as the
ad-hoc instrument; the pages are the *pre-set* lenses. That division — an
axis earns a page, a predicate combination earns a filter press — is the rule
Option B lacked, and it answers the counter-case's stable-place argument
instead of losing to it.

**Why this is stronger than B where it differs.** It fixes the true MECE
break the same way — Tasks/Planned were two *values* of one axis promoted to
two pages, and D collapses them into one page with a scope control — but it
keeps one-press access to the axes people actually think in. The sidebar
becomes four different *questions* (when / who / flagged / everything), which
is MECE at the level of questions, the only level a multi-axis product can
have: one task still appears on several pages, because each page answers a
different question about it, and that is now a feature with a reason rather
than an accident with four names.

**The four questions the drawing must answer** — real tensions, not details,
found by holding D against the spec:

1. **Is the When-page personal or shared at every scope?** Today's My Day is
   *mine* — assigned to me or pulled by me (Q1), with the carry-over. Today's
   Planned is *everyone's* — every accessible dated task (Q3). Merging them
   forces the question: does Agenda@Week show my week or the household's
   week? The honest default: Today keeps Q1 whole (curation, carried, recap —
   the pull machinery is frozen API and survives any rename), wider scopes
   show all accessible as Planned does, and the Who-page's "Me" scope is
   where "my week" lives. But that makes Today the one personal stop on a
   shared ladder — defensible (today *is* personal; it is the working day)
   and it must be decided by looking, both ways drawn.
2. **Where do undated tasks live on a time axis?** Nowhere, by definition —
   unless the ladder ends in a "No date" stop (the Things "Anytime" pattern),
   which would make the When-page exhaustive over open tasks. Otherwise the
   undated live only in Everything and the folders. Draw both.
3. **Where does Done go?** D's four axes have no status axis. Either Done
   stays as a fifth page (history is its own kind of answer), or Everything
   takes the folder-page grammar globally — Scheduled, Unscheduled, Completed
   collapsed — and Done retires into it (the old Option C move; the API's
   portable completed-cursor makes it feasible). The studio still leans
   toward keeping Done: a paginated history inside a collapsible is a scroll
   inside a scroll.
4. **Is the Who-page the existing People screen grown up, or a new page?**
   9.8's People screen is connection *management* (roster, invites). A
   tasks-by-person page could extend it — one page about people — or stand
   alone and keep management where it is. Feasibility either way: no
   assignee-view endpoint exists in frozen 7, and none is needed — Q5's cards
   carry the assignee, so the page is a client-side composition at v1 scale.

**Feasibility notes, so the draw does not trip on them.** Year scope cannot
be a calendar grid: Q3C refuses ranges over 62 days and the spec cut year
zoom deliberately ("hundreds of markers with no designed density rendering") —
so Year is a list grouped by month, from Q3, which the 1000-cap covers at v1
scale. The invite gate is spec'd as a section of My Day, so it rides at the
top of whatever the When-page becomes at /app. And the rename touches UI copy
only: `my_day_entries`, the pull endpoints and `/views/my-day` are frozen
internals that keep their names, exactly as `?folder-page=v1` kept old keys.

**Names, offered not decided.** For the When-page: **Agenda** (the studio's
tentative pick — a time word at every zoom, owned by no to-do app), Schedule,
Planner; *Upcoming* is declined as Todoist's word, *Today* as false at year
scope. For the Who-page: **Assigned**, or fold into People. For totality:
**Everything**, or All tasks. Important keeps its generic English name.

Status: **D is the working direction, not a ruling** — Imran offered it with
"maybe I'm wrong" attached, which is what the by-looking rule is for. Next
step unchanged in kind from the review's process section: draw D behind
`?nav=v2` with questions 1–4 as the draw's agenda, then the RFC once his eye
has ruled.

## Addendum, 2026-08-22: the RFC's sequencing, corrected

Imran, at the close of F6: "Isn't RFC after the V steps?"

He is right, and this document's process section is superseded on that one
point. Item 3 above sequences the spec change **before V9's reference set**,
"so the handoff captures one navigation, not two". That reason does not hold:

- **V9 produces design records, not spec.** Its output is the reference
  captures, the "ground ready" note, `design-contract.md` and
  `screen-registry.csv` — none of which reads or writes `docs/spec/`. And the
  captures come from the prototype, which draws one navigation whether or not
  the spec has been edited. The stated reason was true of the prototype rather
  than of the RFC, so it argued for drawing the model early — which was done at
  F4 — and not for writing spec text early.
- **The plan keeps normative material out of the design phase**, and B3 on its
  rulings track is the precedent: spec 9.4's edit is decided, and what is owed
  is the sentence "before the port to `app/`", not before V9.
- **RFC 0002 is the precedent one level up.** The v1 design's whole spec delta
  — 9.1 through 9.8, 11.4, 11.13, 12 and 13 — lived inside the *port* RFC,
  written once the design was settled. The v2 plan charters RFC 0004 to mirror
  that machinery.

And the reason that decides it today: **the design is not approved.**
Twenty-eight rulings from F5 and F6 are still awaiting Imran's eye. Normative
text written against a drawing that may still move is how a specification comes
to describe a design that changed underneath it.

**What survives unchanged** is the review's actual recommendation: it should be
**its own** RFC, with its own accept/reject line, rather than a rider on a
restyle. That was always an argument about separateness, not about timing. So
the corrected sequence is: the design phase closes (V8, V9, V10) → the
navigation RFC, on its own → RFC 0004 and the port.

Item 4 stands as written: until that RFC is Accepted, the six pages remain the
specification, whatever the prototype draws.
