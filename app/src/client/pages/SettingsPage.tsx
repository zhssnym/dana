/*
9.7's Settings page, at /app/settings.

**This file owns the route wiring and server reads.** The visible layout is
`components/settings-page-content.tsx`, which receives what it needs instead of
opening a second settings query inside presentation code. What the page adds is
the sample workspace's confirm and 7.1's `DELETE /me`, whose body carries the
literal the person typed and after which there is nothing left to navigate a
signed-in client to.
*/
import { mutateApi } from '../api/http.js'
import { useBundle } from '../api/queries.js'
import { SettingsPageContent } from '../components/settings-page-content.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { SAMPLE_COPY, useSampleActs } from '../onboarding/sample.js'
import { paths } from '../routes.js'

export function SettingsPage(): React.JSX.Element {
  const bundle = useBundle()
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
