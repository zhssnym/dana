/*
`docs/design/prototype-v2/src/screens/settings-screen.tsx`, lifted whole at
RFC 0004's S27 and bound through the adapter seam. It diffs empty against its
original except at the seams named here, each marked `Seam` in the body.

1. **The `@/` specifiers become this client's relative ESM paths** (11.4), the
   mechanical seam every lifted file takes, and the em dashes leave under
   protocol section 7.
2. **The four lib modules are adapters**: `lib/nav-model.ts` over `routes.ts`,
   `lib/page-pins.ts` over 4.19's `pinned_views`, `lib/theme.ts` over the
   `theme` column and item 43's mirror, `lib/viewer.ts` over `/me` and 7.15.
   `lib/row-density.ts` gained the setter this file calls. Each header names
   what it crosses.
3. **The pin list carries the viewer's saved views after the nine natives**,
   which is 9.7's "native and saved alike"; the prototype's model has no saved
   views (its own header: "views a person makes themselves need a table and
   endpoints and stay NEEDS BACKEND"). The table exists, so the rows are
   drawn in the same `SettingRow` with a bookmark for a mark, last because
   9.1 fixes the order of the nine and a person's own views are not in it.
4. **Two rows 9.7 names that the prototype does not draw, Clock and Where a
   task opens**, in the same idiom as its two: 9.7 says four, the prototype is
   short here rather than contradictory, and 11.13 gives structure to the
   section. Their writers are `lib/time-format.ts` and
   `lib/task-surface-preference.ts`, and section 13 item 48 is read at the
   second.
5. **The account row reads the session**: `imran@example.com` and
   `America/Edmonton` are the viewer's own email and 7.2's detected timezone.
   The Remove control on the picture is not drawn, because 7.15 has no route
   that clears an avatar (the reason is in `lib/viewer.ts`).
6. **Sign out and Delete account are callbacks**, `onSignOut` and
   `onDeleteAccount`, the lab having nothing to sign out of. The dialog's
   confirming control reads "Continue" rather than the prototype's "Delete
   account", 9.1's names table fixing the two controls of every confirmation
   and the earlier lift rows (item 44's A2) keeping 9.1's names on addressing.
7. **The section headed "Deleting your account" is the prototype's own, by
   Imran's ruling of 2026-08-22 recorded in the file itself**, where 9.7 read
   "Danger zone"; 9.7 is amended toward it (RFC 0005 change control item 55).
   The storage line 9.7 names is still absent, section 13 item 35(c) standing.

Nothing else moves.
*/
import { useRef, useState, type ReactNode } from "react"
import {
  Sun,
  Moon,
  Monitor,
  ImagePlus,
  Download,
  Globe,
  ListTodo,
  LogOut,
  Settings,
  Trash2,
  UsersRound,
  type LucideIcon,
} from "../lib/icons.js"
/* Seam 3 and seam 4: the marks the two additions wear. */
import { Bookmark, Clock3, PanelRight } from "../lib/icons.js"

import { InlineError } from "../components/state-patterns.js"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog.js"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar.js"
import { Button } from "../components/ui/button.js"
import { Input } from "../components/ui/input.js"
import { Skeleton } from "../components/ui/skeleton.js"
import { Switch } from "../components/ui/switch.js"
import { NAV_PAGES, pageQuestion } from "../lib/nav-model.js"
import { isPagePinned, setPagePinned, usePagePins } from "../lib/page-pins.js"
import { setRowDensity, useRowDensity } from "../lib/row-density.js"
import { setTheme, useTheme } from "../lib/theme.js"
import { setViewerImage, squareImageFile, useViewer } from "../lib/viewer.js"
import { cn } from "../components/ui/utils.js"
/* Seam 4: the two writers 9.7's other two rows need. */
import { setClock, useTimeFormat } from "../lib/time-format.js"
import { setTaskOpen } from "../lib/task-surface-preference.js"
import { useBundle } from "../api/queries.js"
import type { SavedView } from "../../shared/bundle.js"

export type PageVisibility = {
  Important: boolean
  All: boolean
  Done: boolean
}

