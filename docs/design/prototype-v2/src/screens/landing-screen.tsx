import { useEffect, useRef, useState, type ReactNode } from "react"

import { DanaMark } from "@/components/dana-mark"
import { Button } from "@/components/ui/button"
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  FolderInput,
  FolderOpen,
  Folders,
  ListChecks,
  MessageSquare,
  PanelRight,
  Play,
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
  heroCrop: string
  heroTransform: string
}

const showcaseItems: ShowcaseItem[] = [
  {
    id: "organize",
    label: "Organize",
    title: "Projects that hold more than a task list.",
    detail: "Folders bring tasks, sections, writing, dates, people, and progress into one page.",
    image: "/dana-product-travel.png",
    alt: "The real Dana Travel folder showing shelves, tasks, sections, due dates, assignees, and progress.",
    heroCrop: "object-[34%_top]",
    heroTransform: "scale-[1.06] origin-[30%_42%]",
  },
  {
    id: "collaborate",
    label: "Collaborate",
    title: "The detail stays beside the conversation.",
    detail: "Open a task for steps, notes, files, and comments while the shared folder conversation remains in reach.",
    image: "/dana-product-collaboration.png",
    alt: "The real Dana Office folder with an expanded task, steps, notes, attachments, comments, and the conversation panel.",
    heroCrop: "object-[64%_top]",
    heroTransform: "scale-[1.1] origin-[72%_42%]",
  },
  {
    id: "schedule",
    label: "Schedule",
    title: "One view for every dated commitment.",
    detail: "Scheduled gathers work from every folder without separating it from the project where it belongs.",
    image: "/dana-product-scheduled.png",
    alt: "The real Dana Scheduled view grouping dated tasks by their folders.",
    heroCrop: "object-[48%_top]",
    heroTransform: "scale-[1.08] origin-[50%_48%]",
  },
  {
    id: "workflows",
    label: "Reuse",
    title: "Save the structure. Reuse the playbook.",
    detail: "Turn a folder into a Dana workflow file, then import it whenever the same kind of work begins again.",
    image: "/dana-product-workflow.png",
    alt: "The real Dana Travel folder menu showing Save as workflow alongside history, duplicate, and other folder actions.",
    heroCrop: "object-right-top",
    heroTransform: "scale-[1.1] origin-[88%_28%]",
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

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setVisible(true)
        observer.disconnect()
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`${className} transition-[opacity,transform] duration-[var(--duration-slow)] ease-[var(--ease-enter)] motion-reduce:translate-y-0 motion-reduce:opacity-100 ${visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
    >
      {children}
    </div>
  )
}

function HeadlineLine({
  id,
  activeId,
  index,
  children,
  onActivate,
  quiet = false,
}: {
  id: ShowcaseId
  activeId: ShowcaseId
  index: string
  children: ReactNode
  onActivate: (id: ShowcaseId) => void
  quiet?: boolean
}) {
  const active = activeId === id

  return (
    <span className="block">
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onActivate(id)}
        onMouseEnter={() => onActivate(id)}
        onFocus={() => onActivate(id)}
        className={`group inline-flex max-w-full items-baseline gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction} ${active ? "text-foreground" : quiet ? "text-muted-foreground" : "text-foreground/75 hover:text-foreground"}`}
      >
        <span className={`hidden text-[10px] font-semibold tracking-[0.14em] sm:inline ${active ? "text-primary" : "text-muted-foreground"}`}>{index}</span>
        <span className={quiet ? "font-normal" : "font-semibold"}>{children}</span>
      </button>
    </span>
  )
}

function ProductAnnotation({
  id,
  activeId,
  icon,
  label,
  className,
  onActivate,
}: {
  id: ShowcaseId
  activeId: ShowcaseId
  icon: ReactNode
  label: string
  className: string
  onActivate: (id: ShowcaseId) => void
}) {
  const active = activeId === id
  return (
    <button
      type="button"
      onClick={() => onActivate(id)}
      className={`absolute z-20 hidden items-center gap-2 bg-card px-3 py-2 text-xs font-medium text-card-foreground shadow-[var(--elevation-1)] outline-none focus-visible:ring-2 focus-visible:ring-ring/30 xl:flex ${className} ${interaction} ${active ? "translate-y-0 border-primary" : "border-border hover:-translate-y-0.5"}`}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      {label}
    </button>
  )
}

function HeroProductStage({ activeId, onActivate }: { activeId: ShowcaseId; onActivate: (id: ShowcaseId) => void }) {
  const active = showcaseItems.find((item) => item.id === activeId) ?? showcaseItems[0]
  const [walking, setWalking] = useState(false)

  useEffect(() => {
    if (!walking) return
    const current = showcaseItems.findIndex((item) => item.id === activeId)
    if (current >= showcaseItems.length - 1) {
      setWalking(false)
      return
    }
    const timer = window.setTimeout(() => onActivate(showcaseItems[current + 1]?.id ?? "organize"), 1800)
    return () => window.clearTimeout(timer)
  }, [activeId, onActivate, walking])

  const playWalkthrough = () => {
    onActivate("organize")
    setWalking(true)
  }

  return (
    <div
      id="product"
      className="relative mt-10 pb-16 sm:mt-12 sm:pb-20"
      // The dark half is deliberately fixed: this public stage must not invert with the app colourway.
      style={{ background: "linear-gradient(to bottom, transparent 0%, transparent 38%, var(--color-graphite-950) 38%, var(--color-graphite-950) 100%)" }}
    >
      <div className="relative mx-auto w-full max-w-[1280px] px-4 sm:px-8">
        <div className="relative">
          <div className="pointer-events-none absolute -inset-x-5 top-[38%] hidden h-px bg-white/10 xl:block" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-[14px] border border-border bg-[var(--color-graphite-950)] shadow-[var(--elevation-2)]">
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 border border-white/15 bg-[color-mix(in_srgb,var(--color-graphite-950)_80%,transparent)] px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-white uppercase">
              <span className="size-1.5 rounded-full bg-[var(--color-folder-fern)]" />
              Real Dana workspace
            </div>
            <img
              key={active.id}
              src={active.image}
              alt={active.alt}
              loading="eager"
              className={`aspect-video w-full object-cover ${active.heroCrop} ${active.heroTransform} duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in-0 zoom-in-[1.01] motion-reduce:animate-none`}
            />
          </div>

          <ProductAnnotation id="organize" activeId={activeId} icon={<Folders className="size-4" />} label="Library → project" className="-left-8 top-[22%] border after:absolute after:top-1/2 after:left-full after:w-8 after:border-t after:border-dashed after:border-current after:opacity-35" onActivate={onActivate} />
          <ProductAnnotation id="collaborate" activeId={activeId} icon={<PanelRight className="size-4" />} label="Task → conversation" className="-right-8 top-[30%] border before:absolute before:top-1/2 before:right-full before:w-8 before:border-t before:border-dashed before:border-current before:opacity-35" onActivate={onActivate} />
          <ProductAnnotation id="schedule" activeId={activeId} icon={<CalendarDays className="size-4" />} label="Project → schedule" className="-right-5 bottom-[17%] border before:absolute before:top-1/2 before:right-full before:w-8 before:border-t before:border-dashed before:border-current before:opacity-35" onActivate={onActivate} />
        </div>

        <div className="mt-6 grid gap-5 text-white sm:grid-cols-[1fr_auto] sm:items-end">
          <div aria-live="polite">
            <p className="text-xs font-semibold tracking-[0.1em] text-white/55 uppercase">{active.title}</p>
            <p className="mt-2 max-w-[64ch] text-sm leading-6 text-white/75">{active.detail}</p>
          </div>
          <button
            type="button"
            onClick={playWalkthrough}
            disabled={walking}
            className={`inline-flex h-10 items-center justify-center gap-2 border border-white/20 px-4 text-xs font-medium text-white outline-none hover:border-white/40 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-default disabled:opacity-50 ${interaction}`}
          >
            <Play className="size-4" />
            {walking ? "Playing walkthrough" : "Play product walkthrough"}
          </button>
        </div>

        <div className="mt-8 flex overflow-x-auto border-t border-white/15 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }} role="tablist" aria-label="Dana product features">
          {showcaseItems.map((item, index) => {
            const selected = item.id === activeId
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setWalking(false)
                  onActivate(item.id)
                }}
                className={`flex min-w-36 flex-1 items-center gap-3 border-t-2 px-1 py-4 text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${interaction} ${selected ? "border-primary text-white" : "border-transparent text-white/45 hover:text-white"}`}
              >
                <span className={`tabular-nums ${selected ? "text-primary" : "text-white/25"}`}>0{index + 1}</span>
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DetailList({ heading, points, inverse = false }: { heading: string; points: string[]; inverse?: boolean }) {
  return (
    <ul className={`mt-8 space-y-3 text-sm ${inverse ? "text-white/80" : "text-foreground"}`} aria-label={`${heading} details`}>
      {points.map((point) => (
        <li key={point} className={`flex items-start gap-3 border-t pt-3 ${inverse ? "border-white/15" : "border-border"}`}>
          <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${inverse ? "bg-white text-[var(--color-graphite-950)]" : "bg-foreground text-background"}`}><Check className="size-3" /></span>
          <span className="leading-6">{point}</span>
        </li>
      ))}
    </ul>
  )
}

