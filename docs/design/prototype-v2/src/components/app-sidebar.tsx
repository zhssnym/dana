import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { IconMotion, type LucideIcon } from "@/lib/icons"
import {
  Workflow,
  CircleQuestionMark,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Folders,
  Layers3,
  ListTodo,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Star,
  SunMedium,
  Trash2,
  UsersRound,
} from "@/lib/icons"
import { useHelpSheet } from "@/components/help-sheet"
import { ViewerFace } from "@/components/viewer-face"

import { DanaMark } from "@/components/dana-mark"
import { FolderDirectory } from "@/components/folder-directory"
import { FolderRow } from "@/components/folder-row"
import { folderPageMark } from "@/components/folder-mark"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  shellFolderGroups,
  shellInbox,
  shellUnlabelledFolders,
  type ShellFolderFixture,
} from "@/fixtures"
import {
  baseShelfLabels,
  folderShelf,
  type PrototypeFolderMemberships,
} from "@/lib/folder-membership"
import { FOOTER_PAGES, NAV_PAGES, readNavModel } from "@/lib/nav-model"
import { cn } from "@/lib/utils"
import { isPagePinned, usePagePins } from "@/lib/page-pins"

export type ShellPageName =
  | "My Day"
  | "Tasks"
  | "Planned"
  | "Important"
  | "All"
  | "Done"
  | "People"
  | "Settings"
  | "Trash"
  /* DES-152's set, live behind `?nav=v2` beside the old one so the two can be
     compared by looking. Both are in the union while the flag exists. */
  | "Desk"
  | "Today"
  | "Scheduled"
  | "Assignments"

export type OptionalPageVisibility = Partial<
  Record<"Important" | "All" | "Done", boolean>
>

type SystemPageName = Exclude<ShellPageName, "People" | "Settings">

type SidebarFolderFixture = ShellFolderFixture & { folderKey: string }
type FolderSidebarAction = "rename" | "appearance" | "delete"

const systemPages: Array<{ name: SystemPageName; icon: LucideIcon }> = [
  { name: "My Day", icon: SunMedium },
  { name: "Tasks", icon: ListTodo },
  { name: "Planned", icon: CalendarDays },
  { name: "Important", icon: Star },
  { name: "All", icon: Layers3 },
  { name: "Done", icon: CheckCircle2 },
]

