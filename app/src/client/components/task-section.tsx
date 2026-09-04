/*
A section of a task list, one component for every kind there is.

Lifted from `docs/design/prototype-v2/src/components/task-section.tsx` at S23,
read on `v2-build` at `b316785`. That prototype is deleted (`a7886df`,
2026-09-01); read it in git history before that commit. The lift discipline
of RFC 0004's prototype-lift section applies: this file diffs empty against
that original except at the seams named at the foot of this header. The
designer's own reasoning below is kept intact, being the design record for
what this does.

**The seams are the two mechanical ones every lifted file takes and no
other**: the `@/` specifiers become this client's relative ESM paths (11.4),
and the em dashes leave under protocol section 7's writing convention.

Imran, 2026-08-22: "Sections have two types: native sections and sections
added by users, both should be same, only the native sections can't be deleted
or renamed. Right now native sections are not collapsable which is not good,
but they can carry an icon or even a profile avatar."

He is describing a real split. The folder page's user-made sections were
collapsible, renameable and deletable; every computed section elsewhere, My
Day's "Carried over", Scheduled's dates, Assignments' people, All's two
labels, Tasks' folders, Done's days, was a bare heading that could not be
collapsed at all. Two grammars for one idea, which is the fault DES-151 fixed
at the level of *type* and this fixes at the level of *behaviour*.

So there is one section, and the only differences are capabilities:

- **Every section collapses.** Computed or hand-made, a heading you cannot
  fold is a heading that cannot get out of your way.
- **A section may carry a mark**: a folder's glyph, a person's face, a date's
  nothing. Optional and genuinely optional, see below.
- **Only a section somebody made can be renamed or deleted**, which is the
  whole of what "native" means. It is a capability, not a different component.

**The absent mark leaves no hole.** Imran's constraint: "if a section does not
carry an icon, the section should not feel like it's lacking something." So
the mark is *inline in the heading* rather than in a reserved slot, a section
without one simply starts its name earlier, and nothing anywhere is waiting to
be filled. The chevron is the constant left anchor instead, which is honest,
because the chevron is the one thing every section really does have.

The tier is DES-148's: 16px on the hairline band, the count quiet beside it.
*/

import { useState, type ReactNode } from "react"

import { ChevronRight, type LucideIcon } from "../lib/icons.js"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible.js"
import { cn } from "./ui/utils.js"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

export function TaskSection({
  id,
  name,
  icon: Icon,
  iconColor,
  /* A face, for a section that groups by person. Takes the mark's place;
     a section never carries both. */
  avatar,
  count,
  /* Shown at the right of the heading on hover, a user-made section's rename
     and delete. A computed section passes nothing and grows no slot. */
  actions,
  defaultOpen = true,
  /*
  Controlled open, for a page that keeps its own record of what is folded.

  The folder page does: a person's sections are theirs, so which of them are
  shut is presentation state that belongs to the page and outlives any one
  section's mount. Uncontrolled stays the default because every computed
  section on every other page wants exactly that and should not have to say
  so, the pair is the standard shape, and having it is what let the folder
  page stop keeping a second copy of this component (DES-165).
  */
  open: openProp,
  onOpenChange,
  children,
  className,
}: {
  id?: string
  name: ReactNode
  icon?: LucideIcon
  iconColor?: string
  avatar?: ReactNode
  count?: number
  actions?: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  className?: string
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setUncontrolled(next)
    onOpenChange?.(next)
  }

  return (
    <section className={className} aria-labelledby={id}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="group/section mb-2 flex h-8 items-center gap-1.5 border-b border-border">
          <CollapsibleTrigger
            className={cn(
              "-ml-1.5 flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--color-graphite-400)] transition-[background-color,color] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)]",
              T_FAST,
              FOCUS,
            )}
            aria-label={open ? "Collapse section" : "Expand section"}
          >
            <ChevronRight
              className={cn("size-4 transition-transform", T_FAST, open && "rotate-90")}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </CollapsibleTrigger>

          {avatar ?? null}
          {!avatar && Icon ? (
            <Icon
              className="size-4 shrink-0 text-[var(--color-graphite-500)]"
              style={iconColor ? { color: iconColor } : undefined}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          ) : null}

          {/*
          The heading clips only when it is holding text.

          A computed section's name is a string and wants the ellipsis. A
          section somebody made hands in an `InlineName`, a control that
          already truncates itself and sits on a `-mx-1` negative margin so
          its hover wash lines up with the text. An `overflow: hidden`
          heading around that clips exactly those eight pixels, and the
          ellipsis appears on a name with two hundred pixels of room beside
          it, which is how "Venue & vendors" became "Venue & vend…".

          So the clipping goes where the text is, and a node is left to
          manage its own width, which is the only thing it can do, since
          only it knows whether it is text.
          */}
          <h2
            id={id}
            className={cn(
              "min-w-0 text-base leading-6 font-semibold text-foreground",
              typeof name === "string" && "truncate",
            )}
          >
            {name}
          </h2>

          {typeof count === "number" ? (
            <span className="shrink-0 text-[12px] leading-4 text-[var(--color-graphite-400)] tabular-nums">
              {count}
            </span>
          ) : null}

          {actions ? <div className="ml-auto shrink-0">{actions}</div> : null}
        </div>

        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </section>
  )
}

/*
The quiet section at the foot of a page: finished work.

Imran, 2026-08-22: every folder, native or user-made, ends in a collapsed
Completed section. It is deliberately *not* a `TaskSection`, it is one line
rather than a band, in the grammar DES-142 settled for the conversation and
Q7 already used for a folder's own Completed, because a section that closes a
page is not a peer of the sections that organise it.

The wording differs in exactly one place and on purpose: My Day's recap is
"Done today (N)", which spec 9.1 makes normative to the letter.
*/
export function CompletedSection({
  label = "Completed",
  count,
  children,
}: {
  label?: string
  count: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  if (count === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "group/done flex h-[var(--control-height)] w-full items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-[var(--color-graphite-600)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-800)]",
          T_FAST,
          "focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
        )}
      >
        <ChevronRight
          className={cn("size-4 transition-transform", T_FAST, open && "rotate-90")}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {label} ({count})
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}
