/*
9.7's Settings page, the presentation. The route page (`pages/SettingsPage.tsx`)
owns the reads and the account delete; this file draws five sections in one
column: Account, Appearance, Time, People, Data. Settings is the home of every
configuration: a preference is not also toggled from a menu elsewhere.

What is worth knowing:

- **No view pins.** The sidebar no longer has pinnable views, so the switches
  that mirrored it are gone rather than kept as a second copy of the sidebar.
- **Every row is a label and its control**, the control wrapping under the label
  on a phone rather than squeezing the words into a column one word wide.
- **The picture is the control** for the viewer's own picture (7.15); Remove is
  offered only while there is one.
- **"Download my data" is an anchor with `download`**, not a fetch: a navigation
  carries the session cookie and hands 7.22's attachment to the browser. The
  cost, recorded in 9.7, is that a rate-limit refusal arrives as a downloaded
  response rather than a toast.
- **Sample data lives here and only here** among the pages; Remove confirms once
  (the route page's dialog) and then offers the undo bar.
- **People** (9.8) is a section here, and /app/people lands on `#people`.
  Sign out has one home, the sidebar's account menu, and is not repeated here.
- **Pickers are the one `Combobox`**; the timezone list is long, so it filters
  as you type.
- **Delete account** requires typing DELETE, and says shared folders must be
  handed on first, which is what `DELETE /me`'s 409 enforces (issue #228).
*/
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { SUPPORT_EMAIL } from '../../shared/support.js'
import { ImagePlus } from '../lib/icons.js'
import { setTheme, useTheme } from '../lib/theme.js'
import { setClock, useTimeFormat } from '../lib/time-format.js'
import { setTaskOpen, useTaskOpenPreference } from '../lib/task-surface-preference.js'
import {
  clearViewerImage,
  setViewerImage,
  setViewerTimezone,
  squareImageFile,
  useViewer,
} from '../lib/viewer.js'
import { PeopleSettings } from './settings/people.js'
import { Screen, ScreenSection } from './settings/screen.js'
import { InlineError } from './state-patterns.js'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog.js'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.js'
import { Button } from './ui/button.js'
import { Combobox } from './ui/combobox.js'
import { Input } from './ui/input.js'
import { Skeleton } from './ui/skeleton.js'
import { cn } from './ui/utils.js'

