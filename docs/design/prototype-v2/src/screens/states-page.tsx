/*
The state sheet: every state Dana's row actually has, drawn by the real row.

V3's deliverable, and it was still v1's page. That is worse than it sounds,
because a reference sheet that has stopped matching the product is not
out of date — it is **wrong**, and it is wrong in the one place a person goes
to find out what is right. It showed a row this product no longer draws, and
it showed four "interaction states" that all rendered identically, because the
props behind them (`visualState`, `showSecondaryActions`, `menuOpen`) were
being accepted and ignored. Two more states, Unassigned and Invite pending,
rendered nothing at all.

So three things changed together:

1. **It renders the shipping `TaskRow`**, with no props the row does not
   honour. The five that were kept alive only so this page compiled are gone
   from the row's contract — a prop that cannot do anything is DES-144's dead
   control one level down.
2. **Hover, focus and selection are not drawn, they are done.** The new row
   draws its own, so the honest way to show them is a live row you can put a
   pointer on, and a line saying so. Four identical rows labelled differently
   was the page telling a story the code could not.
3. **It left the audit's lab exclusion.** A sheet nobody checks is a rumour
   (DES-157), and this one had drifted for four sessions without anything
   noticing.

The section that is new is **what the page already says** — the four faces of
DES-183 side by side. That rule is invisible on any single screen, because
seeing it means seeing the same task drawn twice under different headings, and
this is the only surface in the product where that can be arranged.
*/

import { CalendarCheck2, FolderOpen, ListTodo } from "@/lib/icons"

import {
  EmptyState,
  InlineError,
  OfflineBanner,
  SkeletonList,
} from "@/components/state-patterns"
import { TaskRow } from "@/components/task-row"
import { taskStateFixtures } from "@/fixtures"

