import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import type { LucideIcon } from "lucide-react"
import {
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
  Settings2,
  Star,
  SunMedium,
  Trash2,
  UsersRound,
} from "lucide-react"

import { FolderRow } from "@/components/folder-row"
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
import type { PrototypeFolderMemberships } from "@/lib/folder-membership"

export type ShellPageName =
  | "My Day"
  | "Tasks"
  | "Planned"
  | "Important"
  | "All"
  | "Done"
  | "People"
  | "Settings"

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

function FolderGroup({
  label,
  folders,
  activeFolder,
  groupLabels,
  onSelectFolder,
  onAddFolder,
  onAddTask,
  onMoveFolderToLabel,
  onOpenFolderAction,
  onRenameGroup,
  onDeleteGroup,
}: {
  label: string
  folders: SidebarFolderFixture[]
  activeFolder?: string
  groupLabels: string[]
  onSelectFolder?: (name: string) => void
  onAddFolder?: (label: string) => void
  onAddTask?: (folderName: string) => void
  onMoveFolderToLabel?: (
    folderName: string,
    label: string | null,
  ) => void
  onOpenFolderAction?: (
    folderName: string,
    action: FolderSidebarAction,
  ) => void
  onRenameGroup?: (label: string, folders: ShellFolderFixture[]) => void
  onDeleteGroup?: (label: string, folders: ShellFolderFixture[]) => void
}) {
  const [open, setOpen] = useState(true)
  const childActive = folders.some((folder) => folder.folderKey === activeFolder)
  const groupIconTone = childActive
    ? "text-[var(--color-graphite-900)]"
    : "text-[var(--color-graphite-500)]"

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`group/folder-group relative flex h-[var(--shell-sidebar-row-height)] items-center rounded-md bg-transparent text-[var(--color-graphite-600)] hover:text-[var(--color-graphite-600)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] focus-within:before:bg-[var(--color-graphite-100)] [&>*]:relative [&>*]:z-10 ${
          childActive ? "text-[var(--color-graphite-900)]" : ""
        }`}
      >
        <CollapsibleTrigger
          data-sidebar-tier="group"
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md py-0 pr-1 pl-3 text-left text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <span className="relative size-4 shrink-0" aria-hidden="true">
            <Folders
              className={`absolute inset-0 !size-4 opacity-90 transition-opacity group-hover/folder-group:opacity-0 group-focus-within/folder-group:opacity-0 ${groupIconTone}`}
              strokeWidth={1.75}
            />
            {open ? (
              <ChevronDown
                className={`absolute inset-0 !size-4 opacity-0 transition-opacity group-hover/folder-group:opacity-100 group-focus-within/folder-group:opacity-100 ${groupIconTone}`}
                strokeWidth={1.75}
              />
            ) : (
              <ChevronRight
                className={`absolute inset-0 !size-4 opacity-0 transition-opacity group-hover/folder-group:opacity-100 group-focus-within/folder-group:opacity-100 ${groupIconTone}`}
                strokeWidth={1.75}
              />
            )}
          </span>
          <span className="truncate">{label}</span>
        </CollapsibleTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 rounded-md text-[var(--color-graphite-600)] opacity-0 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)] group-hover/folder-group:opacity-100 focus-visible:opacity-100"
          aria-label={`Add folder to ${label}`}
          onClick={() => onAddFolder?.(label)}
        >
          <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="mr-1 size-6 shrink-0 rounded-md text-[var(--color-graphite-600)] opacity-0 hover:bg-[var(--color-graphite-200)] group-hover/folder-group:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                aria-label={`Manage ${label} folder group`}
              />
            }
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() =>
                onRenameGroup?.(
                  label,
                  folders.map((folder) => ({
                    ...folder,
                    name: folder.folderKey,
                  })),
                )
              }
            >
              <Pencil className="size-4" />Rename group
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                onDeleteGroup?.(
                  label,
                  folders.map((folder) => ({
                    ...folder,
                    name: folder.folderKey,
                  })),
                )
              }
            >
              <Trash2 className="size-4" />Delete group…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CollapsibleContent>
        <SidebarMenu className="pb-1">
          {folders.map((folder, index) => (
            <FolderRow
              key={folder.folderKey}
              {...folder}
              nested
              tree
              treeLast={index === folders.length - 1}
              active={activeFolder === folder.folderKey}
              groupLabels={groupLabels}
              currentLabel={label}
              onSelect={() => onSelectFolder?.(folder.folderKey)}
              onAddTask={() => onAddTask?.(folder.folderKey)}
              onMoveToLabel={(nextLabel) =>
                onMoveFolderToLabel?.(folder.folderKey, nextLabel)
              }
              onRename={() =>
                onOpenFolderAction?.(folder.folderKey, "rename")
              }
              onEditAppearance={() =>
                onOpenFolderAction?.(folder.folderKey, "appearance")
              }
              onDelete={() =>
                onOpenFolderAction?.(folder.folderKey, "delete")
              }
            />
          ))}
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
  )
}

