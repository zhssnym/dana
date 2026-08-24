import { useEffect, useState } from "react"

import { FolderPlus, MoreHorizontal, Plus } from "@/lib/icons"

import { folderGlyph } from "@/components/folder-icon-picker"
import { ObjectMenu } from "@/components/object-menu"
import { HistorySheet } from "@/components/history-sheet"
import { saveFolderAsWorkflow } from "@/lib/folder-acts"
import { useFolderIdentity } from "@/lib/folder-presentation"
import type { SortableItemState } from "@/lib/use-sortable-list"

import { Button } from "@/components/ui/button"
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export interface FolderRowProps {
  name: string
  color: string
  pending: number
  active?: boolean
  nested?: boolean
  tree?: boolean
  treeLast?: boolean
  groupLabels?: string[]
  currentLabel?: string | null
  onSelect?: () => void
  onAddTask?: () => void
  onMoveToLabel?: (label: string | null) => void
  onRename?: () => void
  onEditAppearance?: () => void
  onDelete?: () => void
  /* The acts the object contract added at F7. Each is optional and absent
     means "this surface cannot", which is what keeps the menu honest. */
  onOpenInTab?: () => void
  onCopyLink?: () => void
  onDuplicate?: () => void
  /* ------------------------------------------------------------- drag -- */
  /* All optional, and a row given none of them behaves exactly as it did
     before drag existed — which is what the collapsed rail and the v1 Desk
     row still want. */
  itemRef?: (element: HTMLElement | null) => void
  /* The grip. Spread on the row itself rather than on a separate handle: a
     sidebar row is small, and a column of grab dots beside every folder is
     more furniture than the gesture is worth. */
  rowProps?: Record<string, unknown>
  /* Arrow-key reordering, which lives on the focusable control rather than on
     the list item, because that is the thing a keyboard can reach. */
  handleProps?: Record<string, unknown>
  dragState?: SortableItemState
  /* What a release right now would do, in words, drawn on the row being
     carried. Null while an ordinary reorder is the proposal — the space the
     other rows are holding open says that better than a label could. */
  proposal?: string | null
  /* Whether that proposal is a hold still filling, and whether it has
     filled. The ring is the countdown; the fill is the confirmation. */
  holding?: boolean
  armed?: boolean
}

