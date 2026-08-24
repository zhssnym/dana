import { useEffect, useState } from "react"

import { DanaMark } from "@/components/dana-mark"
import { FolderMark } from "@/components/folder-mark"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Layers3,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Search,
  UsersRound,
} from "@/lib/icons"

type StoryStage = "library" | "shelf" | "project" | "task" | "dana"

const storyStages: Array<{ id: StoryStage; label: string; detail: string }> = [
  { id: "library", label: "Library", detail: "Everything you can reach" },
  { id: "shelf", label: "Shelf", detail: "A private area for related work" },
  { id: "project", label: "Project", detail: "The plan and its shared context" },
  { id: "task", label: "Task", detail: "One outcome, fully opened" },
  { id: "dana", label: "Ask Dana", detail: "Action proposed in context" },
]

const interaction =
  "transition-[color,background-color,border-color,opacity,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

function DanaIdentity() {
  return (
    <a
      href="?view=landing"
      className="inline-flex items-center gap-3 rounded-md text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      aria-label="Dana home"
    >
      <DanaMark className="size-8" />
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

function StoryTask({
  label,
  done = false,
  selected = false,
  onSelect,
}: {
  label: string
  done?: boolean
  selected?: boolean
  onSelect?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-center gap-3 border-b border-border/70 px-4 py-3 text-left outline-none last:border-b-0 hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 ${interaction} ${selected ? "bg-muted" : "bg-transparent"}`}
      aria-pressed={selected}
    >
      <span
        className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border ${interaction} ${done ? "border-foreground bg-foreground text-background" : "border-border bg-card text-transparent group-hover:border-muted-foreground"}`}
      >
        <Check className="size-3" strokeWidth={2} aria-hidden="true" />
      </span>
      <span className={`min-w-0 flex-1 truncate text-[13px] ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{label}</span>
      {selected ? <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
    </button>
  )
}

function ContextRail({ stage, onStageChange }: { stage: StoryStage; onStageChange: (stage: StoryStage) => void }) {
  const activeIndex = storyStages.findIndex((item) => item.id === stage)

  return (
    <div className="border-b border-white/10 px-3 py-3 sm:px-5" aria-label="Dana context path">
      <div
        className="mx-auto flex max-w-[1180px] items-center overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {storyStages.map((item, index) => (
          <div key={item.id} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onStageChange(item.id)}
              className={`group flex h-9 items-center gap-2 rounded-md px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${interaction} ${stage === item.id ? "bg-white text-[var(--color-graphite-950)]" : "text-[var(--color-graphite-400)] hover:bg-white/10 hover:text-white"}`}
              aria-pressed={stage === item.id}
              title={item.detail}
            >
              <span
                className={`flex size-4 items-center justify-center rounded-full border text-[9px] tabular-nums ${interaction} ${index <= activeIndex ? (stage === item.id ? "border-[var(--color-graphite-950)] bg-[var(--color-graphite-950)] text-white" : "border-white/35 bg-white/10 text-white") : "border-white/15 text-[var(--color-graphite-500)]"}`}
              >
                {index < activeIndex ? <Check className="size-2.5" strokeWidth={2} /> : index + 1}
              </span>
              {item.label}
            </button>
            {index < storyStages.length - 1 ? <span className={`mx-1 h-px w-4 ${index < activeIndex ? "bg-white/35" : "bg-white/10"}`} aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function DemoSidebar({ stage, onStageChange }: { stage: StoryStage; onStageChange: (stage: StoryStage) => void }) {
  const projectActive = ["project", "task", "dana"].includes(stage)

  return (
    <aside className="hidden border-r border-border bg-[var(--color-graphite-25)] md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <DanaMark className="size-6" />
        <span className="text-[13px] font-semibold">Dana</span>
      </div>
      <nav className="flex-1 space-y-5 p-3 text-[13px]" aria-label="Product demonstration navigation">
        <div>
          <p className="px-2 pb-2 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Workspace</p>
          <button
            type="button"
            onClick={() => onStageChange("library")}
            className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction} ${stage === "library" ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            <Layers3 className="size-4" strokeWidth={1.75} />
            Library
          </button>
        </div>
        <div>
          <p className="px-2 pb-2 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Personal shelf</p>
          <button
            type="button"
            onClick={() => onStageChange("project")}
            className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction} ${projectActive ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            <FolderMark name="Travel" className="size-4" />
            Travel
          </button>
          <button type="button" className={`mt-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction}`}>
            <FolderMark name="Home" className="size-4" />
            Home
          </button>
        </div>
        <div>
          <p className="px-2 pb-2 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Shared</p>
          <div className="flex items-center gap-2.5 px-2 py-2 text-muted-foreground">
            <UsersRound className="size-4" strokeWidth={1.75} />
            Team launch
          </div>
        </div>
      </nav>
      <button type="button" className={`m-3 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground outline-none hover:border-muted-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction}`}>
        <Search className="size-3.5" />
        Search Dana
        <span className="ml-auto text-[10px]">⌘ K</span>
      </button>
    </aside>
  )
}

function LibraryCanvas({ stage, onStageChange }: { stage: StoryStage; onStageChange: (stage: StoryStage) => void }) {
  const isShelf = stage === "shelf"

  return (
    <div className="min-h-[560px] bg-card p-5 sm:p-8 lg:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{isShelf ? "Library / Personal" : "Workspace"}</p>
          <h3 className="mt-2 text-[28px] font-semibold tracking-[-0.035em]">{isShelf ? "Personal" : "Library"}</h3>
          <p className="mt-2 max-w-[46ch] text-sm leading-6 text-muted-foreground">
            {isShelf ? "A private shelf for plans that can become shared when they are ready." : "Every shelf, folder, and shared project in one calm index."}
          </p>
        </div>
        <button type="button" className={`rounded-md border border-border p-2 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction}`} aria-label="Library options">
          <MoreHorizontal className="size-4" />
        </button>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onStageChange(isShelf ? "project" : "shelf")}
          className={`group col-span-full grid min-h-40 overflow-hidden rounded-[10px] border border-border bg-background text-left outline-none hover:border-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30 sm:grid-cols-[1fr_180px] ${interaction}`}
        >
          <div className="p-5">
            <div className="flex items-center gap-2.5">
              {isShelf ? <FolderMark name="Travel" className="size-5" /> : <Layers3 className="size-5" />}
              <span className="text-sm font-semibold">{isShelf ? "Travel" : "Personal"}</span>
            </div>
            <p className="mt-8 text-xs text-muted-foreground">{isShelf ? "8 tasks · shared with Hassan" : "4 folders · private"}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground">
              Open {isShelf ? "project" : "shelf"}
              <ArrowRight className="size-3 transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5" />
            </span>
          </div>
          <img src="/travel-route-editorial.png" alt="A train route along a mountain lake" className="hidden h-full w-full object-cover sm:block" />
        </button>
        {["Home", "Learning"].map((name, index) => (
          <div key={name} className="rounded-[10px] border border-border bg-background p-5">
            <div className="flex items-center gap-2.5">
              <FolderMark name={name} className="size-4" />
              <span className="text-sm font-medium">{name}</span>
            </div>
            <p className="mt-8 text-xs text-muted-foreground">{index === 0 ? "5 tasks" : "3 notes"}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectCanvas({ onTaskOpen }: { onTaskOpen: () => void }) {
  return (
    <div className="min-h-[560px] bg-card">
      <img src="/travel-route-editorial.png" alt="A train tracing the edge of a quiet mountain lake" className="h-36 w-full object-cover sm:h-44" />
      <div className="border-b border-border px-5 py-4 sm:px-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Personal / Travel</p>
            <h3 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">Travel</h3>
          </div>
          <div className="flex -space-x-2" aria-label="Shared with Imran and Hassan">
            <Avatar className="size-7 border-2 border-card"><AvatarFallback className="bg-[var(--color-folder-fern)] text-[9px] text-white">IK</AvatarFallback></Avatar>
            <Avatar className="size-7 border-2 border-card"><AvatarFallback className="bg-[var(--color-folder-rose)] text-[9px] text-white">HA</AvatarFallback></Avatar>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FolderMark name="Travel" className="size-4" />
            <span>8 tasks</span><span aria-hidden="true">·</span><span>2 people</span>
          </div>
          <div className="flex rounded-md border border-border bg-background p-0.5" aria-label="Project view">
            <button type="button" className="rounded-[4px] bg-foreground px-2.5 py-1 text-[11px] font-medium text-background">List</button>
            <button type="button" className={`rounded-[4px] px-2.5 py-1 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction}`}>Board</button>
          </div>
        </div>
        <section className="mt-5" aria-labelledby="transport-heading">
          <div className="mb-2 flex items-center justify-between">
            <h4 id="transport-heading" className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Transport</h4>
            <span className="text-[11px] text-muted-foreground">2 of 4</span>
          </div>
          <div className="overflow-hidden rounded-[8px] border border-border bg-background">
            <StoryTask label="Compare rail passes" done />
            <StoryTask label="Choose the Vancouver route" selected onSelect={onTaskOpen} />
            <StoryTask label="Reserve the sleeper cabin" />
            <StoryTask label="Share arrival details" />
          </div>
        </section>
        <div className="mt-5 grid grid-cols-[96px_1fr] gap-4 rounded-[8px] border border-border bg-[var(--color-graphite-25)] p-3">
          <img src="/travel-route-editorial.png" alt="" className="h-16 w-24 rounded-[6px] object-cover" />
          <div className="min-w-0 py-1">
            <p className="text-xs font-medium">Route reference</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">A visual block pinned beside the plan, so the destination stays present while the details change.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskDetail({ askDana }: { askDana: boolean }) {
  return (
    <aside className="border-t border-border bg-background lg:border-t-0 lg:border-l">
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <div className="flex items-center gap-2 text-xs font-medium"><ListChecks className="size-4" />Task</div>
        <button type="button" className={`rounded-md p-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction}`} aria-label="Task options"><MoreHorizontal className="size-4" /></button>
      </div>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-1 size-[18px] shrink-0 rounded-full border border-muted-foreground/50" />
          <div>
            <h4 className="text-[17px] leading-6 font-semibold tracking-[-0.02em]">Choose the Vancouver route</h4>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Compare timing, views, and connections before booking.</p>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-[84px_1fr] gap-y-3 border-y border-border py-4 text-xs">
          <dt className="text-muted-foreground">Due</dt><dd className="flex items-center gap-2"><CalendarDays className="size-3.5" /> Aug 28</dd>
          <dt className="text-muted-foreground">Assignee</dt><dd className="flex items-center gap-2"><Avatar className="size-5"><AvatarFallback className="bg-[var(--color-folder-fern)] text-[8px] text-white">IK</AvatarFallback></Avatar> Imran</dd>
          <dt className="text-muted-foreground">Project</dt><dd className="flex items-center gap-2"><FolderMark name="Travel" className="size-3.5" /> Travel</dd>
        </dl>
        <div className="mt-5">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Steps</p>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center gap-2"><span className="flex size-4 items-center justify-center rounded-full bg-foreground text-background"><Check className="size-2.5" /></span> Compare overnight options</div>
            <div className="flex items-center gap-2"><span className="size-4 rounded-full border border-muted-foreground/50" /> Check connection in Jasper</div>
          </div>
        </div>

        {askDana ? (
          <div className="mt-6 overflow-hidden rounded-[8px] border border-foreground bg-card">
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
              <DanaMark className="size-5" />
              <div><p className="text-xs font-semibold">Ask Dana</p><p className="text-[10px] text-muted-foreground">Working from this task and project</p></div>
            </div>
            <div className="p-3.5">
              <p className="text-xs leading-5">Find the best overnight route and turn the decision into the next steps.</p>
              <div className="mt-3 border-l-2 border-foreground pl-3">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Proposed changes</p>
                <p className="mt-1.5 text-xs leading-5">Add 3 steps, attach the route note, and assign the booking check to Hassan.</p>
              </div>
              <button type="button" className={`mt-4 flex w-full items-center justify-between rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background outline-none hover:bg-card-foreground focus-visible:ring-2 focus-visible:ring-ring/30 active:translate-y-px ${interaction}`}>
                Review changes<ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"><MessageSquare className="size-3.5" />Conversation</div>
            <div className="mt-3 flex gap-2.5">
              <Avatar className="size-6"><AvatarFallback className="bg-[var(--color-folder-rose)] text-[8px] text-white">HA</AvatarFallback></Avatar>
              <div className="rounded-[7px] bg-muted px-3 py-2.5 text-[11px] leading-5">The Jasper connection gives us the best daylight stretch.</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function WorkspaceStory() {
  const [stage, setStage] = useState<StoryStage>("project")
  const showProject = ["project", "task", "dana"].includes(stage)
  const showDetail = stage === "task" || stage === "dana"
  const current = storyStages.find((item) => item.id === stage) ?? storyStages[0]

  return (
    <figure className="mx-auto w-full max-w-[1280px]">
      <div className="overflow-hidden rounded-[14px] border border-white/15 bg-[var(--color-graphite-950)] shadow-[var(--elevation-2)]">
        <ContextRail stage={stage} onStageChange={setStage} />
        <div className={`grid bg-card md:grid-cols-[190px_minmax(0,1fr)] ${showDetail ? "lg:grid-cols-[190px_minmax(0,1fr)_340px]" : ""}`}>
          <DemoSidebar stage={stage} onStageChange={setStage} />
          <div key={stage} className="min-w-0 duration-[var(--duration-base)] ease-[var(--ease-enter)] animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
            {showProject ? <ProjectCanvas onTaskOpen={() => setStage("task")} /> : <LibraryCanvas stage={stage} onStageChange={setStage} />}
          </div>
          {showDetail ? <TaskDetail askDana={stage === "dana"} /> : null}
        </div>
      </div>
      <figcaption className="mt-5 flex flex-col gap-2 text-xs leading-5 text-[var(--color-graphite-400)] sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <span className="font-semibold tracking-[0.1em] uppercase">{current.label}</span>
        <span className="max-w-[52ch] sm:text-right">{current.detail}. Choose any step above to move through the same connected workspace.</span>
      </figcaption>
    </figure>
  )
}

function ContextEditorial() {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
      <div>
        <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Context that travels</p>
        <h2 className="mt-4 max-w-[12ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">The project carries the work.</h2>
        <p className="mt-6 max-w-[48ch] text-[15px] leading-7 text-muted-foreground">Tasks, references, people, discussion, and decisions live on the same structure. Open one item and the useful context is already there.</p>
      </div>
      <div className="overflow-hidden rounded-[12px] border border-border bg-card shadow-[var(--elevation-1)]">
        <div className="grid sm:grid-cols-[1fr_260px]">
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-2 text-xs font-medium"><FolderMark name="Travel" className="size-4" /> Travel / Transport</div>
            <h3 className="mt-6 text-xl font-semibold tracking-[-0.025em]">Choose the Vancouver route</h3>
            <div className="mt-6 space-y-3 text-xs">
              <div className="flex items-center gap-3 border-b border-border pb-3"><CalendarDays className="size-4 text-muted-foreground" /> Due Aug 28</div>
              <div className="flex items-center gap-3 border-b border-border pb-3"><FileText className="size-4 text-muted-foreground" /> Route comparison attached</div>
              <div className="flex items-center gap-3"><UsersRound className="size-4 text-muted-foreground" /> Shared with Hassan</div>
            </div>
          </div>
          <div className="border-t border-border bg-[var(--color-graphite-25)] p-5 sm:border-t-0 sm:border-l">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Latest</p>
            <div className="mt-4 flex gap-2.5">
              <Avatar className="size-6"><AvatarFallback className="bg-[var(--color-folder-rose)] text-[8px] text-white">HA</AvatarFallback></Avatar>
              <p className="text-[11px] leading-5 text-muted-foreground">I compared the daylight stretches and added the Jasper note.</p>
            </div>
            <img src="/travel-route-editorial.png" alt="Mountain rail route reference" className="mt-5 aspect-[4/3] w-full rounded-[7px] object-cover" />
          </div>
        </div>
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
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
        <DanaIdentity />
        <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Public navigation">
          <a href="#product" className={`hidden rounded-md px-3 py-2 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:block ${interaction}`}>Product</a>
          <a href="#context" className={`hidden rounded-md px-3 py-2 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:block ${interaction}`}>How Dana works</a>
          <Button type="button" size="sm" className="ml-2 bg-foreground text-background shadow-none hover:bg-card-foreground">Sign in</Button>
        </nav>
      </header>

      <section className="px-5 pt-16 pb-16 text-center sm:px-8 sm:pt-20 sm:pb-12">
        <div className="mx-auto max-w-[1000px] duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
          <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Personal focus. Shared momentum.</p>
          <h1 className="mt-5 text-[clamp(44px,6.2vw,76px)] leading-[0.98] font-semibold tracking-[-0.055em] text-foreground">
            <span className="block">Organize the work.</span>
            <span className="mt-1 block font-normal text-muted-foreground">Keep its context.</span>
            <span className="mt-1 block">Move it forward.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-[660px] text-[16px] leading-7 text-muted-foreground sm:text-[17px]">Dana brings tasks, projects, schedules, people, and contextual AI into one shared workspace—so planning and doing stay connected.</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button type="button" className={`h-11 min-w-56 gap-3 bg-foreground px-5 text-sm font-medium text-background shadow-none hover:bg-card-foreground active:translate-y-px ${interaction}`}><GoogleGlyph />Continue with Google</Button>
            <Button variant="ghost" className="h-11 gap-2 px-4 text-sm" render={<a href="#product" />}>See the workspace<ArrowRight className="size-4" /></Button>
          </div>
          <p className="mx-auto mt-4 max-w-[44ch] text-xs leading-5 text-muted-foreground">Dana requests only your Google profile and email for sign-in, sharing, and invitations.</p>
        </div>
      </section>

      <section id="product" className="relative overflow-hidden bg-[var(--color-graphite-950)] px-4 py-12 sm:px-8 sm:py-16">
        <DanaMark className="pointer-events-none absolute -top-36 -right-36 size-[520px] opacity-[0.1]" surface="dark" plate={false} />
        <div className="relative z-10"><WorkspaceStory /></div>
      </section>

      <section id="context" className="border-b border-border bg-background px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto w-full max-w-[1180px]"><ContextEditorial /></div>
      </section>

      <section className="border-b border-border bg-[var(--color-graphite-25)] px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto grid w-full max-w-[1180px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div className="order-2 overflow-hidden rounded-[12px] border border-border bg-card shadow-[var(--elevation-1)] lg:order-1">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-4"><DanaMark className="size-6" /><span className="text-sm font-semibold">Ask Dana</span><span className="ml-auto text-[11px] text-muted-foreground">Travel / Route</span></div>
            <div className="p-5 sm:p-7">
              <p className="max-w-[54ch] text-sm leading-6">Find the strongest overnight route, then prepare the follow-up work without losing this project’s constraints.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {["Compare routes", "Draft next steps", "Assign the booking check"].map((label, index) => <div key={label} className="border-t border-border pt-3"><p className="text-[10px] font-semibold tabular-nums text-muted-foreground">0{index + 1}</p><p className="mt-2 text-xs leading-5">{label}</p></div>)}
              </div>
              <div className="mt-6 flex flex-col gap-3 border-l-2 border-foreground bg-[var(--color-graphite-25)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Proposed, not applied</p><p className="mt-1 text-xs">3 native changes ready for review</p></div>
                <Button size="sm" className="bg-foreground text-background shadow-none hover:bg-card-foreground">Review changes <ArrowRight className="size-3.5" /></Button>
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">AI inside the work</p>
            <h2 className="mt-4 max-w-[12ch] text-[clamp(34px,4vw,52px)] leading-[1.06] font-semibold tracking-[-0.045em]">Dana acts on what you can already see.</h2>
            <p className="mt-6 max-w-[48ch] text-[15px] leading-7 text-muted-foreground">Ask from the task, project, or library you are in. Dana can prepare changes using that context, while the final action stays explicit and reviewable.</p>
          </div>
        </div>
      </section>

      <section className="px-5 py-24 text-center sm:px-8 sm:py-32">
        <div className="mx-auto max-w-[760px]">
          <DanaMark className="mx-auto size-11" />
          <h2 className="mt-7 text-[clamp(34px,4.4vw,54px)] leading-[1.04] font-semibold tracking-[-0.045em]">A clear place for the work ahead.</h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-[15px] leading-7 text-muted-foreground">Start privately, invite people when the work needs them, and keep every next step attached to its context.</p>
          <Button type="button" className={`mt-8 h-11 min-w-56 gap-3 bg-foreground px-5 text-sm font-medium text-background shadow-none hover:bg-card-foreground active:translate-y-px ${interaction}`}><GoogleGlyph />Continue with Google</Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-8">
          <DanaIdentity /><span className="sm:ml-3">© 2026 Dana</span>
          <div className="flex gap-5 sm:ml-auto">
            <a id="privacy" href="#privacy" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">Privacy</a>
            <a id="terms" href="#terms" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
