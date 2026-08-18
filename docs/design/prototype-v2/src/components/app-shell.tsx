import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import type { LucideIcon } from "@/lib/icons"
import { Plus } from "@/lib/icons"

import {
  AppSidebar,
  type OptionalPageVisibility,
  type ShellPageName,
} from "@/components/app-sidebar"
import {
  FolderGroupDialog,
  type FolderGroupOption,
} from "@/components/folder-group-dialog"
import { NewFolderDialog } from "@/components/new-folder-dialog"
import { PageBar } from "@/components/page-bar"
import {
  OfflineBanner,
  SystemToast,
  type SystemToastKind,
} from "@/components/state-patterns"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  shellFolderGroups,
  shellUnlabelledFolders,
  type ShellFolderFixture,
} from "@/fixtures"
import {
  PROTOTYPE_FOLDER_MEMBERSHIP_EVENT,
  readPrototypeFolderMemberships,
  removePrototypeFolderMembership,
  type PrototypeFolderMembership,
  savePrototypeFolderMemberships,
} from "@/lib/folder-membership"
import {
  PROTOTYPE_FOLDER_PRESENTATION_EVENT,
  deletePrototypeFolder,
  readPrototypeFolderPresentation,
  restorePrototypeFolder,
  type PrototypeFolderPresentation,
} from "@/lib/folder-presentation"

const DEFAULT_SIDEBAR_WIDTH = 256
const MIN_SIDEBAR_WIDTH = 224
const MAX_SIDEBAR_WIDTH = 360
const SIDEBAR_WIDTH_STORAGE_KEY = "dana:desktop-sidebar-width"
const CREATED_FOLDERS_STORAGE_KEY = "dana:prototype-created-folders"

function isCleanHandoffPreview() {
  if (typeof window === "undefined") return false
  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get("handoff") === "clean" && !searchParams.has("explore")
}

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
}

function readStoredSidebarWidth() {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH
  if (isCleanHandoffPreview()) return DEFAULT_SIDEBAR_WIDTH

  const storedValue = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
  if (storedValue === null) return DEFAULT_SIDEBAR_WIDTH

  const stored = Number(storedValue)
  return Number.isFinite(stored)
    ? clampSidebarWidth(stored)
    : DEFAULT_SIDEBAR_WIDTH
}

function readCreatedFolders(): ShellFolderFixture[] {
  if (typeof window === "undefined") return []
  if (isCleanHandoffPreview()) return []
  try {
    const value = JSON.parse(
      window.localStorage.getItem(CREATED_FOLDERS_STORAGE_KEY) ?? "[]",
    )
    if (!Array.isArray(value)) return []
    return value.filter(
      (folder): folder is ShellFolderFixture =>
        typeof folder?.name === "string" &&
        typeof folder?.color === "string" &&
        typeof folder?.pending === "number",
    )
  } catch {
    return []
  }
}

