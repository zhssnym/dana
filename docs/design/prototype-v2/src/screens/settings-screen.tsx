import { useState, type ReactNode } from "react"
import {
  Download,
  Globe2,
  LogOut,
  Settings2,
  Trash2,
  UsersRound,
} from "lucide-react"

import { InlineError } from "@/components/state-patterns"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useRowDensity } from "@/lib/density"
import { cn } from "@/lib/utils"

export type PageVisibility = {
  Important: boolean
  All: boolean
  Done: boolean
}

function SettingsSection({
  id,
  title,
  description,
  children,
  danger = false,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
  danger?: boolean
}) {
  return (
    <section className="border-t border-border pt-6" aria-labelledby={id}>
      <div className="mb-3">
        <h2
          id={id}
          className={
            danger
              ? "text-sm font-semibold text-[var(--color-danger-700)]"
              : "text-sm font-semibold text-foreground"
          }
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/* Two named choices rather than a switch: a switch has to be labelled with
   one of its states and leaves the other unnamed, and "Compact ▢" makes
   somebody guess what the off position is. */
function DensityChoice() {
  const { density, setDensity } = useRowDensity()

  return (
    <div
      role="radiogroup"
      aria-label="Row density"
      className="flex shrink-0 items-center gap-0.5 rounded-md bg-[var(--color-graphite-100)] p-0.5"
    >
      {(
        [
          ["two", "Two lines"],
          ["one", "One line"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={density === value}
          onClick={() => setDensity(value)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-[12px] leading-4 font-medium transition-[background-color,color] duration-[var(--duration-fast)]",
            density === value
              ? "bg-card text-[var(--color-graphite-900)]"
              : "text-[var(--color-graphite-600)] hover:text-[var(--color-graphite-800)]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function SettingRow({
  title,
  description,
  control,
}: {
  title: string
  description: string
  control: ReactNode
}) {
  return (
    <div className="flex min-h-14 items-center gap-4 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading settings" aria-busy="true">
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-3 border-t border-border pt-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}

export function SettingsScreen({
  pageVisibility,
  onPageVisibilityChange,
  onOpenPeople,
  previewState,
}: {
  pageVisibility: PageVisibility
  onPageVisibilityChange: (page: keyof PageVisibility, visible: boolean) => void
  onOpenPeople: () => void
  previewState?: string | null
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")

  return (
    <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
      <header className="flex min-h-12 items-start gap-3">
        <Settings2
          className="mt-0.5 size-6 shrink-0 text-[var(--color-graphite-700)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
            Settings
          </h1>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            Preferences and account
          </p>
        </div>
      </header>

      <div className="mt-7 max-w-[820px]">
        {previewState === "loading" ? (
          <SettingsSkeleton />
        ) : previewState === "error" ? (
          <InlineError />
        ) : (
          <div className="space-y-8">
            {/* Row density, DES-113. It sits first because it changes how
                every list in the product looks, and a person who came to
                Settings to make Dana denser should not have to hunt past
                page toggles to find it. */}
            <SettingsSection
              id="settings-appearance"
              title="Appearance"
              description="How tasks are laid out in every list."
            >
              <div className="space-y-0.5">
                <SettingRow
                  title="Row density"
                  description="Two lines shows the whole task name. One line shows more tasks at once."
                  control={<DensityChoice />}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              id="settings-pages"
              title="Pages"
              description="Choose which optional pages appear in the sidebar. This does not change or delete any tasks."
            >
              <div className="space-y-0.5">
                <SettingRow
                  title="Important"
                  description="Starred pending and abandoned tasks."
                  control={
                    <Switch
                      checked={pageVisibility.Important}
                      onCheckedChange={(checked) =>
                        onPageVisibilityChange("Important", checked)
                      }
                      aria-label="Show Important in sidebar"
                    />
                  }
                />
                <SettingRow
                  title="All"
                  description="Planned and undated tasks in one view."
                  control={
                    <Switch
                      checked={pageVisibility.All}
                      onCheckedChange={(checked) =>
                        onPageVisibilityChange("All", checked)
                      }
                      aria-label="Show All in sidebar"
                    />
                  }
                />
                <SettingRow
                  title="Done"
                  description="Completed task history."
                  control={
                    <Switch
                      checked={pageVisibility.Done}
                      onCheckedChange={(checked) =>
                        onPageVisibilityChange("Done", checked)
                      }
                      aria-label="Show Done in sidebar"
                    />
                  }
                />
              </div>
              <p className="mt-3 px-2 text-xs text-muted-foreground">
                My Day, Tasks, and Planned are always shown.
              </p>
            </SettingsSection>

            <SettingsSection id="settings-account" title="Account">
              <div className="space-y-0.5">
                <div className="flex min-h-16 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
                  <Avatar className="size-10">
                    <AvatarFallback className="bg-[var(--color-graphite-200)] text-xs font-medium text-[var(--color-graphite-700)]">
                      IW
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">Imran Wafa</p>
                    <p className="truncate text-xs text-muted-foreground">imran@example.com · Google account</p>
                  </div>
                </div>

                <div className="flex min-h-16 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
                  <div className="flex size-10 shrink-0 items-center justify-center text-[var(--color-graphite-500)]">
                    <Globe2 className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">America/Edmonton</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Dana follows your device&apos;s timezone automatically
                    </p>
                  </div>
                </div>

                <SettingRow
                  title="People and connections"
                  description="Manage people available for quick folder sharing."
                  control={
                    <Button
                      variant="outline"
                      className="h-8 gap-2 px-3 text-xs"
                      onClick={onOpenPeople}
                    >
                      <UsersRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      Open People
                    </Button>
                  }
                />

                <SettingRow
                  title="Sign out"
                  description="End this Dana session on this device."
                  control={
                    <Button variant="ghost" className="h-8 gap-2 px-3 text-xs">
                      <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      Sign out
                    </Button>
                  }
                />
              </div>
            </SettingsSection>

            <SettingsSection
              id="settings-install"
              title="Install Dana"
              description="Install Dana from your browser to open it like a regular desktop app."
            >
              <div className="flex min-h-14 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
                <div className="flex size-10 shrink-0 items-center justify-center text-[var(--color-graphite-500)]">
                  <Download className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                  Use the install option in your browser&apos;s address bar or application menu.
                </p>
                <span className="shrink-0 rounded-md border border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-graphite-600)]">
                  Browser menu
                </span>
              </div>
            </SettingsSection>

            <SettingsSection
              id="settings-danger"
              title="Danger zone"
              description="Account deletion is permanent."
              danger
            >
              <div className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--color-danger-200)] bg-[var(--color-danger-100)]/45 px-3">
                <Trash2
                  className="size-5 shrink-0 text-[var(--color-danger-700)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-danger-700)]">Delete account</p>
                  <p className="mt-0.5 text-xs text-[var(--color-graphite-600)]">
                    Review the consequences before continuing.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  className="h-8 px-3 text-xs"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  Delete account
                </Button>
              </div>
            </SettingsSection>
          </div>
        )}
      </div>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setDeleteConfirmation("")
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your Dana account?</AlertDialogTitle>
            <AlertDialogDescription>
              Folders you share will be handed to their longest-standing member. Private folders and their tasks are permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <label htmlFor="delete-account-confirmation" className="text-xs font-medium text-foreground">
              Type DELETE to confirm
            </label>
            <Input
              id="delete-account-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
              className="mt-2 h-[var(--control-height)] bg-white px-3 font-mono text-sm md:text-sm"
              aria-label="Type DELETE to confirm account deletion"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction destructive disabled={deleteConfirmation !== "DELETE"}>
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
