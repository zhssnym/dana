/*
9.7's Settings page: Views, Account, Danger zone, each a named region.

**The Views section is the pin list, built at S16, and what it replaces is
why this file is worth reading before it is edited.** It shipped carrying
three named switches, Important, All and Done, under a note reading "My Day,
Tasks, and Planned are always shown", which is v1's page set described to a
person using v2. RFC 0005 item 9 records why it outlived its own product:
"RFC 0004 gives the Settings rewrite to no package." The machinery has been
finished since S7 and only the control was missing, which is a setting nobody
has.

9.7's sentence is the shape: "every view Dana has, native and saved alike,
each with the page's own mark, its one-line question, and a pin switch; Desk
locked". Two consequences are structural rather than cosmetic. The native
half **reads `navPages`** rather than a list written here, so a view added to
9.1's page block appears in this list without anyone editing this file, which
is the thing three hardcoded booleans could never do and the reason a fourth
could not simply be added. And each row's mark and question come from that
same table, so this list and the sidebar draw one page rather than two
descriptions of it.

The two halves write two addresses, because 4.19 keeps them in two places: a
native view's pin is a key in `pinned_views` on the settings bundle, and a
saved view's pin is a column on its own `user_views` row. That seam is not
this page's invention and it is not one this page can hide; what it can do is
make both switches mean one thing to the person pressing them.

**AC-095's switch is a row of this list**, and 9.7's own note is what stands
where v1's did. The three v1 flags of frozen 7.2 are untouched by this
surface, per item 6: they stay stored, AC-119 to AC-123 stay green on them,
and the fold makes `pinned_views` the record from the moment it is written.

Two sections 9.7 names are not here and neither is this package's to add.
**Appearance** (theme, row density, the clock, where a task opens) has its
stored fields in the same bundle and no built control, and RFC 0004 assigns
it to no row; the parity audit lists it under the Settings surface and the
session log records it as owed. **Storage used against 10.3's quota** waits
on a read that reports it.

The note beside Desk and the danger zone's two sentences are normative copy
and are transcribed; the section and row descriptions are the designer's own
words from `settings-screen.tsx`, transcribed with the same discipline.

The deletion flow moved from an inline input to the prototype's dialog at the
polish pass: 9.7 requires typing DELETE and the dialog is where the prototype
puts the typing. The dialog's two controls keep 9.1's uniform confirmation
names, "Continue" and "Cancel", rather than the prototype's "Delete account",
because the destructive verb is already in the sentence the person is reading;
Continue stays disabled until the word is typed, which is 9.7's own guard.
*/
import { useState } from 'react'

import {
  Download,
  Globe2,
  LogOut,
  Settings2,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router'
import type { ReactNode } from 'react'

/* The pin list's two marks come from the icon module of DES-125, which is
   where the sidebar takes them from: one drawing, one name, and this list
   and the sidebar showing one page rather than two. */
import { Bookmark } from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import { DEFAULT_PINNED } from '../../shared/bundle.js'
import type { SavedView } from '../../shared/bundle.js'
import { mutateApi } from '../api/http.js'
import { usePatchBundle, usePatchSavedView } from '../api/mutations.js'
import { useBundle, useMe, useSavedViews } from '../api/queries.js'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
} from '../components/ui/alert-dialog.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Switch } from '../components/ui/switch.js'
import { initialsOf } from '../parts/presenters.js'
import { navPages, paths } from '../routes.js'
import type { NavPage } from '../routes.js'
import { definitionPage } from '../views/filter.js'
import { PLACES } from '../views/place-pages.js'
import type { PlaceKey } from '../views/place-pages.js'
import { PageHeading } from './page-heading.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { PersonFace } from '../components/person-face.js'

/** 9.7, verbatim: the note that stands where the one locked row is. */
const DESK_LOCKED =
  'Desk cannot be unpinned: it is where a task goes when you have not said ' +
  'where, so it has to stay reachable.'

/** 9.7's danger zone, verbatim. */
const DELETE_ACCOUNT =
  'Folders you share will be handed to their longest-standing member. ' +
  'Private folders and their tasks are permanently deleted.'

/** 9.7, the note beside the detected timezone. */
const TIMEZONE_NOTE = "Dana follows your device's timezone automatically"

/** The designer's own words for the section, from `settings-screen.tsx`. */
const VIEWS_DESCRIPTION =
  'Every view Dana has. Pin the ones you want in the sidebar, and nothing ' +
  'here changes or deletes a task.'

/**
 * What a saved view's row says under its name.
 *
 * 9.7 gives every row "its one-line question", and a saved view has none: a
 * native page answers a question DES-152 wrote for it, and a view somebody
 * saved answers whatever they saved. So the line states the one fact the
 * definition carries, the page the view is a view of, which is also where
 * pressing its sidebar entry lands. No section fixes this string and this
 * package wrote it; a view whose definition names no page falls back to All,
 * which is `savedViewPath`'s own fallback and for its reason.
 */
