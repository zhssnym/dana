/*
Dana's icons.

**The family is `@animateicons/react/lucide`**: the
same Lucide drawings the product already used, with a motion/react animation
per icon that plays on hover. Every icon comes from this module and nothing
imports `lucide-react` directly, so the family is one decision in one file
rather than four hundred import lines.

**Motion is opt-out, by region.** Wrap a region in `<IconMotion enabled={false}>`
and every icon inside it renders as **plain Lucide**, not an animated icon
with its animation suppressed, but the static component, with no motion
machinery mounted at all. The sidebar does this, for two reasons that took a
while to separate:

1. Several of the family's icons animate *in*: their paths scale and fade up
   from nothing. That is right for an icon that is arriving and wrong for one
   already on screen, where hovering makes it vanish and rebuild. Planned drops
   seven of its ten paths to zero scale.
2. Worse, and it reads as blinking: a collapsed sidebar shows
   a tooltip on hover, and opening one remounts its trigger's subtree. A
   remounted animated icon starts from its hidden initial state, so the icon
   under the pointer flashes, and the one you just left flashes too as its own
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
- **The size class lands on the wrapper**, leaving the `svg` classless, which
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
  useState,
  type ComponentType,
  type CSSProperties,
  type Ref,
  type SVGProps,
} from "react"
import * as Anim from "@animateicons/react/lucide"
import * as Lu from "lucide-react"

import { cn } from "../components/ui/utils.js"

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
   trigger, it defaults to true and only decides whether the component may
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

/*
Static at rest, animated while touched.

The first build kept the animated component mounted always and drove it with
`startAnimation` / `stopAnimation`. That is what the library documents, and it
has one fault this family makes unavoidable: **many of these icons animate
*in*.** Their resting state is their initial state, which is nothing,
`stopAnimation` returns them to zero and a never-hovered one starts there. So
whether an icon was visible at rest depended entirely on which icon it was:
most of Dana's happened to rest drawn, `UserRoundCheck` rests at zero, and the
sidebar had been silently switched to static to paper over it, losing the
animation everywhere to fix one glyph.

Swapping the component instead fixes the class rather than the instance:

- **At rest, the plain Lucide drawing.** It cannot be hidden, because there is
  no animation state to be in, the thing that made this fragile is gone
  rather than worked around.
- **On hover or focus, the animated one mounts and plays its intro**, which is
  precisely the animation the family was built to show. Nothing has to be
  triggered against the grain; arriving *is* the effect.
- **On leave it unmounts back to the drawing.** A remount at rest, the
  tooltip in the collapsed rail, the case that started all of this, now
  renders a static icon, so there is nothing left to flash.

Stroke width is matched deliberately: the animated components hardcode 2, so
the resting drawing takes 2 as well *in this path only*. Otherwise the glyph
would visibly thicken on hover, which reads as a wobble rather than as an
animation. The static-mode path below keeps the call site's own 1.75.
*/
function AnimatedIcon({
  Component,
  Static,
  className,
  style,
  size,
  ...rest
}: IconProps & { Component: AnimComponent; Static: LucideIcon }) {
  const handle = useRef<AnimHandle | null>(null)
  const host = useRef<HTMLSpanElement | null>(null)

  /*
  Both layers are mounted always, and **exactly one of them is ever visible.**

  Mounted always because the alternative was worse: a component mounted under
  a pointer already inside it never receives an enter, so it sat in its hidden
  initial state and the icon went blank for as long as you hovered. Keeping it
  mounted means its imperative handle is attached long before anyone touches
  the control, so `startAnimation` has something to talk to.

  Visible one at a time because the previous revision painted both, and two
  identical strokes at 16px do not disappear into each other, they read as a
  doubled, slightly blurred glyph, "one icon on top of the other". The overlay does not rest
  at zero for most of this family; it rests fully drawn, so "the drawing shows
  through when the animation is idle" was true for a handful of glyphs and
  false for the rest.

  So visibility is switched rather than assumed:

  - **at rest** the plain drawing shows and the animation is hidden;
  - **while touched** the animation shows and the drawing is hidden;
  - **on leave** they swap back, which is invisible because the animation ends
    on exactly the drawing the static layer is.

  The invariant that matters survives: an icon's visibility never depends on
  an animation succeeding, because the layer that is visible at rest has no
  animation state at all.
  */
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const scope = parent.closest(HOVER_SCOPE) ?? parent
    const enter = () => {
      setPlaying(true)
      handle.current?.startAnimation()
    }
    const leave = () => {
      setPlaying(false)
      handle.current?.stopAnimation()
    }
    scope.addEventListener("mouseenter", enter)
    scope.addEventListener("mouseleave", leave)
    /* Keyboard users get it too: a tab stop is touching the control. */
    scope.addEventListener("focusin", enter)
    scope.addEventListener("focusout", leave)
    return () => {
      scope.removeEventListener("mouseenter", enter)
      scope.removeEventListener("mouseleave", leave)
      scope.removeEventListener("focusin", enter)
      scope.removeEventListener("focusout", leave)
    }
  }, [])

  return (
    <span
      ref={host}
      /*
      A size, always, F5, 2026-08-22.

      An icon given no size class fell back to lucide's own 24px, and that is
      how the overflow menus ended up disagreeing with each other: shadcn
      sizes a menu's glyphs with `[&_svg:not([class*='size-'])]:size-3.5`,
      which cannot reach ours. Our icons are a *span* wrapping an svg that
      carries `size-full`, and `size-full` contains the substring the
      selector excludes, so the primitive's rule silently skipped every one
      of them. Menus whose author happened to pass `size-4` looked right;
      menus that trusted the primitive were 24px.

      So the family carries its own default, and it is the compact icon token
      the design already has (16px). Anything wanting another size still says
      so, and the two can no longer disagree because only one of them is a
      decision.
      */
      className={cn(
        "relative inline-flex shrink-0",
        !/(?:^|\s)(?:size|[hw])-/.test(className ?? "") && "size-4",
        className,
      )}
      style={style}
    >
      {/* The drawing. Hidden, not unmounted, while the animation plays, so
          the geometry underneath never reflows. */}
      <Static
        className={cn("size-full", playing && "invisible")}
        strokeWidth={2}
        aria-hidden="true"
      />
      {/*
      The animation, exactly over it and pointer-transparent so it cannot take
      the hover it exists to react to.

      **The positioning belongs to this span, not to the animated component.**
      It used to be handed to the component as a `className`, which works only
      for the ones that forward it, and `BookmarkIcon` does not. The class
      went nowhere, the overlay stayed in flow, and the wrapper then held two
      flex items in a 14px box, so both halves rendered at 7px wide: a glyph
      squashed to half its width, in a family where every other glyph was
      fine. Owning the layer ourselves means a component that drops props can
      no longer break the geometry around it (DES-154). The size rule is a
      descendant selector for the same reason, some of these render their own
      wrapper around the svg and some do not.
      */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 [&_svg]:!size-full",
          !playing && "invisible",
        )}
      >
        <Component
          ref={handle}
          size={typeof size === "number" ? size : pixelSize(className)}
          {...(rest as Record<string, unknown>)}
        />
      </span>
    </span>
  )
}

