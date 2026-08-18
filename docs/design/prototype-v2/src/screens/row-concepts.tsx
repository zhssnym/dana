/*
The row lab, rebuilt to render the real components.

It used to hold its own copy of the row and the card — around 3,900 lines of
them — which was right while they were concepts and nothing else existed. It
stopped being right the moment the design was approved and ported: the copy
fell behind within a day, losing More options, the History block and the fix to
the reveal animation, while still presenting itself as the thing to judge.

So this file now renders `TaskRow` and `TaskCard` themselves. Two consequences
worth being explicit about, because they change how this page is used:

- **What you approve here is what ships.** There is no porting step between the
  lab and the prototype any more, and therefore no gap for the two to drift
  into.
- **A change made for the lab is a change to the product.** That is the point,
  but it means this page is no longer a sandbox. A genuine experiment belongs
  on a branch rather than in a concept entry.

The baseline concept went with the copy. "What Dana looks like today" was
rendering `TaskRow`, which after the port *is* the new row — so the block was
quietly showing the new design and labelling it the old one. The honest
before-picture is the untouched v1 prototype at `docs/design/prototype/`.

What remains is the two densities of one approved row (DES-113), shown side by
side because the setting exists and the default had to be chosen.
*/

import { useState, type ReactNode } from "react"

import { TaskCard } from "@/components/task-card"
import type { TaskFormData } from "@/components/task-form"
import { TaskRow, type TaskRowProps } from "@/components/task-row"
import { RowDensityProvider, type RowDensity } from "@/lib/density"
import { cn } from "@/lib/utils"

const VIOLET = "var(--color-folder-violet)"
const FERN = "var(--color-folder-fern)"
const TEAL = "var(--color-folder-teal)"

const PEOPLE = [
  { name: "Imran Wafa", initials: "IW" },
  { name: "Sara Khan", initials: "SK" },
  { name: "Hassan Ali", initials: "HA" },
]

const FOLDERS = [
  { name: "Wedding", color: VIOLET },
  { name: "Community planning committee", color: FERN },
  { name: "Home", color: TEAL },
  { name: "Inbox", color: "var(--color-graphite-400)" },
]

function form(
  id: string,
  title: string,
  overrides: Partial<TaskFormData> = {},
): TaskFormData {
  return {
    id,
    title,
    dueDate: "14 Aug",
    important: false,
    notes: "",
    folder: "Wedding",
    assignee: "Imran Wafa",
    dueTime: "",
    reminder: "none",
    repeat: "none",
    repeatDays: ["Mo"],
    repeatInterval: "2",
    repeatMonthlyDay: "10",
    repeatEnds: "",
    invitePending: "",
    steps: [],
    createdAt: "4 Aug",
    createdBy: "Imran Wafa",
    ...overrides,
  }
}

interface SampleTask {
  id: string
  row: TaskRowProps
  form: TaskFormData
}