function NavigationRow({
  name,
  icon: Icon,
  active,
  onSelect,
}: {
  name: string
  icon: LucideIcon
  active?: boolean
  onSelect?: () => void
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        data-sidebar-tier="primary"
        isActive={active}
        aria-current={active ? "page" : undefined}
        tooltip={name}
        onClick={onSelect}
        className="relative h-[var(--shell-sidebar-row-height)] gap-2 border-0 bg-transparent px-3 text-[13px] font-semibold text-[var(--color-graphite-600)] hover:bg-transparent hover:text-[var(--color-graphite-600)] data-active:bg-transparent data-active:font-semibold data-active:text-[var(--color-graphite-900)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] data-active:before:bg-[var(--color-graphite-100)] [&>*]:relative [&>*]:z-10"
      >
        <Icon
          className={
            active
              ? "!size-4 text-[var(--color-graphite-900)]"
              : "!size-4 text-[var(--color-graphite-500)]"
          }
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="group-data-[collapsible=icon]:hidden">{name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function SidebarBrandHeader({ onOpenSearch }: { onOpenSearch?: () => void }) {
  return (
    <SidebarHeader className="p-2 pb-1" >
      <div className="flex min-h-[var(--shell-sidebar-item-height)] items-center group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
        <a
          href="/"
          className="flex min-w-0 items-center gap-3 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          aria-label="Dana — go to My Day"
        >
          <DanaMark className="size-7 group-data-[collapsible=icon]:size-6" />
          <span className="truncate text-base font-semibold text-[var(--color-graphite-900)] group-data-[collapsible=icon]:hidden">
            Dana
          </span>
        </a>
        <div className="ml-auto flex items-center gap-1 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:flex-col">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  className="size-[var(--shell-sidebar-item-height)] text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] group-data-[collapsible=icon]:order-2 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)]"
                  aria-label="Search Dana. Keyboard shortcut Control K or slash."
                  onClick={onOpenSearch}
                >
                  <Search className="!size-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent side="right">Search · Ctrl K or /</TooltipContent>
          </Tooltip>
          <SidebarTrigger className="size-[var(--shell-sidebar-item-height)] shrink-0 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] group-data-[collapsible=icon]:order-1 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)] [&_svg]:!size-4" />
        </div>
      </div>
    </SidebarHeader>
  )
}

function ProfileMenu({
  defaultOpen = false,
  onOpenSettings,
}: {
  defaultOpen?: boolean
  onOpenSettings?: () => void
}) {
  const help = useHelpSheet()
  return (
    <>
      <DropdownMenu defaultOpen={defaultOpen} modal={!defaultOpen}>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            className="h-[var(--shell-sidebar-item-height)] gap-2 px-2 text-[13px] font-semibold text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]"
            aria-label="Open Imran Wafa's account menu"
          >
            <ViewerFace className="size-7 group-data-[collapsible=icon]:size-5" />
            <span className="min-w-0 text-[13px] font-semibold group-data-[collapsible=icon]:hidden">
              Imran Wafa
            </span>
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent side="right" align="end" className="w-44">
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onOpenSettings}
        >
          <Settings className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        {/*
        Help, placed by the same rule as Trash and New shelf.

        It is not a destination inside your work and it does not make anything;
        it is about the *application*, which is what everything else in this
        menu is about. A sidebar row for it would have made the footer's
        navigation list mean two things at once — three places in your data and
        one page of documentation — and the list's legibility is the only thing
        holding it together as items arrive.

        Dana's answer to a first-time user is not this link. It is a page that
        arrives with something on it, which is what the image block and the
        worked example are for.
        */}
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={() => help.setOpen(true)}
        >
          <CircleQuestionMark className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Help
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-[var(--control-height)] text-sm">
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
      {/* A sibling of the menu, not a child of it: the sheet has to outlive
          the press that opened it, and a dialog nested inside a menu unmounts
          with the menu the moment it closes. */}
      </DropdownMenu>
      {help.sheet}
    </>
  )
}

function SidebarResizeHandle({
  value,
  min,
  max,
  onChange,
  onCommit,
  onReset,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  onCommit: (value: number) => void
  onReset: () => void
}) {
  const drag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    currentWidth: number
  } | null>(null)

  function clamp(valueToClamp: number) {
    return Math.min(max, Math.max(min, valueToClamp))
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    event.preventDefault()
    event.currentTarget.focus()
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: value,
      currentWidth: value,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return

    const nextWidth = clamp(
      drag.current.startWidth + event.clientX - drag.current.startX,
    )
    drag.current.currentWidth = nextWidth
    onChange(nextWidth)
  }

  function finishPointerResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return

    onCommit(drag.current.currentWidth)
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    let nextWidth: number | null = null

    if (event.key === "ArrowLeft") {
      nextWidth = clamp(value - (event.shiftKey ? 24 : 8))
    } else if (event.key === "ArrowRight") {
      nextWidth = clamp(value + (event.shiftKey ? 24 : 8))
    } else if (event.key === "Home") {
      nextWidth = min
    } else if (event.key === "End") {
      nextWidth = max
    }

    if (nextWidth === null) return
    event.preventDefault()
    onChange(nextWidth)
    onCommit(nextWidth)
  }

  return (
    <div
      data-sidebar="resize-handle"
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} pixels`}
      tabIndex={0}
      title={`Resize sidebar · ${Math.round(value)}px · double-click to reset`}
      className="absolute inset-y-0 -right-1 z-30 hidden w-2 cursor-col-resize touch-none outline-none group-data-[collapsible=icon]:hidden md:block after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[var(--color-graphite-300)] focus-visible:after:bg-[var(--color-dana-accent-600)]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerResize}
      onPointerCancel={finishPointerResize}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  )
}

export function AppSidebar({
  activePage = "My Day",
  activeFolder,
  corePagesOnly = false,
  avatarMenuOpen = false,
  sidebarWidth = 256,
  sidebarMinWidth = 224,
  sidebarMaxWidth = 360,
  onSidebarWidthChange,
  onSidebarWidthCommit,
  onSidebarWidthReset,
  onNavigate,
  additionalFolders = [],
  folderMemberships = {},
  folderNameOverrides = {},
  deletedFolderNames = [],
  onCreateFolder,
  onCreateFolderGroup,
  onImportWorkflow,
  onOpenShelf,
  onOpenFolderInTab,
  onSaveShelfWorkflow,
  onCreateFolderInGroup,
  onMoveFolderToLabel,
  onAddTaskToFolder,
  onOpenFolderAction,
  onRenameFolderGroup,
  onDeleteFolderGroup,
  onNavigateFolder,
  onCopyFolderLink,
  onDuplicateFolder,
  onDeleteFolder,
  onOpenSearch,
  onGroupFolders,
  pageVisibility,
}: {
  activePage?: ShellPageName | null
  activeFolder?: string
  corePagesOnly?: boolean
  avatarMenuOpen?: boolean
  sidebarWidth?: number
  sidebarMinWidth?: number
  sidebarMaxWidth?: number
  onSidebarWidthChange?: (width: number) => void
  onSidebarWidthCommit?: (width: number) => void
  onSidebarWidthReset?: () => void
  onNavigate?: (page: ShellPageName) => void
  additionalFolders?: ShellFolderFixture[]
  folderMemberships?: PrototypeFolderMemberships
  folderNameOverrides?: Record<string, string>
  deletedFolderNames?: string[]
  onCreateFolder?: () => void
  onCreateFolderGroup?: () => void
  /* A file's text, straight through: only the shell can turn it into a folder
     and its tasks. */
  onImportWorkflow?: (text: string) => void
  onOpenShelf?: (label: string) => void
  onOpenFolderInTab?: (name: string) => void
  onSaveShelfWorkflow?: (label: string) => void
  onCreateFolderInGroup?: (label: string) => void
  onMoveFolderToLabel?: (
    folderName: string,
    label: string | null,
  ) => void
  onAddTaskToFolder?: (folderName: string) => void
  onOpenFolderAction?: (
    folderName: string,
    action: FolderSidebarAction,
  ) => void
  onRenameFolderGroup?: (
    label: string,
    folders: ShellFolderFixture[],
  ) => void
  onDeleteFolderGroup?: (
    label: string,
    folders: ShellFolderFixture[],
  ) => void
  onNavigateFolder?: (name: string) => void
  /* The object contract's acts, from the shell — only it has the clipboard
     and somewhere to put a copy. */
  onCopyFolderLink?: (name: string) => void
  onDuplicateFolder?: (name: string) => void
  onDeleteFolder?: (name: string) => void
  onOpenSearch?: () => void
  /* Two folders held together long enough to become a group. The naming
     panel is the shell's, so this only reports the pair. */
  onGroupFolders?: (folderNames: string[]) => void
  pageVisibility?: OptionalPageVisibility
}) {
  /* DES-152's sidebar, behind `?nav=v2`: one page per question, Desk at the
     head of the block because it is native, undeletable and where a new
     account lands — which is also why it is no longer listed among the
     folders a person can delete. Done ships unpinned. */
  const workflowInput = useRef<HTMLInputElement>(null)
  /* The tab strip's "+" offers Import too, and this input is the one file
     picker — a second input would be a second copy of the act, and the two
     would answer one selector. The request travels as an event because the
     strip is not this component's child (DES-217). */
  useEffect(() => {
    const openPicker = () => workflowInput.current?.click()
    window.addEventListener("dana:prototype-import-workflow", openPicker)
    return () =>
      window.removeEventListener("dana:prototype-import-workflow", openPicker)
  }, [])
  const pagePins = usePagePins()
  const navModel = readNavModel()
  /*
  The pinned views, from the pin store — DES-153's "Settings is a pin list".

  This used to read `page.pinned || (page.name === "Done" && …)`: the shipped
  default, plus one hardcoded exception for the one unpinned view that
  existed. Two more arrived at F5 and a person's own saved views arrive after
  that, so the exception is a lookup now and the sidebar has stopped knowing
  any page by name.
  */
  const v2Pages = NAV_PAGES.filter((page) =>
    isPagePinned(page.name, pagePins),
  ).map((page) => ({
    name: page.name as SystemPageName,
    /* A page whose spine is a folder wears that folder's mark, resolved now
       rather than when `nav-model` loaded — which is why choosing a glyph for
       Desk never reached the sidebar. */
    icon: page.spine === "folder" ? folderPageMark(page.name) : page.icon,
  }))

  const visiblePages =
    navModel === "v2"
      ? corePagesOnly
        ? v2Pages.slice(0, 3)
        : v2Pages
      : (corePagesOnly ? systemPages.slice(0, 3) : systemPages).filter(
          (page) =>
            page.name === "My Day" ||
            page.name === "Tasks" ||
            page.name === "Planned" ||
            /* Narrowed because `SystemPageName` now spans both models while
               this branch only ever walks the v1 six; the map's three keys
               are the only optional pages in that set. */
            pageVisibility?.[page.name as "Important" | "All" | "Done"] !==
              false,
        )
  const baseLabels = baseShelfLabels(shellFolderGroups)
  const allFolders: SidebarFolderFixture[] = [
    ...shellFolderGroups.flatMap((group) => group.folders),
    ...shellUnlabelledFolders,
    ...additionalFolders,
  ]
    .filter((folder) => !deletedFolderNames.includes(folder.name))
    .map((folder) => ({
      ...folder,
      folderKey: folder.name,
      name: folderNameOverrides[folder.name] ?? folder.name,
      color: folderMemberships[folder.name]?.color ?? folder.color,
    }))
    /*
    One folder, one row (DES-216).

    Imran, 2026-08-23: a folder restored from the Trash "becomes two instead of
    one". This list is built from three sources — the fixture groups, the
    unlabelled fixtures and whatever a person has made — and any name appearing
    in two of them was drawn twice. `folderLibrary()` has de-duplicated since it
    was written, which is why the pickers and search were always right and only
    the sidebar doubled; the column that draws folders had its own list and its
    own rules.

    De-duplicated by `folderKey` rather than by the displayed name, so a rename
    cannot make one folder look like two or two look like one.
    */
    .filter((folder, index, all) =>
      all.findIndex((other) => other.folderKey === folder.folderKey) === index,
    )
  const groupedFolders = new Map<string, SidebarFolderFixture[]>()
  const unlabelledFolders: SidebarFolderFixture[] = []

  allFolders.forEach((folder) => {
    const label = folderShelf(folder.folderKey, baseLabels, folderMemberships)

    if (!label) {
      unlabelledFolders.push(folder)
      return
    }

    groupedFolders.set(label, [...(groupedFolders.get(label) ?? []), folder])
  })

  const displayFolderGroups = [...groupedFolders.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([label, folders]) => ({
      label,
      folders: folders.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    }))
  const groupLabels = displayFolderGroups.map((group) => group.label)

  unlabelledFolders.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  )

  const [foldersOpen, setFoldersOpen] = useState(true)

  return (
    /* Permanent furniture, so its icons render static rather than animated.
       Two separate faults sat behind this: several of the family's icons
       animate in from nothing, and — the blinking Imran saw — a tooltip
       opening in the collapsed rail remounts its trigger, and a remounted
       animated icon starts from its hidden state. Static components have
       neither problem. See lib/icons.tsx. */
    /* Animation is back on, and safely: `lib/icons.tsx` now renders the plain
       drawing at rest and mounts the animated one only while a control is
       hovered or focused, so an icon that animates in can no longer be
       invisible at rest and a remounted tooltip trigger has nothing to
       flash. Both faults this paragraph describes are fixed at the source
       rather than by turning the family off here. */
    <IconMotion enabled={true}>
    <Sidebar
      collapsible="icon"
      className="h-full shrink-0 bg-sidebar"
    >
      <SidebarBrandHeader onOpenSearch={onOpenSearch} />

      {/* The sidebar is permanent furniture, so its icons do not animate. See
          the note in lib/icons.tsx: several of the family's icons animate in
          from nothing, which reads as vanishing when the icon was already
          there. */}
      <SidebarContent className="py-1" >
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {visiblePages.map((page) => (
                <NavigationRow
                  key={page.name}
                  {...page}
                  active={activePage === page.name}
                  onSelect={() => onNavigate?.(page.name)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Collapsible
          open={foldersOpen}
          onOpenChange={setFoldersOpen}
          className="mt-2 group-data-[collapsible=icon]:hidden"
        >
          <SidebarGroup className="py-0">
            <div className="group/folder-directory flex h-8 items-center px-1">
              <CollapsibleTrigger
                data-sidebar-tier="section"
                className="group/folder-directory-trigger flex h-6 min-w-0 flex-1 items-center rounded-md px-2 text-left text-[11px] font-semibold text-[var(--color-graphite-600)] outline-none hover:bg-[var(--color-graphite-100)] focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                {/* "Library", not "Folders": the section has held shelves as
                    well as folders since DES-195, and a label naming half its
                    contents reads wrong the moment a shelf is looked at. A
                    library is the place shelves stand — the metaphor was
                    already chosen when "shelf" was (Imran asked for a better
                    word, 2026-08-24; this one is offered, not ruled). */}
                <span className="truncate">Library</span>
                <ChevronDown
                  className={`ml-1 size-3.5 shrink-0 text-[var(--color-graphite-500)] opacity-0 transition-[opacity,transform] group-hover/folder-directory-trigger:opacity-100 group-focus-visible/folder-directory-trigger:opacity-100 ${foldersOpen ? "" : "-rotate-90"}`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 rounded-md text-[var(--color-graphite-500)] opacity-0 hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)] group-hover/folder-directory:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                      aria-label="Library options"
                    />
                  }
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={onCreateFolder}>
                    <FolderPlus className="size-4" />New folder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onCreateFolderGroup}>
                    <Folders className="size-4" />New shelf
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
            <SidebarMenu>
              {/* Desk left the folder list for the page block when the nav
                  model changed: it is native and cannot be deleted, so
                  sitting among folders a person can delete misrepresented it
                  (Imran, DES-152). It is also the one folder row that is not
                  draggable, for the same reason. */}
              {navModel === "v2" ? null : (
              <FolderRow
                {...shellInbox}
                active={activeFolder === shellInbox.name}
                onSelect={() => onNavigateFolder?.(shellInbox.name)}
                onAddTask={() => onAddTaskToFolder?.(shellInbox.name)}
                onRename={() => onOpenFolderAction?.(shellInbox.name, "rename")}
                onEditAppearance={() =>
                  onOpenFolderAction?.(shellInbox.name, "appearance")
                }
              />
              )}
            </SidebarMenu>

            {/* Groups and loose folders are one ordered list, and the drag
                that arranges it lives with the arrangement rather than
                here. */}
            <FolderDirectory
              groups={displayFolderGroups}
              loose={unlabelledFolders}
              activeFolder={activeFolder}
              onSelectFolder={onNavigateFolder}
              onAddFolder={onCreateFolderInGroup}
              onAddTask={onAddTaskToFolder}
              onMoveFolderToLabel={onMoveFolderToLabel}
              onOpenFolderAction={onOpenFolderAction}
              onRenameGroup={onRenameFolderGroup}
              onOpenGroup={onOpenShelf}
              onOpenFolderInTab={onOpenFolderInTab}
              onSaveShelfWorkflow={onSaveShelfWorkflow}
              onDeleteGroup={onDeleteFolderGroup}
              onCopyFolderLink={onCopyFolderLink}
              onDuplicateFolder={onDuplicateFolder}
              onDeleteFolder={onDeleteFolder}
              onGroupFolders={onGroupFolders}
            />
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      <SidebarFooter className="gap-0 py-2" >
        {/*
        One primary button, then a row of three (DES-209).

        Imran, 2026-08-23: "remember that 'New folder' should be a single
        button, you can organize things as I expected under that" — and, from
        the original brief, "three buttons in a row, icon first and label beside
        it, when a sidebar is shrinked by the user, only icons are left".

        **Why these three, and in this order.** The row is *the things you reach
        for occasionally*, and it reads left to right from most to least like
        making something. **New shelf** makes a container, so it is nearest the
        button above it. **Import** also makes one, from a file somebody sent
        you, which is rarer. **Trash** is where things go, and it ends the row
        because it is the only one that is a destination rather than an act —
        it sits here rather than with People and Settings because Imran asked
        for it in the footer's buttons, and a person looking for what they
        deleted looks near the things they made.

        **Help is not here**, and that is the one departure. It is neither a
        thing you make nor a place inside your work; it is about the
        application, which is what everything in the account menu is about. A
        fourth item would also have broken the row of three he asked for.

        **Narrow, they stay a row and drop their labels** (DES-216). Imran,
        2026-08-23, pointing at Notion's own nav, where exactly that happens.
        The trigger is the sidebar's *width* rather than the collapsed state:
        Dana's sidebar is draggable from 224px to 360px, and 224 is about where
        three labels stop fitting — which is the same place Notion drops
        theirs. A container query asks the row how much room it has, so the
        answer follows the drag rather than a breakpoint somebody guessed.

        In the fully collapsed 56px rail they do stack, and that is arithmetic
        rather than a choice: three 32px icons and their gaps need 100px and
        there are 56. The tooltip names each one in both states, because with
        the label gone it is the only thing that does.
        */}
        <SidebarMenu className="mb-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              data-sidebar-new-folder
              data-sidebar-tier="action"
              tooltip="New folder"
              className="h-[var(--shell-sidebar-item-height)] w-full justify-center gap-2 rounded-lg border border-transparent bg-[var(--color-graphite-100)] px-3 text-[13px] font-semibold text-[var(--color-graphite-600)] shadow-none hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-600)] group-data-[collapsible=icon]:!size-auto group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:px-0"
              onClick={onCreateFolder}
            >
              <FolderPlus className="!size-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden">New folder</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu className="@container mb-1 flex-row gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-0.5">
          {[
            {
              key: "shelf",
              label: "New shelf",
              tooltip: "New shelf — a group of folders",
              icon: Folders,
              onClick: onCreateFolderGroup,
              mark: { "data-sidebar-new-shelf": true },
            },
            {
              key: "import",
              label: "Import",
              tooltip: "Import a workflow",
              icon: Workflow,
              onClick: () => workflowInput.current?.click(),
              mark: { "data-sidebar-import-workflow": true },
            },
            {
              key: "trash",
              label: "Trash",
              tooltip: "Trash — deleted items, kept 30 days",
              icon: Trash2,
              onClick: () => onNavigate?.("Trash"),
              mark: {},
            },
          ].map((action) => (
            <SidebarMenuItem
              key={action.key}
              /* Content-sized, not equal thirds: equal shares gave "New
                 shelf" the same room as "Trash" and clipped it at the default
                 width while its neighbours sat in slack (Imran, 2026-08-24). */
              className="min-w-0 flex-auto"
            >
              <SidebarMenuButton
                {...action.mark}
                data-sidebar-tier="action"
                tooltip={action.tooltip}
                isActive={action.key === "trash" && activePage === "Trash"}
                className="h-[var(--shell-sidebar-item-height)] w-full justify-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] group-data-[collapsible=icon]:!size-auto group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:px-0"
                onClick={action.onClick}
              >
                <action.icon className="!size-4" strokeWidth={1.75} aria-hidden="true" />
                {/*
                Whose label survives narrowing is decided by arithmetic, not
                rank: the three words need 256px and the default row has 240,
                so at the default width something has to give (Imran,
                2026-08-24: "New shelf … is not fully visible, the remaining
                two should be shortened"). New shelf keeps its word at every
                row width, because it is the label that was clipping and the
                one that reads worst clipped; Import and Trash go to their
                icons until the row genuinely fits all three, which is what
                the whole row already does when the person narrows the
                sidebar. The tooltip names them in every state.
                */}
                <span
                  className={cn(
                    "truncate group-data-[collapsible=icon]:hidden",
                    action.key !== "shelf" && "@max-[262px]:hidden",
                  )}
                >
                  {action.label}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <input
          ref={workflowInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file || !onImportWorkflow) return
            void file.text().then(onImportWorkflow)
          }}
        />
        <SidebarMenu>
          {/* From the model, so the audit's collision rule sees these two
              exactly as it sees every page above them. */}
          {FOOTER_PAGES.map((page) => (
            <NavigationRow
              key={page.name}
              name={page.name}
              icon={page.icon}
              active={activePage === page.name}
              onSelect={() => onNavigate?.(page.name)}
            />
          ))}
        </SidebarMenu>
        <SidebarMenu className="mt-2">
          <SidebarMenuItem>
            <ProfileMenu
              defaultOpen={avatarMenuOpen}
              onOpenSettings={() => onNavigate?.("Settings")}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {onSidebarWidthChange &&
      onSidebarWidthCommit &&
      onSidebarWidthReset ? (
        <SidebarResizeHandle
          value={sidebarWidth}
          min={sidebarMinWidth}
          max={sidebarMaxWidth}
          onChange={onSidebarWidthChange}
          onCommit={onSidebarWidthCommit}
          onReset={onSidebarWidthReset}
        />
      ) : null}
    </Sidebar>
    </IconMotion>
  )
}
