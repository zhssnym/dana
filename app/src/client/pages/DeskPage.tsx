/*
Desk, at /app.

9.1: "/app renders Desk, the account's default folder, which is where the
product lands a person with nothing else asked for." So Desk is not a seventh
kind of page. It is the folder page of 9.6 pointed at one particular folder,
and it is drawn by that page rather than by a copy of it, which is the whole
reason `FolderPage` takes an optional id.

**The folder's identity is data rather than an address**, and it is the only
page in 9.1's table of which that is true. 10.6 fixes the installed app's
start_url at /app, so the id cannot be in the path; the account's default
folder is the one carrying `is_default`, which 4.3 guarantees exists and
INV-2 guarantees cannot be deleted.

**Desk keeps its name whatever the folder is called.** 4.3 lets an owner
rename their default folder and S2's migration renamed the untouched ones
from Inbox to Desk; the sidebar entry is a fixed string in 9.1's page block
either way, so a person who renames it still finds the page where it was.
The page's own heading is the folder's name, because that is what 9.6 draws
and the folder is what they renamed.

**A failed folder read is the page's own failure**, drawn with 9.1's inline
line rather than the global toast: nothing was being saved. The skeleton and
the error come from the shared state patterns for the same reason every other
page uses them, which is that a page inventing its own is the hazard 9.1's
state vocabulary exists to prevent.
*/
import { useFolders } from '../api/queries.js'
import { InlineError, SkeletonList } from '../components/state-patterns.js'
import { SampleStrip } from '../onboarding/SampleStrip.js'
import { StarterOffer, useMayBeFresh } from '../onboarding/StarterOffer.js'

import { FolderPage } from './FolderPage.js'

export function DeskPage(): React.JSX.Element {
  const folders = useFolders()
  /*
  9.13's offer, beneath the folder page rather than inside it: `FolderPage` is
  S12's file and this seam already exists. The cheap half of the freshness
  test is run here so that the All view the other half needs is never mounted
  for an account that has folders, which is every account after the first one.
  */
  const mayBeFresh = useMayBeFresh()

  if (folders.isPending) {
    return (
      <main className="mx-auto w-full max-w-[var(--shell-content-max)] px-6 py-6">
        <SkeletonList />
      </main>
    )
  }

  const desk = folders.data?.find((folder) => folder.is_default)
  if (desk === undefined) {
    return (
      <main className="mx-auto w-full max-w-[var(--shell-content-max)] px-6 py-6">
        <InlineError onRetry={() => void folders.refetch()} />
      </main>
    )
  }

  return (
    <>
      {/* Item 60's strip, above the page while the sample is present. The
          starter offer below it needs no change: 9.13's freshness test
          fails while the sample's folders exist, and passes again the
          moment removal empties the account. */}
      <div className="px-6">
        <SampleStrip />
      </div>
      <FolderPage folderId={desk.id} />
      {mayBeFresh ? <StarterOffer /> : null}
    </>
  )
}
