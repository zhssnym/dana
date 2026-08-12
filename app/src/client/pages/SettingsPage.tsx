/*
9.7's Settings page: Pages, Account, Danger zone, which are also its three
region names in 9.1's table.

The three toggles are the control AC-095 measures the sidebar through. Each is
a switch whose accessible name is the page it hides, and the one-line
description is `aria-describedby` rather than part of the label, so the name
stays the page's name: a switch called "Important Hide the Important page"
would be a control no table fixes and no test can ask for.

The note under the trio and the danger zone's two sentences are normative copy
and are transcribed.
*/
import { useState } from 'react'

import type { Settings } from '../../shared/me.js'
import { mutateApi } from '../api/http.js'
import { useUpdateSettings } from '../api/mutations.js'
import { useMe, useSettings } from '../api/queries.js'
import { paths } from '../routes.js'
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
    description: 'Show the page of everything you have starred.',
  },
  {
    key: 'show_all',
    name: 'All',
    description: 'Show one page carrying Planned and Tasks together.',
  },
  {
    key: 'show_done',
    name: 'Done',
    description: 'Show the history of what you have completed.',
  },
] as const satisfies readonly {
  key: keyof Settings
  name: string
  description: string
}[]

export function SettingsPage(): React.JSX.Element {
  const settings = useSettings()
  const me = useMe()
  const update = useUpdateSettings()
  const [confirmation, setConfirmation] = useState('')

  return (
    <div className="space-y-6">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
      </header>

      <PageSection name="Pages" heading="Pages">
        <PageBody query={settings} isEmpty={false} emptyCopy="">
          {/* No class names a settings row, so each one's shape is placed with
              layout utilities and the name is recorded for row 4b. The order
              inside is the DOM order it has always had, label then input then
              description: the description wraps to its own line by taking the
              full width rather than by moving. */}
          <ul className="list-card">
            {TOGGLES.map((toggle) => (
              <li
                key={toggle.key}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3"
              >
                <label className="text-label flex-1" htmlFor={`setting-${toggle.key}`}>{toggle.name}</label>
                <input
                  id={`setting-${toggle.key}`}
                  type="checkbox"
                  className="switch"
                  role="switch"
                  aria-describedby={`setting-${toggle.key}-description`}
                  checked={settings.data?.[toggle.key] ?? false}
                  onChange={(event) => {
                    update.mutate({ [toggle.key]: event.target.checked })
                  }}
                />
                <span className="field-hint w-full" id={`setting-${toggle.key}-description`}>{toggle.description}</span>
              </li>
            ))}
          </ul>
          <p className="field-hint">{ALWAYS_SHOWN}</p>
        </PageBody>
      </PageSection>

      <PageSection name="Account" heading="Account">
        <p className="section-heading">{me.data?.user.display_name ?? ''}</p>
        <p className="meta">{me.data?.user.email ?? ''}</p>
        <p className="meta">{me.data?.user.timezone ?? ''}</p>
        <p className="meta">{TIMEZONE_NOTE}</p>
        {/* 10.6: Settings carries a short install hint and no custom prompt
            interception in v1, so this is a sentence and not a control. */}
        <p className="field-hint">
          Install Dana from your browser&apos;s own install control to keep it a tap away.
        </p>
        <button
          className="button-base button-default"
          type="button"
          onClick={() => {
            void mutateApi(null, { method: 'POST', path: '/auth/logout' }).finally(() => {
              window.location.assign(paths.landing)
            })
          }}
        >
          Sign out
        </button>
      </PageSection>

      <PageSection name="Danger zone" heading="Danger zone">
        <p className="empty-state-text">{DELETE_ACCOUNT}</p>
        <label className="text-label" htmlFor="delete-confirmation">Type DELETE to confirm</label>
        <input
          id="delete-confirmation"
          className="input-base"
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <button
          className="button-base button-danger"
          type="button"
          disabled={confirmation !== 'DELETE'}
          onClick={() => {
            // 7.1 requires the literal string in the body, and the server runs
            // 8.10 and destroys every session; there is nothing left to
            // navigate a signed-in client to.
            void mutateApi(null, {
              method: 'DELETE',
              path: '/me',
              body: { confirm: 'DELETE' },
            }).then(() => {
              window.location.assign(paths.landing)
            })
          }}
        >
          Delete account
        </button>
      </PageSection>
    </div>
  )
}
