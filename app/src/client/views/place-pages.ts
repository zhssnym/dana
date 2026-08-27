/*
The place-pages of 9.4 and 9.5, as one table: what each one is, which views it
can honestly draw, where it captures, and what a task made on it carries.

**This table exists because DES-182 found the fault of not having it.** "The
spine's unnamed else-branch got a name in the process: three places were
spelling out 'not any of the others' by hand, which is why nothing had ever
compared the defaults to the spine." The bug that made it visible was a task
made on Today never appearing on Today, and it was invisible for the same
reason it was possible: the floating button, the quick-add and the board
column each decided the defaults for themselves. Here they are decided once,
and 9.1's own sentence is the test of them: "every capture creates the task
with the entry defaults of 9.3 for where it stands, so a task made on a page
appears on that page."

**Which views a page offers is DES-177's rule and not a preference.** A page
either pins a value on an axis or spans it, and arranging by an axis the page
has pinned gives one group, "which is a list wearing a different control: a
calendar of Today is a single cell". So the calendar belongs to Scheduled
alone, because having a date is what puts a task there; list is the ground and
is offered everywhere; and board is offered wherever a page can be grouped,
which is everywhere, because the folder is the one categorical value every
task always has.

**The capture column is 9.1's list read as a list.** "The floating 'Add task'
button appears only on the pages with no capture affordance of their own,
Today, Important, and Assignments, and never on Done or Abandoned." AC-096
asserts that as three presences against seven absences precisely because an
implementation reading it as a mood passes the shorter test.
*/
import type { LucideIcon } from '../lib/icons.js'
import {
  Ban,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  Layers3,
  Star,
  SunMedium,
  UserRoundCheck,
} from '../lib/icons.js'
import { paths } from '../routes.js'
import type { GroupBy } from './filter.js'
import type { ViewMode } from './view-mode.js'

/**
 * The place-pages this table draws.
 *
 * **`folder` joined them at S17b, and the sentence this replaces said it would
 * not:** "Desk and a folder are 9.6's, not here." That held while the folder
 * page had no view strip and no window-bar filter, which is what the parity
 * audit records against it, "the board view entirely: no view strip, no
 * window-bar filter, DES-132's two-column board". 9.6 asks for all three, "the
 * filter of 9.1 narrows the page without touching its arrangement", so a
 * folder page is a place-page in every sense this table means and keeping it
 * out is what left it with none of the shared behaviour.
 *
 * What stays 9.6's is everything that needs the folder's own id: its capture
 * writes that folder, its filter is remembered per folder rather than per
 * kind, and its head is the identity head. `usePlace` takes those as options
 * for that reason, and the spine below carries only what is true of every
 * folder page.
 */
export type PlaceKey =
  | 'today'
  | 'scheduled'
  | 'assignments'
  | 'important'
  | 'all'
  | 'done'
  | 'abandoned'
  | 'anytime'
  | 'folder'

/** Where a page's one always-visible capture point is, or that it has none. */
export type CaptureKind = 'floating' | 'inline' | 'none'

export interface PlaceSpine {
  readonly key: PlaceKey
  /** 9.1's page block name, which is what a criterion addresses. */
  readonly name: string
  readonly path: string
  /** DES-152's question, drawn as the head's prose line. */
  readonly question: string
  readonly icon: LucideIcon
  readonly views: readonly ViewMode[]
  readonly capture: CaptureKind
  /**
   * What a board groups by when nobody has said. DES-182: "the page's own
   * spine where the page spans a categorical axis, which is Assignments and
   * people; and the folder everywhere else."
   */
  readonly boardAxis: Exclude<GroupBy, 'none'>
}

const LIST_AND_BOARD: readonly ViewMode[] = ['list', 'board']

