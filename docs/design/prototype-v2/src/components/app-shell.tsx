import { UndoBar } from "@/components/undo-bar"
import { useRightEdge } from "@/components/right-edge"
import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { FolderPlus, Folders, Plus, Workflow } from "@/lib/icons"

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
import { FolderMark, folderPageMark } from "@/components/folder-mark"
import { PageBar, type PageTab } from "@/components/page-bar"
import { WindowBar } from "@/components/window-bar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { record } from "@/lib/history"
import { moveShelfPage, shelfKey } from "@/lib/shelf-acts"
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
  savePrototypeFolderIdentity,
  type PrototypeFolderPresentation,
} from "@/lib/folder-presentation"
import {
  PROTOTYPE_FOLDERS_EVENT,
  copyFolderLink,
  duplicateFolder,
  readCreatedFolders,
  saveCreatedFolders,
} from "@/lib/folder-acts"
import {
  FOREIGN_FOLDERS,
  PROTOTYPE_LEAVE_FOLDER_EVENT,
} from "@/lib/folder-ownership"
import { leavePrototypeFolder } from "@/lib/folder-presentation"
import { notice } from "@/lib/undo"

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

/* The clean-handoff export reads as a fresh account, which is the one thing
   the shared reader in `lib/folder-acts` cannot know about. */
function readShellFolders(): ShellFolderFixture[] {
  return isCleanHandoffPreview() ? [] : readCreatedFolders()
}

