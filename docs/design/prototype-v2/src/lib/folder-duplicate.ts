/*
What a copy of a folder is.

Imran, 2026-08-23: "When a folder is duplicated, the duplicated folder does not
carry the tasks, sections, text, and the data. I think if they exclude the chat
and members it's good, but other data should be duplicated with it. 'Due dates'
are also something that you should decide."

He is right, and the first version's reason for skipping the contents — that
this prototype had no folder-to-task ownership to walk — was a plumbing excuse
rather than a design one. It was also just wrong: a task carries `folder`, and
the sections have been in a store since DES-168. A folder that copies only its
glyph and colour is not a duplicate, it is a new folder wearing the original's
costume, and the thing people duplicate a folder *for* is the structure inside.

**One rule decides everything that does not copy: a grant is not a thing.**

Members, sharing and the conversation are the obvious cases, and Imran named
them. But the rule is worth stating in this form because it settles the case he
did not name and that I would otherwise have got wrong: **an assignee is a
grant too.** Copying the folder would have handed Sara eight new tasks she
never accepted, and in the ported product it would have sent her eight
notifications for a folder she has never seen. So the copy's work is the
duplicator's, unassigned, and one principle covers members, sharing and
assignment rather than three remembered exceptions.

**But a grant not travelling is not the same as the work becoming nobody's.**
The first version cleared the assignee to empty, which contradicted the sentence
above it — if the copy's work is the duplicator's, then the duplicator is who it
is assigned to. Empty meant the copy appeared in *nobody's* Assignments,
including the copier's, so a folder duplicated to run again produced eight tasks
that no page about people would ever show. Sara's grant does not travel; the
work lands on whoever made the copy. Importing a workflow already behaved this
way, which is how the two were found to disagree.

The conversation is excluded for a second reason worth keeping separate: a
message is something a person *said*, at a time, to someone. Copying it puts
their words in a room they were never in.

**And a duplicate arrives unstarted.** This is the other thing nobody asks for
and everybody wants: duplicate a folder that is eight-of-twelve done and the
copy arrives eight-of-twelve done, so the first thing you do is uncheck eight
things. In practice a folder is duplicated to *run the same shape again* — a
trip, a launch, an onboarding — so the copy takes the structure and none of the
progress. Completed and abandoned both reset; so do the steps inside a task.

**Due dates: shifted, not copied, and only when they are spent.**

Copying them verbatim is the worst of the three options and the one that comes
free — duplicate last April's trip and every row arrives red, a brand-new
folder that is entirely overdue before you have touched it. Dropping them is
safe and throws away the most useful thing a template has: the *shape* of the
plan, that booking came six weeks before packing.

So the intervals are kept and the whole plan is re-anchored to today, which
preserves the shape and tells no lies. The condition is what stops it being too
clever: **only when the folder's earliest date has already passed.** Dates
still ahead are a live plan, and moving those would be the surprise. Spent
dates are a template, and leaving those is the surprise. One test separates
them, and the bar says which happened, so it is never silent.
*/

import { readFolderLayout, saveFolderLayout } from "@/lib/folder-layout"
import { dueLabelFor, parseIsoDate } from "@/lib/task-model"
import { VIEWER_NAME } from "@/lib/viewer"

/*
The least a task must be for this to copy it.

Structural rather than the screen's `ShellTask`, because that type lives in
shell-page and a lib that imported it would close a circle. Generic, so the
caller gets its own concrete type back rather than this shrunken one.
*/
export interface DuplicableTask {
  id: string
  status?: "pending" | "completed" | "abandoned"
  completedAt?: string
  folder?: { name: string; color: string }
  /* The row's *drawn* deadline, which is a second copy of `form.dueDate` —
     see the note on rebuilding it below. */
  due?: { label: string; overdue?: boolean }
  assignee?: { initials: string; name: string; image?: string }
  steps?: { complete: number; total: number }
  /* Pulled into today, and how many people have said something. Both are
     cleared on a copy; see the note where that happens. */
  pulled?: boolean
  myDayGroup?: "carried" | "today"
  hiddenFromMyDay?: boolean
  /* Whatever shape the surface uses — this only ever clears it. */
  comments?: unknown
  form: {
    id: string
    title?: string
    folder: string
    assignee: string
    dueDate: string
    steps: Array<{ id: number; title: string; done: boolean }>
    completedAt?: string
    completedBy?: string
    createdAt?: string
    createdBy?: string
    invitePending?: string
  }
}