/*
`Animated` may be null, and that is a real answer rather than a gap.

The animated library covers most of Lucide and not all of it, and the
temptation when it does not is to reach for something close, which is
exactly how the two alert glyphs came to animate into a *triangle* and mean
two things (DES-159). A drawing with no animation of its own is drawn plain
and does not move. That is a smaller loss than a glyph that turns into a
different object under the pointer.

**Twenty-nine of them were doing exactly that.** The filter
was three lines at rest and a funnel under the pointer; Settings was sliders
and then a gear; Folders opened, Ban became a crossed flag, the grip became
an ellipsis. Each one was a near-enough substitute chosen when the animated
library had no exact twin, and near enough is what DES-159 already ruled
against. They keep their drawings and lose their motion.

The audit checks it now, by rendering both and comparing them rather than by
reading names: lucide keeps aliases beside their replacements, so
`CheckCircle2` and `CircleCheckBig` are the same picture under two names and
must not be reported.

**Which half gives way is a judgement per icon.** The rule leaves two ways to
satisfy it, change the animation or change the drawing, and taking the drawing
every time would spend motion to keep pictures that are not always the better
ones. The filter is a funnel and Settings is a gear, because those drawings
are strong; seven more follow them, and all nine animate.

**Twenty stay drawn plain, each for a reason rather than for tidiness.** In
every one of these the animated twin would have changed what the glyph means,
or landed on a name already here:

- `Ban` → a crossed flag. Abandoned is not "unflagged".
- `CircleAlert` → a triangle. This is the exact morph DES-159 removed, and a
  triangle carries danger where a circle carries notice.
- `UserRoundPlus` → a square-headed figure, breaking the round-head family
  `UserRound` and `UserRoundCheck` belong to.
- `FolderInput` → an open folder, losing the arrow that *is* "move into".
- `Folders` → one closed folder, losing the plurality a group is named for.
- `GripVertical` → a vertical ellipsis, which is the overflow menu.
- `ListPlus` → a plain list, losing the plus.
- `ListTodo` → `ListChecks`, which is already the steps glyph here.
- `Group` → a list. Grouping is not listing.
- `Palette` → a blend. A palette says colour; a blend says opacity.
- `PanelLeft` → a hamburger and `PanelRight` → a list. A panel toggle is
  neither, and the two would have landed on one drawing.
- `Maximize2` → an arrow leaving a box, which is "open elsewhere" rather than
  "fill the screen"; `PictureInPicture2` → the same arrow.
- `Fullscreen` and `SquareSquare` → both to a scan bracket: one drawing under
  two names, and the wrong drawing.
- `Undo2` and `Redo2` → elbow arrows, which name a direction rather than an act.
- `RotateCcw` → `History`, a name this module already uses.
- `LampDesk` has no animated twin at all (DES-181).
*/
function icon(Static: LucideIcon, Animated: AnimComponent | null): LucideIcon {
  function DanaIcon({
    strokeWidth,
    absoluteStrokeWidth,
    ...rest
  }: IconProps) {
    const motion = useContext(IconMotionContext) && Animated !== null

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
          /* The same default as the animated path above, so an icon is not
             one size with motion on and another with it off, which it was,
             because this path is a bare svg that shadcn's own rule *can*
             reach and the other is not. */
          className={cn(
            !/(?:^|\s)(?:size|[hw])-/.test(rest.className ?? "") && "size-4",
            rest.className,
          )}
        />
      )
    }

    return <AnimatedIcon Component={Animated} Static={Static} {...rest} />
  }

  return DanaIcon
}

