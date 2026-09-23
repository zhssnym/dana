/*
9.7's Settings page, at /app/settings.

**This file owns the route wiring and server reads.** The visible Settings
layout is `components/settings-page-content.tsx`, which receives the data it
needs instead of opening a second settings query inside presentation code.

What the page supplies is what the screen cannot know: the saved views of
4.19 and the write that pins one, where People lives, how a session ends,
and 7.1's `DELETE /me`, whose body carries the literal the person typed and
after which there is nothing left to navigate a signed-in client to.

**Storage used against 10.3's quota is the one thing 9.7 names that is still
not here**: nothing reports the total, and a label with an invented figure
under it is worse than an absent label.
*/
import { useNavigate } from 'react-router'

import { mutateApi } from '../api/http.js'
import { usePatchSavedView } from '../api/mutations.js'
import { useBundle, useSavedViews } from '../api/queries.js'
import { SettingsPageContent } from '../components/settings-page-content.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { SAMPLE_COPY, useSampleActs } from '../onboarding/sample.js'
import { paths } from '../routes.js'
import { signOut } from '../shell/session.js'

export function SettingsPage(): React.JSX.Element {
  const navigate = useNavigate()
  const bundle = useBundle()
  const savedViews = useSavedViews()
  const patchSavedView = usePatchSavedView()
  /* Item 60: the sample workspace's row, over the same hook as the strip. */
  const sample = useSampleActs()

  return (
    <>
      <SettingsPageContent
        sample={
          sample.present === undefined
            ? null
            : {
                present: sample.present,
                busy: sample.busy,
                tasks: sample.counts?.tasks ?? 0,
                folders: sample.counts?.folders ?? 0,
              }
        }
        onRemoveSample={sample.askRemove}
        onRestoreSample={sample.restore}
        previewState={bundle.isPending ? 'loading' : bundle.isError ? 'error' : null}
        taskOpen={bundle.data?.task_open ?? 'dialog'}
        savedViews={savedViews.data ?? []}
        onPinSavedView={(id, pinned) => {
          patchSavedView.mutate({ id, body: { pinned } })
        }}
        onOpenPeople={() => {
          void navigate(paths.people)
        }}
        onSignOut={signOut}
        onDeleteAccount={() => {
          /* 7.1 requires the literal string in the body, and the server runs
             8.10 and destroys every session. */
          void mutateApi(null, {
            method: 'DELETE',
            path: '/me',
            body: { confirm: 'DELETE' },
          }).then(() => {
            window.location.assign(paths.landing)
          })
        }}
      />
      {sample.confirming ? (
        <ConfirmDialog
          message={SAMPLE_COPY.confirm}
          onContinue={sample.remove}
          onCancel={sample.cancelRemove}
        />
      ) : null}
    </>
  )
}