export const PLACES: Record<PlaceKey, PlaceSpine> = {
  today: {
    key: 'today',
    name: 'Today',
    path: paths.today,
    question: 'What I am doing today',
    icon: SunMedium,
    views: LIST_AND_BOARD,
    capture: 'floating',
    boardAxis: 'folder',
  },
  scheduled: {
    key: 'scheduled',
    name: 'Scheduled',
    path: paths.scheduled,
    question: 'Everything with a date',
    icon: CalendarDays,
    views: ['list', 'board', 'calendar'],
    capture: 'inline',
    boardAxis: 'folder',
  },
  assignments: {
    key: 'assignments',
    name: 'Assignments',
    path: paths.assignments,
    question: "Who's carrying what",
    icon: UserRoundCheck,
    views: LIST_AND_BOARD,
    capture: 'floating',
    boardAxis: 'person',
  },
  important: {
    key: 'important',
    name: 'Important',
    path: paths.important,
    question: 'Starred tasks',
    icon: Star,
    views: LIST_AND_BOARD,
    capture: 'floating',
    boardAxis: 'folder',
  },
  all: {
    key: 'all',
    name: 'All',
    path: paths.all,
    question: 'Every task, finished ones included',
    icon: Layers3,
    views: LIST_AND_BOARD,
    capture: 'inline',
    boardAxis: 'folder',
  },
  done: {
    key: 'done',
    name: 'Done',
    path: paths.done,
    question: 'Everything you have finished',
    icon: CheckCircle2,
    /*
    List alone, and the omission is dated rather than a reading of DES-177.
    Done draws `DoneRow` and every other page draws `TaskRow`, which 11.15
    records as the duplication to reunify and RFC 0004 assigns to S11 as "one
    task-row implementation total". A board here would have to pick one of the
    two now, on a package that owns neither, and whichever it picked would be
    the second implementation S11 then has to unpick. Board arrives with the
    reunion; nothing asserts it today.
    */
    views: ['list'],
    capture: 'none',
    boardAxis: 'folder',
  },
  abandoned: {
    key: 'abandoned',
    name: 'Abandoned',
    path: paths.abandoned,
    question: 'Things you decided not to do',
    icon: Ban,
    views: LIST_AND_BOARD,
    capture: 'none',
    boardAxis: 'folder',
  },
  anytime: {
    key: 'anytime',
    name: 'Anytime',
    path: paths.anytime,
    question: 'No date on it, whenever you get to it',
    icon: CalendarX,
    views: LIST_AND_BOARD,
    capture: 'inline',
    boardAxis: 'folder',
  },
  /*
  The folder page (9.6), added at S17b.

  **Its board axis is the date and not the folder**, which every other row
  here uses, and DES-177 is why rather than taste: "a page either pins a value
  on an axis or spans it, and arranging by an axis the page has pinned gives
  one group, which is a list wearing a different control". A folder page has
  pinned the folder, so a board grouped by it is one column, which is the
  degenerate case that rule exists to refuse. The date is the axis such a page
  actually spans.

  **Its name, question, path and capture are placeholders and are never
  read.** The folder page draws 9.6's identity head rather than a place head,
  its address carries an id this table cannot know, and its capture is the
  quick-add that writes its own folder. `usePlace` takes the capture as an
  option and the page supplies its own; these three fields are here because
  the shape requires them, and a reader should not go looking for where they
  are used.
  */
  folder: {
    key: 'folder',
    name: 'Folder',
    path: '',
    question: '',
    icon: Layers3,
    views: LIST_AND_BOARD,
    capture: 'inline',
    /*
    **The folder board's columns are its sections** (item 44's B2, ledger
    L-044), which is better than either option the rulings sheet offered: it
    framed the question as sections against date, and the ruling makes sections
    the unfiltered arrangement and the date board one of the filter's group-by
    values. So this is the axis the page opens on and `filter.groupBy` still
    overrides it, exactly as it does on every other place page.

    What this replaces said "the board's axis is the date rather than the
    folder, and DES-177 is the reason: a folder page has pinned the folder, so
    grouping by it gives one column". Both halves of that survive, the folder
    axis is still wrong here and for the same reason; what changed is that
    there is now a third answer that is the page's own arrangement.
    */
    boardAxis: 'section',
  },
}

/** The place a path is, or null where the path is not a place-page. */
export function placeAt(pathname: string): PlaceSpine | null {
  for (const spine of Object.values(PLACES)) {
    if (spine.path === pathname) return spine
  }
  return null
}

/**
 * A column's own value, which a capture inside it writes over the page's
 * defaults (DES-182: "capture in a column means capture with that column's
 * value"). A column that is a relation rather than a value carries none, and
 * Overdue is the case that sentence names.
 */
