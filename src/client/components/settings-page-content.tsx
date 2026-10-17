// The Settings page presentation; `pages/SettingsPage.tsx` owns the reads and account
// deletion. "Download my data" is an anchor with `download`, so the session cookie goes
// with it; a rate-limit refusal then arrives as a downloaded response, not a toast.
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'

import { paths } from '../routes.js'
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

// The viewer's picture, name and address. The circle is the button.
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
      // The name comes from Google and has no write, and the line says so.
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
}: {
  previewState?: string | null
  onDeleteAccount?: () => void
}) {
  const theme = useTheme()
  const clock = useTimeFormat()
  const [defaultWorkView, setDefaultWorkView] = useDefaultWorkView()

  // Deep links arrive as /app/settings#<section>; sections draw after the bundle, so
  // scroll once they exist.
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
                    { value: 'board', label: 'Board' },
                    { value: 'calendar', label: 'Calendar' },
                  ]}
                  onValueChange={(next) => {
                    if (next === 'thread' || next === 'freeform' || next === 'board' || next === 'calendar') setDefaultWorkView(next)
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

          <PeopleSettings />

          <SettingsSection title="Data">
            <StackingRow
              label="Download my data"
              description="Everything Dana holds about you, as one JSON file"
              control={<Button render={<a href="/api/v1/me/export" download />}>Download</Button>}
            />
            <StackingRow
              label="Archived work"
              description="Work and pages removed from active views"
              control={<Button render={<Link to={paths.archivedWork} />}>Manage archived work</Button>}
            />
          </SettingsSection>

          <SettingsSection title="About">
            <div className="rounded-[var(--radius-card)] border border-border bg-card p-[var(--space-inline)]">
              <p className="text-sm font-section text-foreground">Dana</p>
              <p className="mt-[var(--space-inline)] text-sm text-foreground">
                A place to plan, shape, and collaborate on work.
              </p>
              <p className="mt-[var(--space-inline)] text-xs text-muted-foreground">
                Created by its co-founders. Operated by Wafa Graphics.
              </p>
              <div className="mt-[var(--space-inline)] flex flex-wrap gap-[var(--space-inline)] border-t border-border pt-[var(--space-inline)] text-xs">
                <Link to={paths.privacy} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  Privacy Policy
                </Link>
                <Link to={paths.terms} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  Terms of Service
                </Link>
              </div>
              <p className="mt-[var(--space-inline)] text-xs text-muted-foreground">
                © 2026 Imranullah Wafa and Hassan Shahir. All rights reserved.
              </p>
            </div>
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

        </>
      )}

    </Screen>
  )
}

// One picker at one width, so the right column reads as one edge.
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

// The list is the browser's own; a detected zone it lacks is offered as the current
// value, so the control never shows a zone the account is not in.
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
