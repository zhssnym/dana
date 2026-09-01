/*
The designer's `src/components/folder-row.tsx`, ported at P8R session R3: one
folder in the sidebar's folder list, with its colour dot, its pending count
and its own menu.

**It is a link now, and that is 9.1's roles table rather than a preference.**
Measured against the running prototype on 2026-08-13: every entry in his
sidebar is a `button`, and the only anchor anywhere in it is the brand. That
table fixes "the six page entries, and each folder row" as links, on the
ground the section already carried: the routes table makes every surface a
URL, and a page you can reach at a URL is navigated to. AC-175 asserts both
halves, the role and the `href`, and asserts `aria-current` on the row for the
folder currently open.

So `href` is required. `render` is offered beside it because this client
routes with React Router in library mode and a router's own link element has
to be the thing that carries the destination; the shell passes it and the
default stays a plain anchor, which is also what makes the row work with
scripting unavailable. Whichever arrives, it is an anchor with an `href`, and
that is what the criterion reads.

**The mark is the folder's own since S17a, and the colour is 4.3's.** This
row drew a literal folder glyph in the viewer's personal `my_color` until
then, which was correct under v1 and is two faults under v2: 9.1 asks each
row for "the folder's mark (its icon in its colour, 4.3)", and 9.6 retires
4.4's per-member column from every v2 surface. Both values arrive as props,
resolved once by `parts/presenters.ts`, so the row, a task's folder chip and
the tab strip cannot answer the same question differently (DES-130, AC-243).
The rule that raw values live only in `tokens.css` governs the values the
design fixes; a folder's colour is data on the wire. AC-173 reads the paint
inside the row and would fail a client that painted every folder from one
swatch.

**The menu is "More actions", corrected here.** This file shipped his
`Manage {folder} folder` on the reading that the row's menu was not the
control the task row's overflow is. 9.1 ruled the other way at the P8R
mid-package change control of 2026-08-13, re-accepted by the owner the same
day: a sidebar folder row's menu and a folder group's menu take "More
actions", making four controls that share it, because they are the same
control pointed at different objects and a fourth name would assert a
difference in kind that is not there. The interpolation is the other half of
the fault and the general one: a name in that table is a fixed string, and
what tells four instances apart is 9.1's region rule, this one being reached
inside the row that names its folder. The menu's entries are unchanged, 9.6
supplying "Rename" and "Label and color" as its own words and "Move to group"
being one of the four folder-group actions that table names.

**The move-to-group submenu renders `menuitemradio`, which is accurate and
which AC-180 now admits.** A folder carries exactly one personal label, so a
radio group is what that choice is, and the state a screen reader announces is
which group the folder is in. That criterion reached for `menuitem` or `option`
alone when this was written, so R3 escalated rather than degrading the
primitive; the Adversarial Test Engineer corrected the locator on 2026-08-13,
9.1's roles table not reaching this control and sending it to "its role in the
ordinary sense of the word", which all three are true of. Nothing here changed.

**The menu is the object contract's since S17a, and that is the change a
reader will see.** It was a hand-written list of five items, and the folder
page's was a hand-written list of seven, so where a person stood decided what
they could do to the same folder: DES-201's own worked example, still true of
this client on the day it was ported. `lib/object-acts.ts` now owns which acts
exist, their words, their glyphs and their order, and `object-menu.tsx` draws
them; what stays here is the one item that belongs to the *surface* rather
than to the folder, "New folder group", and the contents of the group picker.
"Label and color" is gone with the dialog 9.6 retired.

Every handler is still a prop that may be absent, and the contract's own
safety property does the rest: an act with no handler is not drawn, so a
member's row is given `onLeave` and an owner's `onDelete` and neither needs a
role branch in this file.
*/
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

/* The icon module of DES-125, since S24 here: this file imported `lucide-react`
   per icon, which `components/ui/foundation.test.ts` allowed on a named v1 list
   whose own comment says each entry "leaves with the package that replaces the
   surface it draws". The shell is that package. */