function OrganizeVisual() {
  const item = showcaseItems[0]
  return (
    <div className="relative pb-10 sm:pr-10">
      <div className="overflow-hidden rounded-[12px] border border-[color-mix(in_srgb,var(--color-folder-violet)_28%,var(--border))] bg-card shadow-[var(--elevation-2)]">
        <img src={item.image} alt={item.alt} loading="lazy" className="aspect-[4/3] w-full object-cover object-[18%_top]" />
      </div>
      <div className="absolute right-0 bottom-0 hidden w-1/2 overflow-hidden rounded-[12px] border border-[color-mix(in_srgb,var(--color-folder-violet)_28%,var(--border))] bg-card p-1.5 shadow-[var(--elevation-2)] sm:block">
        <div className="overflow-hidden bg-[var(--color-graphite-950)]">
          <img src={item.image} alt="" loading="lazy" className="aspect-video w-full scale-150 origin-[65%_76%] object-cover object-[65%_76%]" />
        </div>
        <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.1em] text-[var(--color-folder-violet)] uppercase">Sections keep the plan readable</p>
      </div>
      <div className="absolute -left-3 top-8 hidden items-center gap-2 bg-card px-3 py-2 text-xs font-medium shadow-[var(--elevation-1)] xl:flex">
        <FolderOpen className="size-4 text-[var(--color-folder-violet)]" /> Shelf → folder → section
      </div>
    </div>
  )
}

