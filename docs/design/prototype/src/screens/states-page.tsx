import { CalendarCheck2, CircleCheck, FolderOpen, ListTodo } from "lucide-react"

import {
  EmptyState,
  InlineError,
  OfflineBanner,
  SkeletonList,
} from "@/components/state-patterns"
import { TaskRow } from "@/components/task-row"
import { interactionFixtures, taskStateFixtures } from "@/fixtures"

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
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
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
      <span className="truncate text-[0.625rem] leading-3 text-muted-foreground">
        {note}
      </span>
    </div>
  )
}

export function StatesPage() {
  return (
    <main className="mx-auto w-[1328px] py-10">
      <header className="flex items-start justify-between border-b border-border pb-6">
        <div>
          <div className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Dana design prototype
          </div>
          <h1 className="mt-3 text-2xl leading-8 font-semibold text-foreground">
            Component state lab
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-5 text-muted-foreground">
            Session 3 applies the selected A + D2 direction to Dana&apos;s complete
            TaskRow contract and repeated page states.
          </p>
        </div>
        <div className="text-right text-xs leading-4 text-muted-foreground">
          <div className="inline-flex items-center gap-1.5 font-medium text-[var(--color-success-700)]">
            <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Sessions 1–3 approved
          </div>
          <div className="mt-1">Desktop · 1440px</div>
          <div>Session 3 · Approved reference</div>
        </div>
      </header>

      <section className="mt-8">
        <SectionHeading
          number="01"
          title="Chosen TaskRow anatomy"
          description="The full row hovers; the title owns remaining space; metadata automatically packs from the right; utilities appear beside the title."
        />

        <div className="flex items-center gap-6 border-y border-border py-3 text-xs text-muted-foreground">
          <span><strong className="font-medium text-foreground">44px</strong> row and targets</span>
          <span aria-hidden="true">/</span>
          <span><strong className="font-medium text-foreground">Flexible</strong> title</span>
          <span aria-hidden="true">/</span>
          <span><strong className="font-medium text-foreground">Automatic</strong> trailing metadata</span>
          <span aria-hidden="true">/</span>
          <span><strong className="font-medium text-foreground">Inline</strong> hover utilities</span>
          <span aria-hidden="true">/</span>
          <span><strong className="font-medium text-foreground">Neutral</strong> completed check</span>
        </div>

        <div className="mt-3 bg-card p-1">
          <TaskRow
            title="Confirm final guest count and send it to the caterer before Thursday"
            folder={{ name: "Wedding", color: "var(--color-graphite-900)" }}
            due={{ label: "Overdue · 6 Aug", overdue: true }}
            important
            assignee={{ initials: "S", name: "Sara" }}
            steps={{ complete: 2, total: 5 }}
            recurrence="Weekly"
            showSecondaryActions
          />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          number="02"
          title="Required task states"
          description="Optional metadata is added to one automatic trailing group; no empty columns are reserved when a property is absent."
        />

        <div className="space-y-0.5 border-y border-border py-1">
          {taskStateFixtures.map((fixture) => (
            <div
              key={fixture.id}
              className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4"
            >
              <StateLabel id={fixture.id} label={fixture.label} note={fixture.note} />
              <TaskRow {...fixture.task} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          number="03"
          title="Interaction behavior"
          description="The full row receives hover and selection treatment; utilities reveal beside the title without moving right-side metadata."
        />

        <div className="space-y-0.5 border-y border-border py-1">
          {interactionFixtures.map((fixture) => (
            <div
              key={fixture.label}
              className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-4"
            >
              <StateLabel label={fixture.label} note={fixture.note} />
              <div className={fixture.task.menuOpen ? "min-h-48" : undefined}>
                <TaskRow {...fixture.task} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          number="04"
          title="Repeated system states"
          description="Official shadcn Alert, Skeleton and Empty primitives carry Dana&apos;s approved copy, semantic tokens and restrained Lucide cues."
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
                Inline error + retry · copy decision remains open
              </div>
              <InlineError />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <EmptyState
              icon={CalendarCheck2}
              label="My Day · exact copy"
              copy="Nothing on your day. Tasks assigned to you appear here on their due date, or pull anything in yourself."
            />
            <EmptyState
              icon={ListTodo}
              label="Tasks · exact copy"
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
        <span>Session boundary: no shell, task form, calendar or mobile UI.</span>
        <span>Inter · Lucide · shadcn Mira + Base UI · Dana tokens</span>
      </footer>
    </main>
  )
}
