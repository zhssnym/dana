import { useEffect, useState } from "react"

import { DanaMark } from "@/components/dana-mark"
import { Button } from "@/components/ui/button"
import {
  ArrowRight,
  CalendarDays,
  Check,
  FolderOpen,
  ListChecks,
  MessageSquare,
  Workflow,
} from "@/lib/icons"

type ShowcaseId = "organize" | "collaborate" | "schedule" | "workflows"

type ShowcaseItem = {
  id: ShowcaseId
  label: string
  title: string
  detail: string
  image: string
  alt: string
  mobilePosition: string
}

const showcaseItems: ShowcaseItem[] = [
  {
    id: "organize",
    label: "Organize",
    title: "Projects that hold more than a task list.",
    detail: "Folders bring tasks, sections, writing, dates, people, and progress into one page.",
    image: "/dana-product-travel.png",
    alt: "The real Dana Travel folder showing shelves, tasks, sections, due dates, assignees, and progress.",
    mobilePosition: "object-[28%_top]",
  },
  {
    id: "collaborate",
    label: "Collaborate",
    title: "The detail stays beside the conversation.",
    detail: "Open a task for steps, notes, files, and comments while the shared folder conversation remains in reach.",
    image: "/dana-product-collaboration.png",
    alt: "The real Dana Office folder with an expanded task, steps, notes, attachments, comments, and the conversation panel.",
    mobilePosition: "object-[70%_top]",
  },
  {
    id: "schedule",
    label: "Schedule",
    title: "One view for every dated commitment.",
    detail: "Scheduled gathers work from every folder without separating it from the project where it belongs.",
    image: "/dana-product-scheduled.png",
    alt: "The real Dana Scheduled view grouping dated tasks by their folders.",
    mobilePosition: "object-[48%_top]",
  },
  {
    id: "workflows",
    label: "Reuse",
    title: "Save the structure. Reuse the playbook.",
    detail: "Turn a folder into a Dana workflow file, then import it whenever the same kind of work begins again.",
    image: "/dana-product-workflow.png",
    alt: "The real Dana Travel folder menu showing Save as workflow alongside history, duplicate, and other folder actions.",
    mobilePosition: "object-right-top",
  },
]

const interaction =
  "transition-[color,background-color,border-color,opacity,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

function DanaIdentity({ dark = false }: { dark?: boolean }) {
  return (
    <a
      href="?view=landing"
      className={`inline-flex items-center gap-3 rounded-md text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${dark ? "text-white" : "text-foreground"}`}
      aria-label="Dana home"
    >
      <DanaMark className="size-8" surface={dark ? "dark" : "light"} />
      <span>Dana</span>
    </a>
  )
}

function GoogleGlyph() {
  return (
    <span className="flex size-5 items-center justify-center rounded-full bg-white" aria-hidden="true">
      <img src="/google-g.svg" alt="" className="size-[18px]" />
    </span>
  )
}

function ProductImage({ item, eager = false }: { item: ShowcaseItem; eager?: boolean }) {
  return (
    <div className="overflow-hidden bg-black">
      <img
        key={item.id}
        src={item.image}
        alt={item.alt}
        loading={eager ? "eager" : "lazy"}
        className={`aspect-[4/3] w-full object-cover sm:aspect-video sm:object-center ${item.mobilePosition} duration-[var(--duration-base)] ease-[var(--ease-enter)] animate-in fade-in-0 motion-reduce:animate-none`}
      />
    </div>
  )
}

