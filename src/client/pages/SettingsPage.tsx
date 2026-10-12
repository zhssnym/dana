/* Settings: route wiring and server reads. The layout is `components/settings-page-content.tsx`. */
import { useState } from 'react'

import { mutateApi } from '../api/http.js'
import { useBundle } from '../api/queries.js'
import { SettingsPageContent } from '../components/settings-page-content.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { paths } from '../routes.js'

export function SettingsPage(): React.JSX.Element {
  const bundle = useBundle()
  const [deleting, setDeleting] = useState(false)

  return (
    <>
      <SettingsPageContent
        previewState={bundle.isPending ? 'loading' : bundle.isError ? 'error' : null}
        onDeleteAccount={() => setDeleting(true)}
      />
      {deleting ? (
        <ConfirmDialog
          message="Delete your Dana account?"
          description="Shared pages you own must be handed on or deleted first, and Dana names them; private pages and their tasks are deleted for good."
          requireText="DELETE"
          confirmLabel="Delete account"
          cancelLabel="Cancel"
          onCancel={() => setDeleting(false)}
          onContinue={() => {
            setDeleting(false)
            /* The server needs the typed literal in the body, then destroys every session. */
            void mutateApi(null, {
              method: 'DELETE',
              path: '/me',
              body: { confirm: 'DELETE' },
            }).then(() => {
              window.location.assign(paths.landing)
            })
          }}
        />
      ) : null}
    </>
  )
}
