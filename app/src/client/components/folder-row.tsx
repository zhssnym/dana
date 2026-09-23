/*
One folder in the sidebar's folder list, with its mark, its pending count and
its own menu.

**It is a link, and that is 9.1's roles table.** That table fixes "the six page
entries, and each folder row" as links: the routes table makes every surface a
URL, and a page you can reach at a URL is navigated to. AC-175 names both
halves, the role and the `href`, and names `aria-current` on the row for the
folder currently open.

So `href` is required. `render` is offered beside it because this client routes
with React Router in library mode and a router's own link element has to be the
thing that carries the destination; the shell passes it and the default stays a
plain anchor, which is also what makes the row work with scripting unavailable.
Whichever arrives, it is an anchor with an `href`, and that is what the
criterion reads.

**The mark is the folder's own, and the colour is 4.3's.** 9.1 asks each row for
"the folder's mark (its icon in its colour, 4.3)", and 9.6 retires 4.4's
per-member colour column from every surface. Both values arrive as props,
resolved once by `parts/presenters.ts`, so the row, a task's folder chip and the
tab strip cannot answer the same question differently (AC-243). The rule that
raw values live only in `tokens.css` governs the values the design fixes; a
folder's colour is data on the wire. AC-173 reads the paint inside the row and
would fail a client that painted every folder from one swatch.

**The menu is "More actions".** A sidebar folder row's menu and a folder group's
menu share that name with two other controls, because they are the same control
pointed at different objects and a fourth name would assert a difference in kind
that is not there. A name in 9.1's table is a fixed string, and what tells four
instances apart is 9.1's region rule, this one being reached inside the row that
names its folder.

**The move-to-shelf submenu renders `menuitemradio`, which is accurate.** A
folder carries exactly one personal label, so a radio group is what that choice
is, and the state a screen reader announces is which group the folder is in.
9.1's roles table does not reach this control and sends it to "its role in the
ordinary sense of the word"; AC-180 admits it.

**The menu is the object contract's.** `lib/object-acts.ts` owns which acts
exist, their words, their glyphs and their order, and `object-menu.tsx` draws
them, so where a person stands does not decide what they can do to the same
folder. What stays here is what belongs to the *surface* rather than to the
folder: the contents of the shelf picker.

Every handler is a prop that may be absent, and the contract's own safety
property does the rest: an act with no handler is not drawn, so a member's row
is given `onLeave` and an owner's `onDelete` and neither needs a role branch in
this file.
*/
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