/*
The account's own row, and the picture in it (DES-204).

Imran, 2026-08-23: "a profile picture can be uploaded in Settings". The row was
already here, drawn with initials in a circle; what it lacked was that the
circle could be pressed.

**The picture is the control.** A separate "Upload photo" button beside an
avatar is a second thing to look at where there is only one thing to do, and
every product a person has used already teaches that the circle is the button.
Hovering says so; the menu behind it is only needed once there is a picture to
replace or remove.
*/
function ViewerPictureRow() {
  const viewer = useViewer()
  const fileInput = useRef<HTMLInputElement>(null)

  async function take(file: File | undefined | null) {
    if (!file) return
    const square = await squareImageFile(file)
    if (square) setViewerImage(square)
  }

  return (
    <div className="flex min-h-16 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
      <div className="group/pic relative">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          aria-label={viewer.image ? "Change your picture" : "Add a picture"}
          className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-2"
        >
          <Avatar className="size-10">
            {viewer.image ? <AvatarImage src={viewer.image} alt="" /> : null}
            <AvatarFallback className="bg-[var(--color-graphite-200)] text-xs font-medium text-[var(--color-graphite-700)]">
              {viewer.initials}
            </AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-[var(--color-graphite-900)]/55 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover/pic:opacity-100">
            <ImagePlus className="size-4 text-white" strokeWidth={1.75} aria-hidden="true" />
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void take(event.target.files?.[0])}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{viewer.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {/* Seam 5: the session's address. */}
          {viewer.email} · Google account
        </p>
      </div>
      {/* Seam 5: the prototype's Remove control is not drawn; 7.15 has no
          route that clears an avatar. See `lib/viewer.ts`. */}
    </div>
  )
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
  /* A view's own mark, so this list and the sidebar show the same thing:
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

/* Seam 4: the prototype's segmented control, as one component, so the two
   rows 9.7 adds are drawn by the same code as its two rather than by a copy
   of their class strings. The strings are its own, untouched. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onSelect: (next: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-lg bg-[var(--color-graphite-100)] p-0.5"
    >
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onSelect(option)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
            value === option
              ? "bg-card text-[var(--color-graphite-900)] shadow-[var(--elevation-1)]"
              : "text-[var(--color-graphite-600)] hover:text-[var(--color-graphite-900)]",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export function SettingsScreen({
  onOpenPeople,
  previewState,
  savedViews = [],
  onPinSavedView,
  onSignOut,
  onDeleteAccount,
}: {
  onOpenPeople: () => void
  previewState?: string | null
  /* Seam 3. */
  savedViews?: readonly SavedView[]
  onPinSavedView?: (id: string, pinned: boolean) => void
  /* Seam 6. */
  onSignOut?: () => void
  onDeleteAccount?: () => void
}) {
  const pins = usePagePins()
  const density = useRowDensity()
  const theme = useTheme()
  /* Seam 4: 9.7's other two values, from the same bundle. */
  const clock = useTimeFormat()
  const taskOpen = useBundle().data?.task_open ?? "dialog"
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

      {/* ~560px, not the page measure (review S2): every row here is a label
          with a control at its far end, and at 820px the switch sat a whole
          reading-line away from the words that name it. 560 is the same
          discipline the People screen's form already keeps. */}
      <div className="mt-7 max-w-[560px]">
        {previewState === "loading" ? (
          <SettingsSkeleton />
        ) : previewState === "error" ? (
          <InlineError />
        ) : (
          <div className="space-y-8">
            <SettingsSection
              id="settings-pages"
              title="Views"
              description="Every view Dana has. Pin the ones you want in the sidebar; nothing here changes or deletes a task."
            >
              {/*
              The pin list: DES-153, and Imran's ask in his own words: an
              option to hide a page, and "letting the user that you want to
              unhide or activate this page you can do it from settings".

              What stood here was three switches named Important, All and
              Done, and a line saying "My Day, Tasks, and Planned are always
              shown": v1's page set, still being offered two navigation
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
                {/* Seam 3: 9.7's "native and saved alike". DES-153's backend
                    half has landed, 4.19's `user_views`, so the rows the
                    prototype's comment above anticipates are drawn here. */}
                {savedViews.map((view) => (
                  <SettingRow
                    key={view.id}
                    icon={Bookmark}
                    title={view.name}
                    description="A view you saved"
                    control={
                      <Switch
                        checked={view.pinned}
                        onCheckedChange={(checked) =>
                          onPinSavedView?.(view.id, checked === true)
                        }
                        aria-label={`Pin ${view.name} to the sidebar`}
                      />
                    }
                  />
                ))}
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
            expecting a control here, "read by the row, by every screen that
            draws a list, by the states page and by a settings control", and
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
                    ? "Two lines: the title, then its details underneath"
                    : "One line: details fold onto the title's own line"
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
              {/*
              Theme, under Appearance and nowhere else (DES-205).

              Imran, 2026-08-23, asked where the toggle goes. It goes here, and
              the two tempting alternatives are both worse for the same reason.
              **Not the account menu**, which is where a lot of products put it
              and where it does not belong: that menu is about *you*, your
              picture, your sign-out, help with the app, and a theme is about
              how Dana draws, which is what this section already says it is
              for. **Not the window bar**, because a control in the chrome is a
              control you press by accident, and nobody changes their theme
              often enough to pay rent in the bar.

              **Three states rather than a switch**, and the third is the one
              people want: a two-way toggle makes you re-choose at sunset and
              leaves Dana disagreeing with every other window for half the day.

              It sits above Row height because it is the larger of the two:
              one changes every colour, the other changes a list's spacing.
              */}
              <SettingRow
                icon={theme === "dark" ? Moon : theme === "light" ? Sun : Monitor}
                title="Theme"
                description={
                  theme === "system"
                    ? "Following your device"
                    : theme === "dark"
                      ? "Dark, whatever your device says"
                      : "Light, whatever your device says"
                }
                control={
                  <div
                    role="radiogroup"
                    aria-label="Theme"
                    className="flex items-center gap-0.5 rounded-lg bg-[var(--color-graphite-100)] p-0.5"
                  >
                    {(
                      [
                        ["system", "System"],
                        ["light", "Light"],
                        ["dark", "Dark"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={theme === value}
                        onClick={() => setTheme(value)}
                        className={cn(
                          "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                          theme === value
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
              {/* Seam 4: 9.7's clock and where a task opens, in the rows'
                  own idiom. Each description is the value in words, which is
                  the rule the two rows above set. */}
              <SettingRow
                icon={Clock3}
                title="Clock"
                description={clock === "24" ? "Times read 17:30" : "Times read 5:30 PM"}
                control={
                  <Segmented
                    label="Clock"
                    value={clock === "24" ? "24h" : "12h"}
                    options={[
                      ["12h", "12-hour"],
                      ["24h", "24-hour"],
                    ]}
                    onSelect={setClock}
                  />
                }
              />
              <SettingRow
                icon={PanelRight}
                title="Where a task opens"
                description={
                  taskOpen === "panel"
                    ? "Beside it, at the right edge"
                    : taskOpen === "tab"
                      ? "As a tab of its own"
                      : "Over the page you were on"
                }
                control={
                  <Segmented
                    label="Where a task opens"
                    value={taskOpen}
                    options={[
                      ["dialog", "Dialog"],
                      ["panel", "Panel"],
                      ["tab", "Tab"],
                    ]}
                    onSelect={setTaskOpen}
                  />
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
              <ViewerPictureRow />

                <div className="flex min-h-16 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
                  <div className="flex size-10 shrink-0 items-center justify-center text-[var(--color-graphite-500)]">
                    <Globe className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Seam 5: 7.2's detected timezone. */}
                    <p className="text-sm font-medium text-foreground"><TimezoneLine /></p>
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
                    <Button variant="ghost" className="h-8 gap-2 px-3 text-xs" onClick={onSignOut}>
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
            "Deleting your account", not "Danger zone": Imran, 2026-08-22.

            Two faults in two words. **It is a coinage**, GitHub's, and
            DES-152 settled that Dana uses the common word rather than
            somebody else's invention, the same rule that left "My Day" and
            "Assigned to me" to Microsoft. And **it names a feeling instead of
            its contents**: a person scanning Settings for how to close their
            account is looking for the word "account", which was the one word
            the heading did not contain.

            The section also said its one idea three times, a heading, a row
            title and a button all reading some form of *delete account*, plus
            "Review the consequences before continuing", which is a sentence
            that describes reading rather than telling you anything. The
            consequence itself is what belongs there, in Dana's own nouns:
            folders, members, tasks. Each line earns its place now, and the
            confirmation dialog behind the button is unchanged: it is where
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
            {/* Seam 6: 9.1's "Continue", and the act is the page's. */}
            <AlertDialogAction
              destructive
              disabled={deleteConfirmation !== "DELETE"}
              onClick={onDeleteAccount}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* Seam 5: the timezone the session detected, drawn where the prototype wrote
   a literal. A component rather than a hook call above so the row's markup
   stays the prototype's. */
function TimezoneLine() {
  return <>{useViewer().timezone}</>
}