/* ─── The set ────────────────────────────────────────────────────────────────

   Name-for-name with Lucide where the animated family has the icon; where it
   does not, the substitute and the reason are on the line.                   */

/*
Failure, and only failure, F5, 2026-08-22.

There were two names here for one drawing: `AlertCircle` and `CircleAlert` are
the same lucide glyph, kept side by side because lucide keeps its deprecated
alias next to the replacement. Nothing in the source showed it, and the two
names had drifted onto two different meanings, one saying "this request
failed" in the error state, the other saying "this task is late" on a row.
One picture, two meanings, which is the fault the rule above names from the
other direction.

Worse, both were paired with `TriangleAlertIcon`, because the animated set has
no circle-alert: the resting glyph was a circle and the hover animation was a
triangle, so every one of them changed shape under the pointer.

The triangle is the conventional glyph for *something went wrong*, and it is
the one with a real animated twin, so failure takes it and the static and the
animation are finally the same shape. Lateness stops borrowing it, see the
due chip, which now keeps `CalendarDays` in every state and says "Overdue" in
danger red, because a field that changes glyph with its state is a field you
cannot find by shape.
*/
export const TriangleAlert = icon(Lu.TriangleAlert, Anim.TriangleAlertIcon)
export const AlignLeft = icon(Lu.AlignLeft, Anim.AlignLeftIcon)
export const Ban = icon(Lu.Ban, null) // animated: no ban. Abandoned is a
export const Bell = icon(Lu.Bell, Anim.BellIcon)
export const ArrowLeft = icon(Lu.ArrowLeft, Anim.ArrowLeftIcon)
export const ArrowRight = icon(Lu.ArrowRight, Anim.ArrowRightIcon)
export const CalendarCheck2 = icon(Lu.CalendarCheck, Anim.CalendarCheckIcon)
export const CalendarClock = icon(Lu.CalendarClock, Anim.CalendarClockIcon)
/* No date on it, the other value of the axis `CalendarDays` carries, and
   the filter's own words for it ("No due date"). Static and animation are the
   same drawing. */
export const CalendarX = icon(Lu.CalendarX, Anim.CalendarXIcon)
export const Download = icon(Lu.Download, Anim.DownloadIcon)
export const FolderOpen = icon(Lu.FolderOpen, Anim.FolderOpenIcon)
export const MailPlus = icon(Lu.MailPlus, Anim.MailPlusIcon)
export const MailWarning = icon(Lu.MailWarning, Anim.MailWarningIcon)
/* animated: no user-round-plus, and the family's user-plus is the same act */
export const UserRoundPlus = icon(Lu.UserRoundPlus, null)
export const CalendarDays = icon(Lu.CalendarDays, Anim.CalendarDaysIcon)
export const Check = icon(Lu.Check, Anim.CheckIcon)
export const CheckCircle2 = icon(Lu.CircleCheckBig, Anim.CircleCheckBigIcon)
export const ChevronDown = icon(Lu.ChevronDown, Anim.ChevronDownIcon)
export const ChevronUp = icon(Lu.ChevronUp, Anim.ChevronUpIcon)
export const ChevronLeft = icon(Lu.ChevronLeft, Anim.ChevronLeftIcon)
export const ChevronRight = icon(Lu.ChevronRight, Anim.ChevronRightIcon)
export const CircleAlert = icon(Lu.CircleAlert, null)
export const Clock3 = icon(Lu.Clock, Anim.ClockIcon)
export const Copy = icon(Lu.Copy, Anim.CopyIcon)
/* The two acts the object contract named that had no glyph yet. Neither has an
   animated twin, so both are drawn plain, DES-187 rule. */