/*
The sample is fixed across both densities, and chosen so the hard cases never
leave the screen: a bare task, a very long title, an overdue one, one carrying
nearly every detail at once, a repeating one pulled into My Day, and an
abandoned one. A row that only survives short titles has not been tested.
*/
const SAMPLE: SampleTask[] = [
  {
    id: "t1",
    row: { title: "Renew the library card" },
    form: form("t1", "Renew the library card", { folder: "Inbox" }),
  },
  {
    id: "t2",
    row: {
      title:
        "Confirm final guest count and send it to the caterer before Thursday",
      folder: { name: "Wedding", color: VIOLET },
      due: { label: "Due 14 Aug" },
      assignee: { initials: "IW", name: "Imran Wafa" },
      steps: { complete: 2, total: 5 },
      notes: true,
    },
    form: form(
      "t2",
      "Confirm final guest count and send it to the caterer before Thursday",
      {
        notes: "The caterer needs the final number by Thursday lunchtime.",
        steps: [
          {
            id: 1,
            title: "Ask the venue for the final seating plan",
            done: true,
          },
          { id: 2, title: "Chase the four unanswered RSVPs", done: true },
          { id: 3, title: "Confirm the numbers with the venue", done: false },
          { id: 4, title: "Send the final count to the caterer", done: false },
          { id: 5, title: "Pay the balance", done: false },
        ],
      },
    ),
  },
  {
    id: "t3",
    row: {
      title: "Send the venue deposit",
      folder: { name: "Wedding", color: VIOLET },
      due: { label: "Overdue · 6 Aug", overdue: true },
      important: true,
    },
    form: form("t3", "Send the venue deposit", {
      dueDate: "6 Aug",
      important: true,
    }),
  },
  {
    id: "t4",
    row: {
      title: "Review the community grant application",
      folder: { name: "Community planning committee", color: FERN },
      due: { label: "Overdue · 8 Aug", overdue: true },
      assignee: { initials: "SK", name: "Sara Khan" },
      steps: { complete: 2, total: 4 },
      recurrence: "Weekly",
      notes: true,
    },
    form: form("t4", "Review the community grant application", {
      folder: "Community planning committee",
      assignee: "Sara Khan",
      dueDate: "8 Aug",
      repeat: "weekly",
      notes: "Second draft is in the shared folder.",
      steps: [
        { id: 1, title: "Read the second draft", done: true },
        { id: 2, title: "Check the budget table", done: true },
        { id: 3, title: "Write the covering note", done: false },
        { id: 4, title: "Send it to the committee", done: false },
      ],
    }),
  },
  {
    id: "t5",
    row: {
      title: "Water the balcony plants",
      folder: { name: "Home", color: TEAL },
      due: { label: "Due today" },
      assignee: { initials: "HA", name: "Hassan Ali" },
      recurrence: "Daily",
      pulled: true,
    },
    form: form("t5", "Water the balcony plants", {
      folder: "Home",
      assignee: "Hassan Ali",
      repeat: "daily",
      dueDate: "Today",
    }),
  },
  {
    id: "t6",
    row: {
      title: "Keep the backup chair reservation",
      folder: { name: "Wedding", color: VIOLET },
      status: "abandoned",
      due: { label: "12 Aug" },
    },
    form: form("t6", "Keep the backup chair reservation", { dueDate: "12 Aug" }),
  },
]

/* One live list at whichever density it is given. Everything a person can do
   here is the component's own behaviour rather than the lab's: renaming,
   completing, expanding, editing inside the card, restoring an abandoned
   task. */
function LiveList({ density }: { density: RowDensity }) {
  const [tasks, setTasks] = useState(SAMPLE)
  const [openId, setOpenId] = useState<string | null>(null)

  function patchRow(id: string, next: Partial<TaskRowProps>) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, row: { ...task.row, ...next } } : task,
      ),
    )
  }

  /* The card writes the form, and the row's derived fields follow from it —
     the same relationship the shell has, so a step ticked in the card moves
     the count in the row above it. */
  function patchForm(id: string, next: Partial<TaskFormData>) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== id) return task
        const merged = { ...task.form, ...next }
        return {
          ...task,
          form: merged,
          row: {
            ...task.row,
            title: merged.title,
            notes: Boolean(merged.notes),
            steps: merged.steps.length
              ? {
                  complete: merged.steps.filter((step) => step.done).length,
                  total: merged.steps.length,
                }
              : undefined,
          },
        }
      }),
    )
  }

  return (
    <RowDensityProvider value={density}>
      <div className="flex flex-col">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            {...task.row}
            onRename={(title) => patchForm(task.id, { title })}
            onToggleComplete={(completed) =>
              patchRow(task.id, {
                status: completed ? "completed" : "pending",
              })
            }
            onToggleImportant={() =>
              patchRow(task.id, { important: !task.row.important })
            }
            onRemoveFromMyDay={() => patchRow(task.id, { pulled: false })}
            isExpanded={openId === task.id}
            onToggleExpanded={() =>
              setOpenId((current) => (current === task.id ? null : task.id))
            }
            expanded={
              <TaskCard
                form={task.form}
                people={PEOPLE}
                folders={FOLDERS}
                onChange={(next) => patchForm(task.id, next)}
                onClose={() => setOpenId(null)}
              />
            }
          />
        ))}
      </div>
    </RowDensityProvider>
  )
}

