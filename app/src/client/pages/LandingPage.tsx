/*
9.2's public page, at `/`.

**The copy is the design's.** 9.2 fixes the rules copy is written under, not the
sentences, so a later revision of them is a design change rather than a
specification amendment. The one string 9.2 still spells is the line under the
sign-in control, which discloses what Dana takes rather than claiming what Dana
does; it is written here exactly as that section spells it.

**The claim rule is the one to watch, and it is broken by addition.** 9.2 says
the page may name no capability Dana does not ship, of which the no-AI-claim
rule is the instance AC-159 asserts by reading the whole rendered body. Nothing
here may promise a capability that is not in section 1's product.

**There is one "Continue with Google", and it is a link.** Two calls to action,
one in the hero and one in a closing block, is the shape 9.2 forbids. The
closing block keeps its words and has no button; so that this costs no reach,
the header is sticky, which puts the sign-in path one glance from every point on
a page this long. The header's control is named "Sign in" and is navigation to
the same destination rather than a second call to action; AC-159 counts the name
9.2 fixes, and this is not it.

It is a link and not a button, which 9.2 states outright as behaviour rather
than presentation: it carries the viewer's detected timezone to 7.1's
authorisation endpoint, which is how a first session gets a timezone before any
row exists to hold one, and a link is what makes that destination visible,
bookmarkable and reachable with scripting unavailable.

**Details worth keeping.**

The heading's rotating verb keeps its fixed accessible name: "A place to finish
the work." is what assistive technology reads, and the verb rotates only behind
`aria-hidden`. 9.2 requires exactly that of any animated heading: a heading
whose text depends on when it is sampled has no name at all.

The copyright year is computed rather than typed, so the line is never wrong.

There is no mount-time viewport-minimum override: this application pins no
desktop floor on `document.body`, so there is nothing to undo.

**The two product images must picture the built client.** A landing page that
pictures screens the product does not draw is the claim rule failing by
illustration rather than by sentence.

A signed-in visitor goes to `/app` (AC-956, issue #326): `dana.so` and its
bookmarks otherwise offered "Sign in" over a live 30-day session, and the click
went round Google for nothing. The server answers a signed-in `/` with a 302
before this page is sent (`server/index.ts`), so in production nothing here
draws; this check is the fallback for Vite's dev server, which the server never
sees. It is the `/me` read `main.tsx` already prefetches, so the load costs no
extra request, and only a 200 moves anyone: a 401, an offline or a slow answer
keeps the page. A query string keeps it too, on both sides, so `?signin=failed`
still says its sentence and `/?about` shows a signed-in person the page.
*/
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { useMe } from '../api/queries.js'
import { browserTimezone } from '../api/tz.js'
import { Button } from '../components/ui/button.js'
import { DanaMark } from '../components/dana-mark.js'
import { paths } from '../routes.js'
/* The public family's header control, shared so the legal pages wear the same
   one rather than a second copy of it. */
import { DanaIdentity } from './dana-identity.js'
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  FolderInput,
  FolderOpen,
  Folders,
  LampDesk,
  Layers3,
  ListChecks,
  MessageSquare,
  Workflow,
} from '../lib/icons.js'

type HeroFocus = 'organize' | 'context' | 'progress'
type OrganizationLevel = 'desk' | 'shelf' | 'folder' | 'task'

/*
The verb that rotates inside the heading. The heading's meaning is carried by
the fixed sentence beside it, so these are decoration and never the name.
*/
const heroWords = [
  {
    label: 'plan',
    color: 'color-mix(in srgb, var(--color-dana-accent-600) 72%, var(--foreground))',
  },
  {
    label: 'shape',
    color: 'color-mix(in srgb, var(--color-folder-sky) 68%, var(--foreground))',
  },
  {
    label: 'share',
    color: 'color-mix(in srgb, var(--color-folder-teal) 70%, var(--foreground))',
  },
  {
    label: 'finish',
    color: 'color-mix(in srgb, var(--color-folder-fern) 70%, var(--foreground))',
  },
] as const

/*
Both of the lists below are typed as non-empty tuples rather than arrays, so
that `[0]` is a value and not a maybe. `noUncheckedIndexedAccess` is on, and
the alternative at each of the six use sites is a fallback for a case the
literal makes impossible.
*/
interface HeroFocusItem {
  readonly id: HeroFocus
  readonly label: string
  readonly title: string
  readonly detail: string
}