/* A picture on a page (DES-202). The family's animated twin is `ImageIcon`,
   which draws lucide's plain `Image`, a different picture from `ImagePlus`,
   so pairing them would be exactly the morph the glyph rule exists to catch.
   Drawn plain instead (DES-187). */
export const ImagePlus = icon(Lu.ImagePlus, null)
export const OpenInNewTab = icon(Lu.SquareArrowOutUpRight, null)
/* Help, which the account menu gained when the footer was sorted by role
   (DES-200). Lucide carries this drawing under three names, CircleHelp,
   HelpCircle and CircleQuestionMark, and only one of them may be exported
   here, or the "one drawing, one name" rule is right to complain. The
   family has no animated twin, so it is drawn plain (DES-187). */
export const CircleQuestionMark = icon(Lu.CircleQuestionMark, null)
export const Workflow = icon(Lu.Workflow, null)
/* The Diagram block in the canvas `/` menu (#222). Not `Workflow`, which
   already means a workflow file. No animated twin, so drawn plain. */
export const Network = icon(Lu.Network, null)
/* Hiding a view from the sidebar (DES-170). Static and animation are the
   same drawing, which is the rule the alert glyphs broke. */
export const EyeOff = icon(Lu.EyeOff, Anim.EyeOffIcon)
export const Eye = icon(Lu.Eye, Anim.EyeIcon)
export const FileText = icon(Lu.FileText, Anim.FileTextIcon)
export const Video = icon(Lu.Video, Anim.VideoIcon) // animated: no film
export const Folder = icon(Lu.Folder, Anim.FolderIcon)
export const FolderInput = icon(Lu.FolderInput, null) // animated: no folder-input
export const FolderPlus = icon(Lu.FolderPlus, Anim.FolderPlusIcon)
export const Folders = icon(Lu.Folders, null) // animated: no folders
export const GripVertical = icon(Lu.GripVertical, null)
export const History = icon(Lu.History, Anim.HistoryIcon)
export const Image = icon(Lu.Image, Anim.ImageIcon)
/* Desk's mark (DES-152). The glyph is Lucide's tray, which is the drawing
   the name describes, a shallow tray things land in, rather than the
   envelope-adjacent one its Lucide name suggests. */
export const Inbox = icon(Lu.Inbox, Anim.InboxIcon)
export const Layers3 = icon(Lu.Layers3, Anim.LayersIcon)
export const Link2 = icon(Lu.Link, Anim.LinkIcon)
export const ListChecks = icon(Lu.ListChecks, Anim.ListChecksIcon)
export const Filter = icon(Lu.Filter, Anim.FilterIcon)
export const ListPlus = icon(Lu.ListPlus, null) // animated: no list-plus
export const ListTodo = icon(Lu.ListTodo, null) // animated: no list-todo
export const LogOut = icon(Lu.LogOut, Anim.LogOutIcon)
export const Mail = icon(Lu.Mail, Anim.MailIcon)
export const Maximize2 = icon(Lu.Maximize2, null)
export const MoreHorizontal = icon(Lu.MoreHorizontal, Anim.EllipsisIcon)
export const Palette = icon(Lu.Palette, null) // animated: no palette
export const PanelLeft = icon(Lu.PanelLeft, null) // animated: no panel-left
export const Paperclip = icon(Lu.Paperclip, Anim.PaperclipIcon)
export const Pencil = icon(Lu.Pencil, Anim.PencilIcon)
export const Pin = icon(Lu.Pin, Anim.PinIcon)
export const Play = icon(Lu.Play, Anim.PlayIcon)
export const Plus = icon(Lu.Plus, Anim.PlusIcon)
export const Redo2 = icon(Lu.Redo2, null) // animated: no redo
export const RefreshCw = icon(Lu.RefreshCw, Anim.RefreshCwIcon)
export const Repeat2 = icon(Lu.Repeat2, Anim.Repeat2Icon)
export const RotateCcw = icon(Lu.RotateCcw, null) // animated: no rotate-ccw
export const Search = icon(Lu.Search, Anim.SearchIcon)
export const Settings = icon(Lu.Settings, Anim.SettingsIcon)
export const Share2 = icon(Lu.Share2, Anim.ShareIcon)
export const SlidersHorizontal = icon(Lu.SlidersHorizontal, Anim.SlidersHorizontalIcon)
/* F5, for the rebuilt filter's arrangement axes and its Save as view. */
export const ArrowDownUp = icon(Lu.ArrowDownUp, Anim.ArrowDownUpIcon)
export const Bookmark = icon(Lu.Bookmark, Anim.BookmarkIcon)
export const Group = icon(Lu.Group, null)
export const Star = icon(Lu.Star, Anim.StarIcon)
export const SunMedium = icon(Lu.SunMedium, Anim.SunMediumIcon)
export const Trash2 = icon(Lu.Trash2, Anim.Trash2Icon)
export const Undo2 = icon(Lu.Undo2, null)
/* The icon picker's random-colour cell (e8-colors). */
export const Shuffle = icon(Lu.Shuffle, Anim.ShuffleIcon)
/*
Desk's mark: a desk lamp.

Desk replaced Inbox because Inbox carries email posture (DES-152), and
then went on wearing the literal tray, so the page had escaped the word and
not the picture. A lamp is where you work rather than where things arrive,
which is the whole distinction the rename was for.

The animated family has no desk lamp, and it **stays still** rather than becoming an animated lightbulb or having one
hand-written. That is DES-187 applied rather than an exception to it: an icon
with no twin is drawn plain, because the alternative is a glyph that changes
into a different picture on hover, the exact fault the share icon had.

The question is closed; it does not need re-opening the next time somebody
notices Desk sitting still while its neighbours move.
*/
export const LampDesk = icon(Lu.LampDesk, null)
export const UserPlus = icon(Lu.UserPlus, Anim.UserPlusIcon)
/*
People's own mark.

Assignments and People would both be round-head person glyphs, and at 16px
two figures of the same family read as the same row. The
split that fixes it is a real difference rather than a different accessory:
**Assignments is work that belongs to somebody**, a person carrying a tick,
while **People is the roster of humans you share with**, which is a card with
a person on it. The card's rectangle dominates at 16px, so the two are told
apart by shape rather than by a detail nobody can see at that size.

`one-page-one-mark` could not have caught this: two *different* names is
exactly what that rule wants, and no static rule can judge that two drawings
look alike. What it can see now is the footer, because the footer's two
screens joined `nav-model` in the same pass.
*/
export const Contact = icon(Lu.Contact, Anim.ContactIcon)
export const UserRound = icon(Lu.UserRound, Anim.UserRoundIcon)
/* Assignments' own mark. `UsersRound` was carrying five meanings at once,
   the People roster, the Assignments page, the "Everyone" scope, a folder's
   members and a landing-page bullet, so the page that means "work that
   belongs to somebody" takes the person-with-a-check and leaves the plain
   group to mean a group of people. */
