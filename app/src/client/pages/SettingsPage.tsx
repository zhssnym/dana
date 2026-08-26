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

**Appearance arrived at S17b**, assigned here by RFC 0005 change control item
30 after S16 found it belonged to no package. Its four fields, theme, row
density, the clock and where a task opens, had been in the 4.19 bundle since
S7 with no control anywhere, so the client "persists four preferences a person
has no way to set". A switch that changes no row is that defect one level
down, so three of the four drive the client as well as the column: the theme
and the density land on the document through `shell/appearance.ts`, and the
clock is written into `lib/time-format.ts`, the one place a time becomes
words, which S17b also had to repoint because `presenters.ts` was writing a
row's due time at a fixed 24 hours and never asking.

**The fourth is honest about its consumer and this is where that is
recorded.** Where a task opens has three values, dialog, panel and tab, and
the surface that could answer to all three is the v2 task surface of DES-117
and DES-136, whose five homes S15's own log row reports as not ported;
`components/task-form/**` is the Complex Interaction engineer's and is
outside this package besides. So the control exists, the column is written,
and the preference is read by the surface that arrives with that port. What
item 30 recorded, a preference with no way in, is closed for all four; what
remains is one preference whose reader is owed, which is a smaller and
differently-shaped thing and is named in S17b's log row rather than left for
somebody to find.

**Storage used against 10.3's quota is the one thing 9.7 names that is still
not here**, and it is not this package's to invent. The quota is real and
enforced, `server/domain/files.ts` holding it at 1 GB and refusing an upload
that would cross it, and nothing reports the total: no `storage_used` exists
anywhere in `app/src` or `docs/spec`, and `server/routes/files.ts` offers
upload, fetch and delete with no listing to sum. So the line waits on a read,
escalated at RFC 0005 change control item 35 (c) with a recommendation, and
the alternative, a client-side estimate or a label with an invented figure
under it, is worse than an absent label.

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
import {
  Bookmark,
  /* DES-205's three theme glyphs and the three rows beside it, all through
     the icon module of DES-125 rather than lucide directly. */
  Clock3 as Clock,
  ListTodo,
  Monitor,
  Moon,
  PanelRight,
  Sun,
} from '../lib/icons.js'
import type { LucideIcon } from '../lib/icons.js'
import { DEFAULT_PINNED } from '../../shared/bundle.js'
import type { SettingsBundle } from '../../shared/bundle.js'
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

/*
Appearance, its four rows and the sentence each of them says about the value
it is holding (9.7, DES-205, DES-113).

**The section's own line is the designer's**, from `settings-screen.tsx`, and
it earns its place: this is the one section of Settings whose rows change what
a person sees rather than what Dana holds, and saying so is what stops somebody
looking here for a way to change a task.

**Each row's description is the value in words rather than a restatement of
the label.** His two do exactly that, "Following your device" under Theme and
"Two lines, the title, then its details underneath" under Row height, so the
row answers "what is this set to" without the reader parsing a segmented
control. The two rows section 9 adds are written to the same rule.

**The density labels are 9.7's `comfortable` and `compact` and not the
prototype's "Two lines" and "One line".** The column is 4.19's and those are
its two values; his words describe DES-113's two row *shapes*, which need the
v2 task row that S15's log row records as not ported. So the control writes the
preference the section names, and the description says what it does today
rather than promising the shape that has not arrived.
*/
const APPEARANCE_DESCRIPTION = 'How Dana draws your work. Nothing here changes a task.'

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: SettingsBundle['theme']; label: string }[]

const THEME_NOTE: Record<SettingsBundle['theme'], string> = {
  system: 'Following your device',
  light: 'Light, whatever your device says',
  dark: 'Dark, whatever your device says',
}

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
] as const satisfies readonly { value: SettingsBundle['row_density']; label: string }[]

const DENSITY_NOTE: Record<SettingsBundle['row_density'], string> = {
  comfortable: 'Lists breathe, with space between rows',
  compact: 'Lists close up, so more fits on a screen',
}

const CLOCK_OPTIONS = [
  { value: '12h', label: '12-hour' },
  { value: '24h', label: '24-hour' },
] as const satisfies readonly { value: SettingsBundle['clock']; label: string }[]

const CLOCK_NOTE: Record<SettingsBundle['clock'], string> = {
  '12h': 'Times read 5:30 PM',
  '24h': 'Times read 17:30',
}

const TASK_OPEN_OPTIONS = [
  { value: 'dialog', label: 'Dialog' },
  { value: 'panel', label: 'Panel' },
  { value: 'tab', label: 'Tab' },
] as const satisfies readonly { value: SettingsBundle['task_open']; label: string }[]