export function AppShell({
  onImportWorkflow,
  onOpenShelf,
  onOpenFolderInTab,
  onOpenShelfInTab,
  onSaveShelfWorkflow,
  children,
  activePage = "My Day",
  activeFolder,
  corePagesOnly = false,
  offline = false,
  showUpdate = false,
  systemToast,
  avatarMenuOpen = false,
  onCreateTask,
  onCreateTaskForFolder,
  onNavigate,
  onOpenSearch,
  pageVisibility,
  hideCreate = false,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
}: {
  onImportWorkflow?: (text: string) => void
  onOpenShelf?: (label: string) => void
  onOpenFolderInTab?: (name: string) => void
  onOpenShelfInTab?: (label: string) => void
  onSaveShelfWorkflow?: (label: string) => void
  children: ReactNode
  activePage?: ShellPageName | null
  activeFolder?: string
  corePagesOnly?: boolean
  offline?: boolean
  showUpdate?: boolean
  systemToast?: SystemToastKind
  avatarMenuOpen?: boolean
  onCreateTask?: () => void
  onCreateTaskForFolder?: (folderName: string) => void
  onNavigate?: (page: ShellPageName) => void
  onOpenSearch?: () => void
  pageVisibility?: OptionalPageVisibility
  /* The folder-page concept retires the floating New task button where a
     quick-add row is the capture point (DES-133). A screen-by-screen ruling,
     so it arrives as a prop rather than a policy here. */
  hideCreate?: boolean
  /* The tab strip — owned by the shell page, drawn by PageBar (DES-217). */
  tabs?: PageTab[]
  activeTab?: string | null
  onSelectTab?: (id: string) => void
  onCloseTab?: (id: string) => void
  onReorderTabs?: (from: number, to: number) => void
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
    readShellFolders,
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
    /* `preselect` is how the sidebar's hold-two-folders-together gesture
       reaches this dialog: the pair arrives already ticked and everything
       else about making a group — the name, the validation, adding a third
       folder before committing — is the one surface it always was. */
    | { mode: "create"; preselect?: string[] }
    | { mode: "rename"; label: string; folders: ShellFolderFixture[] }
    | null
  >(null)
  const [folderGroupDelete, setFolderGroupDelete] = useState<{
    label: string
    folders: ShellFolderFixture[]
  } | null>(null)
  /* The one leave-folder confirmation (DES-225): rows and pages raise the
     request as an event, the shell asks the question — like the one undo bar,
     because two surfaces asking it differently is how copy drifts. */
  const [leaveFolderName, setLeaveFolderName] = useState<string | null>(null)
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
        saveCreatedFolders(next)
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

    function refreshCreatedFolders() {
      setCreatedFolders(readShellFolders())
    }

    window.addEventListener(PROTOTYPE_FOLDERS_EVENT, refreshCreatedFolders)
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
        window.removeEventListener(PROTOTYPE_FOLDERS_EVENT, refreshCreatedFolders)
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

  /*
  A page can ask for the New folder dialog (DES-219).

  The shelf page's add-folder row offers "New folder…", and the dialog it
  means is this shell's — the same one the sidebar opens, label pre-filled so
  the folder lands on the shelf it was made from. The page is a child of the
  shell page, not of this component, so the request travels as an event, the
  arrangement `prototype-delete-folder` already uses and for the same reason.
  */
  useEffect(() => {
    function openNewFolder(event: Event) {
      const label = (event as CustomEvent<{ label?: string }>).detail?.label
      setNewFolderGroupLabel(label ?? null)
      setNewFolderOpen(true)
    }
    window.addEventListener("dana:prototype-new-folder", openNewFolder)
    return () =>
      window.removeEventListener("dana:prototype-new-folder", openNewFolder)
  }, [])

  useEffect(() => {
    function askToLeave(event: Event) {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name
      if (name) setLeaveFolderName(name)
    }
    window.addEventListener(PROTOTYPE_LEAVE_FOLDER_EVENT, askToLeave)
    return () =>
      window.removeEventListener(PROTOTYPE_LEAVE_FOLDER_EVENT, askToLeave)
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
    /* And the task somebody arrived by a link to open: it belongs to the
       arrival, not to every folder pressed afterwards (DES-211). */
    nextUrl.searchParams.delete("task")
    nextUrl.searchParams.delete("open")
    /* The v1 comparison switch never survives a navigation. It stuck once —
       every folder opened from the sidebar kept showing the previous screen,
       silently — so ordinary navigation always returns to the concept. */
    nextUrl.searchParams.delete("folder-page")
    window.location.assign(nextUrl)
  }

  /*
  Deleting a folder happens where you are standing (DES-216).

  It used to navigate to the folder's own page and delete on arrival, which was
  the v1 instrument being reused. Two things went wrong with that and only the
  second is obvious. The page had to honour a URL — three faults' worth, fixed
  in DES-208. And the act was immediately followed by a **navigation**, so the
  undo bar it pushed died with the page load: the "two ways back" DES-200 spent
  the delete confirmation on was one way back and a bar nobody could ever see.

  Deleting from a row does not need to travel anywhere. Only leaving the page
  you are *on* does, which is the one case that still navigates.
  */
  function deleteFolder(name: string) {
    deletePrototypeFolder(name)
    window.dispatchEvent(
      new CustomEvent("dana:prototype-delete-folder", { detail: { name } }),
    )
    if (activeFolder === name) {
      const nextUrl = new URL(window.location.href)
      nextUrl.search = ""
      window.location.assign(nextUrl)
    }
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

  /* Room the open panel has asked the page to keep clear (DES-212). */
  const rightEdge = useRightEdge()

  /*
  The strip's "+" (DES-217). Imran: "in the tabs row, we should always have a
  '+' sign for opening the existing pages (shelfs and folders) or adding a new
  shelf, folder, and importing a workflow."

  It lives here rather than in PageBar because everything it offers is this
  component's: the folder and shelf lists, the two dialogs, and the sidebar's
  import input. Opening an existing page goes through the same handlers the
  sidebar's "Open in a new tab" uses, so the two ways into a tab cannot drift.
  */
  const addTabMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="New tab"
            className="ml-1 flex size-6 shrink-0 items-center justify-center self-center rounded-md text-[var(--color-graphite-500)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] outline-none hover:bg-[color-mix(in_oklab,var(--color-graphite-0)_60%,var(--color-graphite-50))] hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] data-popup-open:bg-[color-mix(in_oklab,var(--color-graphite-0)_60%,var(--color-graphite-50))]"
          />
        }
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 w-56 overflow-y-auto">
        {existingFolderGroupLabels.map((label) => {
          const Mark = folderPageMark(shelfKey(label))
          return (
            <DropdownMenuItem
              key={`shelf-${label}`}
              onClick={() => onOpenShelfInTab?.(label)}
            >
              <Mark className="size-4" />
              <span className="truncate">{label}</span>
            </DropdownMenuItem>
          )
        })}
        {folderGroupOptions.map((folder) => (
          <DropdownMenuItem
            key={`folder-${folder.name}`}
            onClick={() => onOpenFolderInTab?.(folder.name)}
          >
            <FolderMark
              name={folder.name}
              color={folder.color}
              className="size-4"
            />
            <span className="truncate">
              {folderPresentation.names[folder.name] ?? folder.name}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setNewFolderGroupLabel(null)
            setNewFolderOpen(true)
          }}
        >
          <FolderPlus className="size-4" />
          New folder…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setFolderGroupDialog({ mode: "create" })}>
          <Folders className="size-4" />
          New shelf…
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            /* The sidebar owns the one file input; a second input here would
               be a second copy of the same act (and two inputs answering one
               selector). It listens for this. */
            window.dispatchEvent(new CustomEvent("dana:prototype-import-workflow"))
          }
        >
          <Workflow className="size-4" />
          Import workflow…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

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
          onImportWorkflow={onImportWorkflow}
          onOpenShelf={onOpenShelf}
          onOpenFolderInTab={onOpenFolderInTab}
          onSaveShelfWorkflow={onSaveShelfWorkflow}
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
          onCopyFolderLink={copyFolderLink}
          onDuplicateFolder={duplicateFolder}
          onDeleteFolder={deleteFolder}
          onOpenSearch={onOpenSearch}
          onGroupFolders={(folderNames) =>
            setFolderGroupDialog({ mode: "create", preselect: folderNames })
          }
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
            showUpdate={showUpdate}
            tabs={tabs}
            activeTab={activeTab}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onReorderTabs={onReorderTabs}
            addMenu={addTabMenu}
          />
          {/* The window's own thin strip: breadcrumbs to come on the left,
              this tab's controls on the right (DES-139). */}
          <WindowBar />
          {offline ? (
            <OfflineBanner className="rounded-none border-x-0 border-t-0" />
          ) : null}
          {/* The side panel's room, kept by the page rather than taken from
              it. The variable is set by the panel only while one is open and
              removed when it closes, so this is 0 the rest of the time — see
              the note in `task-surface.tsx`. The transition is the panel's
              own slide, matched, so the page moves with it rather than after
              it. */}
          <div
            data-shell-scroll
            className="min-h-0 flex-1 overflow-y-auto transition-[padding] duration-[var(--duration-slow)] ease-[var(--ease-enter)]"
            style={{ paddingRight: rightEdge }}
          >
            {children}
          </div>
          {/* One undo bar for the whole window, because undo is one idea and
              a bar per screen is six of them (see `lib/undo.ts`). It sits
              bottom-left so it never lands on the capture button. */}
          <UndoBar />
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
          preselect={
            folderGroupDialog?.mode === "create"
              ? folderGroupDialog.preselect
              : undefined
          }
          existingLabels={existingFolderGroupLabels}
          onOpenChange={(open) => {
            if (!open) setFolderGroupDialog(null)
          }}
          onSubmit={(label, folderNames) => {
            /*
            A renamed shelf keeps its page (DES-218).

            This dialog rewrites the label on its folders, which is the rename
            — a shelf's name *is* its membership label. But the page it has
            grown since DES-207 — cover, icon, description, blocks — is stored
            under the old name, so without moving it the shelf answers to its
            new name with a page that has forgotten everything. Same helper as
            the page's own rename field, so the two paths cannot drift.
            */
            const renamedFrom =
              folderGroupDialog?.mode === "rename" &&
              folderGroupDialog.label !== label
                ? folderGroupDialog.label
                : null
            applyFolderGroupLabel(folderNames, label)
            if (renamedFrom) {
              moveShelfPage(renamedFrom, label)
              record({
                kind: "shelf",
                subject: label,
                name: label,
                verb: "renamed",
                detail: `from “${renamedFrom}”`,
              })
              /* Standing on the shelf you just renamed: the URL still names
                 the old label, and a page addressed by a name that no longer
                 exists is an empty shelf. Follow it. */
              const params = new URLSearchParams(window.location.search)
              if (
                params.get("state") === "shelf" &&
                params.get("shelf") === renamedFrom
              ) {
                const nextUrl = new URL(window.location.href)
                nextUrl.searchParams.set("shelf", label)
                window.location.assign(nextUrl)
              }
            }
          }}
        />
        <AlertDialog
          open={Boolean(folderGroupDelete)}
          onOpenChange={(open) => {
            if (!open) setFolderGroupDelete(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete shelf?</AlertDialogTitle>
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
        {/*
        Leaving confirms; deleting no longer does — and that asymmetry is
        DES-200's own reasoning pointed the other way. Delete lost its
        question because a deleted folder has two ways back, the bar and the
        Trash. Leaving has none you can take yourself: the way back is an
        invitation, so the question is earned. No Trash row is written and no
        undo is offered, because either would promise a return nobody can
        grant themselves (DES-225).
        */}
        <AlertDialog
          open={Boolean(leaveFolderName)}
          onOpenChange={(open) => {
            if (!open) setLeaveFolderName(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave {leaveFolderName}?</AlertDialogTitle>
              <AlertDialogDescription>
                {leaveFolderName
                  ? `You'll lose access to “${leaveFolderName}” and its tasks. The folder stays as it is for ${
                      FOREIGN_FOLDERS[leaveFolderName] ?? "its owner"
                    } and the other members, and the way back is an invitation from one of them.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const name = leaveFolderName
                  if (!name) return
                  setLeaveFolderName(null)
                  leavePrototypeFolder(name)
                  notice(`You left ${name}`)
                  if (activeFolder === name) {
                    const nextUrl = new URL(window.location.href)
                    nextUrl.search = ""
                    window.location.assign(nextUrl)
                  }
                }}
              >
                Leave folder
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarProvider>
    </div>
  )
}