export const UserRoundCheck = icon(Lu.UserRoundCheck, Anim.UserRoundCheckIcon)
export const UsersRound = icon(Lu.UsersRound, Anim.UsersRoundIcon)
export const WifiOff = icon(Lu.WifiOff, Anim.WifiOffIcon)
export const X = icon(Lu.X, Anim.XIcon)

/* ─── Conversation, added with the comments concept (DES-129) ──────────── */

export const AudioLines = icon(Lu.AudioLines, Anim.AudioLinesIcon)
export const MessageSquare = icon(Lu.MessageSquare, Anim.MessageSquareIcon)
export const Mic = icon(Lu.Mic, Anim.MicIcon)
export const Pause = icon(Lu.Pause, Anim.PauseIcon)
export const Reply = icon(Lu.Reply, Anim.ReplyIcon)
export const SendHorizontal = icon(Lu.SendHorizontal, Anim.SendHorizontalIcon)

/* ─── The folder page's views (DES-131) ────────────────────────────────── */

export const LayoutGrid = icon(Lu.LayoutGrid, Anim.LayoutGridIcon)
export const List = icon(Lu.List, Anim.ListIcon)

/* ─── Surfaces and structure (the critique round) ──────────────────────── */

export const ArrowDown = icon(Lu.ArrowDown, Anim.ArrowDownIcon)
export const ArrowUp = icon(Lu.ArrowUp, Anim.ArrowUpIcon)
export const ArrowUpRight = icon(Lu.ArrowUpRight, Anim.ArrowUpRightIcon)
export const Fullscreen = icon(Lu.Fullscreen, null) // animated: no fullscreen; Scan is the same corners without the centre pane
/* A dialog: a panel standing over the page. It had been drawn with
   `Fullscreen`, which is a different thing entirely and the one place a task
   can open that this is not. animated: the set has no plain square, and Scan
   is the nearest true shape, a bounded region drawn by its edges, which is
   what both of these are. */