const heroFocusItems: readonly [HeroFocusItem, ...HeroFocusItem[]] = [
  {
    id: 'organize' as const,
    label: 'Organize',
    title: 'A calm map for work of every size.',
    detail:
      'Desk catches loose ends. Shelves separate the broad areas of life. Folders give every project a place of its own.',
  },
  {
    id: 'context' as const,
    label: 'Keep context',
    title: 'The plan stays beside the tasks.',
    detail:
      'Sections, writing, dates, people, and progress remain visible instead of being scattered across separate tools.',
  },
  {
    id: 'progress' as const,
    label: 'Move forward',
    title: 'Every next step keeps its place.',
    detail:
      'Open the project, see what matters now, and finish the work without losing the thinking that shaped it.',
  },
]

interface OrganizationItem {
  readonly id: OrganizationLevel
  readonly label: string
  readonly title: string
  readonly detail: string
  readonly color: string
  readonly icon: ReactNode
}

const organizationItems: readonly [OrganizationItem, ...OrganizationItem[]] = [
  {
    id: 'desk',
    label: 'Desk',
    title: 'Capture it before you classify it.',
    detail:
      'Desk holds loose tasks and ideas until there is a useful reason to move them somewhere more specific.',
    color: 'var(--color-dana-accent-600)',
    icon: <LampDesk className="size-7" />,
  },
  {
    id: 'shelf',
    label: 'Shelf',
    title: 'Separate personal, shared, and work.',
    detail:
      'Shelves divide the broad areas of the library without turning navigation into one long list.',
    color: 'var(--color-folder-fern)',
    icon: <Layers3 className="size-7" />,
  },
  {
    id: 'folder',
    label: 'Folder',
    title: 'Keep one outcome in one place.',
    detail:
      'A folder holds the brief, writing, sections, tasks, people, and progress for a single project.',
    color: 'var(--color-folder-violet)',
    icon: <FolderOpen className="size-7" />,
  },
  {
    id: 'task',
    label: 'Task',
    title: 'Open the detail without leaving the project.',
    detail:
      'Steps, notes, files, and comments appear where the task already lives, with its folder still in view.',
    color: 'var(--color-folder-ochre)',
    icon: <ListChecks className="size-7" />,
  },
]

const workflowSteps = [
  { label: 'Learning folder', title: 'Design systems', icon: <BookOpen className="size-5" /> },
  { label: 'Workflow file', title: 'Learning plan.dana', icon: <Workflow className="size-5" /> },
  { label: 'Fresh plan', title: 'French B2', icon: <FolderInput className="size-5" /> },
]

const interaction =
  'transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)]'
const heroFocusPanelId = 'landing-product-focus'

/** Roving tabindex for the three tablists below, per the WAI-ARIA tabs pattern. */
function moveTabFocus<T extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  values: readonly T[],
  active: T,
  onActivate: (value: T) => void,
): void {
  const current = values.indexOf(active)
  let next = current

  if (event.key === 'ArrowRight') next = (current + 1) % values.length
  else if (event.key === 'ArrowLeft') next = (current - 1 + values.length) % values.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = values.length - 1
  else return

  const value = values[next]
  if (!value) return
  event.preventDefault()
  onActivate(value)
  const tabs =
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  tabs?.[next]?.focus()
}

function SectionEyebrow({
  children,
  color,
}: {
  readonly children: ReactNode
  readonly color: string
}): React.JSX.Element {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
      {children}
    </p>
  )
}

/*
The Google mark is the control's own. It is decorative, so the link's accessible
name stays the three words 9.2 fixes and AC-159 counts.
*/
function GoogleGlyph(): React.JSX.Element {
  return (
    <span
      className="flex size-5 items-center justify-center rounded-full bg-[var(--color-fixed-white)]"
      aria-hidden="true"
    >
      <img src="/google-g.svg" alt="" className="size-[18px]" />
    </span>
  )
}