export interface ColumnValue {
  readonly folder_id?: string
  readonly assignee_id?: string | null
  readonly due_date?: string | null
  /**
   * 4.5's section, added at S26 for item 44's B2.
   *
   * Null is the loose list, which is 9.6's own name for the tasks under no
   * section, and is a value rather than an absence: dropping a card out of a
   * section has to write something.
   */
  readonly section_block_id?: string | null
}

/** What a capture writes: the POST body fragment, and Today's own extra act. */
export interface CaptureDefaults {
  readonly folder_id?: string
  readonly due_date?: string | null
  readonly important?: boolean
  readonly assignee_id?: string | null
  /**
   * Today's spine is a Today entry, and no field of 7.6's body writes one, so
   * the capture posts the task and then pulls it (7.8). This is the flag that
   * says so, and the reason AC-221 asserts the row on Today after a reload
   * rather than only inside the column it was typed in.
   */
  readonly pullIntoToday: boolean
}

/**
 * 9.3's entry table, keyed by the page a person is standing on.
 *
 * The rows this returns are that table's, and the ones it does not return are
 * the ones another surface owns: a calendar cell passes its own day, a folder
 * page passes its own folder, and a section passes both (S12). What is fixed
 * here is the page's part, and a column's value is layered over it, which is
 * DES-182's "the page's own entry defaults ride underneath".
 */
export function captureDefaults(
  place: PlaceKey,
  today: string,
  column?: ColumnValue,
): CaptureDefaults {
  const base = placeDefaults(place, today)
  return {
    ...base,
    ...(column?.folder_id === undefined ? {} : { folder_id: column.folder_id }),
    ...(column?.due_date === undefined ? {} : { due_date: column.due_date }),
    ...(column?.assignee_id === undefined ? {} : { assignee_id: column.assignee_id }),
  }
}

function placeDefaults(place: PlaceKey, today: string): CaptureDefaults {
  switch (place) {
    /* Today: dated today, and the membership its spine actually is. */
    case 'today':
      return { due_date: today, important: false, pullIntoToday: true }
    /* Scheduled: dated today, which is the only thing that keeps a task made
       here on the page it was made on (Q3 admits dated rows only). */
    case 'scheduled':
      return { due_date: today, important: false, pullIntoToday: false }
    /* Important: the flag, and no date, because starring is not scheduling. */
    case 'important':
      return { due_date: null, important: true, pullIntoToday: false }
    /* Assignments: assigned to the viewer. 7.6 defaults `assignee_id` to the
       caller when a body carries none, and Desk is single-member so the
       forcing lands on them either way, which is why this row writes no
       assignee of its own rather than restating the server's rule. */
    case 'assignments':
      return { due_date: null, important: false, pullIntoToday: false }
    /* All and Anytime: Desk and undated, 9.3's first row. Done and Abandoned
       capture nowhere and never reach this, and the branch is here rather
       than thrown from because an unreachable throw is a crash waiting for a
       future page. */
    case 'all':
    case 'anytime':
    case 'done':
    case 'abandoned':
      return { due_date: null, important: false, pullIntoToday: false }
    /* A folder page's capture is the page's own, because the one thing it
       writes is a folder id this table cannot know. `usePlace` takes it as an
       option and the folder page supplies it, so this branch is reached only
       by a board column's capture on that page, whose column value rides over
       it. Undated and unstarred is 9.3's first row, which is the right floor
       for it. */
    case 'folder':
      return { due_date: null, important: false, pullIntoToday: false }
  }
}

/**
 * The same defaults as the task surface takes them, for the floating button.
 *
 * The surface is opened rather than posted to, so the membership half cannot
 * ride along: the pull needs the id of a task that does not exist yet, and
 * the surface is the Complex Interaction engineer's. It costs nothing on the
 * three pages the button is on: Today's date and the viewer's own assignment
 * put the task on Today by 6 Q1's automatic clause, which is why AC-093 reads
 * the date here and AC-221 reads the membership at the capture that can write
 * it.
 */
export function surfaceDefaults(
  place: PlaceKey,
  today: string,
): { due_date: string | null; important: boolean } {
  const defaults = placeDefaults(place, today)
  return {
    due_date: defaults.due_date ?? null,
    important: defaults.important ?? false,
  }
}