export const SquareSquare = icon(Lu.SquareSquare, null)
export const Heading1 = icon(Lu.Heading1, Anim.Heading1Icon)
export const LoaderCircle = icon(Lu.LoaderCircle, Anim.LoaderCircleIcon)
export const PanelRight = icon(Lu.PanelRight, null) // animated: no panel-right; layout-list reads as a panel beside a page, where the menu glyph read as a hamburger
export const PictureInPicture2 = icon(Lu.PictureInPicture2, null) // animated: no pip; the out-of-flow meaning survives
export const Pilcrow = icon(Lu.Pilcrow, Anim.PilcrowIcon)
/* The slash menu's block kinds (r3-slash): drawn still, as menus are. */
export const Heading2 = icon(Lu.Heading2, null)
export const Heading3 = icon(Lu.Heading3, null)
export const ListOrdered = icon(Lu.ListOrdered, null)
export const ListCollapse = icon(Lu.ListCollapse, null)
export const Minus = icon(Lu.Minus, null)
export const Type = icon(Lu.Type, null)
export const ThumbsUp = icon(Lu.ThumbsUp, Anim.ThumbsUpIcon)

/* ─── The folder identity library (DES-130) ─────────────────────────────
   Icons a person can put on a folder. Every one exists name-for-name in the
   animated family, which is what bounded the choice: the library was picked
   from what the family can animate, not trimmed down to it afterwards. None
   of them is used by Dana's own chrome, so a folder's mark can never be
   mistaken for a control. `FOLDER_GLYPHS` in `folder-icon-picker.tsx` is the
   manifest; this file only owns the components, as it does for every icon. */

export const Banknote = icon(Lu.Banknote, Anim.BanknoteIcon)
export const Bike = icon(Lu.Bike, Anim.BikeIcon)
export const BookOpen = icon(Lu.BookOpen, Anim.BookOpenIcon)
export const Camera = icon(Lu.Camera, Anim.CameraIcon)
export const Car = icon(Lu.Car, Anim.CarIcon)
export const Cat = icon(Lu.Cat, Anim.CatIcon)
export const Cloud = icon(Lu.Cloud, Anim.CloudIcon)
export const Code = icon(Lu.Code, Anim.CodeIcon)
export const Coffee = icon(Lu.Coffee, Anim.CoffeeIcon)
export const Compass = icon(Lu.Compass, Anim.CompassIcon)
export const Dog = icon(Lu.Dog, Anim.DogIcon)
export const Drum = icon(Lu.Drum, Anim.DrumIcon)
export const Fish = icon(Lu.Fish, Anim.FishIcon)
export const Flame = icon(Lu.Flame, Anim.FlameIcon)
export const Footprints = icon(Lu.Footprints, Anim.FootprintsIcon)
export const Gamepad = icon(Lu.Gamepad2, Anim.GamepadIcon)
export const Gift = icon(Lu.Gift, Anim.GiftIcon)
export const Globe = icon(Lu.Globe, Anim.GlobeIcon)
export const Guitar = icon(Lu.Guitar, Anim.GuitarIcon)
export const Headphones = icon(Lu.Headphones, Anim.HeadphonesIcon)
export const Heart = icon(Lu.Heart, Anim.HeartIcon)
export const House = icon(Lu.House, Anim.HouseIcon)
export const Key = icon(Lu.Key, Anim.KeyIcon)
export const Laptop = icon(Lu.Laptop, Anim.LaptopIcon)
export const Lightbulb = icon(Lu.Lightbulb, Anim.LightbulbIcon)
export const MapIcon = icon(Lu.Map, Anim.MapIcon)
export const MapPin = icon(Lu.MapPin, Anim.MapPinIcon)
export const Moon = icon(Lu.Moon, Anim.MoonIcon)
/* The theme control's other two (DES-205). `Sun` rather than the `SunMedium`
   the Today page wears: they are different drawings, and giving the light
   theme the page's own glyph would say the two are related when they are not.
   `Monitor` is "whatever this machine says", which is what System means. */
export const Sun = icon(Lu.Sun, Anim.SunIcon)
export const Monitor = icon(Lu.Monitor, Anim.MonitorIcon)
export const Mountain = icon(Lu.Mountain, Anim.MountainIcon)
export const Music = icon(Lu.Music, Anim.MusicIcon)
export const Piano = icon(Lu.Piano, Anim.PianoIcon)
export const Coins = icon(Lu.Coins, Anim.CoinsIcon) // the pig retired at Imran's direction; coins say savings without the cartoon
export const Rocket = icon(Lu.Rocket, Anim.RocketIcon)
export const ShoppingBag = icon(Lu.ShoppingBag, Anim.ShoppingBagIcon)
export const ShoppingCart = icon(Lu.ShoppingCart, Anim.ShoppingCartIcon)
export const Swords = icon(Lu.Swords, Anim.SwordsIcon)
export const Tent = icon(Lu.Tent, Anim.TentIcon)
export const Umbrella = icon(Lu.Umbrella, Anim.UmbrellaIcon)
export const Utensils = icon(Lu.Utensils, Anim.UtensilsIcon)
export const Wallet = icon(Lu.Wallet, Anim.WalletIcon)
export const Zap = icon(Lu.Zap, Anim.ZapIcon)