function ProductShowcase() {
  const [activeId, setActiveId] = useState<ShowcaseId>("collaborate")
  const active = showcaseItems.find((item) => item.id === activeId) ?? showcaseItems[0]

  return (
    <figure className="mx-auto w-full max-w-[1280px]">
      <div className="overflow-hidden rounded-[14px] border border-white/15 bg-black shadow-[var(--elevation-2)]">
        <div className="flex overflow-x-auto border-b border-white/10 p-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }} role="tablist" aria-label="Dana product features">
          {showcaseItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeId === item.id}
              aria-controls="landing-product-panel"
              onClick={() => setActiveId(item.id)}
              className={`flex h-11 shrink-0 items-center gap-2 rounded-md px-3.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:flex-1 sm:justify-center ${interaction} ${activeId === item.id ? "bg-white" : "text-white/55 hover:bg-white/10 hover:text-white"}`}
              style={activeId === item.id ? { color: "#000" } : undefined}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full border text-[10px] tabular-nums ${activeId === item.id ? "" : "border-white/20"}`}
                style={activeId === item.id ? { color: "#fff", backgroundColor: "var(--color-dana-accent-600)", borderColor: "var(--color-dana-accent-600)" } : undefined}
              >
                {index + 1}
              </span>
              {item.label}
            </button>
          ))}
        </div>
        <div id="landing-product-panel" role="tabpanel">
          <ProductImage item={active} eager />
        </div>
      </div>
      <figcaption className="mt-5 grid gap-2 text-xs leading-5 text-white/55 sm:grid-cols-[0.8fr_1.2fr] sm:gap-12">
        <span className="font-semibold tracking-[0.1em] uppercase">{active.title}</span>
        <span className="max-w-[60ch] sm:justify-self-end sm:text-right">{active.detail}</span>
      </figcaption>
    </figure>
  )
}

function EvidenceSection({
  eyebrow,
  eyebrowColor,
  heading,
  body,
  points,
  item,
  imageFirst = false,
}: {
  eyebrow: string
  eyebrowColor?: string
  heading: string
  body: string
  points: string[]
  item: ShowcaseItem
  imageFirst?: boolean
}) {
  const copy = (
    <div className={imageFirst ? "lg:pl-8" : "lg:pr-8"}>
      <p
        className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase"
        style={eyebrowColor ? { color: eyebrowColor } : undefined}
      >
        {eyebrow}
      </p>
      <h2 className="mt-4 max-w-[13ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">{heading}</h2>
      <p className="mt-6 max-w-[50ch] text-[15px] leading-7 text-muted-foreground">{body}</p>
      <ul className="mt-7 space-y-3 text-sm" aria-label={`${heading} details`}>
        {points.map((point) => (
          <li key={point} className="flex items-start gap-3 border-t border-border pt-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><Check className="size-3" /></span>
            <span className="leading-6">{point}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  const image = (
    <div className="overflow-hidden rounded-[12px] border border-border bg-card shadow-[var(--elevation-1)]">
      <ProductImage item={item} />
    </div>
  )

  return (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
      {imageFirst ? image : copy}
      {imageFirst ? copy : image}
    </div>
  )
}

function WorkflowSection() {
  const item = showcaseItems[3]

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
      <div>
        <p className="text-xs font-semibold tracking-[0.1em] text-primary uppercase">Reusable workflows</p>
        <h2 className="mt-4 max-w-[13ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">Good process should not start from zero.</h2>
        <p className="mt-6 max-w-[50ch] text-[15px] leading-7 text-muted-foreground">Save a folder or shelf as a workflow file and import it into a clean new workspace. The structure travels; private history does not.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="border-t border-border pt-4">
            <Workflow className="size-5 text-primary" />
            <p className="mt-3 text-sm font-semibold">Save as workflow</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Keep the page, sections, task titles, and steps.</p>
          </div>
          <div className="border-t border-border pt-4">
            <FolderOpen className="size-5 text-primary" />
            <p className="mt-3 text-sm font-semibold">Import into a new folder</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Dates, people, comments, and completion stay behind.</p>
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-[12px] border border-border bg-card shadow-[var(--elevation-1)]">
        <ProductImage item={item} />
      </div>
    </div>
  )
}

export default function LandingScreen() {
  useEffect(() => {
    const htmlMinWidth = document.documentElement.style.minWidth
    const bodyMinWidth = document.body.style.minWidth
    document.documentElement.style.minWidth = "0px"
    document.body.style.minWidth = "0px"

    return () => {
      document.documentElement.style.minWidth = htmlMinWidth
      document.body.style.minWidth = bodyMinWidth
    }
  }, [])

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
        <DanaIdentity />
        <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Public navigation">
          <a href="#product" className={`hidden rounded-md px-3 py-2 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:block ${interaction}`}>Product</a>
          <a href="#features" className={`hidden rounded-md px-3 py-2 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:block ${interaction}`}>Features</a>
          <a href="#workflows" className={`hidden rounded-md px-3 py-2 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:block ${interaction}`}>Workflows</a>
          <Button type="button" size="sm" className="ml-2 bg-primary text-primary-foreground shadow-none hover:bg-[var(--color-dana-accent-700)]">Sign in</Button>
        </nav>
      </header>

      <section className="px-5 pt-16 pb-16 text-center sm:px-8 sm:pt-20 sm:pb-12">
        <div className="mx-auto max-w-[1000px] duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
          <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Personal focus. Shared momentum.</p>
          <h1 className="mt-5 text-[clamp(44px,6.2vw,76px)] leading-[0.98] font-semibold tracking-[-0.055em]">
            <span className="block">Organize the work.</span>
            <span className="mt-1 block font-normal text-muted-foreground">Keep its context.</span>
            <span className="mt-1 block">Move it forward.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-[660px] text-[16px] leading-7 text-muted-foreground sm:text-[17px]">Dana brings tasks, projects, schedules, and collaboration into one focused workspace—so the plan and the work stay together.</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button type="button" className={`h-11 min-w-56 gap-3 bg-primary px-5 text-sm font-medium text-primary-foreground shadow-none hover:bg-[var(--color-dana-accent-700)] active:translate-y-px ${interaction}`}><GoogleGlyph />Continue with Google</Button>
            <Button variant="ghost" className="h-11 gap-2 px-4 text-sm" render={<a href="#product" />}>See Dana in action<ArrowRight className="size-4" /></Button>
          </div>
          <p className="mx-auto mt-4 max-w-[44ch] text-xs leading-5 text-muted-foreground">Dana requests only your Google profile and email for sign-in, sharing, and invitations.</p>
        </div>
      </section>

      <section id="product" className="relative overflow-hidden bg-black px-4 py-12 sm:px-8 sm:py-16">
        <DanaMark className="pointer-events-none absolute -top-36 -right-36 size-[520px] opacity-[0.1]" surface="dark" plate={false} />
        <div className="relative z-10"><ProductShowcase /></div>
      </section>

      <section id="features" className="border-b border-border px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto w-full max-w-[1180px]">
          <EvidenceSection
            eyebrow="Travel · Projects with shape"
            eyebrowColor="var(--color-folder-violet)"
            heading="A folder can carry the whole plan."
            body="Dana pages combine the fast clarity of a task list with the structure a real project needs. Everything remains visible and editable in one place."
            points={["Group work into shelves, folders, and sections", "Add writing between task groups to preserve decisions", "Switch between list and board views without changing the work"]}
            item={showcaseItems[0]}
          />
        </div>
      </section>

      <section className="border-b border-border bg-[var(--color-graphite-25)] px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto w-full max-w-[1180px]">
          <EvidenceSection
            eyebrow="Office · Work together in context"
            eyebrowColor="var(--color-folder-teal)"
            heading="Open the task. Keep the project in view."
            body="A task expands where it lives. Steps, notes, attachments, comments, and the shared folder conversation remain connected instead of scattering across tools."
            points={["Break outcomes into clear, checkable steps", "Keep notes, files, and links on the task", "Use comments and the folder conversation for shared decisions"]}
            item={showcaseItems[1]}
            imageFirst
          />
        </div>
      </section>

      <section className="border-b border-border px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto w-full max-w-[1180px]">
          <EvidenceSection
            eyebrow="Scheduled · Across projects"
            eyebrowColor="var(--color-dana-accent-600)"
            heading="See every dated task without losing where it belongs."
            body="Scheduled gathers commitments from across Dana and groups them by folder. Update the task here or return to its project with the same details intact."
            points={["Bring due and overdue work into one view", "Keep folder identity, assignees, steps, and recurrence visible", "Choose list, board, or calendar presentation for the moment"]}
            item={showcaseItems[2]}
          />
        </div>
      </section>

      <section id="workflows" className="border-b border-border bg-[var(--color-graphite-25)] px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto w-full max-w-[1180px]"><WorkflowSection /></div>
      </section>

      <section className="px-5 py-24 text-center sm:px-8 sm:py-32">
        <div className="mx-auto max-w-[760px]">
          <DanaMark className="mx-auto size-11" />
          <h2 className="mt-7 text-[clamp(34px,4.4vw,54px)] leading-[1.04] font-semibold tracking-[-0.045em]">A clear place for the work ahead.</h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-[15px] leading-7 text-muted-foreground">Start privately, invite people when the work needs them, and keep every next step attached to its project.</p>
          <Button type="button" className={`mt-8 h-11 min-w-56 gap-3 bg-primary px-5 text-sm font-medium text-primary-foreground shadow-none hover:bg-[var(--color-dana-accent-700)] active:translate-y-px ${interaction}`}><GoogleGlyph />Continue with Google</Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-8">
          <DanaIdentity /><span className="sm:ml-3">© 2026 Dana</span>
          <div className="flex gap-5 sm:ml-auto">
            <a href="?view=privacy" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">Privacy</a>
            <a href="?view=terms" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
