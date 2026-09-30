/*
9.7's Settings page, the presentation. The route page (`pages/SettingsPage.tsx`)
owns the reads and the account delete; this file draws four labelled cards in
one column (Account, Preferences, People, Data), then Delete account in a card of
its own, then the quiet support line (Hassan's grouped-cards reference, r12).
Built from the system `Row` inside `settings/screen.tsx`'s cards, neutral
buttons, one danger style. Settings is the home of every
configuration: a preference is not also toggled from a menu elsewhere.

What is worth knowing:

- **No view pins.** The sidebar no longer has pinnable views, so the switches
  that mirrored it are gone rather than kept as a second copy of the sidebar.
- **Every row is a label and its control** on one line, a phone included; a
  long description wraps rather than the control.
- **The picture is the control** for the viewer's own picture (7.15); Remove is
  offered only while there is one.
- **"Download my data" is an anchor with `download`**, not a fetch: a navigation
  carries the session cookie and hands 7.22's attachment to the browser. The
  cost, recorded in 9.7, is that a rate-limit refusal arrives as a downloaded
  response rather than a toast.
- **Sample data lives here and only here** among the pages; Remove is one press
  and then offers the undo bar.
- **People** (9.8) is a section here, and /app/people lands on `#people`.
  Settings is reached from the sidebar's foot, beside Trash. Sign out has one
  home, the identity row here; the sidebar has no account menu.
- **Pickers are the one `Combobox`**; the timezone list is long, so it filters
  as you type.
- **Delete account** requires typing DELETE, and says shared folders must be
  handed on first, which is what `DELETE /me`'s 409 enforces (issue #228).
*/
import { useEffect, useRef } from 'react'

import { SUPPORT_EMAIL } from '../../shared/support.js'
import { signOut } from '../shell/session.js'
import { ImagePlus } from '../lib/icons.js'
import { setTheme, useTheme } from '../lib/theme.js'
import { setClock, useTimeFormat } from '../lib/time-format.js'
import { useDefaultWorkView } from '../views/work-view.js'
import {
  clearViewerImage,
  setViewerImage,
  setViewerTimezone,
  squareImageFile,
  useViewer,
} from '../lib/viewer.js'
import { PeopleSettings } from './settings/people.js'
import { Screen, SettingsSection, StackingRow } from './settings/screen.js'
import { InlineError } from './state-patterns.js'
import { isOwnPicture, PersonFace } from './person-face.js'
import { Button } from './ui/button.js'
import { Combobox } from './ui/combobox.js'
import { Skeleton } from './ui/skeleton.js'

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
    <StackingRow
      icon={
        <>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label={isOwnPicture(viewer.image) ? 'Change your picture' : 'Add a picture'}
            className="group/pic relative block shrink-0 rounded-full"
          >
            <PersonFace
              id={viewer.id}
              name={viewer.name}
              image={viewer.image ?? null}
              className="size-7 data-[size=sm]:size-7"
            />
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
        </>
      }
      className="min-h-12"
      label={<span className="font-title">{viewer.name}</span>}
      /* 7.1 has no write for the name: it is Google's, and the line says so. */
      description={`${viewer.email} · from Google`}
      control={
        <>
          {isOwnPicture(viewer.image) ? (
            <Button onClick={() => clearViewerImage()}>Remove picture</Button>
          ) : null}
          <Button onClick={signOut}>Sign out</Button>
        </>
      }
    />
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
  const [defaultWorkView, setDefaultWorkView] = useDefaultWorkView()

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
    <Screen title="Settings" bleed={false}>
      {previewState === 'loading' ? (
        <div className="space-y-3" aria-label="Loading settings" aria-busy="true">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : previewState === 'error' ? (
        <InlineError />
      ) : (
        <>
          <SettingsSection title="Account">
            <ViewerRow />
          </SettingsSection>

          <SettingsSection title="Preferences">
            <StackingRow
              label="Theme"
              control={
                <Choice
                  label="Theme"
                  value={theme}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  onValueChange={(next) => {
                    setTheme(next as typeof theme)
                  }}
                />
              }
            />
            <StackingRow
              label="Default Work view"
              control={
                <Choice
                  label="Default Work view"
                  value={defaultWorkView}
                  options={[
                    { value: 'thread', label: 'Thread' },
                    { value: 'freeform', label: 'Freeform' },
                  ]}
                  onValueChange={(next) => {
                    if (next === 'thread' || next === 'freeform') setDefaultWorkView(next)
                  }}
                />
              }
            />
            <StackingRow label="Timezone" control={<TimezoneSelect />} />
            <StackingRow
              label="Clock"
              control={
                <Choice
                  label="Clock"
                  value={clock === '24' ? '24h' : '12h'}
                  options={[
                    { value: '12h', label: '12-hour' },
                    { value: '24h', label: '24-hour' },
                  ]}
                  onValueChange={(next) => {
                    setClock(next as '12h' | '24h')
                  }}
                />
              }
            />
          </SettingsSection>

          <SettingsSection id="people" title="People" className="scroll-mt-6">
            <PeopleSettings />
          </SettingsSection>

          <SettingsSection title="Data">
            <StackingRow
              label="Download my data"
              description="Everything Dana holds about you, as one JSON file"
              control={<Button render={<a href="/api/v1/me/export" download />}>Download</Button>}
            />
            {sample ? (
              <StackingRow
                label="Sample workspace"
                description={sample.present ? 'To show you around.' : undefined}
                control={
                  /* The client cannot tell removed from never had, so one neutral label. */
                  <Button
                    disabled={sample.busy}
                    onClick={sample.present ? onRemoveSample : onRestoreSample}
                  >
                    {sample.present ? 'Remove' : 'Add sample pages'}
                  </Button>
                }
              />
            ) : null}
          </SettingsSection>

          {/* Destructive, so last and in a card of its own. */}
          <SettingsSection aria-label="Delete account">
            <StackingRow
              label="Delete account"
              description="Shared pages you own must be handed on or deleted first"
              control={
                <Button variant="destructive" onClick={onDeleteAccount}>
                  Delete account
                </Button>
              }
            />
          </SettingsSection>

          <p className="mt-4 text-xs text-muted-foreground">
            Something wrong? Write to{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </>
      )}

    </Screen>
  )
}

/* A simple choice: the one picker, at the one width, so the right column
   reads as one calm edge and the chosen value is always shown in words. */
function Choice({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onValueChange: (next: string) => void
}) {
  return (
    <Combobox
      aria-label={label}
      value={value}
      onValueChange={onValueChange}
      options={options}
      className={PICKER}
    />
  )
}

const PICKER = 'w-(--settings-picker-width) max-sm:w-36 justify-between border border-input bg-muted'

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
      className={PICKER}
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