/*
The navigation model: which pages the sidebar offers, and what each one asks.

DES-152, ruled by Imran 2026-08-21 after the research in
`docs/design/six-pages-review.md`. The six pages Dana shipped mixed four
classification schemes and presented them as peers, which is the "not MECE"
complaint stated precisely: Tasks and Planned were two *values* of one axis
promoted to two pages, All was provably their union (spec 6.1), and Important
was one predicate the window bar's filter already carries as a switch.

The replacement is **one page per question**:

    Desk          nothing decided about it yet
    Today         what am I doing today
    Scheduled     when is it due
    Assignments   who is carrying it
    Important     is it starred
    All           everything, completed included

Done is a sixth shipped view that ships **unpinned** — reachable from
Settings, absent from the sidebar — which is what `user_settings.show_done`
already does today.

**Each page locks its own axis and frees the others** (Imran's rule): a page's
identity is its spine, not a filter setting, so no page can be turned into
another by adjusting controls, while every other axis stays adjustable so the
page is still useful. Only All locks nothing. This is also the category's own
practice — Todoist's built-in views cannot be edited as filter queries, while
user-made filters can.

**Why Today and Scheduled are two pages rather than one zoom.** Microsoft's
users are documented as confused by My Day versus Today, because one is
curated and one automatic and the names do not say which; Dana's own Q1 mixes
exactly those two mechanisms. The finding that settled it: *mixing sources is
fine, mixing questions is not.* Today holds what is due today, what carried
over and what was pulled in — three sources, one question — and stays honest
only because the deadline question lives next door. Collapsing them would
rebuild the confusion and cost the pull.

**Names.** The principle, after three rounds failed: there is a difference
between copying a coinage and using the common word. "My Day" and "Assigned to
me" are Microsoft's inventions; "Today", "Scheduled", "Important" and "All"
are ordinary English that Apple also uses because they are the plainest words
available. Desk replaces Inbox (Imran: Inbox carries email posture, and most
of what lands there you wrote yourself); Assignments replaces the People
candidate, which "conveys a message of community and connections, not
assignations" and would have collided with the footer's People screen.

**Names never change; scope controls do.** A sidebar entry is always static —
it is the navigation anchor — while the value it is currently showing lives in
a scope control in the window bar. That is why the pages are named for their
*axis* rather than for a value of it.

This module is fixtures-and-presentation only. The whole model is a spec
change (sections 1, 2, 6, 9.1, 9.3–9.5, 9.7 and about a dozen criteria) and
goes as its own RFC once Imran has looked at the drawing; frozen sections 4
and 7 take zero edits, since `/views/all` serves All, `/views/planned` serves
Scheduled, `/views/my-day` serves Today, and Assignments is a client-side
composition over cards that already carry their assignee.
*/

import {
  Ban,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  Contact,
  Layers3,
  Star,
  SunMedium,
  Settings,
  Trash2,
  UserRoundCheck,
  type LucideIcon,
} from "@/lib/icons"
import { folderGlyph } from "@/components/folder-icon-picker"

/* Desk is a folder, so its mark comes from the one resolver every other
   surface asks rather than from an icon imported here — that split is exactly
   why Desk wore a tray in the sidebar and a plain folder on task chips. */
const DeskIcon = folderGlyph(undefined, "Desk")

export type NavPageName =
  | "Desk"
  | "Today"
  | "Scheduled"
  | "Assignments"
  | "Important"
  | "All"
  | "Done"
  | "Abandoned"
  | "Anytime"

export interface NavPage {
  name: NavPageName
  icon: LucideIcon
  /* The one axis this page locks. `null` on All, which locks nothing — the
     deliberate no-axis page, and the ground truth the others are windows on. */
  spine: "folder" | "day" | "date" | "assignee" | "importance" | "status" | null
  /* What the page answers, in the person's own words. Shown as the page
     description under its title, and the reason the page exists. */
  question: string
  /* Ships pinned to the sidebar? Done does not (DES-152, and
     `user_settings.show_done` already defaults false today). */
  pinned: boolean
  /*
  Can it be unpinned at all?

  Imran, 2026-08-22: "'Desk' should not be disabled or hided from the
  sidebar." He is right and the reason is structural rather than a
  preference: Desk is the default folder, the destination every entry default
  in spec 9.3 names, and where a task goes when nobody chose. A person who
  hid it would still be filling it, with no way back to what they had filed.
  A place you cannot stop using is a place you cannot be allowed to lose.

  Everything else is a view over tasks that exist elsewhere too, so hiding
  one costs nothing but the shortcut.
  */
  hideable?: boolean
}

