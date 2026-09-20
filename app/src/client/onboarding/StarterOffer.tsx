/*
9.13's first-run offer, drawn on Desk beneath the folder page.

**Fresh is two facts and a dismissal.** 9.13: the account holds no folder but
Desk and no task anywhere. The first is `useFolders`, which the shell has
already read to draw the sidebar. The second is the All view, and it is
mounted here rather than in `DeskPage` so that it is requested only by an
account that has already passed the cheap check: a person with folders never
issues it, which is every person after their first hour.

**The offer lives here and not in the folder page.** 9.13 puts it beneath
Desk's empty state, and `FolderPage` is S12's file; `DeskPage` is the seam
that already exists between the route and that page, so the offer renders
after it and reaches across nothing. A fresh Desk has no tasks, so the folder
page above is showing its own empty state and this sits directly under it,
which is what that section asks for.

**Dismissal is local to the device**, in `localStorage`. 9.13 says a person
who answers the offer has left first run, and the import answers it in the
database by making the account no longer fresh. A dismissal has nothing to
change, so it needs somewhere to live, and the alternative is a key on the
4.19 settings bundle, which is the Query role's file and a migration. That
trade is not worth a person on a second device seeing one card once, and it
is recorded here rather than discovered later.

**Nothing here is special-cased.** Choosing a starter posts an ordinary
7.16 workflow file, and the folders it creates are folders. On success the
person is taken into what they just made, because an example nobody opens
teaches nothing.
*/
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useImportWorkflow } from '../api/mutations.js'
import { useAllView, useFolders } from '../api/queries.js'
import { Button } from '../components/ui/button.js'
import { paths } from '../routes.js'

import { STARTERS, type Starter } from './starters.js'

/** 9.13's copy, normative. */
const COPY = {
  heading: 'Start with an example',
  body:
    'Import a worked example to see how Dana holds a real piece of work. ' +
    'Nothing here is fixed: change anything, or delete it all.',
  dismiss: 'No thanks',
} as const

const DISMISSED_KEY = 'dana.starters.dismissed'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Private modes and blocked storage throw on read. An offer that cannot
    // remember a dismissal is better than a Desk that cannot render.
    return false
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    /* As above: the dismissal is lost, the page is not. */
  }
}

/**
 * The cheap half of 9.13's freshness test, and the only half `DeskPage` runs.
 * A person with one folder that is Desk may be fresh; anyone else is not.
 */
export function useMayBeFresh(): boolean {
  const folders = useFolders()
  const list = folders.data
  if (list === undefined) return false
  return list.length === 1 && list[0]?.is_default === true
}

function StarterCard({
  starter,
  onChoose,
  busy,
}: {
  readonly starter: Starter
  readonly onChoose: (starter: Starter) => void
  readonly busy: boolean
}): React.JSX.Element {
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={() => {
        onChoose(starter)
      }}
      className="flex h-auto min-h-32 flex-col items-start justify-start gap-2 rounded-[14px] p-4 text-left whitespace-normal"
    >
      <span className="text-sm font-semibold">{starter.label}</span>
      <span className="text-xs leading-5 font-normal text-muted-foreground">
        {starter.summary}
      </span>
    </Button>
  )
}

export function StarterOffer(): React.JSX.Element | null {
  const navigate = useNavigate()
  const importWorkflow = useImportWorkflow()
  const [dismissed, setDismissed] = useState(readDismissed)
  /*
  The expensive half of the freshness test. `DeskPage` has already checked the
  cheap half, so this only ever runs for an account that has one folder and it
  is Desk.
  */
  const all = useAllView()

  if (dismissed) return null
  // Not "no rows yet": an unread view is not an empty one, and drawing the
  // offer while the answer is outstanding would flash it at every person who
  // ever deletes their way back down to one folder.
  if (all.data === undefined) return null
  /*
  Q5 hands All back already partitioned into the dated and the undated, which
  AC-070 stated as covering every task with no gap and no overlap. **AC-070 has
  no test file**: it went in the 2026-09-20 cut, and 06.1's own dated correction
  says what stands in for it. So all three
  arrays empty is "no task anywhere" in that criterion's own terms, and reading
  one of them would be reading half the account.
  */
  const taskCount =
    all.data.planned.length + all.data.tasks_inbox.length + all.data.tasks_groups.length
  if (taskCount > 0) return null

  const choose = (starter: Starter): void => {
    importWorkflow.mutate(starter.file, {
      onSuccess: (result) => {
        const first = result.folders[0]
        if (first !== undefined) void navigate(paths.folder(first.id))
      },
    })
  }

  return (
    <section
      aria-labelledby="starter-offer-heading"
      className="mx-auto w-full max-w-[var(--shell-content-max)] px-6 pb-10"
    >
      <div className="rounded-[18px] bg-muted/50 p-5 sm:p-6">
        <h2 id="starter-offer-heading" className="text-base font-semibold tracking-[-0.02em]">
          {COPY.heading}
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted-foreground">{COPY.body}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {STARTERS.map((starter) => (
            <StarterCard
              key={starter.id}
              starter={starter}
              onChoose={choose}
              busy={importWorkflow.isPending}
            />
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-4"
          disabled={importWorkflow.isPending}
          onClick={() => {
            writeDismissed()
            setDismissed(true)
          }}
        >
          {COPY.dismiss}
        </Button>
      </div>
    </section>
  )
}
