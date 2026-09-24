/*
A section of a task list, one component for every kind there is.

Sections have two types, native and user-added, and both behave the same
except that native sections cannot be deleted or renamed. Both collapse, and
a section can carry an icon or a profile avatar.

Computed sections (My Day's "Carried over", Scheduled's dates, Assignments'
people, All's two labels, Tasks' folders, Done's days) and a folder's
user-made sections share one grammar. So there is one section, and the only differences are capabilities:

- **Every section collapses.** Computed or hand-made, a heading you cannot
  fold is a heading that cannot get out of your way.
- **A section may carry a mark**: a folder's glyph, a person's face, a date's
  nothing. Optional and genuinely optional, see below.
- **Only a section somebody made can be renamed or deleted**, which is the
  whole of what "native" means. It is a capability, not a different component.

**The absent mark leaves no hole**: a section without an icon should not feel
like it lacks something. So the mark is *inline in the heading* rather than in a reserved slot, a section
without one simply starts its name earlier, and nothing anywhere is waiting to
be filled. The chevron is the constant left anchor instead, which is honest,
because the chevron is the one thing every section really does have.

The tier: 16px on the hairline band, the count quiet beside it.
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
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"

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
  so, and the pair is the standard shape.
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
              "-ml-1.5 flex size-6 shrink-0 items-center justify-center rounded-md text-quiet-foreground transition-[background-color,color] hover:bg-accent hover:text-section-foreground",
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
              className="size-4 shrink-0 text-muted-foreground"
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
            <span className="shrink-0 text-xs leading-4 text-quiet-foreground tabular-nums">
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

Every folder, native or user-made, ends in a collapsed Completed section. It
is deliberately *not* a `TaskSection`, it is one line rather than a band,
because a section that closes a
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
          "group/done flex h-[var(--control-height)] w-full items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
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