function SidebarBrandHeader({ onOpenSearch }: { onOpenSearch?: () => void }) {
  return (
    <SidebarHeader className="p-2 pb-1">
      <div className="flex min-h-[var(--shell-sidebar-item-height)] items-center group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
        <a
          href="/"
          className="flex min-w-0 items-center gap-3 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          aria-label="Dana — go to My Day"
        >
          <img src="/dana-mark.svg" alt="" className="size-7 shrink-0 group-data-[collapsible=icon]:size-6" />
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
  return (
    <DropdownMenu defaultOpen={defaultOpen} modal={!defaultOpen}>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            className="h-[var(--shell-sidebar-item-height)] gap-2 px-2 text-[13px] font-semibold text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]"
            aria-label="Open Imran Wafa's account menu"
          >
            <Avatar className="size-7 group-data-[collapsible=icon]:size-5">
              <AvatarFallback className="bg-[var(--color-graphite-200)] text-xs font-medium text-[var(--color-graphite-700)]">
                IW
              </AvatarFallback>
            </Avatar>
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
          <Settings2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-[var(--control-height)] text-sm">
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  onCreateFolderInGroup,
  onMoveFolderToLabel,
  onAddTaskToFolder,
  onOpenFolderAction,
  onRenameFolderGroup,
  onDeleteFolderGroup,
  onNavigateFolder,
  onOpenSearch,
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
  onOpenSearch?: () => void
  pageVisibility?: OptionalPageVisibility
}) {
  const visiblePages = (corePagesOnly ? systemPages.slice(0, 3) : systemPages).filter(
    (page) =>
      page.name === "My Day" ||
      page.name === "Tasks" ||
      page.name === "Planned" ||
      pageVisibility?.[page.name] !== false,
  )
  const baseLabels = new Map(
    shellFolderGroups.flatMap((group) =>
      group.folders.map((folder) => [folder.name, group.label] as const),
    ),
  )
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
  const groupedFolders = new Map<string, SidebarFolderFixture[]>()
  const unlabelledFolders: SidebarFolderFixture[] = []

  allFolders.forEach((folder) => {
    const hasOverride = Object.prototype.hasOwnProperty.call(
      folderMemberships,
      folder.folderKey,
    )
    const label = hasOverride
      ? folderMemberships[folder.folderKey]?.label
      : baseLabels.get(folder.folderKey)

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
    <Sidebar
      collapsible="icon"
      className="h-full shrink-0 border-r border-sidebar-border bg-sidebar"
    >
      <SidebarBrandHeader onOpenSearch={onOpenSearch} />

      <SidebarContent className="py-1">
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
                <span className="truncate">Folders</span>
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
                      aria-label="Folder directory options"
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
                    <Folders className="size-4" />New folder group
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
            <SidebarMenu>
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
            </SidebarMenu>

            {displayFolderGroups.map((group) => (
              <FolderGroup
                key={group.label}
                {...group}
                activeFolder={activeFolder}
                groupLabels={groupLabels}
                onSelectFolder={onNavigateFolder}
                onAddFolder={onCreateFolderInGroup}
                onAddTask={onAddTaskToFolder}
                onMoveFolderToLabel={onMoveFolderToLabel}
                onOpenFolderAction={onOpenFolderAction}
                onRenameGroup={onRenameFolderGroup}
                onDeleteGroup={onDeleteFolderGroup}
              />
            ))}

            <SidebarMenu className="mt-1">
              {unlabelledFolders.map((folder) => (
                <FolderRow
                  key={folder.folderKey}
                  {...folder}
                  active={activeFolder === folder.folderKey}
                  groupLabels={groupLabels}
                  currentLabel={null}
                  onSelect={() => onNavigateFolder?.(folder.folderKey)}
                  onAddTask={() => onAddTaskToFolder?.(folder.folderKey)}
                  onMoveToLabel={(label) =>
                    onMoveFolderToLabel?.(folder.folderKey, label)
                  }
                  onRename={() =>
                    onOpenFolderAction?.(folder.folderKey, "rename")
                  }
                  onEditAppearance={() =>
                    onOpenFolderAction?.(folder.folderKey, "appearance")
                  }
                  onDelete={() =>
                    onOpenFolderAction?.(folder.folderKey, "delete")
                  }
                />
              ))}
            </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      <SidebarFooter className="gap-0 py-2">
        <SidebarMenu className="mb-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              data-sidebar-new-folder
              data-sidebar-tier="action"
              tooltip="New folder"
              className="h-[var(--shell-sidebar-item-height)] justify-center gap-2 rounded-lg border border-transparent bg-[var(--color-graphite-100)] px-3 text-[13px] font-semibold text-[var(--color-graphite-600)] shadow-none hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-600)]"
              onClick={onCreateFolder}
            >
              <FolderPlus className="!size-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden">New folder</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <NavigationRow
            name="People"
            icon={UsersRound}
            active={activePage === "People"}
            onSelect={() => onNavigate?.("People")}
          />
          <NavigationRow
            name="Settings"
            icon={Settings2}
            active={activePage === "Settings"}
            onSelect={() => onNavigate?.("Settings")}
          />
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
  )
}