export function AppShell({
  children,
  activePage = "My Day",
  activeFolder,
  corePagesOnly = false,
  offline = false,
  showUpdate = false,
  systemToast,
  avatarMenuOpen = false,
  pageTitle = "My Day",
  pageIcon,
  pageIconColor,
  onCreateTask,
  onCreateTaskForFolder,
  onNavigate,
  onOpenSearch,
  pageVisibility,
  hideCreate = false,
}: {
  children: ReactNode
  activePage?: ShellPageName | null
  activeFolder?: string
  corePagesOnly?: boolean
  offline?: boolean
  showUpdate?: boolean
  systemToast?: SystemToastKind
  avatarMenuOpen?: boolean
  pageTitle?: string
  pageIcon?: LucideIcon
  pageIconColor?: string
  onCreateTask?: () => void
  onCreateTaskForFolder?: (folderName: string) => void
  onNavigate?: (page: ShellPageName) => void
  onOpenSearch?: () => void
  pageVisibility?: OptionalPageVisibility
  /* The folder-page concept retires the floating New task button where a
     quick-add row is the capture point (DES-133). A screen-by-screen ruling,
     so it arrives as a prop rather than a policy here. */
  hideCreate?: boolean
}) {
  const showAdd =
    !hideCreate &&
    activePage !== "Done" &&
    activePage !== "People" &&
    activePage !== "Settings"
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth)
  const [newFolderOpen, setNewFolderOpen] = useState(
    () => new URLSearchParams(window.location.search).get("new-folder") === "open",
  )
  const [newFolderGroupLabel, setNewFolderGroupLabel] = useState<string | null>(
    null,
  )
  const [createdFolders, setCreatedFolders] = useState<ShellFolderFixture[]>(
    readCreatedFolders,
  )
  const [folderMemberships, setFolderMemberships] = useState(() =>
    isCleanHandoffPreview() ? {} : readPrototypeFolderMemberships(),
  )
  const [folderPresentation, setFolderPresentation] =
    useState<PrototypeFolderPresentation>(() =>
      isCleanHandoffPreview()
        ? { names: {}, deleted: [], identity: {} }
        : readPrototypeFolderPresentation(),
    )
  const [folderGroupDialog, setFolderGroupDialog] = useState<
    | { mode: "create" }
    | { mode: "rename"; label: string; folders: ShellFolderFixture[] }
    | null
  >(null)
  const [folderGroupDelete, setFolderGroupDelete] = useState<{
    label: string
    folders: ShellFolderFixture[]
  } | null>(null)
  const [toastVisible, setToastVisible] = useState(Boolean(systemToast))

  const baseFolderLabels = new Map(
    shellFolderGroups.flatMap((group) =>
      group.folders.map((folder) => [folder.name, group.label] as const),
    ),
  )
  const folderGroupOptions: FolderGroupOption[] = [
    ...shellFolderGroups.flatMap((group) => group.folders),
    ...shellUnlabelledFolders,
    ...createdFolders,
  ].filter((folder) => !folderPresentation.deleted.includes(folder.name)).map((folder) => {
    const hasOverride = Object.prototype.hasOwnProperty.call(
      folderMemberships,
      folder.name,
    )
    const membership = folderMemberships[folder.name]

    return {
      name: folder.name,
      color: membership?.color ?? folder.color,
      label: hasOverride ? (membership?.label ?? null) : (baseFolderLabels.get(folder.name) ?? null),
    }
  })
  const existingFolderGroupLabels = [
    ...new Set(
      folderGroupOptions
        .map((folder) => folder.label)
        .filter((label): label is string => Boolean(label)),
    ),
  ]
  useEffect(() => setToastVisible(Boolean(systemToast)), [systemToast])

  useEffect(() => {
    function removeCreatedFolder(event: Event) {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name
      if (!name) return
      setCreatedFolders((current) => {
        const next = current.filter((folder) => folder.name !== name)
        window.localStorage.setItem(
          CREATED_FOLDERS_STORAGE_KEY,
          JSON.stringify(next),
        )
        return next
      })
      deletePrototypeFolder(name)
      removePrototypeFolderMembership(name)
      setFolderMemberships((current) => {
        const next = { ...current }
        delete next[name]
        return next
      })
    }

    function updateFolderMembership(event: Event) {
      const detail = (
        event as CustomEvent<{
          folderName?: string
          membership?: PrototypeFolderMembership
        }>
      ).detail
      if (!detail?.folderName || !detail.membership) return
      setFolderMemberships((current) => ({
        ...current,
        [detail.folderName as string]: detail.membership as PrototypeFolderMembership,
      }))
    }

    function updateFolderPresentation(event: Event) {
      const detail = (event as CustomEvent<PrototypeFolderPresentation>).detail
      if (detail) setFolderPresentation(detail)
    }

    window.addEventListener("dana:prototype-delete-folder", removeCreatedFolder)
    window.addEventListener(
      PROTOTYPE_FOLDER_MEMBERSHIP_EVENT,
      updateFolderMembership,
    )
    window.addEventListener(
      PROTOTYPE_FOLDER_PRESENTATION_EVENT,
      updateFolderPresentation,
    )
    return () =>
      {
        window.removeEventListener(
          "dana:prototype-delete-folder",
          removeCreatedFolder,
        )
        window.removeEventListener(
          PROTOTYPE_FOLDER_MEMBERSHIP_EVENT,
          updateFolderMembership,
        )
        window.removeEventListener(
          PROTOTYPE_FOLDER_PRESENTATION_EVENT,
          updateFolderPresentation,
        )
      }
  }, [])

  function persistSidebarWidth(width: number) {
    if (typeof window === "undefined") return
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width))
  }

  function resetSidebarWidth() {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
    persistSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
  }

  function navigateToFolder(name: string) {
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete("page")
    nextUrl.searchParams.delete("new-folder")
    nextUrl.searchParams.set("state", "folder")
    nextUrl.searchParams.set("folder", name)
    nextUrl.searchParams.delete("folder-state")
    nextUrl.searchParams.delete("folder-action")
    /* The v1 comparison switch never survives a navigation. It stuck once —
       every folder opened from the sidebar kept showing the previous screen,
       silently — so ordinary navigation always returns to the concept. */
    nextUrl.searchParams.delete("folder-page")
    window.location.assign(nextUrl)
  }

  function openFolderAction(
    name: string,
    action: "rename" | "appearance" | "delete",
  ) {
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete("page")
    nextUrl.searchParams.delete("new-folder")
    nextUrl.searchParams.set("state", "folder")
    nextUrl.searchParams.set("folder", name)
    nextUrl.searchParams.set("folder-action", action)
    window.location.assign(nextUrl)
  }

  function applyFolderGroupLabel(folderNames: string[], label: string | null) {
    const updates = Object.fromEntries(
      folderNames.map((folderName) => {
        const folder = folderGroupOptions.find(
          (candidate) => candidate.name === folderName,
        )
        return [
          folderName,
          {
            label,
            color: folder?.color ?? null,
          } satisfies PrototypeFolderMembership,
        ]
      }),
    )

    savePrototypeFolderMemberships(updates)
    setFolderMemberships((current) => ({ ...current, ...updates }))
  }

  return (
    <div className="flex h-svh min-w-[1180px] flex-col overflow-hidden bg-background">
      <SidebarProvider
        className="h-svh min-h-0"
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
            "--sidebar-width-icon": "56px",
            "--sidebar": "var(--color-graphite-50)",
            "--sidebar-accent": "var(--color-graphite-100)",
          } as CSSProperties
        }
      >
        <AppSidebar
          activePage={activePage}
          activeFolder={activeFolder}
          corePagesOnly={corePagesOnly}
          avatarMenuOpen={avatarMenuOpen}
          sidebarWidth={sidebarWidth}
          sidebarMinWidth={MIN_SIDEBAR_WIDTH}
          sidebarMaxWidth={MAX_SIDEBAR_WIDTH}
          onSidebarWidthChange={(width) => setSidebarWidth(clampSidebarWidth(width))}
          onSidebarWidthCommit={(width) => persistSidebarWidth(clampSidebarWidth(width))}
          onSidebarWidthReset={resetSidebarWidth}
          onNavigate={onNavigate}
          additionalFolders={createdFolders}
          folderMemberships={folderMemberships}
          folderNameOverrides={folderPresentation.names}
          deletedFolderNames={folderPresentation.deleted}
          onCreateFolder={() => {
            setNewFolderGroupLabel(null)
            setNewFolderOpen(true)
          }}
          onCreateFolderGroup={() => setFolderGroupDialog({ mode: "create" })}
          onCreateFolderInGroup={(label) => {
            setNewFolderGroupLabel(label)
            setNewFolderOpen(true)
          }}
          onMoveFolderToLabel={(folderName, label) =>
            applyFolderGroupLabel([folderName], label)
          }
          onAddTaskToFolder={onCreateTaskForFolder}
          onOpenFolderAction={openFolderAction}
          onRenameFolderGroup={(label, folders) =>
            setFolderGroupDialog({ mode: "rename", label, folders })
          }
          onDeleteFolderGroup={(label, folders) =>
            setFolderGroupDelete({ label, folders })
          }
          onNavigateFolder={navigateToFolder}
          onOpenSearch={onOpenSearch}
          pageVisibility={pageVisibility}
        />
        {/* V1 measure comparison, temporary until Imran picks (v2-refresh-plan
            session V1). The attribute sits here so the CSS variable cascades
            over every screen's own content wrapper; the ?measure= param and
            the losing variant leave with the decision. */}
        <SidebarInset
          data-measure={
            new URLSearchParams(window.location.search).get("measure") ??
            undefined
          }
          className="min-w-0 overflow-hidden bg-card"
        >
          <PageBar
            title={pageTitle}
            icon={pageIcon}
            iconColor={pageIconColor}
            showUpdate={showUpdate}
          />
          {offline ? (
            <OfflineBanner className="rounded-none border-x-0 border-t-0" />
          ) : null}
          <div data-shell-scroll className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </div>
          {showAdd ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    className={cn(
                      "absolute right-6 bottom-6 h-[var(--control-height)] gap-2 rounded-lg px-4 text-sm shadow-[var(--elevation-1)]",
                      "bg-[var(--color-graphite-900)] text-white hover:bg-[var(--color-graphite-800)]",
                    )}
                    aria-label="Create a new task"
                    onClick={onCreateTask}
                  >
                    <Plus className="size-5" strokeWidth={1.75} aria-hidden="true" />
                    New task
                  </Button>
                }
              />
              <TooltipContent side="left">Create a new task</TooltipContent>
            </Tooltip>
          ) : null}
          {systemToast && toastVisible ? (
            <SystemToast
              kind={systemToast}
              className={showAdd ? "right-6 bottom-[76px]" : "right-6 bottom-6"}
              onDismiss={() => setToastVisible(false)}
            />
          ) : null}
        </SidebarInset>
        <NewFolderDialog
          open={newFolderOpen}
          groupLabel={newFolderGroupLabel ?? undefined}
          onOpenChange={(open) => {
            setNewFolderOpen(open)
            if (!open) setNewFolderGroupLabel(null)
          }}
          onCreate={(name) => {
            const nextFolders = [
              ...createdFolders,
              {
                name,
                pending: 0,
                color: "var(--color-graphite-900)",
              },
            ]
            window.localStorage.setItem(
              CREATED_FOLDERS_STORAGE_KEY,
              JSON.stringify(nextFolders),
            )
            restorePrototypeFolder(name)
            setCreatedFolders(nextFolders)
            if (newFolderGroupLabel) {
              const membership = {
                label: newFolderGroupLabel,
                color: "var(--color-graphite-900)",
              } satisfies PrototypeFolderMembership
              savePrototypeFolderMemberships({ [name]: membership })
              setFolderMemberships((current) => ({
                ...current,
                [name]: membership,
              }))
            }
            navigateToFolder(name)
          }}
        />
        <FolderGroupDialog
          open={Boolean(folderGroupDialog)}
          mode={folderGroupDialog?.mode ?? "create"}
          currentLabel={
            folderGroupDialog?.mode === "rename"
              ? folderGroupDialog.label
              : undefined
          }
          folders={
            folderGroupDialog?.mode === "rename"
              ? folderGroupOptions.filter((folder) =>
                  folderGroupDialog.folders.some(
                    (groupFolder) => groupFolder.name === folder.name,
                  ),
                )
              : folderGroupOptions
          }
          existingLabels={existingFolderGroupLabels}
          onOpenChange={(open) => {
            if (!open) setFolderGroupDialog(null)
          }}
          onSubmit={(label, folderNames) =>
            applyFolderGroupLabel(folderNames, label)
          }
        />
        <AlertDialog
          open={Boolean(folderGroupDelete)}
          onOpenChange={(open) => {
            if (!open) setFolderGroupDelete(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete folder group?</AlertDialogTitle>
              <AlertDialogDescription>
                {folderGroupDelete
                  ? `“${folderGroupDelete.label}” will be removed from ${folderGroupDelete.folders.length} ${folderGroupDelete.folders.length === 1 ? "folder" : "folders"}. The folders and their tasks will remain in the ungrouped list.`
                  : "The folders and their tasks will remain in the ungrouped list."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                destructive
                onClick={() => {
                  if (!folderGroupDelete) return
                  applyFolderGroupLabel(
                    folderGroupDelete.folders.map((folder) => folder.name),
                    null,
                  )
                  setFolderGroupDelete(null)
                }}
              >
                Delete group
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarProvider>
    </div>
  )
}