/*
The sixty-three glyphs the library grew by on 2026-08-30, at the owner's word:
the picker was missing "the larger animated Lucide icon library", and the one
glyph a person could not get back was Desk's own lamp.

Three rules, and each is the block above's rather than a new one. **Every
addition is a drawing this family really has**, checked name for name against
`@animateicons/react/lucide`'s exports before it was written here, so nothing
below resolves to `undefined` at render; `LampDesk` is the single exception
and it already sat above with its own paragraph, animated by nothing. **None of them is a control this product draws**,
so a folder's mark still cannot be mistaken for something to press: the set is
objects and subjects, never acts, which is why there is no plus, no pencil and
no chevron in it. **And they arrive in sevens**, sixty-three of them, so the
picker's seven columns still fill whole rows and the orphan cell Imran caught
stays closed, per section rather than per grid now that the picker groups.
*/
export const Activity = icon(Lu.Activity, Anim.ActivityIcon)
export const AlarmClock = icon(Lu.AlarmClock, Anim.AlarmClockIcon)
export const Atom = icon(Lu.Atom, Anim.AtomIcon)
export const AudioWaveform = icon(Lu.AudioWaveform, Anim.AudioWaveformIcon)
export const Barcode = icon(Lu.Barcode, Anim.BarcodeIcon)
export const BicepsFlexed = icon(Lu.BicepsFlexed, Anim.BicepsFlexedIcon)
export const Blocks = icon(Lu.Blocks, Anim.BlocksIcon)
export const Box = icon(Lu.Box, Anim.BoxIcon)
export const Brain = icon(Lu.Brain, Anim.BrainIcon)
export const Calculator = icon(Lu.Calculator, Anim.CalculatorIcon)
export const Clipboard = icon(Lu.Clipboard, Anim.ClipboardIcon)
export const CloudRain = icon(Lu.CloudRain, Anim.CloudRainIcon)
export const CloudSnow = icon(Lu.CloudSnow, Anim.CloudSnowIcon)
export const CloudSun = icon(Lu.CloudSun, Anim.CloudSunIcon)
export const Cpu = icon(Lu.Cpu, Anim.CpuIcon)
export const CreditCard = icon(Lu.CreditCard, Anim.CreditCardIcon)
export const Disc3 = icon(Lu.Disc3, Anim.Disc3Icon)
export const Droplets = icon(Lu.Droplets, Anim.DropletsIcon)
export const Flag = icon(Lu.Flag, Anim.FlagIcon)
export const HardDrive = icon(Lu.HardDrive, Anim.HardDriveIcon)
export const Hourglass = icon(Lu.Hourglass, Anim.HourglassIcon)
export const Keyboard = icon(Lu.Keyboard, Anim.KeyboardIcon)
export const Lock = icon(Lu.Lock, Anim.LockIcon)
export const Mailbox = icon(Lu.Mailbox, Anim.MailboxIcon)
export const Milestone = icon(Lu.Milestone, Anim.MilestoneIcon)
export const Navigation = icon(Lu.Navigation, Anim.NavigationIcon)
export const Package = icon(Lu.Package, Anim.PackageIcon)
export const PiggyBank = icon(Lu.PiggyBank, Anim.PiggyBankIcon)
export const Plug = icon(Lu.Plug, Anim.PlugIcon)
export const Printer = icon(Lu.Printer, Anim.PrinterIcon)
export const QrCode = icon(Lu.QrCode, Anim.QrCodeIcon)
export const Quote = icon(Lu.Quote, Anim.QuoteIcon)
export const Rabbit = icon(Lu.Rabbit, Anim.RabbitIcon)
export const Radio = icon(Lu.Radio, Anim.RadioIcon)
export const Rainbow = icon(Lu.Rainbow, Anim.RainbowIcon)
export const Receipt = icon(Lu.Receipt, Anim.ReceiptIcon)
export const Route = icon(Lu.Route, Anim.RouteIcon)
export const Router = icon(Lu.Router, Anim.RouterIcon)
export const Server = icon(Lu.Server, Anim.ServerIcon)
export const ShoppingBasket = icon(Lu.ShoppingBasket, Anim.ShoppingBasketIcon)
export const Signpost = icon(Lu.Signpost, Anim.SignpostIcon)
export const Smartphone = icon(Lu.Smartphone, Anim.SmartphoneIcon)
export const Snowflake = icon(Lu.Snowflake, Anim.SnowflakeIcon)
export const Sparkles = icon(Lu.Sparkles, Anim.SparklesIcon)
export const Speaker = icon(Lu.Speaker, Anim.SpeakerIcon)
export const Store = icon(Lu.Store, Anim.StoreIcon)
export const Sunrise = icon(Lu.Sunrise, Anim.SunriseIcon)
export const Tablet = icon(Lu.Tablet, Anim.TabletIcon)
export const Tag = icon(Lu.Tag, Anim.TagIcon)
export const Telescope = icon(Lu.Telescope, Anim.TelescopeIcon)
export const Terminal = icon(Lu.Terminal, Anim.TerminalIcon)
export const Thermometer = icon(Lu.Thermometer, Anim.ThermometerIcon)
export const Ticket = icon(Lu.Ticket, Anim.TicketIcon)
export const Timer = icon(Lu.Timer, Anim.TimerIcon)
export const Tornado = icon(Lu.Tornado, Anim.TornadoIcon)
export const Truck = icon(Lu.Truck, Anim.TruckIcon)
export const Tv = icon(Lu.Tv, Anim.TvIcon)
export const Usb = icon(Lu.Usb, Anim.UsbIcon)
export const Watch = icon(Lu.Watch, Anim.WatchIcon)
export const Webcam = icon(Lu.Webcam, Anim.WebcamIcon)
export const Wifi = icon(Lu.Wifi, Anim.WifiIcon)
export const Wind = icon(Lu.Wind, Anim.WindIcon)