export const NAV_PAGES: NavPage[] = [
  {
    name: "Desk",
    icon: DeskIcon,
    spine: "folder",
    question: "Nothing decided about it yet",
    pinned: true,
    hideable: false,
  },
  {
    name: "Today",
    icon: SunMedium,
    spine: "day",
    question: "What I am doing today",
    pinned: true,
  },
  {
    name: "Scheduled",
    icon: CalendarDays,
    spine: "date",
    question: "Everything with a date",
    pinned: true,
  },
  {
    name: "Assignments",
    icon: UserRoundCheck,
    spine: "assignee",
    question: "Who's carrying what",
    pinned: true,
  },
  {
    name: "Important",
    icon: Star,
    spine: "importance",
    question: "Starred tasks",
    pinned: true,
  },
  {
    name: "All",
    icon: Layers3,
    spine: null,
    question: "Every task, finished ones included",
    pinned: true,
  },
  {
    name: "Done",
    icon: CheckCircle2,
    spine: "status",
    question: "Everything you have finished",
    pinned: false,
    hideable: true,
  },
  /*
  The two views added at F5, and the one deliberately not added.

  Imran asked for **Completed** and **Abandoned** pages, off by default and
  switched on from Settings, plus **Anytime**.

  **Completed is Done.** Dana has three task states — pending, completed,
  abandoned — and Done already *is* the completed one; spec 9.5 names it,
  `user_settings.show_done` already ships it unpinned. Two entries for one
  state is the exact fault this navigation model was built to remove, and it
  would be a worse instance than the six-page one because the two would sit
  next to each other in the same list. Done keeps the name it has: the row's
  verb is "Complete" and the page of finished work is "Done", which is how
  ordinary English uses the pair.

  **Abandoned is genuinely missing.** It is the one state with no home at all:
  a task you have given up on is neither pending nor finished, it is filtered
  out of most pages, and the only way to see one has been to know where it
  was. Off by default, because a list of things you decided not to do is not
  something most people want in their sidebar.

  **Anytime** is the undated work. DES-152 considered it as a *page* and
  rejected it — "Planned + Tasks reborn" — and that ruling stands for the
  pinned set. As an unpinned view it is a different proposition: a shipped
  saved view over one value of the date axis, opt-in, and the first thing in
  the product to demonstrate what DES-153 means by "a page is a view". If
  nobody turns it on it costs nothing, which is precisely what the earlier
  objection could not say about a seventh sidebar row.
  */
  {
    name: "Abandoned",
    icon: Ban,
    spine: "status",
    question: "Things you decided not to do",
    pinned: false,
    hideable: true,
  },
  {
    name: "Anytime",
    /* A calendar with an X, which is the filter's own "No due date" and the
       other value of the axis Scheduled's calendar carries. It wore All's
       `Layers3` for one revision — Imran spotted it in the sidebar, where
       every view is on screen together and a shared mark reads as a repeated
       row. The audit checks this now (`one-page-one-mark`). */
    icon: CalendarX,
    spine: "date",
    question: "No date on it, whenever you get to it",
    pinned: false,
    hideable: true,
  },
]

