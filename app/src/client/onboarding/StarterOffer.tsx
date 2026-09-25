/*
9.13's first-run offer. For a fresh account it takes the place of Today's empty
state: a heading line, one plain row per starter, and "No thanks".

**Fresh is two facts and a dismissal.** 9.13: the account holds no page but
Desk and no task anywhere. The page runs the cheap half (`useMayBeFresh`);
this component reads the All view only for an account that passed it.
Dismissal is local to the device, in `localStorage`.

Choosing a starter posts an ordinary 7.16 import and opens what it made.
*/
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'

import { useImportWorkflow } from '../api/mutations.js'
import { useAllView, useFolders } from '../api/queries.js'
import { Row } from '../components/ui/row.js'
import { paths } from '../routes.js'

import { STARTERS, type Starter } from './starters.js'

/** 9.13's copy, normative. */
const COPY = {
  heading: 'Start with an example',
  dismiss: 'No thanks',
} as const

const DISMISSED_KEY = 'dana.starters.dismissed'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** Answers the offer for this device: "No thanks", or removing the sample. */
export function dismissStarters(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    /* The dismissal is lost, the page is not. */
  }
}

/** The cheap half of 9.13's freshness test: one page, and it is Desk. */
export function useMayBeFresh(): boolean {
  const folders = useFolders()
  const list = folders.data
  if (list === undefined) return false
  return list.length === 1 && list[0]?.is_default === true
}

/**
 * The offer when the account is fresh and has not dismissed it, in place of
 * `body` and after `quickAdd` (the page's own "New task", which comes first);
 * otherwise `body` then `quickAdd`, the list's own order.
 *
 * `quickAdd` keeps one place in the tree in both states: the first task a
 * fresh person adds ends the offer, and an input remounted elsewhere would
 * drop focus and the keystrokes typed after Enter.
 */
export function StarterOffer({
  body,
  quickAdd,
}: {
  readonly body: ReactNode
  readonly quickAdd: ReactNode
}): React.JSX.Element {
  const navigate = useNavigate()
  const importWorkflow = useImportWorkflow()
  const [dismissed, setDismissed] = useState(readDismissed)
  const all = useAllView()

  // An unread view is not an empty one: wait for the answer.
  const taskCount =
    all.data === undefined
      ? null
      : all.data.planned.length + all.data.tasks_inbox.length + all.data.tasks_groups.length
  const shown = !dismissed && taskCount === 0

  const choose = (starter: Starter): void => {
    if (importWorkflow.isPending) return
    importWorkflow.mutate(starter.file, {
      onSuccess: (result) => {
        const first = result.folders[0]
        if (first !== undefined) void navigate(paths.folder(first.id))
      },
    })
  }

  return (
    <div className={shown ? 'space-y-[var(--space-group)]' : undefined}>
      {shown ? null : body}
      {quickAdd}
      {!shown ? null : (
        <section
          aria-labelledby="starter-offer-heading"
          className="-mx-0.5 flex flex-col gap-[var(--space-row)]"
        >
          <h2 id="starter-offer-heading" className="px-2 pb-1 text-sm font-section text-foreground">
            {COPY.heading}
          </h2>
          {STARTERS.map((starter) => (
            <Row
              key={starter.id}
              aria-disabled={importWorkflow.isPending}
              label={starter.label}
              description={starter.summary}
              onClick={() => {
                choose(starter)
              }}
            />
          ))}
          {/* A row action like any other: 2px under the rows, not set apart. */}
          <Row
            aria-disabled={importWorkflow.isPending}
            label={<span className="text-muted-foreground">{COPY.dismiss}</span>}
            onClick={() => {
              if (importWorkflow.isPending) return
              dismissStarters()
              setDismissed(true)
            }}
          />
        </section>
      )}
    </div>
  )
}