function SectionHeading({
  number,
  title,
  description,
}: {
  number: string
  title: string
  description: string
}) {
  return (
    <div className="mb-4 flex items-start gap-4">
      <span className="mt-0.5 font-mono text-xs font-medium text-muted-foreground">
        {number}
      </span>
      <div>
        <h2 className="text-base leading-6 font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-[70ch] text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

function StateLabel({
  id,
  label,
  note,
}: {
  id?: string
  label: string
  note: string
}) {
  return (
    <div className="flex min-h-[var(--task-row-height)] flex-col justify-center pr-3">
      <div className="flex items-baseline gap-2">
        {id ? (
          <span className="font-mono text-[0.625rem] leading-3 text-muted-foreground">
            {id}
          </span>
        ) : null}
        <span className="text-xs leading-4 font-medium text-foreground">{label}</span>
      </div>
      <span className="text-[0.625rem] leading-3 text-muted-foreground">{note}</span>
    </div>
  )
}

/* Every row on this sheet is real, so every row needs somewhere for a tap to
   go. Opening a task from a reference sheet means nothing, so it does the one
   honest thing: nothing, deliberately, rather than being left undefined and
   silently swallowing the gesture. */
const inert = () => {}

const ANATOMY = {
  id: "anatomy",
  title: "Confirm the final guest count and send it to the caterer",
  folder: { name: "Travel", color: "var(--color-graphite-900)" },
  section: "Venue & vendors",
  due: { label: "Overdue · 6 Aug", overdue: true },
  important: true,
  assignee: { initials: "S", name: "Sara" },
  steps: { complete: 2, total: 5 },
  recurrence: "Weekly",
} as const

/* One task, four contexts — the point being that it is the *same* task. */
const SUPPRESSED = {
  id: "given",
  title: "Send the venue deposit",
  folder: { name: "Travel", color: "var(--color-graphite-900)" },
  due: { label: "Overdue · 6 Aug", overdue: true },
  important: true,
  assignee: { initials: "S", name: "Sara" },
} as const

export function StatesPage() {
  return (
    <main className="mx-auto w-[1328px] py-10">
      <header className="border-b border-border pb-6">
        <div className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Dana design prototype
        </div>
        <h1 className="mt-3 text-2xl leading-8 font-semibold text-foreground">
          The row, in every state it has
        </h1>
        <p className="mt-2 max-w-[80ch] text-sm leading-5 text-muted-foreground">
          Drawn by the shipping row rather than described. Every row here is
          live: hover one, tab to one, press and hold one. Desktop, 1440px.
        </p>
      </header>

      <section className="mt-8">
        <SectionHeading
          number="01"
          title="Anatomy"
          description="The whole vocabulary at once — check, title, then the detail strip: due, folder, section, assignee, steps, rhythm. The trailing gutter carries the star and the overflow, and reveals on hover."
        />
        <div className="bg-card p-1">
          <TaskRow {...ANATOMY} onOpen={inert} />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          number="02"
          title="Task states"
          description="One row, every fact it can carry. Nothing reserves a column it is not using: a task with no due date simply has one chip fewer."
        />
        <div className="space-y-0.5 border-y border-border py-1">
          {taskStateFixtures.map((fixture) => (
            <div
              key={fixture.id}
              className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-4"
            >
              <StateLabel id={fixture.id} label={fixture.label} note={fixture.note} />
              <TaskRow {...fixture.task} onOpen={inert} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          number="03"
          title="What the page already says"
          description="One task, four places. A row does not repeat the heading above it — so the same task loses a different chip on each page, and the star and the red go quiet where every row would have carried them (DES-183)."
        />
        <div className="space-y-0.5 border-y border-border py-1">
          {[
            {
              label: "On All",
              note: "Nothing is given; the row says everything",
              given: undefined,
            },
            {
              label: "Inside Travel",
              note: "The page is the folder",
              given: { folder: true },
            },
            {
              label: "On Important",
              note: "Every row is starred, so the star drops its fill",
              given: { important: true },
            },
            {
              label: "Under Carried over",
              note: "Every row is late, so the date keeps its words and drops its red",
              given: { overdue: true },
            },
            {
              label: "On Done",
              note: "The deadline is spent; the heading gives the date that matters",
              given: { due: true },
            },
          ].map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-4"
            >
              <StateLabel label={row.label} note={row.note} />
              <TaskRow {...SUPPRESSED} given={row.given} onOpen={inert} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          number="04"
          title="Two densities"
          description="One row at two heights, chosen in Settings (DES-113). The detail strip moves under the title rather than being cut, because a person who wants more rows on screen has not asked to know less about them."
        />
        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-start gap-4 border-y border-border py-3">
          <StateLabel label="One line" note="Details fold into the title's line" />
          <TaskRow {...ANATOMY} density="one" onOpen={inert} />
        </div>
        <div className="mt-1 grid grid-cols-[190px_minmax(0,1fr)] items-start gap-4 border-b border-border py-3">
          <StateLabel label="Two lines" note="The shipped default" />
          <TaskRow {...ANATOMY} density="two" onOpen={inert} />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          number="05"
          title="Repeated system states"
          description="shadcn's Alert, Skeleton and Empty carrying Dana's approved copy, semantic tokens and one icon family."
        />

        <div className="space-y-4">
          <OfflineBanner />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Skeleton list · row geometry preserved
              </div>
              <SkeletonList />
            </div>
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Inline error and retry
              </div>
              <InlineError />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <EmptyState
              icon={CalendarCheck2}
              label="Today · exact copy"
              copy="Nothing on your day. Tasks assigned to you appear here on their due date, or pull anything in yourself."
            />
            <EmptyState
              icon={ListTodo}
              label="Anytime · exact copy"
              copy="No undated tasks. Anything you capture without a date lands here."
            />
            <EmptyState
              icon={FolderOpen}
              label="Folder · exact copy"
              copy="No tasks yet. Add one below."
            />
          </div>
        </div>
      </section>

      <footer className="mt-10 flex items-center justify-between border-t border-border pt-5 text-xs text-muted-foreground">
        <span>
          Drawn by <code className="font-mono">components/task-row.tsx</code>, so this
          sheet cannot disagree with the product.
        </span>
        <span>Inter · Lucide · shadcn + Base UI · Dana tokens</span>
      </footer>
    </main>
  )
}
