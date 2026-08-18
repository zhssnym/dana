/*
Dana's icons.

**The family is `@animateicons/react/lucide`**, ruled by Imran 2026-08-18: the
same Lucide drawings the product already used, with a motion/react animation
per icon that plays on hover. Every icon comes from this module and nothing
imports `lucide-react` directly, so the family is one decision in one file
rather than four hundred import lines.

**Motion is opt-out, by region.** Wrap a region in `<IconMotion enabled={false}>`
and every icon inside it renders as **plain Lucide** — not an animated icon
with its animation suppressed, but the static component, with no motion
machinery mounted at all. The sidebar does this, for two reasons that took a
while to separate:

1. Several of the family's icons animate *in*: their paths scale and fade up
   from nothing. That is right for an icon that is arriving and wrong for one
   already on screen, where hovering makes it vanish and rebuild. Planned drops
   seven of its ten paths to zero scale.
2. Worse, and the thing Imran described as blinking: a collapsed sidebar shows
   a tooltip on hover, and opening one remounts its trigger's subtree. A
   remounted animated icon starts from its hidden initial state, so the icon
   under the pointer flashes — and the one you just left flashes too as its own
   tooltip tears down. Suppressing the hover listener never fixed that, because
   the flash is a mount, not a hover. Rendering the static component does.

So `enabled={false}` is a rendering decision, not a listener one. Animation is
for icons somebody is choosing to touch; permanent chrome stays still.

**Where the family lacks an icon**, the substitute is chosen by meaning and the
reason is on the line. Thirty-seven of Dana's fifty-six exist name-for-name;
nineteen are substitutions. Two are flagged in DES-125 for a second look rather
than hidden here: `GripVertical` becomes a vertical ellipsis, which sits close
to the overflow menu's horizontal one, and `Folders` becomes a closed folder,
which is weaker than the stack it replaces.

Two things the animated wrapper has to paper over:

- **An animated icon renders a `div` around its `svg`**, takes a numeric `size`
  rather than a class, and hardcodes `strokeWidth` at 2. The wrapper reads the
  pixel size back off the Tailwind `size-*` class the call site used, and
  swallows `strokeWidth` rather than spreading it onto a div. Every call site
  still passes 1.75 from the Lucide days; accepting and ignoring it beats four
  hundred edits that change nothing.
- **The size class lands on the wrapper**, leaving the `svg` classless — which
  is exactly what the shadcn primitives'
  `[&_svg:not([class*='size-'])]:size-3.5` is looking for, so every sized icon
  would silently collapse to the container's default. The wrapper fills itself
  with `[&>svg]:!size-full` to put the size back.

**The animation plays from the control, not the glyph**, because a 14px hover
target is one nobody hits: the wrapper walks up to the enclosing button, link,
menu item or row and plays from there.
*/

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ComponentType,
  type CSSProperties,
  type Ref,
  type SVGProps,
} from "react"
import * as Anim from "@animateicons/react/lucide"
import * as Lu from "lucide-react"

import { cn } from "@/lib/utils"

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  size?: number | string
  strokeWidth?: number | string
  absoluteStrokeWidth?: boolean
}

/* The name the shell has always used for an icon's type. Kept so call sites
   and component props do not have to change. */
export type LucideIcon = ComponentType<IconProps>

const IconMotionContext = createContext(true)

export function IconMotion({
  enabled,
  children,
}: {
  enabled: boolean
  children: React.ReactNode
}) {
  return (
    <IconMotionContext.Provider value={enabled}>
      {children}
    </IconMotionContext.Provider>
  )
}

/* The shell sizes icons with Tailwind `size-*`, the occasional `!size-*`, and
   `size-[18px]` in the task row. The animated components want a number, so
   read it back off the class. */
function pixelSize(className: string | undefined, fallback = 16) {
  if (!className) return fallback

  const arbitrary = /(?:^|\s)!?size-\[(\d+(?:\.\d+)?)(px|rem)\]/.exec(className)
  if (arbitrary?.[1]) {
    return Number(arbitrary[1]) * (arbitrary[2] === "rem" ? 16 : 1)
  }

  const scale = /(?:^|\s)!?size-(\d+(?:\.\d+)?)(?:\s|$)/.exec(className)
  if (scale?.[1]) return Number(scale[1]) * 4

  return fallback
}