function Row({
  title,
  description,
  control,
}: {
  title: string
  description?: ReactNode
  control: ReactNode
}) {
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm text-foreground">{title}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

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
      className="flex items-center gap-0.5 rounded-md bg-muted p-0.5"
    >
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onSelect(option)}
          className={cn(
            'h-7 rounded-sm px-2.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
            value === option
              ? 'bg-background text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/* The viewer's picture, name and address. The circle is the button. */
function ViewerRow() {
  const viewer = useViewer()
  const fileInput = useRef<HTMLInputElement>(null)

  async function take(file: File | undefined | null) {
    if (!file) return
    const square = await squareImageFile(file)
    if (square) setViewerImage(square)
  }

  return (
    <div className="flex min-h-14 items-center gap-3 py-2">
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        aria-label={viewer.image ? 'Change your picture' : 'Add a picture'}
        className="group/pic relative block shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <Avatar className="size-10">
          {viewer.image ? <AvatarImage src={viewer.image} alt="" /> : null}
          <AvatarFallback className="bg-muted text-xs text-muted-foreground">
            {viewer.initials}
          </AvatarFallback>
        </Avatar>
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/50 opacity-0 transition-opacity group-hover/pic:opacity-100">
          <ImagePlus className="size-4 text-background" strokeWidth={1.75} aria-hidden="true" />
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void take(event.target.files?.[0])}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{viewer.name}</p>
        {/* 7.1 has no write for the name: it is Google's, and the line says so. */}
        <p className="truncate text-xs text-muted-foreground">{viewer.email} · from Google</p>
      </div>
      {viewer.image ? (
        <Button variant="ghost" onClick={() => clearViewerImage()}>
          Remove picture
        </Button>
      ) : null}
    </div>
  )
}

export function SettingsPageContent({
  previewState,
  onDeleteAccount,
  sample,
  onRemoveSample,
  onRestoreSample,
}: {
  previewState?: string | null
  onDeleteAccount?: () => void
  /* Drawn only once the page knows whether 7.20's sample is present. */
  sample?: { present: boolean; busy: boolean; tasks: number; folders: number } | null
  onRemoveSample?: () => void
  onRestoreSample?: () => void
}) {
  const theme = useTheme()
  const clock = useTimeFormat()
  const taskOpen = useTaskOpenPreference()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')

  /* /app/people and other deep links arrive as /app/settings#<section>; the
     sections draw after the bundle, so scroll once they exist. */
  const ready = previewState !== 'loading' && previewState !== 'error'
  useEffect(() => {
    if (!ready) return
    const hash = window.location.hash.slice(1)
    if (hash === '') return
    document.getElementById(hash)?.scrollIntoView({ block: 'start' })
  }, [ready])

  return (
    <Screen title="Settings">
      {previewState === 'loading' ? (
        <div className="space-y-3" aria-label="Loading settings" aria-busy="true">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : previewState === 'error' ? (
        <InlineError />
      ) : (
        <>
          <ScreenSection id="settings-account" title="Account">
            <ViewerRow />
            <p className="py-2 text-xs text-muted-foreground">
              Something wrong? Write to{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </ScreenSection>

          <ScreenSection id="settings-appearance" title="Appearance">
            <Row
              title="Theme"
              control={
                <Segmented
                  label="Theme"
                  value={theme}
                  options={[
                    ['system', 'System'],
                    ['light', 'Light'],
                    ['dark', 'Dark'],
                  ]}
                  onSelect={setTheme}
                />
              }
            />
            <Row
              title="Open tasks in"
              control={
                <Segmented
                  label="Open tasks in"
                  value={taskOpen}
                  options={[
                    ['panel', 'Side peek'],
                    ['dialog', 'Center peek'],
                    ['tab', 'Full page'],
                  ]}
                  onSelect={setTaskOpen}
                />
              }
            />
          </ScreenSection>

          <ScreenSection id="settings-time" title="Time">
            <Row
              title="Timezone"
              description="Due dates and reminders use this zone"
              control={<TimezoneSelect />}
            />
            <Row
              title="Clock"
              control={
                <Segmented
                  label="Clock"
                  value={clock === '24' ? '24h' : '12h'}
                  options={[
                    ['12h', '12-hour'],
                    ['24h', '24-hour'],
                  ]}
                  onSelect={setClock}
                />
              }
            />
          </ScreenSection>

          <div id="people" className="scroll-mt-6">
            <ScreenSection id="settings-people" title="People">
              <PeopleSettings />
            </ScreenSection>
          </div>

          <ScreenSection id="settings-data" title="Data">
            <Row
              title="Download my data"
              description="Everything Dana holds about you, as one JSON file"
              control={
                <Button variant="outline" render={<a href="/api/v1/me/export" download />}>
                  Download
                </Button>
              }
            />
            {sample ? (
              <Row
                title="Sample data"
                description={
                  sample.present
                    ? `${String(sample.folders)} folders and ${String(sample.tasks)} tasks to show you around. Your own work stays.`
                    : 'Removed. Bring back the example folders and tasks.'
                }
                control={
                  <Button
                    variant="outline"
                    disabled={sample.busy}
                    onClick={sample.present ? onRemoveSample : onRestoreSample}
                  >
                    {sample.present ? 'Remove sample data' : 'Restore sample data'}
                  </Button>
                }
              />
            ) : null}
            <Row
              title="Delete account"
              description="Shared folders you own must be handed on or deleted first. Private folders and their tasks go with the account."
              control={
                <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                  Delete account
                </Button>
              }
            />
          </ScreenSection>
        </>
      )}

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setDeleteConfirmation('')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your Dana account?</AlertDialogTitle>
            <AlertDialogDescription>
              Shared folders you own must be handed to another member, or deleted, first — Dana will
              tell you which ones. Private folders and their tasks are permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <label htmlFor="delete-account-confirmation" className="text-xs text-foreground">
              Type DELETE to confirm
            </label>
            <Input
              id="delete-account-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
              className="mt-2 font-mono text-sm"
              aria-label="Type DELETE to confirm account deletion"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              disabled={deleteConfirmation !== 'DELETE'}
              onClick={onDeleteAccount}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  )
}

/* 7.1's PATCH /me takes a timezone. The list is the browser's own; a zone it
   does not list, which 7.2 may still have detected, is offered as the current
   value so the control never shows a zone the account is not in. */
function TimezoneSelect() {
  const viewer = useViewer()
  const zones = supportedTimezones()
  const current = viewer.timezone
  const listed = current === '' || zones.includes(current) ? zones : [current, ...zones]
  return (
    <Combobox
      aria-label="Timezone"
      value={current}
      onValueChange={setViewerTimezone}
      placeholder="Choose a timezone"
      searchPlaceholder="Search timezones"
      className="w-56 justify-between"
      contentClassName="w-72"
      options={listed.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }))}
    />
  )
}

function supportedTimezones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    return intl.supportedValuesOf?.('timeZone') ?? []
  } catch {
    return []
  }
}