import { Folder, FolderPlus, Folders, Plus } from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import { ObjectMenu } from './object-menu.js'
import { Button } from './ui/button.js'
import { MORE_ACTIONS } from './ui/copy.js'
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu.js'
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar.js'
import { cn } from './ui/utils.js'
import { DWELL_MS } from '../lib/use-sortable-list.js'
import type { SortableItemState } from '../lib/use-sortable-list.js'

export interface FolderRowProps {
  name: string
  color: string
  /** The folder's chosen glyph (4.3). Defaults to the plain folder, which is
      what an unset identity means, so a row given none renders as it always
      did. */
  icon?: LucideIcon
  pending: number
  /** 9.1's routes table: `/app/folders/:id`. Asserted by AC-175. */
  href: string
  /**
   * The element the row renders as, for a router that owns navigation. It
   * must produce an anchor carrying `href`; the default is a plain one.
   */
  render?: ReactElement<Record<string, unknown>>
  active?: boolean
  nested?: boolean
  tree?: boolean
  treeLast?: boolean
  groupLabels?: readonly string[]
  currentLabel?: string | null
  /*
  The four props the S11 drag adds. Each is optional and absent by default, so
  a row nobody is dragging renders exactly as it did: DES-171's "a sidebar
  nobody has touched still reads exactly as it did" is a property of this
  component as much as of the order above it.

  `itemRef` is the engine's measurement ref, `rowProps` is the grip plus
  whatever the surface hit-tests against, `dragState` is how this row is drawn
  while a drag is in the air, and `proposal` is the sentence the carried row
  says about where it would land.
  */
  itemRef?: (element: HTMLLIElement | null) => void
  rowProps?: React.ComponentProps<'li'>
  dragState?: SortableItemState
  /** What a release would do, said on the carried row only. */
  proposal?: string | null
  onSelect?: () => void
  onAddTask?: () => void
  /** 9.1's "New folder group", which is an act on this folder's label and is
      therefore the surface's own rather than the contract's. */
  onNewGroup?: () => void
  /*
  The contract's acts (`lib/object-acts.ts`). Each is optional and an act with
  no handler is not drawn, which is how the role split of 9.6 reaches this row
  without a branch in it: an owner's row is given `onDelete` and a member's
  `onLeave`, and neither is given both.
  */
  onOpenInNewTab?: () => void
  onHistory?: () => void
  onMoveToLabel?: (label: string | null) => void
  onRename?: () => void
  onCopyLink?: () => void
  onDuplicate?: () => void
  onSaveAsWorkflow?: () => void
  onLeave?: () => void
  onDelete?: () => void
}