function CollaborationVisual() {
  const item = showcaseItems[1]
  const [focus, setFocus] = useState<"task" | "conversation">("task")

  return (
    <div className="overflow-hidden rounded-[12px] border border-[color-mix(in_srgb,var(--color-folder-teal)_28%,var(--border))] bg-card shadow-[var(--elevation-2)]">
      <div className="flex border-b border-border p-2" role="tablist" aria-label="Collaboration product detail">
        {(["task", "conversation"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={focus === value}
            onClick={() => setFocus(value)}
            className={`flex h-9 flex-1 items-center justify-center gap-2 border-b-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction} ${focus === value ? "border-[var(--color-folder-teal)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {value === "task" ? <ListChecks className="size-4" /> : <MessageSquare className="size-4" />}
            {value === "task" ? "Task detail" : "Folder conversation"}
          </button>
        ))}
      </div>
      <div className="overflow-hidden bg-[var(--color-graphite-950)]">
        <img
          key={focus}
          src={item.image}
          alt={item.alt}
          loading="lazy"
          className={`aspect-[4/3] w-full object-cover duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in-0 motion-reduce:animate-none ${focus === "task" ? "scale-110 object-[58%_top]" : "scale-125 origin-top-right object-[94%_top]"}`}
        />
      </div>
    </div>
  )
}

function ScheduleVisual() {
  const item = showcaseItems[2]
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-[12px] border border-white/15 bg-[var(--color-graphite-950)] shadow-[var(--elevation-2)]">
        <img src={item.image} alt={item.alt} loading="lazy" className="aspect-video w-full scale-110 object-cover object-[48%_22%]" />
      </div>
      <div className="mt-5 grid grid-cols-3 border-t border-white/15 text-[10px] font-semibold tracking-[0.1em] text-white/65 uppercase">
        <span className="pt-3 text-[var(--color-folder-fern)]">Business</span>
        <span className="border-x border-white/15 px-3 pt-3 text-center text-[var(--color-folder-rose)]">Home</span>
        <span className="pt-3 text-right text-[var(--color-folder-violet)]">Travel</span>
      </div>
    </div>
  )
}

function WorkflowVisual() {
  const item = showcaseItems[3]
  return (
    <div className="grid items-center gap-4 sm:flex">
      <div className="overflow-hidden rounded-[12px] border border-border bg-card p-1.5 shadow-[var(--elevation-1)] sm:flex-1">
        <div className="overflow-hidden bg-[var(--color-graphite-950)]">
          <img src={item.image} alt="" loading="lazy" className="aspect-[4/3] w-full scale-125 object-cover object-left-top" />
        </div>
        <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Project structure</p>
      </div>
      <div className="flex flex-row items-center justify-center gap-2 text-[var(--color-folder-ochre)] sm:flex-col">
        <Workflow className="size-5" />
        <ArrowRight className="size-4 sm:rotate-0" />
      </div>
      <div className="overflow-hidden rounded-[12px] border border-[color-mix(in_srgb,var(--color-folder-ochre)_30%,var(--border))] bg-card shadow-[var(--elevation-2)] sm:flex-1">
        <img src={item.image} alt={item.alt} loading="lazy" className="aspect-[4/3] w-full scale-150 origin-top-right object-cover object-right-top" />
        <div className="flex items-center gap-2 border-t border-border px-3 py-3 text-xs font-medium">
          <FolderInput className="size-4 text-[var(--color-folder-ochre)]" />
          Save once. Import clean.
        </div>
      </div>
    </div>
  )
}

export default function LandingScreen() {
  const [activeId, setActiveId] = useState<ShowcaseId>("organize")

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

      <section className="px-5 pt-8 sm:px-8 sm:pt-10">
        <div className="mx-auto grid w-full max-w-[1280px] items-end gap-8 lg:grid-cols-2 lg:gap-16">
          <div className="duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
            <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Personal focus. Shared momentum.</p>
            <h1 className="mt-4 leading-[0.98] tracking-[-0.055em]" style={{ fontSize: "clamp(44px, 5.3vw, 64px)" }}>
              <HeadlineLine id="organize" activeId={activeId} index="01" onActivate={setActiveId}>Organize the work.</HeadlineLine>
              <HeadlineLine id="collaborate" activeId={activeId} index="02" onActivate={setActiveId} quiet>Keep its context.</HeadlineLine>
              <HeadlineLine id="schedule" activeId={activeId} index="03" onActivate={setActiveId}>Move it forward.</HeadlineLine>
            </h1>
          </div>

          <div className="lg:pb-1">
            <p className="max-w-[54ch] text-[15px] leading-7 text-muted-foreground sm:text-[16px]">Dana brings tasks, projects, schedules, and collaboration into one focused workspace—so the plan and the work stay together.</p>
            <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <Button type="button" className={`h-11 gap-3 bg-primary px-5 text-sm font-medium text-primary-foreground shadow-none hover:bg-[var(--color-dana-accent-700)] active:translate-y-px ${interaction}`}><GoogleGlyph />Continue with Google</Button>
              <Button variant="ghost" className="h-11 gap-2 px-4 text-sm" render={<a href="#product" />}>See Dana in action<ArrowDown className="size-4" /></Button>
            </div>
            <p className="mt-3 max-w-[44ch] text-xs leading-5 text-muted-foreground">Dana requests only your Google profile and email for sign-in, sharing, and invitations.</p>
          </div>
        </div>
      </section>

      <HeroProductStage activeId={activeId} onActivate={setActiveId} />

      <section id="features" className="bg-[color-mix(in_srgb,var(--color-folder-violet)_7%,var(--background))] px-5 py-24 sm:px-8 sm:py-32">
        <Reveal className="mx-auto grid w-full max-w-[1180px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-folder-violet)] uppercase">Travel · Projects with shape</p>
            <h2 className="mt-4 max-w-[13ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">A folder can carry the whole plan.</h2>
            <p className="mt-6 max-w-[50ch] text-[15px] leading-7 text-muted-foreground">Dana pages combine the fast clarity of a task list with the structure a real project needs. Everything remains visible and editable in one place.</p>
            <DetailList heading="A folder can carry the whole plan." points={["Group work into shelves, folders, and sections", "Add writing between task groups to preserve decisions", "Switch between list and board views without changing the work"]} />
          </div>
          <OrganizeVisual />
        </Reveal>
      </section>

      <section className="border-y border-[color-mix(in_srgb,var(--color-folder-teal)_18%,var(--border))] bg-[color-mix(in_srgb,var(--color-folder-teal)_8%,var(--background))] px-5 py-24 sm:px-8 sm:py-32">
        <Reveal className="mx-auto grid w-full max-w-[1180px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <CollaborationVisual />
          <div>
            <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-folder-teal)] uppercase">Office · Work together in context</p>
            <h2 className="mt-4 max-w-[13ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">Open the task. Keep the project in view.</h2>
            <p className="mt-6 max-w-[50ch] text-[15px] leading-7 text-muted-foreground">A task expands where it lives. Steps, notes, attachments, comments, and the shared folder conversation remain connected instead of scattering across tools.</p>
            <DetailList heading="Open the task. Keep the project in view." points={["Break outcomes into clear, checkable steps", "Keep notes, files, and links on the task", "Use comments and the folder conversation for shared decisions"]} />
          </div>
        </Reveal>
      </section>

      <section className="bg-[var(--color-graphite-950)] px-5 py-24 text-white sm:px-8 sm:py-32">
        <Reveal className="mx-auto grid w-full max-w-[1180px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-dana-accent-700)] uppercase">Scheduled · Across projects</p>
            <h2 className="mt-4 max-w-[14ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">See every dated task without losing where it belongs.</h2>
            <p className="mt-6 max-w-[50ch] text-[15px] leading-7 text-white/60">Scheduled gathers commitments from across Dana and groups them by folder. Update the task here or return to its project with the same details intact.</p>
            <DetailList heading="See every dated task without losing where it belongs." points={["Bring due and overdue work into one view", "Keep folder identity, assignees, steps, and recurrence visible", "Choose list, board, or calendar presentation for the moment"]} inverse />
          </div>
          <ScheduleVisual />
        </Reveal>
      </section>

      <section id="workflows" className="bg-[color-mix(in_srgb,var(--color-folder-ochre)_8%,var(--background))] px-5 py-24 sm:px-8 sm:py-32">
        <Reveal className="mx-auto grid w-full max-w-[1180px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-folder-ochre)] uppercase">Reusable workflows</p>
            <h2 className="mt-4 max-w-[13ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">Good process should not start from zero.</h2>
            <p className="mt-6 max-w-[50ch] text-[15px] leading-7 text-muted-foreground">Save a folder or shelf as a workflow file and import it into a clean new workspace. The structure travels; private history does not.</p>
            <div className="mt-8 space-y-4 text-sm">
              <div className="flex gap-3 border-t border-border pt-4"><Workflow className="mt-0.5 size-5 shrink-0 text-[var(--color-folder-ochre)]" /><div><p className="font-semibold">Save as workflow</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Keep the page, sections, task titles, and steps.</p></div></div>
              <div className="flex gap-3 border-t border-border pt-4"><FolderOpen className="mt-0.5 size-5 shrink-0 text-[var(--color-folder-ochre)]" /><div><p className="font-semibold">Import into a new folder</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Dates, people, comments, and completion stay behind.</p></div></div>
            </div>
          </div>
          <WorkflowVisual />
        </Reveal>
      </section>

      <section className="border-t border-border px-5 py-24 text-center sm:px-8 sm:py-32">
        <Reveal className="mx-auto max-w-[760px]">
          <DanaMark className="mx-auto size-11" />
          <h2 className="mt-7 text-[clamp(34px,4.4vw,54px)] leading-[1.04] font-semibold tracking-[-0.045em]">A clear place for the work ahead.</h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-[15px] leading-7 text-muted-foreground">Start privately, invite people when the work needs them, and keep every next step attached to its project.</p>
          <Button type="button" className={`mt-8 h-11 min-w-56 gap-3 bg-primary px-5 text-sm font-medium text-primary-foreground shadow-none hover:bg-[var(--color-dana-accent-700)] active:translate-y-px ${interaction}`}><GoogleGlyph />Continue with Google</Button>
        </Reveal>
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
