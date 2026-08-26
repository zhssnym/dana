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
  Play,
  Workflow,
} from "@/lib/icons"

type HeroFocus = "organize" | "context" | "progress"
type StructureLevel = "library" | "shelf" | "folder" | "task"
type ScheduleFilter = "all" | "Business" | "Home" | "Office" | "Travel"

const heroFocusItems = [
  {
    id: "organize" as const,
    label: "Organize",
    title: "A library that stays legible as the work grows.",
    detail: "Shelves separate the broad areas of life. Folders keep every project close enough to open in one move.",
  },
  {
    id: "context" as const,
    label: "Keep context",
    title: "The plan lives on the same page as the tasks.",
    detail: "Sections, project notes, dates, people, and progress stay visible instead of disappearing into separate tools.",
  },
  {
    id: "progress" as const,
    label: "Move forward",
    title: "Every next step keeps its place in the project.",
    detail: "Due dates, assignees, completion, and sections make progress readable without turning work into administration.",
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
  id: HeroFocus
  activeId: HeroFocus
  index: string
  children: ReactNode
  onActivate: (id: HeroFocus) => void
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
  id: HeroFocus
  activeId: HeroFocus
  icon: ReactNode
  label: string
  className: string
  onActivate: (id: HeroFocus) => void
}) {
  const active = activeId === id
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onActivate(id)}
      className={`absolute z-20 hidden items-center gap-2 border bg-card px-3 py-2 text-xs font-medium text-card-foreground shadow-[var(--elevation-1)] outline-none focus-visible:ring-2 focus-visible:ring-ring/30 xl:flex ${className} ${interaction} ${active ? "translate-y-0 border-primary" : "border-border opacity-70 hover:-translate-y-0.5 hover:opacity-100"}`}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      {label}
    </button>
  )
}