/*
Scheduled's scope ladder. Imran's "do it today / this week / this month / this
year", as a control rather than as four pages — the stops are values on one
axis, and a value earns a control while an axis earns a page.

Cumulative from today for the wider stops, because that is how people read
them: "this week" includes today, "this month" includes this week. Overdue
work pins above every stop, which is Dana's carry-over showing through.

Year is a list grouped by month and never a calendar grid: Q3C refuses ranges
over 62 days, and spec 9.5 cut year zoom deliberately because projecting a
daily rule at year scale produces "hundreds of markers with no designed
density rendering".
*/
/*
The two screens under the folders, which are not views over tasks.

They lived as literals in the sidebar's footer, which is why the audit's
"no two views wear the same mark" rule could not see them — it reads this
file and they were not in it. People and Assignments then spent a stretch
wearing two glyphs of the same family with nothing able to say so.

They are deliberately not `NAV_PAGES`: neither is a view over tasks, neither
can be pinned or unpinned, and neither belongs in Settings' pin list. What
they share with a page is a name and a mark, which is exactly the pair the
collision rule cares about.
*/
/*
The footer's destinations, and why Trash is one of them.

A destination is somewhere you *go*; an action is something you *do*. Trash is
the first — you visit it, look around, and come back — which is why it sits
here beside People and Settings rather than as a button in the row above them,
where New folder lives. Placing it by role rather than by novelty is also what
keeps the footer legible as it grows: everything in this list answers "take me
somewhere", and everything above it answers "make something".
*/
export const FOOTER_PAGES: {
  name: "People" | "Settings" | "Trash"
  icon: LucideIcon
}[] = [
  { name: "People", icon: Contact },
  /* Trash moved up into the footer's own row of three (DES-209), where Imran
     asked for it. It keeps its entry in this union because it is still a page
     the shell routes to and the collision rule still has to see its mark. */
  { name: "Settings", icon: Settings },
]

/* Every page with a mark, including the ones no list draws. The collision rule
   and `pageGlyph` both need the whole set, not the drawn subset. */
export const TRASH_PAGE = { name: "Trash" as const, icon: Trash2 }

export type ScheduledScope = "today" | "week" | "month" | "year"

export const SCHEDULED_SCOPES: { key: ScheduledScope; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
]

/* The drawing rides a flag so the two sidebars can be compared by looking,
   which is this plan's rule for a decision of this size — the same instrument
   `?folder-page=v1` was. It leaves when Imran's eye rules. */
/*
**The new navigation is the default; the old one is the instrument.**

It shipped the other way round for one stretch and that was simply wrong: the
model is ruled (DES-152), the drawing is what Imran is reviewing, and a
prototype whose plain URL shows the superseded design makes every reviewer
carry a flag they have to be told about. It also broke the shared build, where
the link opened on the sidebar the work had already replaced.

So it now matches how this plan has always handled a superseded design —
`?folder-page=v1` for the previous folder page, `?measure=wide` for DES-023's
width. The current design is what you get; the thing it replaced is what you
ask for. `nav=v1` is read from the query or the hash, the hash because some
hosts keep the fragment and drop the search string.
*/
export function readNavModel(): "v1" | "v2" {
  if (typeof window === "undefined") return "v2"
  if (new URLSearchParams(window.location.search).get("nav") === "v1") return "v1"
  return window.location.hash.replace(/^#/, "") === "nav=v1" ? "v1" : "v2"
}

/*
The sentence under a page's title, from one place.

Imran, 2026-08-22: every native page should carry "a short, memorable, catchy
and natural sentence" a person can edit later. Each screen was hardcoding its
own, while `NavPage.question` above declared one and was read by nothing — so
the page's own description of itself existed twice and agreed by luck.

`question` is the source, and a screen asks for it by name rather than
carrying a string. Editing is built, as `PageHead`'s `PageDescription` — the
folder page's own control, shared rather than copied. It is Lane 2 the same way
a folder's description is (DES-130): there is no column for it, so a person's
wording sits in the prototype's identity store and clearing it brings this
sentence back.
*/
export function pageQuestion(name: string): string | undefined {
  return NAV_PAGES.find((page) => page.name === name)?.question
}

/*
The mark a page wears, from the one list the sidebar draws.

Search needed it and could have imported an icon of its own, which is how a
folder ended up wearing a tray in one place and a plain folder in another
([[DES-155]]). One resolver, asked by everybody.
*/
export function pageGlyph(name: string): LucideIcon | null {
  if (name === TRASH_PAGE.name) return TRASH_PAGE.icon
  return (
    NAV_PAGES.find((page) => page.name === name)?.icon ??
    FOOTER_PAGES.find((page) => page.name === name)?.icon ??
    null
  )
}