/* How the library actually works, read out of its source rather than guessed,
   because guessing cost a round trip: `isAnimated` is a **gate**, not a
   trigger — it defaults to true and only decides whether the component may
   animate at all. The trigger is the imperative handle, and attaching a ref
   changes the contract: with one, the component stops animating on its own
   hover and defers to you entirely. So the ref is not optional here. Setting
   `isAnimated` from state and dropping the ref, which is what this file did
   for one revision, leaves nothing driving anything. */
type AnimHandle = { startAnimation: () => void; stopAnimation: () => void }
type AnimComponent = ComponentType<{
  ref?: Ref<AnimHandle>
  className?: string
  size?: number
  style?: CSSProperties
}>

/* The row, menu item or button the icon sits in. Hovering any of these plays
   the icon, which is the whole point of the family. */
const HOVER_SCOPE = [
  "button",
  "a",
  "[role='menuitem']",
  "[role='menuitemradio']",
  "[role='menuitemcheckbox']",
  "[role='option']",
  "label",
  "[data-slot='sidebar-menu-item']",
  "li",
].join(", ")

function AnimatedIcon({
  Component,
  className,
  style,
  size,
  ...rest
}: IconProps & { Component: AnimComponent }) {
  const handle = useRef<AnimHandle | null>(null)
  const host = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const parent = host.current?.parentElement
    if (!parent) return
    const scope = parent.closest(HOVER_SCOPE) ?? parent
    const enter = () => handle.current?.startAnimation()
    const leave = () => handle.current?.stopAnimation()
    scope.addEventListener("mouseenter", enter)
    scope.addEventListener("mouseleave", leave)
    return () => {
      scope.removeEventListener("mouseenter", enter)
      scope.removeEventListener("mouseleave", leave)
    }
  }, [])

  const sized = /(?:^|\s)!?size-/.test(className ?? "")

  return (
    <span ref={host} style={{ display: "contents" }}>
      <Component
        ref={handle}
        className={cn("shrink-0", sized && "[&>svg]:!size-full", className)}
        size={typeof size === "number" ? size : pixelSize(className)}
        style={style}
        {...(rest as Record<string, unknown>)}
      />
    </span>
  )
}

function icon(Static: LucideIcon, Animated: AnimComponent): LucideIcon {
  function DanaIcon({
    strokeWidth,
    absoluteStrokeWidth,
    ...rest
  }: IconProps) {
    const motion = useContext(IconMotionContext)

    /* Static means static all the way down: the plain Lucide component, with
       its stroke width honoured. Nothing mounts, so nothing can flash on a
       remount, which is what a tooltip opening in the collapsed sidebar was
       doing to its neighbours. */
    if (!motion) {
      return (
        <Static
          strokeWidth={strokeWidth}
          absoluteStrokeWidth={absoluteStrokeWidth}
          {...rest}
        />
      )
    }

    return <AnimatedIcon Component={Animated} {...rest} />
  }

  return DanaIcon
}

/* ─── The set ────────────────────────────────────────────────────────────────

   Name-for-name with Lucide where the animated family has the icon; where it
   does not, the substitute and the reason are on the line.                   */