function savedViewLine(view: SavedView): string {
  const named = definitionPage(view.definition)
  const place = named !== null && named in PLACES ? PLACES[named as PlaceKey] : PLACES.all
  return `A view you saved on ${place.name}`
}

/**
 * The prototype's section band: a rule above, a small semibold title, an
 * optional quiet description. Wrapped around `PageSection` so the three 9.1
 * region names stay landmarks exactly as before.
 */
function SettingsSection({
  name,
  description,
  danger = false,
  children,
}: {
  readonly name: string
  readonly description?: string
  readonly danger?: boolean
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <PageSection name={name}>
      <div className="border-t border-border pt-6">
        <div className="mb-3">
          <h2
            className={
              danger
                ? 'text-sm font-semibold text-[var(--color-danger-700)]'
                : 'text-sm font-semibold text-foreground'
            }
          >
            {name}
          </h2>
          {description === undefined ? null : (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          )}
        </div>
        {children}
      </div>
    </PageSection>
  )
}

/** The prototype's row: title and description left, one control right. */
function SettingRow({
  title,
  description,
  control,
  /* A view's own mark, so this list and the sidebar show the same thing.
     Optional, because the account rows have no mark: the designer's own note
     on this component, and his reason for it. */
  icon: Icon,
}: {
  readonly title: string
  readonly description: string
  readonly control: ReactNode
  readonly icon?: LucideIcon
}): React.JSX.Element {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
      {Icon === undefined ? null : (
        <Icon
          className="size-4 shrink-0 text-[var(--color-graphite-500)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

/**
 * One row of the pin list, native or saved.
 *
 * One component for both kinds, because 9.7 describes one list: the two
 * differ in where their pin is stored and in nothing a person can see, and a
 * second component here would be where that stops being true.
 */
function PinRow({
  name,
  description,
  icon,
  pinned,
  locked = false,
  onPinnedChange,
}: {
  readonly name: string
  readonly description: string
  readonly icon: LucideIcon
  readonly pinned: boolean
  readonly locked?: boolean
  readonly onPinnedChange: (pinned: boolean) => void
}): React.JSX.Element {
  return (
    <SettingRow
      title={name}
      description={description}
      icon={icon}
      control={
        <Switch
          /* Named for what pressing it does to the view it names, which is
             what makes a list of nine switches addressable at all: nine
             controls called after nine pages would each need their row to
             tell them apart, and a criterion cannot address a row. */
          aria-label={`Pin ${name} to the sidebar`}
          checked={pinned}
          disabled={locked}
          onCheckedChange={(checked) => {
            onPinnedChange(checked === true)
          }}
        />
      }
    />
  )
}

export function SettingsPage(): React.JSX.Element {
  const bundle = useBundle()
  const savedViews = useSavedViews()
  const me = useMe()
  const patchBundle = usePatchBundle()
  const patchSavedView = usePatchSavedView()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  const displayName = me.data?.user.display_name ?? ''

  /*
  The pin set, read from 4.19 and falling back to the defaults rather than to
  nothing. That is `pinnedNavPages`'s own rule generalised: a settings page
  that shows every view unpinned while a read is in flight is a page that
  invites a person to fix something that was never broken.
  */
  const pinned = new Set<string>(bundle.data?.pinned_views ?? DEFAULT_PINNED)

  /**
   * A native view's pin is a key in the bundle's list, so the write is the
   * whole list rather than one flag, and it is rebuilt from `navPages` so it
   * comes back in 9.1's order rather than in the order things were pressed.
   *
   * A locked page is written as pinned as well as drawn that way. The
   * sidebar would keep Desk either way, `pinnable: false` being its rule too,
   * but a stored list that disagrees with the switch a person is looking at
   * is the kind of difference nobody notices until something reads the list
   * and not the rule.
   */
  function setNativePinned(page: NavPage, next: boolean): void {
    const keys = navPages
      .filter((candidate) =>
        candidate.key === page.key
          ? next
          : !candidate.pinnable || pinned.has(candidate.key),
      )
      .map((candidate) => candidate.key)
    patchBundle.mutate({ pinned_views: keys })
  }

  return (
    <div className="space-y-7">
      <PageHeading icon={Settings2} title="Settings" subtitle="Preferences and account" />

      {/* ~560px rather than the page measure (DES-222): every row here is a
          label with a control at its far end, and at 820 the switch sat a
          whole reading-line away from the words that name it. */}
      <PageBody query={bundle} isEmpty={false} emptyCopy="">
        <div className="max-w-[560px] space-y-8">
          <SettingsSection name="Views" description={VIEWS_DESCRIPTION}>
            <div className="space-y-0.5">
              {navPages.map((page) => (
                <PinRow
                  key={page.key}
                  name={page.name}
                  description={page.question}
                  icon={page.icon}
                  /* Desk is present whatever the stored list says, which is
                     the sidebar's rule too: a stale `false` written before
                     the rule existed must not hide it, and a rule that only
                     holds for new data is not a rule. */
                  pinned={!page.pinnable || pinned.has(page.key)}
                  locked={!page.pinnable}
                  onPinnedChange={(next) => {
                    setNativePinned(page, next)
                  }}
                />
              ))}
              {/* 9.7's "native and saved alike". Last, because 9.1 fixes the
                  order of the nine above and a person's own views are not in
                  it. */}
              {(savedViews.data ?? []).map((view) => (
                <PinRow
                  key={view.id}
                  name={view.name}
                  description={savedViewLine(view)}
                  icon={Bookmark}
                  pinned={view.pinned}
                  onPinnedChange={(next) => {
                    patchSavedView.mutate({ id: view.id, body: { pinned: next } })
                  }}
                />
              ))}
            </div>
            {/* Said once, where the one locked row is, rather than as a list
                of names somebody has to keep in step with the page set. */}
            <p className="mt-3 px-2 text-xs text-muted-foreground">{DESK_LOCKED}</p>
          </SettingsSection>

          <SettingsSection name="Account">
            <div className="space-y-0.5">
              <div className="flex min-h-16 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
                <PersonFace
                  name={displayName === '' ? (me.data?.user.email ?? '') : displayName}
                  initials={initialsOf(
                    displayName === '' ? (me.data?.user.email ?? '') : displayName,
                  )}
                  className="size-10"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {me.data?.user.email ?? ''} · Google account
                  </p>
                </div>
              </div>

              <div className="flex min-h-16 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
                <div className="flex size-10 shrink-0 items-center justify-center text-[var(--color-graphite-500)]">
                  <Globe2 className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {me.data?.user.timezone ?? ''}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{TIMEZONE_NOTE}</p>
                </div>
              </div>

              <SettingRow
                title="People and connections"
                description="Manage people available for quick folder sharing."
                control={
                  <Button
                    variant="outline"
                    className="h-8 gap-2 px-3 text-xs"
                    render={<Link to={paths.people} />}
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
                  <Button
                    variant="ghost"
                    className="h-8 gap-2 px-3 text-xs"
                    onClick={() => {
                      void mutateApi(null, { method: 'POST', path: '/auth/logout' }).finally(() => {
                        window.location.assign(paths.landing)
                      })
                    }}
                  >
                    <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    Sign out
                  </Button>
                }
              />
            </div>
          </SettingsSection>

          {/* 10.6: Settings carries a short install hint and no custom prompt
              interception in v1, so this is a sentence and not a control. */}
          <SettingsSection
            name="Install Dana"
            description="Install Dana from your browser to open it like a regular desktop app."
          >
            <div className="flex min-h-14 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
              <div className="flex size-10 shrink-0 items-center justify-center text-[var(--color-graphite-500)]">
                <Download className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                Install Dana from your browser&apos;s own install control to keep it a tap away.
              </p>
              <span className="shrink-0 rounded-md border border-[var(--color-graphite-200)] bg-[var(--color-graphite-25)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-graphite-600)]">
                Browser menu
              </span>
            </div>
          </SettingsSection>

          <SettingsSection name="Danger zone" description="Account deletion is permanent." danger>
            <div className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--color-danger-200)] bg-[var(--color-danger-100)]/45 px-3">
              <Trash2
                className="size-5 shrink-0 text-[var(--color-danger-700)]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-danger-700)]">
                  Delete account
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-graphite-600)]">
                  Review the consequences before continuing.
                </p>
              </div>
              <Button
                variant="destructive"
                className="h-8 px-3 text-xs"
                onClick={() => {
                  setDeleteOpen(true)
                }}
              >
                Delete account
              </Button>
            </div>
          </SettingsSection>
        </div>
      </PageBody>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setConfirmation('')
        }}
      >
        <AlertDialogContent>
          {/* 9.7's two sentences, one text run. */}
          <AlertDialogDescription className="text-sm leading-5 text-foreground">
            {DELETE_ACCOUNT}
          </AlertDialogDescription>
          <div>
            <label
              htmlFor="delete-confirmation"
              className="text-xs font-medium text-foreground"
            >
              Type DELETE to confirm
            </label>
            <Input
              id="delete-confirmation"
              value={confirmation}
              autoComplete="off"
              className="mt-2 h-[var(--control-height)] bg-white px-3 font-mono text-sm md:text-sm"
              onChange={(event) => {
                setConfirmation(event.target.value)
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              disabled={confirmation !== 'DELETE'}
              onClick={() => {
                // 7.1 requires the literal string in the body, and the server
                // runs 8.10 and destroys every session; there is nothing left
                // to navigate a signed-in client to.
                void mutateApi(null, {
                  method: 'DELETE',
                  path: '/me',
                  body: { confirm: 'DELETE' },
                }).then(() => {
                  window.location.assign(paths.landing)
                })
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