/** Scroll-in for the long sections. Reduced motion shows everything at once. */
function Reveal({
  children,
  className = '',
}: {
  readonly children: ReactNode
  readonly className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setVisible(true)
        observer.disconnect()
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`${className} transition-[opacity,transform] duration-[var(--duration-slow)] ease-[var(--ease-enter)] motion-reduce:translate-y-0 motion-reduce:opacity-100 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
    >
      {children}
    </div>
  )
}

function RotatingHeroWord({
  index,
  onAdvance,
}: {
  readonly index: number
  readonly onAdvance: () => void
}): React.JSX.Element {
  const word = heroWords[index] ?? heroWords[0]

  return (
    <span
      className="relative mx-[0.06em] inline-block cursor-default align-baseline whitespace-nowrap"
      onPointerEnter={onAdvance}
      style={{ color: word.color }}
    >
      <span
        key={word.label}
        className="relative z-10 inline-block duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
      >
        {word.label}
      </span>
      <span
        className="absolute right-0 bottom-[0.02em] left-0 h-[0.08em] origin-left rounded-full bg-current opacity-20"
        aria-hidden="true"
      />
    </span>
  )
}

function HeroProductStage({
  onWordIndexChange,
}: {
  readonly onWordIndexChange: (index: number) => void
}): React.JSX.Element {
  const stageRef = useRef<HTMLElement>(null)
  const [activeId, setActiveId] = useState<HeroFocus>('organize')
  const [scrollProgress, setScrollProgress] = useState(0)
  const tabGroupId = useId()
  const focusValues = heroFocusItems.map((item) => item.id)
  const active = heroFocusItems.find((item) => item.id === activeId) ?? heroFocusItems[0]

  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setScrollProgress(0)
      return
    }

    let frame = 0
    const update = (): void => {
      frame = 0
      const rect = node.getBoundingClientRect()
      const distance = window.innerHeight * 0.72 - rect.top
      const range = Math.max(rect.height * 0.68, 1)
      setScrollProgress(Math.min(1, Math.max(0, distance / range)))
    }
    const onMove = (): void => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onMove, { passive: true })
    window.addEventListener('resize', onMove)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onMove)
      window.removeEventListener('resize', onMove)
    }
  }, [])

  useEffect(() => {
    const index = scrollProgress < 0.38 ? 0 : scrollProgress < 0.72 ? 1 : 2
    const next = heroFocusItems[index]?.id
    if (next) setActiveId(next)
  }, [scrollProgress])

  useEffect(() => {
    onWordIndexChange(Math.min(heroWords.length - 1, Math.floor(scrollProgress * heroWords.length)))
  }, [onWordIndexChange, scrollProgress])

  return (
    <section
      ref={stageRef}
      id="product"
      className="relative px-5 pt-12 pb-20 sm:px-8 sm:pt-16 sm:pb-24"
    >
      <div className="relative mx-auto w-full max-w-[1120px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-5 left-1 hidden size-24 text-[var(--color-folder-violet)] lg:block"
          style={{
            transform: `translate3d(0, ${String(scrollProgress * 14)}px, 0) rotate(${String(-8 + scrollProgress * 8)}deg)`,
          }}
        >
          <span className="absolute top-0 left-0 size-20 rounded-tl-[44px] border-t border-l border-dashed border-current opacity-25" />
          <span className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full bg-background text-current shadow-[0_5px_18px_rgba(20,22,28,0.08)]">
            <FolderOpen className="size-4" />
          </span>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 bottom-36 hidden size-28 text-[var(--color-folder-fern)] lg:block"
          style={{
            transform: `translate3d(0, ${String(12 - scrollProgress * 20)}px, 0) rotate(${String(7 - scrollProgress * 7)}deg)`,
          }}
        >
          <span className="absolute right-0 bottom-0 size-24 rounded-br-[52px] border-r border-b border-dashed border-current opacity-25" />
          <span className="absolute top-0 left-0 flex size-9 items-center justify-center rounded-full bg-background text-current shadow-[0_5px_18px_rgba(20,22,28,0.08)]">
            <ListChecks className="size-4" />
          </span>
        </div>

        <img
          src="/dana-product-travel.png"
          alt="A Dana folder showing shelves, tasks, sections, due dates, assignees, and progress."
          loading="eager"
          className="mx-auto block h-auto w-full max-w-[920px] rounded-[10px] shadow-[0_18px_48px_rgba(20,22,28,0.13)]"
        />

        <div className="mx-auto mt-8 max-w-[900px] sm:mt-11">
          <div
            className="grid grid-cols-3 gap-2 sm:gap-3"
            role="tablist"
            aria-label="How work moves through Dana"
          >
            {heroFocusItems.map((item) => {
              const selected = item.id === activeId
              const icon =
                item.id === 'organize' ? (
                  <Folders className="size-4" />
                ) : item.id === 'context' ? (
                  <BookOpen className="size-4" />
                ) : (
                  <ListChecks className="size-4" />
                )
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`${tabGroupId}-${item.id}`}
                  aria-controls={heroFocusPanelId}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    setActiveId(item.id)
                  }}
                  onKeyDown={(event) => {
                    moveTabFocus(event, focusValues, activeId, setActiveId)
                  }}
                  className={`flex min-w-0 items-center justify-center gap-2 rounded-[10px] px-2 py-3 text-center text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-xs ${interaction} ${selected ? 'bg-[var(--color-dana-accent-50)] text-primary shadow-[0_5px_18px_rgba(20,22,28,0.05)]' : 'bg-muted/45 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  <span className="shrink-0">{icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
          <div
            id={heroFocusPanelId}
            role="tabpanel"
            aria-labelledby={`${tabGroupId}-${activeId}`}
            className="mt-3 grid gap-2 rounded-[14px] bg-[var(--color-dana-accent-50)] p-5 text-center sm:grid-cols-[0.9fr_1.1fr] sm:gap-8 sm:p-6 sm:text-left"
          >
            <p
              key={`${activeId}-title`}
              className="text-base font-semibold tracking-[-0.02em] duration-[var(--duration-slow)] animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
            >
              {active.title}
            </p>
            <p
              key={`${activeId}-detail`}
              className="text-sm leading-6 text-muted-foreground duration-[var(--duration-slow)] animate-in fade-in-0 motion-reduce:animate-none"
            >
              {active.detail}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function OrganizationStory(): React.JSX.Element {
  const [activeId, setActiveId] = useState<OrganizationLevel>('folder')
  const tabGroupId = useId()
  const panelId = `${tabGroupId}-panel`
  const values = organizationItems.map((item) => item.id)
  const active = organizationItems.find((item) => item.id === activeId) ?? organizationItems[0]

  return (
    <div className="rounded-[22px] bg-[var(--color-dana-accent-50)] p-4 sm:p-6 lg:p-7">
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
        role="tablist"
        aria-label="Dana organization levels"
      >
        {organizationItems.map((item) => {
          const selected = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${tabGroupId}-${item.id}`}
              aria-controls={panelId}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                setActiveId(item.id)
              }}
              onKeyDown={(event) => {
                moveTabFocus(event, values, activeId, setActiveId)
              }}
              className={`group flex min-h-32 flex-col items-start justify-between rounded-[14px] p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction} ${selected ? '-translate-y-1 bg-card shadow-[0_12px_28px_rgba(20,22,28,0.09)]' : 'bg-card/55 hover:-translate-y-0.5 hover:bg-card'}`}
            >
              <span
                className="flex size-11 items-center justify-center rounded-[12px]"
                style={{
                  color: item.color,
                  background: `color-mix(in srgb, ${item.color} 12%, var(--card))`,
                }}
              >
                {item.icon}
              </span>
              <span className="mt-5 text-sm font-semibold">{item.label}</span>
            </button>
          )
        })}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${tabGroupId}-${activeId}`}
        className="mt-3 rounded-[16px] bg-card p-5 sm:grid sm:grid-cols-[0.8fr_1.2fr] sm:gap-8 sm:p-6"
      >
        <div
          key={`${activeId}-title`}
          className="duration-[var(--duration-slow)] animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
        >
          <p
            className="text-[10px] font-semibold tracking-[0.12em] uppercase"
            style={{ color: active.color }}
          >
            {active.label}
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em]">{active.title}</h3>
        </div>
        <p
          key={`${activeId}-detail`}
          className="mt-3 text-sm leading-6 text-muted-foreground duration-[var(--duration-slow)] animate-in fade-in-0 motion-reduce:animate-none sm:mt-0"
        >
          {active.detail}
        </p>
      </div>
    </div>
  )
}

function CollaborationVisual(): React.JSX.Element {
  const [focus, setFocus] = useState<'task' | 'conversation'>('task')
  const tabGroupId = useId()
  const panelId = `${tabGroupId}-panel`
  const focusValues = ['task', 'conversation'] as const

  return (
    <div>
      <div
        className="mb-3 inline-flex rounded-[10px] bg-background/75 p-1"
        role="tablist"
        aria-label="Collaboration product detail"
      >
        {focusValues.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${tabGroupId}-${value}`}
            aria-controls={panelId}
            aria-selected={focus === value}
            tabIndex={focus === value ? 0 : -1}
            onClick={() => {
              setFocus(value)
            }}
            onKeyDown={(event) => {
              moveTabFocus(event, focusValues, focus, setFocus)
            }}
            className={`flex h-9 items-center justify-center gap-2 rounded-[7px] px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction} ${focus === value ? 'bg-card text-foreground shadow-[0_3px_12px_rgba(20,22,28,0.08)]' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {value === 'task' ? (
              <ListChecks className="size-4" />
            ) : (
              <MessageSquare className="size-4" />
            )}
            {value === 'task' ? 'Task detail' : 'Conversation'}
          </button>
        ))}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${tabGroupId}-${focus}`}
        className="overflow-hidden rounded-[10px] bg-[var(--landing-fixed-dark)] shadow-[0_14px_36px_rgba(20,22,28,0.14)]"
      >
        <img
          key={focus}
          src="/dana-product-collaboration.png"
          alt="A Dana folder with an expanded task, steps, notes, attachments, comments, and the conversation panel."
          loading="lazy"
          className={`aspect-[4/3] w-full object-cover duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in-0 motion-reduce:animate-none ${focus === 'task' ? 'scale-100 object-left' : 'origin-top-right scale-125 object-[94%_top]'}`}
        />
      </div>
    </div>
  )
}

function WorkflowDemo(): React.JSX.Element {
  const [step, setStep] = useState(0)
  const next = (): void => {
    setStep((current) => (current + 1) % workflowSteps.length)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        {/* The design's em dash is a comma, protocol section 7. */}
        <p className="text-xs leading-5 text-muted-foreground">
          Choose a stage to see what Dana keeps, and what it leaves behind.
        </p>
        <button
          type="button"
          onClick={next}
          className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-background text-[var(--color-folder-ochre)] outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/30 ${interaction}`}
          aria-label={`Show the next workflow stage. Stage ${String(step + 1)} of ${String(workflowSteps.length)} is selected.`}
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
      <div
        className="mt-5 grid grid-cols-3 gap-1.5 sm:gap-2"
        role="group"
        aria-label="Workflow stages"
      >
        {workflowSteps.map((item, index) => (
          <button
            key={item.label}
            type="button"
            aria-current={step === index ? 'step' : undefined}
            onClick={() => {
              setStep(index)
            }}
            className={`min-h-28 rounded-[13px] p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:min-h-32 sm:p-4 ${interaction} ${step === index ? '-translate-y-1 bg-card shadow-[0_10px_24px_rgba(20,22,28,0.09)]' : 'bg-background/55 hover:-translate-y-0.5 hover:bg-card'}`}
          >
            <span
              className={step === index ? 'text-[var(--color-folder-ochre)]' : 'text-muted-foreground'}
            >
              {item.icon}
            </span>
            <span className="mt-4 block text-[9px] font-semibold tracking-[0.08em] text-muted-foreground uppercase sm:mt-5 sm:text-[10px] sm:tracking-[0.1em]">
              {item.label}
            </span>
            <span className="mt-1 block text-xs font-semibold sm:text-sm">{item.title}</span>
          </button>
        ))}
      </div>
      <div
        key={step}
        className="mt-3 min-h-16 rounded-[13px] bg-card p-4 duration-[var(--duration-slow)] animate-in fade-in-0 motion-reduce:animate-none"
      >
        {step === 0 && (
          <div className="flex flex-wrap gap-2">
            {['Goal', 'Modules', 'Practice', 'Reading', 'Review'].map((item) => (
              <span
                key={item}
                className="rounded-md bg-muted px-2.5 py-1.5 text-[10px] text-muted-foreground"
              >
                {item}
              </span>
            ))}
          </div>
        )}
        {step === 1 && (
          <div className="flex items-center gap-2 text-xs">
            <Workflow className="size-4 text-[var(--color-folder-ochre)]" />
            <span>The useful shape becomes a portable learning plan.</span>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-2 text-[10px] sm:grid-cols-2">
            <div className="flex items-center gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-folder-fern)_9%,var(--card))] px-3 py-2">
              <Check className="size-3 text-[var(--color-folder-fern)]" />
              Goal, modules, practice, review
            </div>
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-muted-foreground">
              <span className="size-3 rounded-sm bg-card shadow-[inset_0_0_0_1px_var(--border)]" />
              Old dates, people, history stay behind
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function LandingPage(): React.JSX.Element {
  const [heroWordIndex, setHeroWordIndex] = useState(0)
  const signedIn = useMe().isSuccess
  useEffect(() => {
    if (signedIn && window.location.search === '') {
      window.location.replace(paths.today)
    }
  }, [signedIn])
  const signInHref = `/api/v1/auth/google?tz=${encodeURIComponent(browserTimezone())}`
  /*
  The callback's failure marker (auth/pages.ts): every refusal that is not the
  unverified page returns here carrying ?signin=failed, so a cancelled consent
  screen has something to say for itself. The sentence is 9.1's own global
  failure copy rather than a new string, a failed sign-in being a failed
  request and section 9 not having written this surface its own words.
  */
  const signInFailed =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('signin') === 'failed'

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground [--landing-fixed-dark:var(--color-graphite-950)] [[data-theme=dark]_&]:[--landing-fixed-dark:var(--color-graphite-25)]">
      {/*
      Sticky where the design lets the header scroll away, which is what pays
      for the closing block's dropped button: on a page this long the single
      sign-in path must stay reachable from the foot of it.
      */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
          <DanaIdentity />
          <nav
            className="flex items-center gap-1 text-sm text-muted-foreground"
            aria-label="Public navigation"
          >
            <a
              href="#product"
              className={`hidden rounded-md px-3 py-2 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none sm:block ${interaction}`}
            >
              Product
            </a>
            <a
              href="#organization"
              className={`hidden rounded-md px-3 py-2 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none sm:block ${interaction}`}
            >
              Organization
            </a>
            <a
              href="#features"
              className={`hidden rounded-md px-3 py-2 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none sm:block ${interaction}`}
            >
              Workflows
            </a>
            <Button
              size="sm"
              className="ml-2 bg-primary text-primary-foreground shadow-none hover:bg-[var(--color-dana-accent-700)]"
              render={<a href={signInHref} />}
            >
              Sign in
            </Button>
          </nav>
        </div>
      </header>

      <section className="px-5 pt-12 text-center sm:px-8 sm:pt-16 lg:pt-20">
        <div className="mx-auto w-full max-w-[1180px] duration-[var(--duration-slow)] ease-[var(--ease-enter)] animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
          {/*
          The rotating verb is decoration and the fixed sentence is the name,
          which 9.2 requires of any animated heading.
          */}
          <h1 className="mx-auto max-w-[1120px] text-[clamp(42px,7vw,80px)] leading-[0.99] font-semibold tracking-[-0.06em] text-balance">
            <span className="sr-only">A place to finish the work.</span>
            <span aria-hidden="true">
              A place to{' '}
              <RotatingHeroWord
                index={heroWordIndex}
                onAdvance={() => {
                  setHeroWordIndex((current) => (current + 1) % heroWords.length)
                }}
              />{' '}
              the work.
            </span>
          </h1>
          <p className="mx-auto mt-7 max-w-[58ch] text-[15px] leading-7 text-muted-foreground sm:text-[17px]">
            Tasks, projects, schedules, and collaboration stay in the same place, so the plan
            remains visible while you do the work.
          </p>

          {signInFailed ? (
            <p
              role="status"
              className="mx-auto mt-7 flex max-w-[46ch] items-center gap-2.5 rounded-md border border-[var(--color-warning-200)] bg-[var(--color-warning-100)] px-3 py-2.5 text-sm leading-5 text-[var(--color-warning-700)]"
            >
              Something went wrong. Nothing was saved. Try again.
            </p>
          ) : null}

          <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button
              className={`h-11 gap-3 bg-primary px-5 text-sm font-medium text-primary-foreground shadow-none hover:bg-[var(--color-dana-accent-700)] active:translate-y-px sm:min-w-56 ${interaction}`}
              render={<a href={signInHref} />}
            >
              <GoogleGlyph />
              Continue with Google
            </Button>
            <Button
              variant="ghost"
              className="h-11 gap-2 px-4 text-sm"
              render={<a href="#product" />}
            >
              See Dana in action
              <ArrowDown className="size-4" />
            </Button>
          </div>
          {/* The one string 9.2 still spells, written as that section spells it. */}
          <p className="mx-auto mt-3 max-w-[46ch] text-xs leading-5 text-muted-foreground">
            Dana requests only your Google profile and email for sign-in, sharing, and invitations.
          </p>
        </div>
      </section>

      <HeroProductStage onWordIndexChange={setHeroWordIndex} />

      <section id="organization" className="px-5 py-20 sm:px-8 sm:py-28">
        <Reveal className="mx-auto grid w-full max-w-[1120px] items-center gap-12 lg:grid-cols-[0.76fr_1.24fr] lg:gap-16">
          <div>
            <SectionEyebrow color="var(--color-dana-accent-600)">
              Desk to Shelf to Folder to Task
            </SectionEyebrow>
            <h2 className="mt-4 text-[clamp(36px,4.3vw,56px)] leading-[1.04] font-semibold tracking-[-0.05em]">
              Desk first. Structure later.
            </h2>
            <p className="mt-6 max-w-[48ch] text-[15px] leading-7 text-muted-foreground">
              Capture without deciding where it belongs. Move related work into shelves and folders
              only when the shape becomes useful.
            </p>
          </div>
          <OrganizationStory />
        </Reveal>
      </section>

      <section id="features" className="px-5 pt-20 pb-12 sm:px-8 sm:pt-28 sm:pb-16">
        <Reveal className="mx-auto w-full max-w-[1120px]">
          <div className="max-w-[720px]">
            <SectionEyebrow color="var(--color-folder-teal)">Detail without detours</SectionEyebrow>
            <h2 className="mt-4 text-[clamp(36px,4.3vw,56px)] leading-[1.04] font-semibold tracking-[-0.05em]">
              A task can expand. A project can be reused.
            </h2>
            <p className="mt-5 max-w-[56ch] text-[15px] leading-7 text-muted-foreground">
              Dana keeps detail attached to the project, then lets the project shape become a clean
              starting point for something new.
            </p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <article className="rounded-[24px] bg-[color-mix(in_srgb,var(--color-folder-teal)_8%,var(--background))] p-5 sm:p-7">
              <div className="mb-7">
                <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-folder-teal)] uppercase">
                  In context
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
                  Open a task without leaving the folder.
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Steps, notes, files, comments, and the folder conversation stay attached to the
                  same project.
                </p>
              </div>
              <CollaborationVisual />
            </article>
            <article className="rounded-[24px] bg-[color-mix(in_srgb,var(--color-folder-ochre)_9%,var(--background))] p-5 sm:p-7">
              <div className="mb-7">
                <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-folder-ochre)] uppercase">
                  Reusable workflows
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
                  Reuse the shape, not the history.
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Turn a learning folder into a reusable workflow without carrying old dates,
                  people, or history forward.
                </p>
              </div>
              <WorkflowDemo />
            </article>
          </div>
        </Reveal>
      </section>

      {/*
      The design draws a second "Continue with Google" here. It is dropped, not
      restyled: 9.2 admits one and AC-159 counts the page. The block keeps its
      words, and the sticky header keeps the path.
      */}
      <section className="px-5 py-10 text-center sm:px-8 sm:py-12">
        <Reveal className="mx-auto max-w-[1120px] rounded-[28px] bg-muted/55 px-6 py-12 sm:px-12 sm:py-14">
          {/* Drawn rather than fetched (AC-265). It sits in no link or button,
              so it plays from itself: a 44px mark is a big enough target for
              that in a way a 14px icon in a row is not. */}
          <DanaMark className="mx-auto size-11" />
          <h2 className="mx-auto mt-6 text-[clamp(36px,4.4vw,54px)] leading-[1.04] font-semibold tracking-[-0.045em]">
            Start on Desk.
          </h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-7 text-muted-foreground">
            Add one task. File it later. Invite someone only when the work calls for it.
          </p>
        </Reveal>
      </section>

      <footer>
        <div className="mx-auto grid w-full max-w-[1280px] gap-6 px-5 py-8 text-xs text-muted-foreground sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-8">
          <div className="flex items-center gap-4">
            <DanaIdentity />
            <span>Dana Inc · Canada</span>
          </div>
          <a
            href="mailto:support.danadana@gmail.com"
            className="inline-flex w-fit items-center gap-2 rounded-sm text-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none sm:justify-self-center"
          >
            <MessageSquare className="size-4" />
            Have a question?
          </a>
          <div className="flex items-center gap-5 sm:justify-self-end">
            {/* Computed, so the line does not go stale on 1 January. */}
            <span>© {String(new Date().getFullYear())} Dana</span>
            <a
              href="/privacy"
              className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            >
              Terms
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}