const TASK_OPEN_NOTE: Record<SettingsBundle['task_open'], string> = {
  dialog: 'Over the page you were on',
  panel: 'Beside it, at the right edge',
  tab: 'As a tab of its own',
}

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
 * A segmented set of exclusive choices, the designer's own control for the
 * Appearance rows.
 *
 * A `radiogroup` of `radio`s rather than a select or a switch, which is his
 * shape and 9.1's addressing rule agreeing: the group carries the setting's
 * name and each option carries its own, so a criterion asks for "Dark" within
 * "Theme" and cannot be answered by the wrong control on the same page. Two
 * options or three, the control is one; nothing here special-cases a pair.
 */
function Choice<T extends string>({
  label,
  value,
  options,
  onSelect,
}: {
  readonly label: string
  readonly value: T
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly onSelect: (next: T) => void
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-lg bg-[var(--color-graphite-100)] p-0.5"
    >
      {options.map((option) => {
        const current = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={current}
            onClick={() => {
              onSelect(option.value)
            }}
            className={
              current
                ? 'h-7 rounded-md bg-card px-2.5 text-xs font-medium text-[var(--color-graphite-900)] shadow-[var(--elevation-1)] transition-colors'
                : 'h-7 rounded-md px-2.5 text-xs font-medium text-[var(--color-graphite-600)] transition-colors hover:text-[var(--color-graphite-900)]'
            }
          >
            {option.label}
          </button>
        )
      })}
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

  /*
  Appearance's four, from the same bundle and with 4.19's own defaults where
  the read has not answered.

  The falls are the column defaults rather than a guess: a control that
  rendered nothing selected while the bundle was in flight would flicker into
  a value a moment later, and a control that showed the wrong value would
  invite a press that writes what was already true.
  */
  const theme = bundle.data?.theme ?? 'system'
  const density = bundle.data?.row_density ?? 'comfortable'
  const clock = bundle.data?.clock ?? '12h'
  const taskOpen = bundle.data?.task_open ?? 'dialog'

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

          {/*
          9.7's Appearance section, built at S17b, which RFC 0005 change
          control item 30 assigned here after S16 found it belonged to no
          package. That item's own words are what this closes: the four fields
          have been in the 4.19 bundle since S7 with no control for any of
          them, so "the client persists four preferences a person has no way
          to set".

          **All four, where the prototype draws two.** `settings-screen.tsx`
          offers Row height and Theme and no clock and no task-open control.
          11.13 settles that without an escalation, "section 9 always wins over
          any design artifact on structure and copy", and 9.7 names four: the
          prototype is short here rather than contradictory, so its two arrive
          in its shape and the other two arrive beside them in the same idiom.

          **Theme is here and nowhere else** (DES-205, in the designer's own
          words): not the account menu, which "is about *you*, your picture,
          your sign-out, help with the app", where a theme is about how Dana
          draws; and not the window bar, because "a control in the chrome is a
          control you press by accident, and nobody changes their theme often
          enough to pay rent in the bar".

          **Each is a radiogroup and never a switch**, which is his reason and
          not a house style: neither value is the absence of the other. A
          switch labelled "Compact" makes the taller row the *unchecked*
          state, when DES-113's whole argument is that it is the considered
          default rather than the leftover.
          */}
          <SettingsSection name="Appearance" description={APPEARANCE_DESCRIPTION}>
            <div className="space-y-0.5">
              <SettingRow
                icon={theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor}
                title="Theme"
                description={THEME_NOTE[theme]}
                control={
                  <Choice
                    label="Theme"
                    value={theme}
                    options={THEME_OPTIONS}
                    onSelect={(next) => {
                      patchBundle.mutate({ theme: next })
                    }}
                  />
                }
              />
              <SettingRow
                icon={ListTodo}
                title="Row density"
                description={DENSITY_NOTE[density]}
                control={
                  <Choice
                    label="Row density"
                    value={density}
                    options={DENSITY_OPTIONS}
                    onSelect={(next) => {
                      patchBundle.mutate({ row_density: next })
                    }}
                  />
                }
              />
              <SettingRow
                icon={Clock}
                title="Clock"
                description={CLOCK_NOTE[clock]}
                control={
                  <Choice
                    label="Clock"
                    value={clock}
                    options={CLOCK_OPTIONS}
                    onSelect={(next) => {
                      patchBundle.mutate({ clock: next })
                    }}
                  />
                }
              />
              <SettingRow
                icon={PanelRight}
                title="Where a task opens"
                description={TASK_OPEN_NOTE[taskOpen]}
                control={
                  <Choice
                    label="Where a task opens"
                    value={taskOpen}
                    options={TASK_OPEN_OPTIONS}
                    onSelect={(next) => {
                      patchBundle.mutate({ task_open: next })
                    }}
                  />
                }
              />
            </div>
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