const DAY = 24 * 60 * 60 * 1000

function parseDay(value: string) {
  /* `YYYY-MM-DD`, the one format every fixture and every picker writes. */
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function formatDay(at: number) {
  const date = new Date(at)
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0")
  const day = `${date.getUTCDate()}`.padStart(2, "0")
  return `${date.getUTCFullYear()}-${month}-${day}`
}

function today(now: number) {
  const date = new Date(now)
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

/*
How far the whole plan moves, in days.

Zero when there is nothing to move or nothing is spent, and the caller uses
that zero to decide whether to mention it.
*/
export function dueShiftFor(tasks: DuplicableTask[], now = Date.now()) {
  const days = tasks
    .map((task) => parseDay(task.form.dueDate))
    .filter((day): day is number => day !== null)
  if (!days.length) return 0
  const earliest = Math.min(...days)
  const start = today(now)
  /* Ahead of today: a live plan, left exactly where it is. */
  if (earliest >= start) return 0
  return Math.round((start - earliest) / DAY)
}

/*
The copy of one folder's contents, as tasks to add.

Writes the section layout itself — it has to, because the sections and the
tasks share the id map and splitting them across two calls would be two
chances to remap one thing differently.
*/
export function copyFolderContents<Task extends DuplicableTask>(
  from: string,
  to: string,
  tasks: Task[],
  now = Date.now(),
): { tasks: Task[]; shiftedDays: number } {
  const source = tasks.filter((task) => task.form.folder === from)
  const shiftedDays = dueShiftFor(source, now)

  const idMap: Record<string, string> = {}
  const copied = source.map((task, index) => {
    const id = `${task.id}-dup-${index}`
    idMap[task.id] = id
    const day = parseDay(task.form.dueDate)
    return {
      ...task,
      id,
      /* Unstarted, and every step with it. */
      status: "pending" as const,
      completedAt: undefined,
      /* A grant is not a thing — but the work is somebody's, and it is the
         copier's. The row's chip goes; the form says who owns it. */
      assignee: undefined,
      steps: task.steps ? { complete: 0, total: task.steps.total } : undefined,
      /*
      Not in today, and nothing said about it yet.

      Two more that the first pass carried and should not have, each falling
      under a rule already stated rather than needing its own. **My Day is
      progress**: pulling a task into today is something you did on the
      original's run, so a copy that arrives already in My Day has started
      itself. **Comments are the conversation**, excluded for the reason Imran
      gave for the folder's thread — a count of remarks nobody made about a
      task that did not exist is a number with nothing behind it.
      */
      pulled: undefined,
      myDayGroup: undefined,
      hiddenFromMyDay: undefined,
      comments: undefined,
      folder: task.folder ? { ...task.folder, name: to } : undefined,
      /*
      The label rebuilt, not carried.

      A row's deadline exists twice: `form.dueDate` is the fact and `due.label`
      is the sentence drawn from it, and the fixtures write the sentence by
      hand. Shifting only the fact produced a copy whose store said 23 August
      and whose row said "Overdue · 6 Aug" — the dates moved and the page still
      showed a folder that was late before it existed.

      `dueLabelFor` is the same function the pickers use, so a shifted date
      reads exactly like one somebody set, and "overdue" is recomputed rather
      than inherited — it is a fact about the date, and the whole point here is
      that the date changed.
      */
      due:
        day !== null && shiftedDays
          ? dueLabelFor(
              parseIsoDate(formatDay(day + shiftedDays * DAY)),
            )
          : task.due,
      form: {
        ...task.form,
        id,
        folder: to,
        assignee: VIEWER_NAME,
        invitePending: "",
        completedAt: undefined,
        completedBy: undefined,
        dueDate:
          day !== null && shiftedDays ? formatDay(day + shiftedDays * DAY) : task.form.dueDate,
        steps: task.form.steps.map((step) => ({ ...step, done: false })),
      },
    }
  })

  /* Sections, paragraphs and which task sits in which — the "sections, text
     and data" half of the ask. Assignments are remapped through the same id
     map that minted the copies, so a copied task lands under the copied
     heading rather than pointing back at the original's. */
  /* Only when it is going somewhere else. Duplicating a single task inside its
     own folder comes through here with `from === to`, and writing the layout
     then would replace that folder's whole assignment map with the one entry
     this copy produced — every other task would fall out of its section. */
  const layout = from === to ? null : readFolderLayout<unknown>(from)
  if (layout) {
    saveFolderLayout(to, {
      items: layout.items,
      assign: Object.fromEntries(
        Object.entries(layout.assign)
          .filter(([taskId]) => idMap[taskId])
          .map(([taskId, sectionId]) => [idMap[taskId]!, sectionId]),
      ),
    })
  }

  return { tasks: copied as Task[], shiftedDays }
}

/*
Where a copy's tasks live, and why they need anywhere at all.

The shell holds its tasks in component state seeded from a fixture, and every
navigation in this prototype is a full page load, so anything added at runtime
dies at the next click. That has always been true and never mattered: a task
made from the capture bar is judged in the moment it is made.

A duplicate is the first act whose *whole point* is what you find when you come
back. Copy a folder, click into it, and the sections and the prose were there
while the tasks had evaporated — which is precisely the complaint this change
set out to fix, reappearing one navigation later.

So the copies persist, beside the folder they belong to and in the same shape
as the layout store. Only the copies: the fixtures stay fixtures, and this is a
stand-in for a row in a table rather than a general answer to the prototype's
in-memory tasks. Lane 2 travels with it, as it does for the sections.
*/
export const COPIED_TASKS_STORAGE_KEY = "dana:prototype-copied-tasks"

export function readCopiedTasks<Task>(): Task[] {
  if (typeof window === "undefined") return []
  try {
    const value = JSON.parse(
      window.localStorage.getItem(COPIED_TASKS_STORAGE_KEY) ?? "[]",
    )
    return Array.isArray(value) ? (value as Task[]) : []
  } catch {
    return []
  }
}

export function saveCopiedTasks<Task>(tasks: Task[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(COPIED_TASKS_STORAGE_KEY, JSON.stringify(tasks))
}

/*
One task, copied.

The same rules as a folder's contents and deliberately the same code path: a
copy is unstarted, unassigned, unspoken-about, and its date is re-anchored on
today when it has already passed. Reusing \`copyFolderContents\` rather than
writing a second version is the point — two functions that must agree about
what a copy is would drift on the first rule somebody remembered in only one of
them, which is the fault this whole session has been undoing.

The only thing added is the name. "X (copy)" is what the step duplication in
the row already says, so a task copied from its menu and a step copied from its
list read the same.
*/
export function duplicateTask<Task extends DuplicableTask & { title: string }>(
  task: Task,
  now = Date.now(),
): Task {
  const [copy] = copyFolderContents(
    task.form.folder,
    task.form.folder,
    [task],
    now,
  ).tasks
  const named = `${task.title} (copy)`
  /*
  Two differences from a folder's contents, and both come from one question:
  what is a copy *for*?

  **A single task's copy keeps its place.** `copyFolderContents` drops My Day
  membership, because a folder is duplicated to run the same plan again and
  pulling something into today was a decision made during the *original* run.
  A single task is duplicated to sit beside the one you are looking at. Clearing
  it here made the copy vanish from the page you made it on — which is the exact
  fault the entry defaults had, where a task made on Today never appeared on
  Today, invisible because the surface covers the page it failed to add to.

  **And the name**, in both fields: the row's title and the form's are two
  fields carrying one fact, the same split that made a copied deadline disagree
  with its label.
  */
  return {
    ...(copy as Task),
    title: named,
    myDayGroup: task.myDayGroup,
    pulled: task.pulled,
    hiddenFromMyDay: task.hiddenFromMyDay,
    form: { ...copy!.form, title: named },
  }
}

/*
A task's own address (DES-201), which is what Copy link copies.

The same shape the folder's link uses and for the same reason: the string a
person sends is the one the product navigates by, rather than a second scheme
invented for sharing.
*/
export function taskLink(taskId: string) {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = ""
  url.searchParams.set("task", taskId)
  return url.toString()
}