export function FolderRow({
  name,
  color,
  pending,
  active = false,
  nested = false,
  tree = false,
  treeLast = false,
  groupLabels = [],
  currentLabel = null,
  onSelect,
  onAddTask,
  onMoveToLabel,
  onRename,
  onEditAppearance,
  onDelete,
  onOpenInTab,
  onCopyLink,
  onDuplicate,
  itemRef,
  rowProps,
  handleProps,
  dragState,
  proposal = null,
  holding = false,
  armed = false,
}: FolderRowProps) {
  const hasFolderMenu = Boolean(
    onRename ||
      onEditAppearance ||
      onMoveToLabel ||
      onDelete ||
      onOpenInTab ||
      onCopyLink ||
      onDuplicate,
  )
  /* The word changed with DES-195; the prop is still `groupLabels` because
     renaming it reaches nine call sites for no behaviour. */
  const shelfNames = groupLabels
  const hasActions = Boolean(onAddTask || hasFolderMenu)
  const carried = Boolean(dragState?.isActive) && !dragState?.isSettling
  const offset = dragState?.offset ?? 0
  /* The mark a person put on the folder follows it into the sidebar
     (DES-130); a folder nobody has touched keeps the plain folder glyph. */
  const identity = useFolderIdentity(name)
  const Glyph = folderGlyph(identity.glyph, name)
  const glyphColor = identity.color ?? color

  const [historyOpen, setHistoryOpen] = useState(false)
  return (
    <SidebarMenuItem
      ref={itemRef}
      {...rowProps}
      style={{
        /* The carried row tracks the pointer exactly, so its translate is
           never on a transition; the rows making space for it are, because
           that movement is the whole message. Same arrangement as the task
           list's ExpandShell, and for the same reason. */
        transform: offset === 0 ? undefined : `translate3d(0, ${offset}px, 0)`,
        transition: carried
          ? "box-shadow var(--duration-fast) var(--ease-standard)"
          : "transform var(--duration-base) var(--ease-enter), background-color var(--duration-base) var(--ease-enter), box-shadow var(--duration-base) var(--ease-enter)",
        zIndex: carried ? 30 : undefined,
      }}
      className={cn(
        "group/folder-row rounded-md",
        tree &&
          "before:absolute before:-top-0.5 before:left-6 before:z-0 before:h-[calc(50%+2px)] before:w-1.5 before:rounded-bl-[6px] before:border-b before:border-l before:border-[var(--color-graphite-300)] before:content-[''] after:absolute after:top-1/2 after:-bottom-0.5 after:left-6 after:z-0 after:border-l after:border-[var(--color-graphite-300)] after:content-['']",
        tree && treeLast && "after:hidden",
        /* Picked up: opaque, lifted, completely legible. Nothing is faded,
           because the one thing being moved is the one thing to keep. */
        carried &&
          "cursor-grabbing bg-card shadow-[var(--elevation-2)] ring-1 ring-[var(--color-graphite-300)]",
        /* Rested on: a proposal rather than a target, which the ring in the
           badge is explaining. Rings rather than borders, or every row would
           shift a pixel as the proposal moved along the list. */
        holding &&
          "bg-[var(--color-dana-accent-50)] ring-1 ring-[var(--color-dana-accent-200)]",
        armed && "bg-[var(--color-dana-accent-50)] ring-2 ring-[var(--color-dana-accent-600)]",
      )}
    >
      <SidebarMenuButton
        {...handleProps}
        data-sidebar-tier="folder"
        isActive={active}
        aria-current={active ? "page" : undefined}
        title={name}
        tooltip={name}
        onClick={onSelect}
        className={cn(
          "relative h-[var(--shell-sidebar-row-height)] gap-2 border-0 bg-transparent px-3 text-[13px] font-medium text-[var(--color-graphite-600)] hover:bg-transparent hover:text-[var(--color-graphite-600)] data-active:bg-transparent data-active:font-semibold data-active:text-[var(--color-graphite-900)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] group-hover/folder-row:before:bg-[var(--color-graphite-100)] data-active:before:bg-[var(--color-graphite-100)] [&>*]:relative [&>*]:z-10",
          nested && !tree && "pl-7",
          tree && "pl-10 before:!left-8",
          (pending > 0 || hasActions) && "pr-[4.75rem]",
        )}
      >
        {/* A folder row now carries the same rest/active emphasis every other
            sidebar row has, and did not before: the inline colour was applied
            at one strength whatever the row's state, so a folder was the only
            entry in the sidebar that did not darken when you were standing in
            it. Emphasis rides opacity rather than the hue, because the hue is
            the folder's identity (DES-130) and must survive — a graphite
            folder therefore reads exactly like a nav row going light to dark,
            and a coloured one keeps its colour and gains the same weight. */}
        {/*
        The rest opacity is 0.62, and the number is arithmetic rather than
        taste — F5, 2026-08-22.

        A nav row's glyph is graphite-600 at rest and graphite-900 when
        active. A folder's must ride opacity instead, because its hue is its
        identity and must survive, so the question is: what opacity makes
        graphite-900 read as graphite-600 on this ground? Over the sidebar's
        graphite-50, (244−110)/(244−27) = 0.617. At the 0.55 it was, a
        graphite folder sat a shade lighter than every nav row above it —
        close enough to look accidental rather than different on purpose.

        The hover step went with it. A nav row lights its *background* on
        hover and leaves its glyph alone; a folder row was doing both, so the
        two families behaved differently under the same pointer. The
        background hover is still there, on the row, where it is shared.
        */}
        <Glyph
          className={cn(
            "!size-4 shrink-0 transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
            active ? "opacity-100" : "opacity-[0.62]",
          )}
          style={{ color: glyphColor }}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </SidebarMenuButton>

      {pending > 0 ? (
        <SidebarMenuBadge
          className={cn(
            "right-3 h-5 min-w-5 rounded-full bg-[var(--color-graphite-200)] px-1.5 text-[0.625rem] text-[var(--color-graphite-600)] peer-data-active/menu-button:bg-[var(--color-graphite-200)] peer-data-active/menu-button:text-[var(--color-graphite-800)]",
            hasActions &&
              "transition-opacity group-hover/folder-row:pointer-events-none group-hover/folder-row:opacity-0 group-focus-within/folder-row:pointer-events-none group-focus-within/folder-row:opacity-0",
          )}
        >
          {pending}
        </SidebarMenuBadge>
      ) : null}

      {hasActions ? (
        /* The grip is the whole row, so the controls on it have to say they
           are not: a press that lands here belongs to the control, exactly as
           a press on a task row's chip belongs to its picker. */
        <div
          data-no-drag
          className={cn(
            "pointer-events-none absolute top-1/2 right-1 z-20 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/folder-row:pointer-events-auto group-hover/folder-row:opacity-100 group-focus-within/folder-row:pointer-events-auto group-focus-within/folder-row:opacity-100",
            /* A row in the air has no use for its own menu, and the hover
               that would open it is nobody's intention mid-drag. */
            proposal && "hidden",
          )}
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

          {hasFolderMenu ? (
            /*
            One menu for a folder, wherever it is — `lib/object-acts` declares
            the acts and this surface says which of them it can perform. It
            used to be written here by hand, and the folder page wrote its own
            separately, so the same folder offered Label and colour in the
            sidebar and not on its own page.
            */
            <ObjectMenu
              kind="folder"
              name={name}
              handlers={{
                open: onOpenInTab,
                rename: onRename,
                move: onMoveToLabel
                  ? {
                      choose: (
                        <DropdownMenuRadioGroup
                          value={currentLabel || "__none"}
                          onValueChange={(value) =>
                            onMoveToLabel(value === "__none" ? null : value)
                          }
                        >
                          {shelfNames.map((label) => (
                            <DropdownMenuRadioItem key={label} value={label} closeOnClick>
                              {label}
                            </DropdownMenuRadioItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuRadioItem value="__none" closeOnClick>
                            No shelf
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      ),
                    }
                  : undefined,
                /* The same act the page offers, from the row — DES-197's whole
                   point is that where you stand does not decide what you can
                   do to a folder. */
                history: () => setHistoryOpen(true),
                "copy-link": onCopyLink,
                duplicate: onDuplicate,
                /* No prop: a workflow is made from what the shell holds, and
                   the row asks for it the same way Duplicate does. */
                workflow: () => saveFolderAsWorkflow(name),
                delete: onDelete,
              }}
              width="w-52"
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)]"
                  aria-label={`Manage ${name} folder`}
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </Button>
              }
            />
          ) : null}
          <HistorySheet
            kind="folder"
            subject={name}
            name={name}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
          />
        </div>
      ) : null}

      {proposal ? (
        <Proposal text={proposal} holding={holding} armed={armed} />
      ) : null}
    </SidebarMenuItem>
  )
}

