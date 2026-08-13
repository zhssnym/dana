/*
9.7's Settings page: Pages, Account, Danger zone, which are also its three
region names in 9.1's table.

The three toggles are the control AC-095 measures the sidebar through. Each is
a switch whose accessible name is the page it hides, and the one-line
description is `aria-describedby` rather than part of the label, so the name
stays the page's name: a switch called "Important Starred pending and
abandoned tasks" would be a control no table fixes and no test can ask for.

The note under the trio and the danger zone's two sentences are normative copy
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

import type { Settings } from '../../shared/me.js'
import { mutateApi } from '../api/http.js'
import { useUpdateSettings } from '../api/mutations.js'
import { useMe, useSettings } from '../api/queries.js'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
} from '../components/ui/alert-dialog.js'
import { Avatar, AvatarFallback } from '../components/ui/avatar.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Switch } from '../components/ui/switch.js'
import { initialsOf } from '../parts/presenters.js'
import { paths } from '../routes.js'
import { PageHeading } from './page-heading.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'

/** 9.7, verbatim. */
const ALWAYS_SHOWN = 'My Day, Tasks, and Planned are always shown.'

/** 9.7's danger zone, verbatim. */
const DELETE_ACCOUNT =
  'Folders you share will be handed to their longest-standing member. ' +
  'Private folders and their tasks are permanently deleted.'

/** 9.7, the note beside the detected timezone. */
const TIMEZONE_NOTE = "Dana follows your device's timezone automatically"

const TOGGLES = [
  {
    key: 'show_important',
    name: 'Important',
    description: 'Starred pending and abandoned tasks.',
  },
  {
    key: 'show_all',
    name: 'All',
    description: 'Planned and undated tasks in one view.',
  },
  {
    key: 'show_done',
    name: 'Done',
    description: 'Completed task history.',
  },
] as const satisfies readonly {
  key: keyof Settings
  name: string
  description: string
}[]

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
}: {
  readonly title: string
  readonly description: string
  readonly control: ReactNode
}): React.JSX.Element {
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

export function SettingsPage(): React.JSX.Element {
  const settings = useSettings()
  const me = useMe()
  const update = useUpdateSettings()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  const displayName = me.data?.user.display_name ?? ''

  return (
    <div className="space-y-7">
      <PageHeading icon={Settings2} title="Settings" subtitle="Preferences and account" />

      <PageBody query={settings} isEmpty={false} emptyCopy="">
        <div className="max-w-[820px] space-y-8">
          <SettingsSection
            name="Pages"
            description="Choose which optional pages appear in the sidebar. This does not change or delete any tasks."
          >
            <div className="space-y-0.5">
              {TOGGLES.map((toggle) => (
                <SettingRow
                  key={toggle.key}
                  title={toggle.name}
                  description={toggle.description}
                  control={
                    <Switch
                      aria-label={toggle.name}
                      aria-describedby={`setting-${toggle.key}-description`}
                      checked={settings.data?.[toggle.key] ?? false}
                      onCheckedChange={(checked) => {
                        update.mutate({ [toggle.key]: checked })
                      }}
                    />
                  }
                />
              ))}
              {/* The switch descriptions, addressable for aria-describedby. */}
              {TOGGLES.map((toggle) => (
                <span key={toggle.key} id={`setting-${toggle.key}-description`} hidden>
                  {toggle.description}
                </span>
              ))}
            </div>
            <p className="mt-3 px-2 text-xs text-muted-foreground">{ALWAYS_SHOWN}</p>
          </SettingsSection>

          <SettingsSection name="Account">
            <div className="space-y-0.5">
              <div className="flex min-h-16 items-center gap-3 rounded-lg px-2 hover:bg-[var(--color-graphite-50)]">
                <Avatar className="size-10">
                  <AvatarFallback className="bg-[var(--color-graphite-200)] text-xs font-medium text-[var(--color-graphite-700)]">
                    {initialsOf(displayName === '' ? (me.data?.user.email ?? '') : displayName)}
                  </AvatarFallback>
                </Avatar>
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
