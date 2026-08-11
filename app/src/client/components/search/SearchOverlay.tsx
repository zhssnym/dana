/*
9.9's search overlay, all nine lines of it.

"Opened by the top-bar control or shortcut; input with 300 ms debounce;
results per Q8 grouped under Pending, Abandoned and Completed headings; enter
opens the first result; row click opens the task; footer 'Showing matches from
every folder you can access.'"

Four of those are worth their reason.

**The debounce is a rate limit in disguise.** 10.4 allows a user 30 searches a
minute, so a client issuing one request per keystroke spends that budget
inside one word and answers the person a 429 for typing. 300 ms is the
specification's own number and the timer below is the whole of it; the query
is keyed by the debounced value, so nothing is fetched for a keystroke that
was still being typed.

**The floor of two characters is Q8's, not this file's.** The query is
disabled below it rather than sent and refused, because Q8's pattern is
'%' q '%' over a trigram index and a one-character query is a scan of every
accessible task with a pattern the index cannot help. What the person sees is
the overlay waiting, which is what it is doing.

**The three headings are the grouping and the ordering read twice.** Q8 sorts
by status_rank over all three ranks, so the server's order already puts the
statuses in blocks; without the headings the page is that order with nothing
saying what changed between two adjacent rows. Section 6's preamble also says
every view returns rows already ordered and clients never re-sort, so this
partitions and never sorts: each group keeps the relative order it arrived in.

**Enter opens the first result, which is the first row of the response** and
not the first row of whichever group happens to be on top. They are the same
row because Q8 ranks pending first, and taking it from the response is what
keeps them the same row when they would otherwise not be.

The rows are drawn here rather than through `components/ui`'s TaskRow: Q8's
row is "title, folder, status chip, due date if any", which is a different and
smaller thing than 9.4's enumerated row, and a row carrying a complete
checkbox and a star would offer transitions inside a search.
*/
import { useEffect, useRef, useState } from 'react'

import { useSearch } from '../../api/queries.js'
import { onOpenSearch } from '../../shell/overlays.js'
import { PageSection } from '../../states/PageSection.js'
import type { TaskCard } from '../../../shared/tasks.js'
import { Chip } from '../ui/index.js'
import { openTask } from '../task-form/index.js'
import { SEARCH_EMPTY, SEARCH_FOOTER } from './copy.js'

/** 9.9's own number. */
const DEBOUNCE_MS = 300

/** 6 Q8's floor, which the endpoint refuses below. */
const MIN_QUERY = 2

/** The three groups of 9.9, in the order that section writes them, which is
 * also 6's status_rank order. */
const GROUPS = [
  { heading: 'Pending', status: 'pending' },
  { heading: 'Abandoned', status: 'abandoned' },
  { heading: 'Completed', status: 'completed' },
] as const

export function SearchOverlay(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [debounced, setDebounced] = useState('')
  const input = useRef<HTMLInputElement | null>(null)

  useEffect(() => onOpenSearch(() => setOpen(true)), [])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(typed), DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [typed])

  useEffect(() => {
    if (!open) return
    input.current?.focus()
  }, [open])

  const term = debounced.trim()
  const results = useSearch(term, open && term.length >= MIN_QUERY)
  const rows = results.data?.rows ?? []

  if (!open) return null

  function close(): void {
    setOpen(false)
    setTyped('')
    setDebounced('')
  }

  function openRow(task: TaskCard): void {
    close()
    openTask(task.id)
  }

  return (
    <div
      className="dialog-scrim"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
          return
        }
        if (event.key !== 'Enter') return
        event.preventDefault()
        // 9.9: enter opens the first result, which is the response's first row
        // rather than the first row of the group drawn at the top.
        const first = rows[0]
        if (first !== undefined) openRow(first)
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Search" className="dialog-panel">
        <input
          ref={input}
          type="search"
          aria-label="Search tasks"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />

        {term.length >= MIN_QUERY && results.data !== undefined && rows.length === 0 ? (
          <p>{SEARCH_EMPTY}</p>
        ) : null}

        {GROUPS.map((group) => {
          const inGroup = rows.filter((row) => row.status === group.status)
          if (inGroup.length === 0) return null
          return (
            <PageSection key={group.status} name={group.heading} heading={group.heading}>
              <ul role="list">
                {inGroup.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="button-base button-quiet"
                      onClick={() => openRow(row)}
                    >
                      {/* One element with one text node, so a row is addressed
                          by the title it shows and matches exactly once. */}
                      <span>{row.title}</span>
                      <span className="meta">{row.folder.name}</span>
                      <Chip>{group.heading}</Chip>
                      {row.due_date === null ? null : <span className="meta">{row.due_date}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </PageSection>
          )
        })}

        <p>{SEARCH_FOOTER}</p>
      </div>
    </div>
  )
}