/*
What a release would do, in words, riding the row being carried.

The task list says this in a pill wide enough for a sentence. A sidebar is
224 pixels at its narrowest and cannot, so the words are short, the pill
truncates, and the countdown that explains a hold is the same closing ring the
task row uses, shrunk to the size of a folder's own mark.

It rides the carried row rather than the row underneath, which is the lesson
the task row learned the expensive way: the carried row sits directly under
the pointer at z-30, so a badge drawn on the target is painted and then
covered by the very row that caused it.
*/
function Proposal({
  text,
  holding,
  armed,
}: {
  text: string
  holding: boolean
  armed: boolean
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1/2 right-2 z-20 flex max-w-[70%] -translate-y-1/2 items-center gap-1 rounded-full py-0.5 pr-2 pl-1 text-[11px] leading-4 font-medium shadow-[var(--elevation-1)] transition-[background-color,color] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        armed
          ? "bg-[var(--color-dana-accent-600)] text-white"
          : "bg-card text-[var(--color-dana-accent-800)] ring-1 ring-[var(--color-dana-accent-200)]",
      )}
    >
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        {holding ? <DwellRing /> : null}
        <FolderPlus
          className={cn(
            "size-3",
            armed ? "text-white" : "text-[var(--color-dana-accent-600)]",
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
   empty every time rather than from wherever the last one stopped. */
function DwellRing() {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
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
          transition: "stroke-dashoffset 1500ms linear",
        }}
      />
    </svg>
  )
}
