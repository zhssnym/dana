/* First-run offer (spec 9.13): replaces Today's empty state for a fresh account. Dismissal is per device. */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'

import { useImportWorkflow } from '../api/mutations.js'
import { useAllView, useFolders } from '../api/queries.js'
import { Row } from '../components/ui/row.js'
import { paths } from '../routes.js'

import { STARTERS, type Starter } from './starters.js'

/** Spec 9.13 copy, normative. */
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

export function dismissStarters(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    /* The dismissal is lost, the page is not. */
  }
}

/** The cheap half of the freshness test: one page, and it is Desk. */
export function useMayBeFresh(): boolean {
  const folders = useFolders()
  const list = folders.data
  if (list === undefined) return false
  return list.length === 1 && list[0]?.is_default === true
}

/**
 * `quickAdd` keeps one place in the tree in both states: the first task ends the offer, and a remounted input
 * would drop focus and the keys typed after Enter.
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
          {/* A row action like any other, not set apart. */}
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