/* The setting itself, drawn as it appears in Dana rather than as a toolbar for
   this page, so the default is judged where it will actually be met. */
function DensitySetting() {
  const [density, setDensity] = useState<RowDensity>("two")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-14 items-center gap-4 rounded-lg border border-[var(--color-graphite-200)] px-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-5 font-medium text-foreground">
            Row density
          </p>
          <p className="mt-0.5 text-[12px] leading-4 text-[var(--color-graphite-500)]">
            Two lines shows the whole task name. One line shows more tasks at
            once.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Row density"
          className="flex shrink-0 items-center gap-0.5 rounded-md bg-[var(--color-graphite-100)] p-0.5"
        >
          {(
            [
              ["two", "Two lines"],
              ["one", "One line"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={density === value}
              onClick={() => setDensity(value)}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-[12px] leading-4 font-medium transition-[background-color,color] duration-[var(--duration-fast)]",
                density === value
                  ? "bg-card text-[var(--color-graphite-900)]"
                  : "text-[var(--color-graphite-600)] hover:text-[var(--color-graphite-800)]",
              )}
            >
              {label}
              {value === "two" ? (
                <span className="ml-1 text-[var(--color-graphite-400)]">
                  default
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <LiveList density={density} />
    </div>
  )
}

export interface ConceptSpec {
  id: string
  name: string
  optimisesFor: string
  givesUp: string
  principle: string
  tryIt: string
  render: () => ReactNode
}

export const CONCEPTS: ConceptSpec[] = [
  {
    id: "S",
    name: "The setting",
    optimisesFor:
      "Not choosing. Both densities ship and the person picks, which is affordable only because the two agreed on everything except height — one layout switch over one component, not two implementations.",
    givesUp:
      "Every future change to the row has to be right in both, and any test asserting a row's geometry now has two answers. It stays affordable only while they differ in height alone.",
    principle:
      "Two lines is the default because the failure modes are not symmetric. Seeing fewer tasks is visible and self-correcting; a truncated title is invisible, because you do not know what you did not read.",
    tryIt:
      "Flip the control. This is the setting as it appears in Dana, driving the same component the app uses.",
    render: () => <DensitySetting />,
  },
  {
    id: "TWO",
    name: "Two lines — the default",
    optimisesFor:
      "The title, which gets a full line of its own and never truncates, at rest or while you are renaming it. The details sit beneath it in one shared vocabulary that reads the same here and inside the card it opens.",
    givesUp:
      "Height: 64px against 44px, so a viewport that held sixteen tasks holds eleven. A task with nothing to show stays one line, so only rows with details pay it.",
    principle:
      "Proximity groups the second line to the title above, so the pair reads as one object with a caption. That second line is also what makes the vocabulary affordable: an icon can keep its word beside it.",
    tryIt:
      "Open the long one with the chevron on the right, then More options inside the card. Rename a title. Hover the abandoned row for Restore.",
    render: () => <LiveList density="two" />,
  },
  {
    id: "ONE",
    name: "One line",
    optimisesFor:
      "Density. Everything on one 44px line, so a viewport holds sixteen tasks instead of eleven and a long list stays a list rather than a scroll.",
    givesUp:
      "The title. It truncates at about forty characters, and it truncates while you are renaming it, because the details are sharing its line.",
    principle:
      "Fitts's law still holds — the details are the controls that change them — so that is not what separates the two. The separation is height, and nothing else.",
    tryIt:
      "Compare the second task's title against the same task above. Everything else behaves identically, which is the point.",
    render: () => <LiveList density="one" />,
  },
]