export function FolderRow({
  name,
  color,
  icon: Mark = Folder,
  pending,
  href,
  render,
  active = false,
  nested = false,
  tree = false,
  treeLast = false,
  groupLabels = [],
  currentLabel = null,
  itemRef,
  rowProps,
  dragState,
  proposal = null,
  onSelect,
  onAddTask,
  onNewGroup,
  onOpenInNewTab,
  onHistory,
  onMoveToLabel,
  onRename,
  onCopyLink,
  onDuplicate,
  onSaveAsWorkflow,
  onLeave,
  onDelete,
}: FolderRowProps) {
  const hasFolderMenu = Boolean(
    onNewGroup ??
      onOpenInNewTab ??
      onHistory ??
      onMoveToLabel ??
      onRename ??
      onCopyLink ??
      onDuplicate ??
      onSaveAsWorkflow ??
      onLeave ??
      onDelete,
  )
  const hasActions = Boolean(onAddTask) || hasFolderMenu
  /* polish: sidebar F11. A right-click on the row opens the same menu the
     "More actions" button does, by pressing that button. */
  const menuTrigger = useRef<HTMLButtonElement>(null)
  /*
  Geometry inline rather than in a class, because the offset is a measured
  number of pixels and a class cannot carry one. The tokens file stays the
  only place a colour, a type size, a spacing step or a radius is written; a
  transform is none of those.

  The carried row does not transition and the rows it passes do: the carried
  one is following a pointer, where any easing reads as lag, and the others
  are making space, where the movement is the whole message. `isSettling` is
  the one frame band where the carried row transitions too, travelling to the
  slot the list held open before the array underneath it changes.
  */
  const offset = dragState?.offset ?? 0
  const dragStyle: React.CSSProperties | undefined =
    dragState === undefined || (offset === 0 && !dragState.isActive)
      ? undefined
      : {
          transform: `translateY(${String(offset)}px)`,
          transition:
            dragState.isActive && !dragState.isSettling
              ? 'none'
              : /* The prototype's own tokens since S24, where this wrote 180ms
                   and a literal curve. Two raw values standing in for two
                   tokens is the drift 11.4's single-file rule exists to stop,
                   and a row that eases differently from the shelf above it is
                   the drift a person can see. */
                'transform var(--duration-base) var(--ease-enter), background-color var(--duration-base) var(--ease-enter), box-shadow var(--duration-base) var(--ease-enter)',
          zIndex: dragState.isActive ? 30 : undefined,
          position: dragState.isActive ? 'relative' : undefined,
          /* The carried row must not catch the point it is following: the
             Library's containerAt asks the document what is under the
             pointer, and the answer must be the place the row is over, never
             the row itself. */
          pointerEvents: dragState.isActive ? 'none' : undefined,
        }

  return (
    <SidebarMenuItem
      ref={itemRef}
      {...rowProps}
      style={{ ...dragStyle, ...rowProps?.style }}
      data-dragging={dragState?.isActive ? 'true' : undefined}
      onContextMenu={
        hasFolderMenu
          ? (event) => {
              event.preventDefault()
              menuTrigger.current?.click()
            }
          : undefined
      }
      className={cn(
        /* `rounded-md` is the prototype's, and it is what gives the carried
           row and the held-over row their corners; without it the accent wash
           and the ring were square against a list of rounded rows. */
        'group/folder-row rounded-md',
        /* polish: sidebar F2. In the icon rail the tree lines have nothing to
           hang from, so they go with the labels. */
        tree &&
          "before:absolute before:-top-0.5 before:left-6 before:z-0 before:h-[calc(50%+2px)] before:w-1.5 before:rounded-bl-[6px] before:border-b before:border-l before:border-[var(--color-graphite-300)] before:content-[''] after:absolute after:top-1/2 after:-bottom-0.5 after:left-6 after:z-0 after:border-l after:border-[var(--color-graphite-300)] after:content-[''] group-data-[collapsible=icon]:before:hidden group-data-[collapsible=icon]:after:hidden",
        tree && treeLast && 'after:hidden',
        dragState?.isActive &&
          'cursor-grabbing bg-card shadow-[var(--elevation-2)] ring-1 ring-[var(--color-graphite-300)]',
        dragState?.isDwelling &&
          'bg-[var(--color-dana-accent-50)] ring-1 ring-[var(--color-dana-accent-200)]',
        dragState?.isArmed &&
          'bg-[var(--color-dana-accent-50)] ring-2 ring-[var(--color-dana-accent-600)]',
        rowProps?.className,
      )}
    >
      <SidebarMenuButton
        // 9.1's roles table: a folder row is a link to that folder's path.
        render={render ?? <a href={href} />}
        data-sidebar-tier="folder"
        isActive={active}
        aria-current={active ? 'page' : undefined}
        title={name}
        tooltip={name}
        onClick={onSelect}
        className={cn(
          "relative h-[var(--shell-sidebar-row-height)] gap-2 border-0 bg-transparent px-3 text-[13px] font-medium text-[var(--color-graphite-600)] hover:bg-transparent hover:text-[var(--color-graphite-600)] data-active:bg-transparent data-active:font-semibold data-active:text-[var(--color-graphite-900)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] group-hover/folder-row:before:bg-[var(--color-graphite-100)] data-active:before:bg-[var(--color-graphite-100)] [&>*]:relative [&>*]:z-10",
          nested && !tree && 'pl-7',
          tree && 'pl-10 before:!left-8',
          (pending > 0 || hasActions) && 'pr-[4.75rem]',
          /* polish: sidebar F2, corrected against measurement for issue #12.
             This said "one centred glyph per folder in the rail" and was false
             from the day it was written: the glyph has never been centred, and
             `CLAUDE.md` carries it as the worked example of a comment that
             states intent and reads as behaviour. A session working from it
             concluded the reported misalignment was impossible.

             What was actually happening, measured in the browser at 56px of
             rail, where the true centre is 28: this row's glyph sat at 20 and
             every navigation row's sat at 24. The label is clipped to nothing
             in the rail but is still a flex item, so `gap-2` laid out 8px of
             space beside it and pushed every glyph 4px left; this row then
             widened its own content box with the `!px-0` below, which gave its
             `flex-1` label 8px to grow into rather than none, for 8px in all.
             The two magnitudes are why the rail read as a straight column with
             one folder falling out of it.

             `justify-center` was therefore never wrong and never sufficient.
             The gap is now zero in the rail (`ui/sidebar.tsx`) and the label
             below is stopped from growing, so the glyph is the only thing in
             flow and this comment is finally true. The label stays in the
             markup and in the accessibility tree, hidden by nothing: AC-182
             reads both a page row and a folder row by name in the rail, and
             `app-sidebar.tsx` carries the same note on its own row. */
          'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!px-0 group-data-[collapsible=icon]:before:!inset-x-0',
        )}
      >
        {/* The folder's own mark since S17a, where this drew a literal folder
            in the folder's colour. 9.1: "each folder row carries the folder's
            mark (its icon in its colour, 4.3)". The glyph arrives as a prop,
            resolved once by `parts/presenters.ts`, so the row, the task chip
            and the tab strip cannot answer the question differently. */}
        {/*
        The two opacities are the prototype's and its header carries the
        arithmetic: a folder's mark rests at 0.62 and comes to full on the row
        you are standing on, which puts a graphite folder on the same footing
        as the nav rows above it rather than a shade lighter than all of them.
        This drew 0.90 flat, so the active row said nothing the others did not.
        The hover step is deliberately absent: a nav row lights its background
        and leaves its glyph alone, and the background hover is on the row,
        where it is shared.
        */}
        <Mark
          className={cn(
            '!size-4 shrink-0 transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            active ? 'opacity-100' : 'opacity-[0.62]',
          )}
          style={{ color }}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:grow-0">{name}</span>
      </SidebarMenuButton>

      {pending > 0 ? (
        <SidebarMenuBadge
          className={cn(
            'right-3 h-5 min-w-5 rounded-full bg-[var(--color-graphite-200)] px-1.5 text-[0.625rem] text-[var(--color-graphite-600)] peer-data-active/menu-button:bg-[var(--color-graphite-200)] peer-data-active/menu-button:text-[var(--color-graphite-800)] group-data-[collapsible=icon]:hidden',
            hasActions &&
              'transition-opacity group-hover/folder-row:pointer-events-none group-hover/folder-row:opacity-0 group-focus-within/folder-row:pointer-events-none group-focus-within/folder-row:opacity-0',
          )}
        >
          {pending}
        </SidebarMenuBadge>
      ) : null}

      {hasActions ? (
        // Opacity alone, never a collapsed box, for the reason task-row.tsx
        // records at length: a control with an empty bounding box is not
        // visible to anything that addresses it by role and name, which is
        // what 9.1's addressing sentence requires of every control.
        <div
          // The whole row is the drag's grip where a list is sorting it
          // (`shell/library-drag.ts`), and a press on a control belongs to
          // that control, so the row's own actions say they are not the grip.
          data-no-drag
          /*
          **The prototype's `pointer-events-none` is not taken, and it was
          taken once and measured.** Its reasoning is sound on its own terms, a
          strip at zero opacity still answering a click, and it costs the
          prototype nothing. It costs this client four browser criteria:
          AC-180's two cases and AC-223's both address "More actions" on a
          sidebar row, and a control that receives no pointer events until its
          row is hovered cannot be clicked by anything that hit-tests before it
          moves the pointer. Measured at S24, whole leg: the click resolved the
          right button, then retried for fifteen seconds against the row's own
          link underneath it.

          This file's own rule already covers the case and 9.1 is behind it:
          "a control with an empty bounding box is not visible to anything that
          addresses it by role and name", and a control that answers no pointer
          is not operable by it either. 11.13 gives the section the win.
          */
          /* polish: sidebar F2. Hidden in the icon rail, where the strip sat
             on top of the glyph and a click opened the menu instead of the
             folder. A touch screen or a narrow window gets the strip at rest
             rather than on a hover it cannot make. */
          className="absolute top-1/2 right-1 z-20 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/folder-row:opacity-100 group-focus-within/folder-row:opacity-100 group-data-[collapsible=icon]:hidden [@media(hover:none)]:opacity-100"
        >
          {onAddTask ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)]"
              aria-label={`Add task to ${name}`}
              onClick={onAddTask}
            >
              <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          ) : null}

          {/*
          One menu, drawn from `lib/object-acts.ts` since S17a.

          It was a hand-written list of five items until then, and the folder
          page's was a hand-written list of seven, so where a person stood
          decided what they could do to the same folder: DES-201's own worked
          example, still true of this client on the day it was ported. What is
          left here is the two items that belong to the *surface* rather than
          to the folder, "New folder group" and the group picker's contents;
          everything else is the contract's and is the same on both.
          */}
          <ObjectMenu
            kind="folder"
            name={name}
            align="end"
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                ref={menuTrigger}
                className="size-6 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)]"
                // 9.1's names table: a fixed string, the row that names this
                // folder being what separates it from the other controls
                // answering to it.
                aria-label={MORE_ACTIONS}
              />
            }
            /* polish: sidebar F5, F7. "New folder group" stood here at the top
               of the menu five rows above "Move to shelf": one word for the
               thing, and one door, so the act of putting this folder on a
               shelf that does not exist yet lives inside the move submenu as
               "New shelf…" (below). Both fixers renamed this item; only one
               of them could keep it here as well, and two doors to one act is
               what F7 was about. */
            handlers={{
              open: onOpenInNewTab,
              history: onHistory,
              rename: onRename,
              'copy-link': onCopyLink,
              duplicate: onDuplicate,
              workflow: onSaveAsWorkflow,
              leave: onLeave,
              delete: onDelete,
              move:
                onMoveToLabel === undefined
                  ? undefined
                  : {
                      choose: (
                        <DropdownMenuRadioGroup
                          value={currentLabel ?? '__none'}
                          onValueChange={(value) => {
                            onMoveToLabel(value === '__none' ? null : value)
                          }}
                        >
                          {groupLabels.map((label) => (
                            <DropdownMenuRadioItem key={label} value={label} closeOnClick>
                              {label}
                            </DropdownMenuRadioItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuRadioItem value="__none" closeOnClick>
                            {/* polish: tabstrip F6 and shelves F1 both named
                                this row. AC-334 addresses it exactly, so the
                                pages fixer's wording is the one that stands. */}
                            Not on a shelf
                          </DropdownMenuRadioItem>
                          {onNewGroup === undefined ? null : (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={onNewGroup}>
                                <Folders className="size-4" aria-hidden="true" />
                                New shelf…
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuRadioGroup>
                      ),
                    },
            }}
          />
        </div>
      ) : null}

      {/*
      What a release would do, said in words on the row being carried.

      9.1 fixes the sentence for the container case, "the drop reads 'Into
      {shelf}'", and DES-171 gives the reason it is words at all: a closed
      group is never sprung open by a drag hovering it, because opening it
      would move every row below it after the engine had measured where they
      sit. So the closed group takes the drop and says so instead. The same
      line carries the hold's two states and the way out of a group, each of
      which is equally a promise about the release.
      */}
      {proposal === null ? null : (
        <Proposal
          text={proposal}
          holding={dragState?.isDwelling ?? false}
          armed={dragState?.isArmed ?? false}
        />
      )}
    </SidebarMenuItem>
  )
}

/*
What a release would do, in words, riding the row being carried.

Lifted from `docs/design/prototype-v2/src/components/folder-row.tsx` at S24,
read on `v2-build` at `102e855`. Ledger entry L-128 asked this row to be
verified rather than assumed, and the verdict is that the client drew its own
affordance: a graphite pill with the words in it, and `ring-2 ring-ring/40` on
the row while a hold was filling. The words were right and the countdown was
missing, so a person holding a folder over another had nothing telling them how
long to hold or that anything was happening.

The designer's own reasoning, kept intact as the design record: the task list
says this in a pill wide enough for a sentence. A sidebar is 224 pixels at its
narrowest and cannot, so the words are short, the pill truncates, and the
countdown that explains a hold is the same closing ring the task row uses,
shrunk to the size of a folder's own mark.

It rides the carried row rather than the row underneath, which is the lesson
the task row learned the expensive way: the carried row sits directly under the
pointer, so a badge drawn on the target is painted and then covered by the very
row that caused it. That half was already ported and is ledger entry L-127.

**One seam**: `holding` and `armed` are `SortableItemState`'s `isDwelling` and
`isArmed`, which is the same pair under this client's own names, so the row
passes them through rather than the engine being changed.
*/
function Proposal({
  text,
  holding,
  armed,
}: {
  readonly text: string
  readonly holding: boolean
  readonly armed: boolean
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'pointer-events-none absolute top-1/2 right-2 z-20 flex max-w-[70%] -translate-y-1/2 items-center gap-1 rounded-full py-0.5 pr-2 pl-1 text-[11px] leading-4 font-medium shadow-[var(--elevation-1)] transition-[background-color,color] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        armed
          ? 'bg-[var(--color-dana-accent-600)] text-white'
          : 'bg-card text-[var(--color-dana-accent-800)] ring-1 ring-[var(--color-dana-accent-200)]',
      )}
    >
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        {holding ? <DwellRing /> : null}
        <FolderPlus
          className={cn(
            'size-3',
            armed ? 'text-white' : 'text-[var(--color-dana-accent-600)]',
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
      <span className="truncate">{text}</span>
    </span>
  )
}

/* The hold, drawn. Mounted only while one is running, so the ring starts from
   empty every time rather than from wherever the last one stopped. That is
   L-128's sentence exactly, and it is a property of the mount rather than of
   the animation: a ring kept mounted and reset by a prop would show the last
   hold's tail on the first frame of the next one. */
function DwellRing(): React.JSX.Element {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setGrown(true)
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [])

  const radius = 7
  const circumference = 2 * Math.PI * radius

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      /* Rotated so the ring closes from twelve o'clock, where every progress
         ring anybody has seen starts. */
      className="absolute inset-0 size-4 -rotate-90"
    >
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeWidth="1.5"
        className="stroke-[var(--color-dana-accent-100)]"
      />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="stroke-[var(--color-dana-accent-600)]"
        style={{
          strokeDasharray: circumference,
          strokeDashoffset: grown ? 0 : circumference,
          /* The engine's own dwell, so the ring closes when the hold fires
             rather than at a number written twice. */
          transition: `stroke-dashoffset ${String(DWELL_MS)}ms linear`,
        }}
      />
    </svg>
  )
}
