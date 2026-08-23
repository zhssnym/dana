/*
The TaskRow concept lab, opened at session V3 of `v2-refresh-plan.md`.

One page, one set of sample tasks, every candidate row rendered against it, so
a comparison is a scroll rather than a memory. `states-page.tsx` stays what it
is, the catalogue of every state the approved row must carry; this page is
where treatments compete before one of them becomes that row.

Adding a concept is adding one entry to CONCEPTS in `row-concepts.tsx`.

This page is also read by people who have never seen Dana, because Imran
shares it to collect opinions. That is why it opens by explaining what a row
is and what is being decided, and why every concept states what to try rather
than assuming somebody will discover it by waving a mouse around. A reviewer
who does not know an interaction exists is a reviewer voting on a picture.
*/

import { useState } from "react"

import {
  BaselineTaskRow,
  type BaselineTaskRowProps,
} from "@/components/task-row-baseline"
import { CONCEPTS as V3_CONCEPTS, type ConceptSpec } from "@/screens/row-concepts"
import { cn } from "@/lib/utils"

/* The baseline's own sample, in the shipping row's props shape. */
const SAMPLE: BaselineTaskRowProps[] = [
  { title: "Renew the library card" },
  {
    title: "Confirm final guest count and send it to the caterer before Thursday",
    folder: { name: "Travel", color: "var(--color-folder-violet, #8E71CF)" },
    due: { label: "Due 14 Aug" },
    steps: { complete: 2, total: 5 },
  },
  {
    title: "Send the venue deposit",
    folder: { name: "Travel", color: "var(--color-folder-violet, #8E71CF)" },
    due: { label: "Overdue · 6 Aug", overdue: true },
    important: true,
  },
  {
    title: "Review the community grant application",
    folder: {
      name: "Office",
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
    folder: { name: "Travel", color: "var(--color-folder-violet, #8E71CF)" },
    status: "abandoned",
    due: { label: "12 Aug" },
  },
]

/* C0 is the shipping row, present so every other concept is measured against
   something real rather than against a memory of it. It is deliberately the
   one block on this page that is NOT brought up to the shared baseline: it is
   the control, and a control you have improved is not a control. */
const BASELINE: ConceptSpec = {
  id: "C0",
  name: "What Dana looks like today",
  optimisesFor: "What ships right now: one 44px line, details packed right.",
  givesUp:
    "Nothing yet; this is the baseline the others argue with, left exactly as it is so the comparison is honest.",
  principle:
    "The row as approved at session V2. Every concept below argues with this one.",
  tryIt:
    "Read it, then scroll. This is the thing being replaced — it is the only block here that does not respond to you.",
  render: () => (
    <div className="flex flex-col">
      {SAMPLE.map((task) => (
        <BaselineTaskRow key={task.title} {...task} />
      ))}
    </div>
  ),
}

const CONCEPTS: ConceptSpec[] = [BASELINE, ...V3_CONCEPTS]

/* Everything each concept gets for free, listed once here rather than
   repeated in seven places. The point of holding these constant is that a
   comparison then measures the bet rather than the finish. */
const BASELINE_GOODS = [
  ["Rename in place", "click any task's name and type; Enter keeps it, Escape puts it back"],
  ["Complete it", "click any checkbox and watch the tick draw itself"],
  [
    "Open it in place",
    "the chevron on the right opens the full card without leaving the list",
  ],
  [
    "Edit the details",
    "click any date, folder or person in a row and change it from the menu",
  ],
  ["Tick steps off", "inside any open card; the count in the row behind it follows"],
  [
    "Select steps",
    "press and hold a step for a moment, the way you would in a messaging app, then tap the others",
  ],
  ["Star and menu", "both reserved in the gutter, so nothing shifts when you hover a row"],
  ["Full name on hover", "the one-line row truncates, so it explains itself when you point at it"],
  ["Motion on one scale", "three durations and two easings, shared, and all of it off under reduced motion"],
]

function ConceptBlock({ concept }: { concept: ConceptSpec }) {
  /* Remounting the block is the reset: every concept holds its own state and
     none of them needs to know how to undo it. */
  const [nonce, setNonce] = useState(0)

  return (
    <section id={`concept-${concept.id}`} className="scroll-mt-24 pt-14 first:pt-0">
      <div className="mb-1 flex items-baseline gap-3">
        <span className="text-[12px] leading-4 font-semibold tracking-[0.11em] text-[var(--color-graphite-500)] uppercase">
          {concept.id}
        </span>
        <h2 className="text-base leading-6 font-semibold text-foreground">
          {concept.name}
        </h2>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="ml-auto rounded-md px-2 py-1 text-[12px] leading-4 text-[var(--color-graphite-500)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]"
        >
          Reset
        </button>
      </div>

      <p className="mb-2 max-w-[68ch] text-[14px] leading-5 text-[var(--color-graphite-600)]">
        <span className="font-medium text-[var(--color-graphite-800)]">
          Optimises for:
        </span>{" "}
        {concept.optimisesFor}{" "}
        <span className="font-medium text-[var(--color-graphite-800)]">
          Gives up:
        </span>{" "}
        {concept.givesUp}
      </p>
      <p className="mb-3 max-w-[68ch] text-[14px] leading-5 text-[var(--color-graphite-500)] italic">
        {concept.principle}
      </p>
      <p className="mb-4 max-w-[68ch] rounded-md bg-[var(--color-dana-accent-50)] px-3 py-2 text-[14px] leading-5 text-[var(--color-dana-accent-800)]">
        <span className="font-semibold">Try it: </span>
        {concept.tryIt}
      </p>

      {/* The rows are a desktop density and do not reflow: a folder name and
          a due date cannot truncate any further without the concept stopping
          being the concept. So the block scrolls sideways on a narrow window
          rather than the page doing it, which keeps the prose readable at any
          width and keeps every row honest at the width it was designed for. */}
      <div className="overflow-x-auto rounded-lg border border-[var(--color-graphite-200)] bg-card">
        <div key={nonce} className="min-w-[840px] px-3 py-2">
          {concept.render()}
        </div>
      </div>
    </section>
  )
}

export function RowLabPage() {
  return (
    <div className="min-h-screen bg-[var(--color-graphite-25)] pb-24">
      <nav className="sticky top-0 z-40 border-b border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)]/85 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-1 gap-y-1 px-10 py-2.5">
          <span className="mr-3 text-[12px] font-semibold text-[var(--color-graphite-800)]">
            Dana · row concepts
          </span>
          {CONCEPTS.map((concept) => (
            <a
              key={concept.id}
              href={`#concept-${concept.id}`}
              className={cn(
                "rounded-md px-2 py-1 text-[12px] leading-4 text-[var(--color-graphite-600)] transition-colors duration-[var(--duration-fast)]",
                "hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]",
              )}
            >
              <span className="font-semibold">{concept.id}</span>{" "}
              <span className="text-[var(--color-graphite-500)]">
                {concept.name}
              </span>
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-[1120px] px-10 pt-10">
        <header className="mb-10">
          <p className="text-[12px] leading-4 font-semibold tracking-[0.11em] text-[var(--color-graphite-500)] uppercase">
            Dana v2 · session V3
          </p>
          <h1 className="mt-2 text-[26px] leading-8 font-semibold text-foreground">
            Which task row should Dana use?
          </h1>

          <div className="mt-4 max-w-[70ch] space-y-3 text-sm leading-6 text-[var(--color-graphite-700)]">
            <p>
              Dana is a shared to-do app. A <strong>task row</strong> is the one
              line that stands for a task in a list, and since a list is most of
              what anyone ever looks at, this single line is close to the whole
              product. Seven candidates became two, because they converged on
              each other — same renaming, same editing, same card. All that
              separates them now is height, so <strong>Dana ships both and you
              pick</strong>, with two lines as the default. The first block is
              that setting; the two below it are the same rows on their own, to
              look at closely.
            </p>
            <p>
              Every concept is shown against the same six tasks, chosen to be
              awkward rather than flattering: a bare one, a very long title, two
              overdue, one carrying nearly every detail at once, and one that
              was abandoned. Everything on this page is live — click things.
              Nothing you do here reaches anybody's real to-do list, and{" "}
              <strong>Reset</strong> on any block puts it back.
            </p>
            <p>
              You do not need to know which is "correct". The useful answer is
              which one you would rather look at fifty times a day, and why.
            </p>
          </div>

          <div className="mt-5 rounded-lg border border-[var(--color-graphite-200)] bg-card px-4 py-3">
            <p className="mb-2 text-[12px] font-semibold text-[var(--color-graphite-800)]">
              Every concept below has all of this, so you are comparing ideas
              rather than finish:
            </p>
            <ul className="grid gap-x-8 gap-y-1 text-[14px] leading-5 text-[var(--color-graphite-600)] sm:grid-cols-2">
              {BASELINE_GOODS.map(([name, detail]) => (
                <li key={name}>
                  <span className="font-medium text-[var(--color-graphite-800)]">
                    {name}
                  </span>{" "}
                  — {detail}
                </li>
              ))}
            </ul>
          </div>
        </header>

        {CONCEPTS.map((concept) => (
          <ConceptBlock key={concept.id} concept={concept} />
        ))}

        <footer className="mt-16 border-t border-[var(--color-graphite-200)] pt-4 text-[12px] leading-5 text-[var(--color-graphite-500)]">
          Design prototype. Fixtures only, nothing is saved, and no concept here
          has been approved — that is what the opinions are for.
        </footer>
      </div>
    </div>
  )
}
