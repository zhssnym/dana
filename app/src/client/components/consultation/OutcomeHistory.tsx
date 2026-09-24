/*
A Discussion's Outcome history (#320): every Outcome it has ever had, newest
first, the current one marked. Outcomes are append-only, so this is a record
and never an editor. Hidden until there is at least one.

`focusOutcomeId` comes from an `/app/outcomes/:id` link: the history opens,
that Outcome scrolls into view and is highlighted.
*/
import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'

import { useDiscussionOutcomes } from '../../api/consultation.js'
import { formatAgo } from '../../parts/format-dates.js'
import type { PersonResolver } from '../../lib/thread.js'

export function OutcomeHistory(props: {
  discussionId: string
  personOf: PersonResolver
  focusOutcomeId: string | null
}): React.JSX.Element | null {
  const { discussionId, personOf, focusOutcomeId } = props
  const outcomes = useDiscussionOutcomes(discussionId)
  const [open, setOpen] = useState(focusOutcomeId !== null)
  const focusRef = useRef<HTMLLIElement | null>(null)
  const list = outcomes.data?.outcomes ?? []
  const focusPresent = focusOutcomeId !== null && list.some((o) => o.id === focusOutcomeId)

  /* A link that names an Outcome opens the history even when it arrives
     after mount (the URL changes while this view stays mounted). */
  useEffect(() => {
    if (focusOutcomeId !== null) setOpen(true)
  }, [focusOutcomeId])

  useEffect(() => {
    if (!open || !focusPresent) return
    focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [open, focusPresent])

  if (list.length === 0) return null
  const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const now = Date.now()

  return (
    <section aria-label="Outcome history" className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
        }}
        className="flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        Outcome history ({sorted.length})
      </button>
      {open ? (
        <ol className="divide-y divide-border">
          {sorted.map((outcome) => {
            const focused = outcome.id === focusOutcomeId
            return (
              <li
                key={outcome.id}
                ref={focused ? focusRef : undefined}
                data-focused={focused ? 'true' : undefined}
                aria-current={focused ? 'true' : undefined}
                className={`py-2.5 text-sm ${
                  focused ? '-ml-3 border-l-2 border-foreground pl-2.5' : ''
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {outcome.current ? 'Current' : 'Previous'} · {personOf(outcome.actor_id).name} · {formatAgo(outcome.created_at, now)}
                  </span>
                  {outcome.source_comment_id !== null ? (
                    <span className="text-xs text-muted-foreground">
                      · From a comment
                    </span>
                  ) : null}
                </div>
                <p className="break-words whitespace-pre-wrap text-foreground">
                  {outcome.statement}
                </p>
              </li>
            )
          })}
        </ol>
      ) : null}
    </section>
  )
}