export const AlertCircle = icon(Lu.AlertCircle, Anim.TriangleAlertIcon) // animated: no circle-alert
export const AlignLeft = icon(Lu.AlignLeft, Anim.AlignLeftIcon)
export const Ban = icon(Lu.Ban, Anim.FlagOffIcon) // animated: no ban. Abandoned is a
export const Bell = icon(Lu.Bell, Anim.BellIcon)
export const CalendarDays = icon(Lu.CalendarDays, Anim.CalendarDaysIcon)
export const Check = icon(Lu.Check, Anim.CheckIcon)
export const CheckCircle2 = icon(Lu.CheckCircle2, Anim.CircleCheckBigIcon)
export const ChevronDown = icon(Lu.ChevronDown, Anim.ChevronDownIcon)
export const ChevronLeft = icon(Lu.ChevronLeft, Anim.ChevronLeftIcon)
export const ChevronRight = icon(Lu.ChevronRight, Anim.ChevronRightIcon)
export const CircleAlert = icon(Lu.CircleAlert, Anim.TriangleAlertIcon)
export const Clock3 = icon(Lu.Clock3, Anim.ClockIcon)
export const Copy = icon(Lu.Copy, Anim.CopyIcon)
export const FileText = icon(Lu.FileText, Anim.FileTextIcon)
export const Film = icon(Lu.Film, Anim.VideoIcon) // animated: no film
export const Folder = icon(Lu.Folder, Anim.FolderIcon)
export const FolderInput = icon(Lu.FolderInput, Anim.FolderOpenIcon) // animated: no folder-input
export const FolderPlus = icon(Lu.FolderPlus, Anim.FolderPlusIcon)
export const Folders = icon(Lu.Folders, Anim.FolderClosedIcon) // animated: no folders
export const GripVertical = icon(Lu.GripVertical, Anim.EllipsisVerticalIcon)
export const History = icon(Lu.History, Anim.ClockIcon)
export const Image = icon(Lu.Image, Anim.ImageIcon)
export const Layers3 = icon(Lu.Layers3, Anim.LayersIcon)
export const Link2 = icon(Lu.Link2, Anim.LinkIcon)
export const ListChecks = icon(Lu.ListChecks, Anim.ListChecksIcon)
export const ListFilter = icon(Lu.ListFilter, Anim.FilterIcon)
export const ListPlus = icon(Lu.ListPlus, Anim.ListIcon) // animated: no list-plus
export const ListTodo = icon(Lu.ListTodo, Anim.ListChecksIcon) // animated: no list-todo
export const LogOut = icon(Lu.LogOut, Anim.LogOutIcon)
export const Mail = icon(Lu.Mail, Anim.MailIcon)
export const Maximize2 = icon(Lu.Maximize2, Anim.SquareArrowOutUpRightIcon)
export const MoreHorizontal = icon(Lu.MoreHorizontal, Anim.EllipsisIcon)
export const Palette = icon(Lu.Palette, Anim.BlendIcon) // animated: no palette
export const PanelLeft = icon(Lu.PanelLeft, Anim.MenuIcon) // animated: no panel-left
export const Paperclip = icon(Lu.Paperclip, Anim.PaperclipIcon)
export const Pencil = icon(Lu.Pencil, Anim.PencilIcon)
export const Pin = icon(Lu.Pin, Anim.PinIcon)
export const Play = icon(Lu.Play, Anim.PlayIcon)
export const Plus = icon(Lu.Plus, Anim.PlusIcon)
export const Redo2 = icon(Lu.Redo2, Anim.CornerUpRightIcon) // animated: no redo
export const RefreshCw = icon(Lu.RefreshCw, Anim.RefreshCwIcon)
export const Repeat2 = icon(Lu.Repeat2, Anim.Repeat2Icon)
export const RotateCcw = icon(Lu.RotateCcw, Anim.HistoryIcon) // animated: no rotate-ccw
export const Search = icon(Lu.Search, Anim.SearchIcon)
export const Settings2 = icon(Lu.Settings2, Anim.SettingsIcon)
export const Share2 = icon(Lu.Share2, Anim.ShareIcon)
export const SlidersHorizontal = icon(Lu.SlidersHorizontal, Anim.SlidersHorizontalIcon)
export const Star = icon(Lu.Star, Anim.StarIcon)
export const SunMedium = icon(Lu.SunMedium, Anim.SunMediumIcon)
export const Trash2 = icon(Lu.Trash2, Anim.Trash2Icon)
export const Undo2 = icon(Lu.Undo2, Anim.CornerUpLeftIcon) // animated: no undo
export const UserPlus = icon(Lu.UserPlus, Anim.UserPlusIcon)
export const UserRound = icon(Lu.UserRound, Anim.UserRoundIcon)
export const UsersRound = icon(Lu.UsersRound, Anim.UsersRoundIcon)
export const WifiOff = icon(Lu.WifiOff, Anim.WifiOffIcon)
export const X = icon(Lu.X, Anim.XIcon)

/* The `*Icon` spellings the shadcn primitives were generated with. */
export const CheckIcon = Check
export const ChevronRightIcon = ChevronRight
export const PanelLeftIcon = PanelLeft
