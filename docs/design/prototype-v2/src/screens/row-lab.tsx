/*
The TaskRow concept lab, opened at session V3 of `v2-refresh-plan.md`.

One page, one set of sample tasks, every candidate row treatment rendered
against it, so a comparison is a scroll rather than a memory. `states-page.tsx`
stays what it is, the catalogue of every state the approved row must carry;
this page is where treatments compete before one of them becomes that row.

Adding a concept is adding one entry to CONCEPTS below. Each carries the two
sentences a reviewer needs: what it optimises for, and what it gives up.
*/

import type { ReactNode } from "react"

import { TaskRow, type TaskRowProps } from "@/components/task-row"

/*
One sample set for every concept, chosen so the hard cases are always on
screen: a bare task, a long title, an overdue task, a task carrying almost
every optional detail at once, a task belonging to somebody else, and an
abandoned one. A concept that only looks good on the short titles is a
concept that has not been tested.
*/
const SAMPLE: TaskRowProps[] = [
  {
    title: "Renew the library card",
  },
  {
    title: "Confirm final guest count and send it to the caterer before Thursday",
    folder: { name: "Wedding", color: "var(--color-folder-violet, #8E71CF)" },
    due: { label: "Due 14 Aug" },
    steps: { complete: 2, total: 5 },
  },
  {
    title: "Send the venue deposit",
    folder: { name: "Wedding", color: "var(--color-folder-violet, #8E71CF)" },
    due: { label: "Overdue · 6 Aug", overdue: true },
    important: true,
  },
  {
    title: "Review the community grant application",
    folder: {
      name: "Community planning committee",
      color: "var(--color-folder-fern, #52975D)",
    },
    due: { label: "Overdue · 8 Aug", overdue: true },
    steps: { complete: 2, total: 4 },
    assignee: { initials: "SK", name: "Sara" },
    recurrence: "Weekly",
  },
  {
    title: "Water the balcony plants",
    folder: { name: "Home", color: "var(--color-folder-teal, #3D998C)" },
    due: { label: "Due today" },
    recurrence: "Daily",
    pulled: true,
  },
  {
    title: "Keep the backup chair reservation",
    folder: { name: "Wedding", color: "var(--color-folder-violet, #8E71CF)" },
    status: "abandoned",
    due: { label: "12 Aug" },
  },
]

interface Concept {
  id: string
  name: string
  optimisesFor: string
  givesUp: string
  render: (tasks: TaskRowProps[]) => ReactNode
}

/* C0 is the shipping row, present so every other concept is measured against
   something real rather than against a memory of it. */
const CONCEPTS: Concept[] = [
  {
    id: "C0",
    name: "Current",
    optimisesFor: "What ships today: one 44px line, details packed right.",
    givesUp: "Nothing yet; this is the baseline the others argue with.",
    render: (tasks) => (
      <div className="flex flex-col">
        {tasks.map((task) => (
          <TaskRow key={task.title} {...task} />
        ))}
      </div>
    ),
  },
]

function ConceptBlock({ concept }: { concept: Concept }) {
  return (
    <section className="mt-12 first:mt-0">
      <div className="mb-1 flex items-baseline gap-3">
        <span className="text-[11px] font-semibold tracking-[0.11em] text-[var(--color-graphite-500)] uppercase">
          {concept.id}
        </span>
        <h2 className="text-base leading-6 font-semibold text-foreground">
          {concept.name}
        </h2>
      </div>
      <p className="mb-4 max-w-[68ch] text-[13px] leading-5 text-[var(--color-graphite-600)]">
        <span className="font-medium text-[var(--color-graphite-800)]">
          Optimises for:
        </span>{" "}
        {concept.optimisesFor}{" "}
        <span className="font-medium text-[var(--color-graphite-800)]">
          Gives up:
        </span>{" "}
        {concept.givesUp}
      </p>
      <div className="rounded-lg border border-[var(--color-graphite-200)] bg-card px-3 py-2">
        {concept.render(SAMPLE)}
      </div>
    </section>
  )
}

export function RowLabPage() {
  return (
    <div className="min-h-screen bg-[var(--color-graphite-25)] py-10">
      <div className="mx-auto w-full max-w-[1120px] px-10">
        <header className="mb-10">
          <p className="text-[11px] font-semibold tracking-[0.11em] text-[var(--color-graphite-500)] uppercase">
            Dana v2 · session V3
          </p>
          <h1 className="mt-2 text-[26px] leading-8 font-semibold text-foreground">
            TaskRow concept lab
          </h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--color-graphite-600)]">
            Every candidate row against the same six tasks: a bare one, a long
            title, an overdue one, one carrying nearly every detail at once, a
            repeating one pulled into My Day, and an abandoned one.
          </p>
        </header>

        {CONCEPTS.map((concept) => (
          <ConceptBlock key={concept.id} concept={concept} />
        ))}
      </div>
    </div>
  )
}