/* The icon module: nothing imports `lucide-react` per icon
   (`components/ui/foundation.test.ts`). */
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
  /**
   * A word the row appends to its accessible name and never draws, for a row
   * whose name a page entry of 9.1's page block already answers to.
   *
   * Issue #158: the sidebar carries two links called Desk, the page at `/app`
   * and the default folder's row, and expanded they are told apart only by the
   * pending badge inside the folder row's anchor ("Desk 7"). The badge is
   * `group-data-[collapsible=icon]:hidden`, so in the rail it leaves the
   * accessibility tree with everything else the rail drops and both links would
   * read exactly "Desk". A person in the rail with a screen reader would then
   * hear one name twice with nothing between them.
   *
   * It is a suffix inside the anchor rather than an `aria-label` on it, because
   * a label would replace the whole computed name and take the pending count
   * out of it with the rest; AC-155 asserts that count is inside the link, and
   * 9.1 puts it there so a row announces as one thing. So this is the badge's
   * own treatment: real content in the anchor, unseen, concatenated into the
   * name. The leading space is deliberate, adjacent inline elements
   * concatenating without one into "Desk7".
   */
  qualifier?: string
  pending: number
  /** 9.1's routes table: `/app/folders/:id`. Named by AC-175. */
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
  The four props the drag adds. Each is optional and absent by default, so a row
  nobody is dragging renders exactly as it would without them: a sidebar nobody
  has touched still reads exactly as it did.

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
  qualifier,
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
  /* A right-click on the row opens the same menu the "More actions" button
     does, by pressing that button. */
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
              : /* Motion tokens rather than raw values: 11.4's single-file
                   rule, and a row that eases differently from the shelf above
                   it is drift a person can see. */
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
        /* `rounded-md` gives the carried row and the held-over row their
           corners; without it the accent wash and the ring would be square
           against a list of rounded rows. */
        'group/folder-row rounded-md',
        /* In the icon rail the tree lines have nothing to hang from, so they go
           with the labels. */
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
          /* One centred glyph per folder in the rail (issue #12).

             At 56px of rail the true centre is 28. The label is clipped to
             nothing in the rail but is still a flex item, so a `gap-2` would
             lay out 8px of space beside it and push every glyph 4px left, and a
             `flex-1` label given room by the `!px-0` below would push this
             row's glyph a further 4px. `justify-center` alone is not
             sufficient: the gap is zero in the rail (`ui/sidebar.tsx`) and the
             label below is stopped from growing, so the glyph is the only thing
             in flow. The label stays in the markup and in the accessibility
             tree, hidden by nothing: AC-182 reads both a page row and a folder
             row by name in the rail, and `app-sidebar.tsx` carries the same
             note on its own row. */
          'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!px-0 group-data-[collapsible=icon]:before:!inset-x-0',
        )}
      >
        {/* The folder's own mark. 9.1: "each folder row carries the folder's
            mark (its icon in its colour, 4.3)". The glyph arrives as a prop,
            resolved once by `parts/presenters.ts`, so the row, the task chip
            and the tab strip cannot answer the question differently. */}
        {/*
        A folder's mark rests at 0.62 and comes to full on the row you are
        standing on, which puts a graphite folder on the same footing as the nav
        rows above it rather than a shade lighter than all of them, and lets the
        active row say something the others do not. The hover step is
        deliberately absent: a nav row lights its background and leaves its
        glyph alone, and the background hover is on the row, where it is shared.
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
        {/* The qualifier rides inside the label rather than beside it, so that
            the button's own `[&>*]:relative` cannot reach it: that variant
            lands on every direct child of the anchor and beats `sr-only`'s
            `absolute` on source order, which is the collision `FolderRowLink`
            records and answers with `!absolute`. Nested, there is nothing to
            collide with, and the label is already in the accessibility tree in
            the rail (see the note above), so the suffix is there too. */}
        <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:grow-0">
          {name}
          {qualifier === undefined ? null : (
            <span className="sr-only">{` ${qualifier}`}</span>
          )}
        </span>
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
          **No `pointer-events-none` on the hidden strip.** AC-180 and AC-223
          address "More actions" on a sidebar row, and a control that receives
          no pointer events until its row is hovered cannot be clicked by
          anything that hit-tests before it moves the pointer: the click would
          retry against the row's own link underneath it.

          This file's own rule already covers the case and 9.1 is behind it: "a
          control with an empty bounding box is not visible to anything that
          addresses it by role and name", and a control that answers no pointer
          is not operable by it either.
          */
          /* Hidden in the icon rail, where the strip would sit on top of the
             glyph and a click would open the menu instead of the folder. A
             touch screen or a narrow window gets the strip at rest rather than
             on a hover it cannot make. */
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
          One menu, drawn from `lib/object-acts.ts`, the same wherever the
          folder is reached. What is left here is what belongs to the *surface*
          rather than to the folder: the shelf picker's contents.
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
            /* One word for the thing, and one door: putting this folder on a
               shelf that does not exist yet lives inside the move submenu as
               "New shelf…" (below), not as a separate item at the top of the
               menu. */
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
                            {/* AC-334 addresses this row by its exact wording. */}
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
      {shelf}'", and the reason it is words at all is that a closed group is
      never sprung open by a drag hovering it, because opening it would move
      every row below it after the engine had measured where they sit. So the
      closed group takes the drop and says so instead. The same line carries the
      hold's two states and the way out of a group, each of which is equally a
      promise about the release.
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

A sidebar is 224 pixels at its narrowest and cannot hold a sentence, so the
words are short, the pill truncates, and the countdown that explains a hold is
the same closing ring the task row uses, shrunk to the size of a folder's own
mark. Without the countdown a person holding a folder over another has nothing
telling them how long to hold or that anything is happening.

It rides the carried row rather than the row underneath: the carried row sits
directly under the pointer, so a badge drawn on the target would be painted and
then covered by the very row that caused it.

`holding` and `armed` are `SortableItemState`'s `isDwelling` and `isArmed` under
this component's own names, so the row passes them through rather than the
engine being changed.
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
   empty every time rather than from wherever the last one stopped. That is a
   property of the mount rather than of the animation: a ring kept mounted and
   reset by a prop would show the last hold's tail on the first frame of the
   next one. */
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