function HeroProductStage({ activeId, onActivate }: { activeId: HeroFocus; onActivate: (id: HeroFocus) => void }) {
  const active = heroFocusItems.find((item) => item.id === activeId) ?? heroFocusItems[0]
  const [walking, setWalking] = useState(false)

  useEffect(() => {
    if (!walking) return
    const current = heroFocusItems.findIndex((item) => item.id === activeId)
    if (current >= heroFocusItems.length - 1) {
      setWalking(false)
      return
    }
    const timer = window.setTimeout(() => onActivate(heroFocusItems[current + 1]?.id ?? "organize"), 1800)
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
              src="/dana-product-travel.png"
              alt="The real Dana Travel folder showing shelves, tasks, sections, due dates, assignees, and progress."
              loading="eager"
              className="aspect-video w-full scale-[1.04] origin-[34%_42%] object-cover object-[34%_top]"
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute border border-white/60 bg-white/5 ${interaction} ${activeId === "organize" ? "top-[12%] bottom-[5%] left-[1%] w-[15%] opacity-100" : activeId === "context" ? "top-[20%] right-[10%] bottom-[10%] left-[25%] opacity-100" : "top-[31%] right-[12%] bottom-[28%] left-[25%] opacity-100"}`}
            />
          </div>

          <ProductAnnotation id="organize" activeId={activeId} icon={<Folders className="size-4" />} label="Library to folder" className="-left-8 top-[24%] after:absolute after:top-1/2 after:left-full after:w-8 after:border-t after:border-dashed after:border-current after:opacity-35" onActivate={onActivate} />
          <ProductAnnotation id="context" activeId={activeId} icon={<FolderOpen className="size-4" />} label="One project page" className="-right-8 top-[31%] before:absolute before:top-1/2 before:right-full before:w-8 before:border-t before:border-dashed before:border-current before:opacity-35" onActivate={onActivate} />
          <ProductAnnotation id="progress" activeId={activeId} icon={<ListChecks className="size-4" />} label="Progress in place" className="-right-5 bottom-[17%] before:absolute before:top-1/2 before:right-full before:w-8 before:border-t before:border-dashed before:border-current before:opacity-35" onActivate={onActivate} />
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
            {walking ? "Playing walkthrough" : "Play focus walkthrough"}
          </button>
        </div>

        <div className="mt-8 flex overflow-x-auto border-t border-white/15 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }} role="tablist" aria-label="Dana workspace focus">
          {heroFocusItems.map((item, index) => {
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
                className={`flex min-w-40 flex-1 items-center gap-3 border-t-2 px-1 py-4 text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${interaction} ${selected ? "border-primary text-white" : "border-transparent text-white/45 hover:text-white"}`}
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

const structureItems: Array<{ id: StructureLevel; label: string; meta: string; icon: ReactNode }> = [
  { id: "library", label: "Library", meta: "Every area", icon: <Folders className="size-4" /> },
  { id: "shelf", label: "Work", meta: "Shelf", icon: <FolderOpen className="size-4" /> },
  { id: "folder", label: "Office", meta: "Folder · 4", icon: <FolderOpen className="size-4" /> },
  { id: "task", label: "Review grant application", meta: "Task · 2/4", icon: <ListChecks className="size-4" /> },
]

const structureDetail: Record<StructureLevel, { eyebrow: string; title: string; body: string }> = {
  library: { eyebrow: "Library", title: "Personal and Work", body: "The stable map for every shelf and folder." },
  shelf: { eyebrow: "Shelf", title: "Work", body: "Business, Investment, and Office stay grouped without becoming one long list." },
  folder: { eyebrow: "Folder", title: "Office", body: "A project page for tasks, writing, sections, and people." },
  task: { eyebrow: "Task", title: "Review grant application", body: "Steps, notes, attachments, and comments open where the task already lives." },
}

function StructureDemo() {
  const [selected, setSelected] = useState<StructureLevel>("folder")
  const detail = structureDetail[selected]

  return (
    <div className="grid overflow-hidden rounded-[12px] border border-[color-mix(in_srgb,var(--color-folder-violet)_28%,var(--border))] bg-card shadow-[var(--elevation-2)] sm:grid-cols-[0.92fr_1.08fr]">
      <div className="border-b border-border bg-[color-mix(in_srgb,var(--color-folder-violet)_8%,var(--card))] p-5 sm:border-r sm:border-b-0">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-[var(--color-folder-violet)] uppercase">Follow the structure</p>
        <div className="relative mt-5 space-y-2 before:absolute before:top-4 before:bottom-4 before:left-[15px] before:border-l before:border-dashed before:border-[var(--color-folder-violet)]/35">
          {structureItems.map((item, index) => {
            const active = selected === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(item.id)}
                className={`relative flex w-full items-center gap-3 border px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction} ${active ? "translate-x-1 border-[var(--color-folder-violet)] bg-card" : "border-transparent hover:border-border hover:bg-card/70"}`}
                style={{ marginLeft: `${Math.min(index * 12, 28)}px`, width: `calc(100% - ${Math.min(index * 12, 28)}px)` }}
              >
                <span className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md ${active ? "bg-[var(--color-folder-violet)] text-white" : "bg-muted text-muted-foreground"}`}>{item.icon}</span>
                <span className="min-w-0"><span className="block truncate text-xs font-semibold">{item.label}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{item.meta}</span></span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex min-h-80 flex-col p-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{detail.eyebrow}</span>
          <span className="size-2 rounded-full bg-[var(--color-folder-violet)]" />
        </div>
        <div key={selected} className="duration-[var(--duration-slow)] animate-in fade-in-0 slide-in-from-right-1 motion-reduce:animate-none">
          <h3 className="mt-6 text-xl font-semibold tracking-[-0.025em]">{detail.title}</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail.body}</p>
        </div>
        <div className="mt-auto space-y-2 pt-7">
          {selected === "task" ? (
            <>
              {["Confirm outcomes section", "Check budget figures", "Send final review"].map((label, index) => <div key={label} className="flex items-center gap-3 border-t border-border pt-2 text-xs"><span className={`flex size-4 items-center justify-center border ${index === 0 ? "border-[var(--color-folder-fern)] bg-[var(--color-folder-fern)] text-white" : "border-border"}`}>{index === 0 && <Check className="size-3" />}</span>{label}</div>)}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 border-t border-border pt-3 text-xs font-medium"><span className="size-4 border border-border" />Review community grant application</div>
              <div className="flex items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground"><span className="size-4 border border-border" />Prepare the committee agenda</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CollaborationVisual() {
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
          src="/dana-product-collaboration.png"
          alt="The real Dana Office folder with an expanded task, steps, notes, attachments, comments, and the conversation panel."
          loading="lazy"
          className={`aspect-[4/3] w-full object-cover duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in-0 motion-reduce:animate-none ${focus === "task" ? "scale-110 object-[58%_top]" : "scale-125 origin-top-right object-[94%_top]"}`}
        />
      </div>
    </div>
  )
}

const scheduledTasks: Array<{ folder: Exclude<ScheduleFilter, "all">; title: string; meta: string; color: string }> = [
  { folder: "Business", title: "Review the release readiness checklist", meta: "14 Aug", color: "var(--color-folder-fern)" },
  { folder: "Home", title: "Water the balcony plants", meta: "Due today · Weekly", color: "var(--color-folder-rose)" },
  { folder: "Office", title: "Review community grant application", meta: "Overdue · 2/4", color: "var(--color-folder-teal)" },
  { folder: "Travel", title: "Confirm venue accessibility details", meta: "Due today · Sara", color: "var(--color-folder-violet)" },
]

function ScheduleDemo() {
  const [filter, setFilter] = useState<ScheduleFilter>("all")
  const visible = filter === "all" ? scheduledTasks : scheduledTasks.filter((task) => task.folder === filter)

  return (
    <div className="border border-white/15 bg-white/[0.035] p-4 shadow-[var(--elevation-2)] sm:p-5">
      <div className="flex flex-col gap-4 border-b border-white/15 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><CalendarDays className="size-5 text-white/70" /><div><p className="text-sm font-semibold">Scheduled</p><p className="mt-0.5 text-[10px] text-white/45">Everything with a date</p></div></div>
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter the scheduled demonstration">
          {(["all", "Business", "Home", "Office", "Travel"] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`h-7 shrink-0 border px-2.5 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${interaction} ${filter === value ? "border-white/35 bg-white text-[var(--color-graphite-950)]" : "border-white/10 text-white/50 hover:border-white/25 hover:text-white"}`}>{value === "all" ? "All" : value}</button>
          ))}
        </div>
      </div>
      <div className="min-h-[330px] pt-2" aria-live="polite">
        {visible.map((task) => (
          <button key={task.folder} type="button" onClick={() => setFilter(task.folder)} className={`group grid w-full grid-cols-[20px_1fr_auto] items-start gap-3 border-b border-white/10 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${interaction} hover:bg-white/[0.04]`}>
            <span className="mt-0.5 size-4 border border-white/25 group-hover:border-white/50" />
            <span><span className="flex items-center gap-2 text-xs font-semibold"><span className="size-1.5 rounded-full" style={{ background: task.color }} />{task.folder}</span><span className="mt-1.5 block text-sm text-white/85">{task.title}</span></span>
            <span className={`pt-5 text-[10px] ${task.meta.startsWith("Overdue") ? "text-[var(--color-destructive-500)]" : "text-white/45"}`}>{task.meta}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-white/15 pt-3 text-[10px] text-white/40"><span>{visible.length} dated {visible.length === 1 ? "task" : "tasks"}</span><span>List · Board · Calendar</span></div>
    </div>
  )
}

const workflowSteps = [
  { label: "Project folder", title: "Travel launch", icon: <FolderOpen className="size-5" /> },
  { label: "Workflow file", title: "Travel.dana", icon: <Workflow className="size-5" /> },
  { label: "Clean import", title: "New launch", icon: <FolderInput className="size-5" /> },
]

function WorkflowDemo() {
  const [step, setStep] = useState(0)
  const next = () => setStep((current) => (current + 1) % workflowSteps.length)

  return (
    <div className="border border-[color-mix(in_srgb,var(--color-folder-ochre)_30%,var(--border))] bg-card p-5 shadow-[var(--elevation-2)]">
      <div className="flex items-center justify-between border-b border-border pb-4"><div><p className="text-[10px] font-semibold tracking-[0.12em] text-[var(--color-folder-ochre)] uppercase">Reusable structure</p><p className="mt-1 text-xs text-muted-foreground">Select each stage to inspect the transfer.</p></div><button type="button" onClick={next} className={`flex size-9 items-center justify-center border border-border text-[var(--color-folder-ochre)] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction}`} aria-label="Show the next workflow stage"><Play className="size-4" /></button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
        {workflowSteps.map((item, index) => (
          <div key={item.label} className="contents">
            {index > 0 && <div className={`hidden items-center sm:flex ${index <= step ? "text-[var(--color-folder-ochre)]" : "text-muted-foreground/40"}`} aria-hidden="true"><span className="w-4 border-t border-dashed border-current" /><ArrowRight className="size-4" /></div>}
            <button type="button" aria-pressed={step === index} onClick={() => setStep(index)} className={`min-h-32 border p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction} ${step === index ? "-translate-y-1 border-[var(--color-folder-ochre)] bg-[color-mix(in_srgb,var(--color-folder-ochre)_8%,var(--card))]" : "border-border hover:border-[var(--color-folder-ochre)]/50"}`}>
              <span className={step === index ? "text-[var(--color-folder-ochre)]" : "text-muted-foreground"}>{item.icon}</span>
              <span className="mt-5 block text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{item.label}</span>
              <span className="mt-1 block text-sm font-semibold">{item.title}</span>
            </button>
          </div>
        ))}
      </div>
      <div key={step} className="mt-5 border-t border-border pt-4 duration-[var(--duration-slow)] animate-in fade-in-0 motion-reduce:animate-none">
        {step === 0 && <div className="flex flex-wrap gap-2">{["Page", "Sections", "Task titles", "Steps", "Dates", "Comments"].map((item) => <span key={item} className="border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground">{item}</span>)}</div>}
        {step === 1 && <p className="flex items-center gap-2 text-xs"><Workflow className="size-4 text-[var(--color-folder-ochre)]" />Structure is saved as a portable Dana workflow.</p>}
        {step === 2 && <div className="grid gap-2 text-[10px] sm:grid-cols-2"><p className="flex items-center gap-2 border border-border px-3 py-2"><Check className="size-3 text-[var(--color-folder-fern)]" />Page, sections, titles, steps</p><p className="flex items-center gap-2 border border-border px-3 py-2 text-muted-foreground"><span className="size-3 border border-border" />Dates, people, history stay behind</p></div>}
      </div>
    </div>
  )
}

export default function LandingScreen() {
  const [activeId, setActiveId] = useState<HeroFocus>("organize")

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
              <HeadlineLine id="context" activeId={activeId} index="02" onActivate={setActiveId} quiet>Keep its context.</HeadlineLine>
              <HeadlineLine id="progress" activeId={activeId} index="03" onActivate={setActiveId}>Move it forward.</HeadlineLine>
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
          <div><p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-folder-violet)] uppercase">Library · Projects with shape</p><h2 className="mt-4 max-w-[13ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">A folder can carry the whole plan.</h2><p className="mt-6 max-w-[50ch] text-[15px] leading-7 text-muted-foreground">Dana pages combine the fast clarity of a task list with the structure a real project needs. Everything remains visible and editable in one place.</p><DetailList heading="A folder can carry the whole plan." points={["Group work into shelves, folders, and sections", "Add writing between task groups to preserve decisions", "Switch between list and board views without changing the work"]} /></div>
          <StructureDemo />
        </Reveal>
      </section>

      <section className="border-y border-[color-mix(in_srgb,var(--color-folder-teal)_18%,var(--border))] bg-[color-mix(in_srgb,var(--color-folder-teal)_8%,var(--background))] px-5 py-24 sm:px-8 sm:py-32">
        <Reveal className="mx-auto grid w-full max-w-[1180px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <CollaborationVisual />
          <div><p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-folder-teal)] uppercase">Office · Work together in context</p><h2 className="mt-4 max-w-[13ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">Open the task. Keep the project in view.</h2><p className="mt-6 max-w-[50ch] text-[15px] leading-7 text-muted-foreground">A task expands where it lives. Steps, notes, attachments, comments, and the shared folder conversation remain connected instead of scattering across tools.</p><DetailList heading="Open the task. Keep the project in view." points={["Break outcomes into clear, checkable steps", "Keep notes, files, and links on the task", "Use comments and the folder conversation for shared decisions"]} /></div>
        </Reveal>
      </section>

      <section className="bg-[var(--color-graphite-950)] px-5 py-24 text-white sm:px-8 sm:py-32">
        <Reveal className="mx-auto grid w-full max-w-[1180px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div><p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-dana-accent-700)] uppercase">Scheduled · Across projects</p><h2 className="mt-4 max-w-[14ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">See every dated task without losing where it belongs.</h2><p className="mt-6 max-w-[50ch] text-[15px] leading-7 text-white/60">Scheduled gathers commitments from across Dana and groups them by folder. Update the task here or return to its project with the same details intact.</p><DetailList heading="See every dated task without losing where it belongs." points={["Bring due and overdue work into one view", "Keep folder identity, assignees, steps, and recurrence visible", "Choose list, board, or calendar presentation for the moment"]} inverse /></div>
          <ScheduleDemo />
        </Reveal>
      </section>

      <section id="workflows" className="bg-[color-mix(in_srgb,var(--color-folder-ochre)_8%,var(--background))] px-5 py-24 sm:px-8 sm:py-32">
        <Reveal className="mx-auto grid w-full max-w-[1180px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div><p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-folder-ochre)] uppercase">Reusable workflows</p><h2 className="mt-4 max-w-[13ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">Good process should not start from zero.</h2><p className="mt-6 max-w-[50ch] text-[15px] leading-7 text-muted-foreground">Save a folder or shelf as a workflow file and import it into a clean new workspace. The structure travels; private history does not.</p><div className="mt-8 space-y-4 text-sm"><div className="flex gap-3 border-t border-border pt-4"><Workflow className="mt-0.5 size-5 shrink-0 text-[var(--color-folder-ochre)]" /><div><p className="font-semibold">Save as workflow</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Keep the page, sections, task titles, and steps.</p></div></div><div className="flex gap-3 border-t border-border pt-4"><FolderOpen className="mt-0.5 size-5 shrink-0 text-[var(--color-folder-ochre)]" /><div><p className="font-semibold">Import into a new folder</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Dates, people, comments, and completion stay behind.</p></div></div></div></div>
          <WorkflowDemo />
        </Reveal>
      </section>

      <section className="border-t border-border px-5 py-24 text-center sm:px-8 sm:py-32"><Reveal className="mx-auto max-w-[760px]"><DanaMark className="mx-auto size-11" /><h2 className="mt-7 text-[clamp(34px,4.4vw,54px)] leading-[1.04] font-semibold tracking-[-0.045em]">A clear place for the work ahead.</h2><p className="mx-auto mt-5 max-w-[52ch] text-[15px] leading-7 text-muted-foreground">Start privately, invite people when the work needs them, and keep every next step attached to its project.</p><Button type="button" className={`mt-8 h-11 min-w-56 gap-3 bg-primary px-5 text-sm font-medium text-primary-foreground shadow-none hover:bg-[var(--color-dana-accent-700)] active:translate-y-px ${interaction}`}><GoogleGlyph />Continue with Google</Button></Reveal></section>

      <footer className="border-t border-border"><div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-8"><DanaIdentity /><span className="sm:ml-3">© 2026 Dana</span><div className="flex gap-5 sm:ml-auto"><a href="?view=privacy" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">Privacy</a><a href="?view=terms" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">Terms</a></div></div></footer>
    </main>
  )
}