/*
The set the 4.3 icon key validates against. The server stores the key
opaquely, so tightening it is a validation change and never a migration. One
record of the set, in the file whose family bounded the choice; the picker
builds its labelled manifest from these keys and adds nothing to them.

**One hundred and five since 2026-08-30, and the two rules that governed
forty-two still govern it.** The keys were the designer's own forty-two, so
his picker's seven columns filled six rows with no orphan cell; the owner
asked for the larger library and for Desk's lamp to be inside it, so the set
grew by sixty-three, which is nine more whole rows, and the picker now groups
them into fifteen sections of seven so the rule holds where a person actually
reads it. **The forty-two are all still here and none of them moved**, because
a key is what 4.3 stores: dropping or respelling one would blank the mark on
every folder wearing it. `lamp-desk` is the addition with a reason of its own
and it is the third line below, next to the plain folder it stands beside on
Desk.
*/
export const FOLDER_ICON_KEYS = [
  /* General */
  'folder', 'lamp-desk', 'house', 'heart', 'gift', 'flag', 'sparkles',
  /* Work */
  'laptop', 'code', 'terminal', 'keyboard', 'printer', 'calculator',
  'clipboard',
  /* Ideas and study */
  'book-open', 'lightbulb', 'brain', 'telescope', 'atom', 'quote', 'rocket',
  /* Money */
  'coins', 'wallet', 'banknote', 'credit-card', 'piggy-bank', 'receipt', 'tag',
  /* Shopping */
  'shopping-cart', 'shopping-bag', 'shopping-basket', 'store', 'package',
  'box', 'barcode',
  /* Home */
  'key', 'lock', 'plug', 'utensils', 'coffee', 'umbrella', 'mailbox',
  /* Travel */
  'map', 'map-pin', 'compass', 'tent', 'mountain', 'globe', 'route',
  /* Getting around */
  'car', 'bike', 'truck', 'footprints', 'navigation', 'signpost', 'ticket',
  /* Weather */
  'cloud', 'cloud-rain', 'cloud-snow', 'cloud-sun', 'moon', 'sunrise',
  'rainbow',
  /* Nature */
  'flame', 'zap', 'snowflake', 'wind', 'droplets', 'tornado', 'thermometer',
  /* Music */
  'music', 'guitar', 'piano', 'drum', 'headphones', 'radio', 'audio-waveform',
  /* Time and effort */
  'hourglass', 'timer', 'alarm-clock', 'watch', 'activity', 'biceps-flexed',
  'milestone',
  /* Media */
  'camera', 'tv', 'smartphone', 'tablet', 'webcam', 'disc', 'speaker',
  /* Tech */
  'cpu', 'server', 'hard-drive', 'router', 'wifi', 'usb', 'qr-code',
  /* Animals and play */
  'cat', 'dog', 'fish', 'rabbit', 'gamepad', 'swords', 'blocks',
] as const

/*
The `*Icon` spellings the shadcn primitives were generated with.

Three of these are his. `ChevronDownIcon`, `ChevronUpIcon` and `XIcon` exist,
with `ChevronUp` above them, because `select.tsx` and
`sheet.tsx` were the two primitives still importing `lucide-react`
directly: the module had no name for what they reached for, so they
reached past it. DES-125 says in terms that nothing imports `lucide-react`
directly, so the port completed the
rule his own alias block had started rather than carrying two exceptions
forward. `ChevronUp` is a real icon rather than an alias because the family
never had one; the animated set does, and it is the same drawing.
*/
export const CheckIcon = Check
export const ChevronDownIcon = ChevronDown
export const ChevronRightIcon = ChevronRight
export const ChevronUpIcon = ChevronUp
export const PanelLeftIcon = PanelLeft
export const XIcon = X
