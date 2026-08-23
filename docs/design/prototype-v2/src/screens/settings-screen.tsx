import { useState, type ReactNode } from "react"
import {
  Download,
  Globe,
  ListTodo,
  LogOut,
  Settings,
  Trash2,
  UsersRound,
  type LucideIcon,
} from "@/lib/icons"

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
import { NAV_PAGES, pageQuestion } from "@/lib/nav-model"
import { isPagePinned, setPagePinned, usePagePins } from "@/lib/page-pins"
import { setRowDensity, useRowDensity } from "@/lib/row-density"
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

function SettingRow({
  title,
  description,
  control,
  /* A view's own mark, so this list and the sidebar show the same thing —
     a settings row that describes a page in different clothes is a second
     description of it. Optional, because the account rows have no mark. */
  icon: Icon,
}: {
  title: string
  description: string
  control: ReactNode
  icon?: LucideIcon
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
      {Icon ? (
        <Icon
          className="size-4 shrink-0 text-[var(--color-graphite-500)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      ) : null}
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
  onOpenPeople,
  previewState,
}: {
  onOpenPeople: () => void
  previewState?: string | null
}) {
  const pins = usePagePins()
  const density = useRowDensity()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")

  return (
    <div className="mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6">
      <header className="flex min-h-12 items-start gap-3">
        <Settings
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
            <SettingsSection
              id="settings-pages"
              title="Views"
              description="Every view Dana has. Pin the ones you want in the sidebar — nothing here changes or deletes a task."
            >
              {/*
              The pin list — DES-153, and Imran's ask in his own words: an
              option to hide a page, and "letting the user that you want to
              unhide or activate this page you can do it from settings".

              What stood here was three switches named Important, All and
              Done, and a line saying "My Day, Tasks, and Planned are always
              shown" — v1's page set, still being offered two navigation
              models later. It could only ever describe the pages it was
              written against.

              This reads the model instead, so a view added to `NAV_PAGES`
              appears here without anyone editing this file, and a view a
              person saves for themselves will too when DES-153's backend
              half lands. Each row carries the page's own mark and its own
              sentence, so the list is the same thing the sidebar shows
              rather than a second description of it.
              */}
              <div className="space-y-0.5">
                {NAV_PAGES.map((page) => {
                  const pinned = isPagePinned(page.name, pins)
                  const locked = page.hideable === false
                  return (
                    <SettingRow
                      key={page.name}
                      icon={page.icon}
                      title={page.name}
                      description={pageQuestion(page.name) ?? ""}
                      control={
                        <Switch
                          checked={pinned}
                          disabled={locked}
                          onCheckedChange={(checked) =>
                            setPagePinned(page.name, checked === true)
                          }
                          aria-label={`Pin ${page.name} to the sidebar`}
                        />
                      }
                    />
                  )
                })}
              </div>
              {/* Said once, where the one locked row is, rather than as a
                  list of names somebody has to keep in step with the model. */}
              <p className="mt-3 px-2 text-xs text-muted-foreground">
                Desk cannot be unpinned: it is where a task goes when you have
                not said where, so it has to stay reachable.
              </p>
            </SettingsSection>

            {/*
            Row height, where DES-113 always said it lived.

            The ruling settled it in Settings and the module store was built
            expecting a control here — "read by the row, by every screen that
            draws a list, by the states page and by a settings control" — and
            the control was never written. So the preference existed, was
            honoured everywhere, and could not be changed by anybody: a
            setting with no way in is a setting nobody has (Imran,
            2026-08-22).

            Two options rather than a switch, because neither is the absence
            of the other. A switch labelled "Compact" makes two lines the
            *unchecked* state, and DES-113's whole argument is that two lines
            is the considered default rather than the leftover.
            */}
            <SettingsSection
              id="settings-appearance"
              title="Appearance"
              description="How Dana draws your work. Nothing here changes a task."
            >
              <SettingRow
                icon={ListTodo}
                title="Row height"
                description={
                  density === "two"
                    ? "Two lines — the title, then its details underneath"
                    : "One line — details fold onto the title's own line"
                }
                control={
                  <div
                    role="radiogroup"
                    aria-label="Row height"
                    className="flex items-center gap-0.5 rounded-lg bg-[var(--color-graphite-100)] p-0.5"
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
                        onClick={() => setRowDensity(value)}
                        className={cn(
                          "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                          density === value
                            ? "bg-card text-[var(--color-graphite-900)] shadow-[var(--elevation-1)]"
                            : "text-[var(--color-graphite-600)] hover:text-[var(--color-graphite-900)]",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
              />
              {/* The choice is worth seeing rather than reading, so the row
                  above is followed by the thing it changes. */}
              <p className="mt-3 px-2 text-xs text-muted-foreground">
                The state sheet draws both, side by side, if you want to compare
                them before choosing.
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
                    <Globe className="size-5" strokeWidth={1.75} aria-hidden="true" />
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

            {/*
            "Deleting your account", not "Danger zone" — Imran, 2026-08-22.

            Two faults in two words. **It is a coinage**, GitHub's, and
            DES-152 settled that Dana uses the common word rather than
            somebody else's invention — the same rule that left "My Day" and
            "Assigned to me" to Microsoft. And **it names a feeling instead of
            its contents**: a person scanning Settings for how to close their
            account is looking for the word "account", which was the one word
            the heading did not contain.

            The section also said its one idea three times — a heading, a row
            title and a button all reading some form of *delete account*, plus
            "Review the consequences before continuing", which is a sentence
            that describes reading rather than telling you anything. The
            consequence itself is what belongs there, in Dana's own nouns:
            folders, members, tasks. Each line earns its place now, and the
            confirmation dialog behind the button is unchanged — it is where
            the real check happens.
            */}
            <SettingsSection
              id="settings-danger"
              title="Deleting your account"
              description="Folders you share pass to their longest-standing member. Private folders and their tasks are deleted with the account."
              danger
            >
              <div className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--color-danger-200)] bg-[var(--color-danger-100)]/45 px-3">
                <Trash2
                  className="size-5 shrink-0 text-[var(--color-danger-700)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <p className="min-w-0 flex-1 text-sm text-[var(--color-graphite-700)]">
                  This cannot be undone.
                </p>
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
