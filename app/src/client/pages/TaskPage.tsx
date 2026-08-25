/*
/app/tasks/:id, the task's own address (7.17, 9.1).

9.1's roles table: the task surface is "a dialog when opened as one; a page
when opened as a tab or by its URL". This is the URL arm, added at S12
because 9.12 makes a notification row a pointer to exactly this address, and
an address that 404s until another package lands is a bell whose rows lie.

**Interim by design, and the interim is honest.** S11 owns the v2 task
surface (the card, the four homes, DES-117); this page renders the task's
own facts in `main` and offers the full editor through the existing overlay
seam, the same interim shape S9 used for Today and Scheduled. What a reader
may rely on: the title is in the document, the 10.2 not-found discipline
holds (`PageBody` renders the 404 copy for an inaccessible id), and the
address never server-renders anything (7.17: the SPA resolves it against
existing reads).

The editor opens through `openTask`, the edit bus `components/task-form`
already listens on, so this page holds no form state and duplicates no
surface.
*/
import { useParams } from 'react-router'

import { useTask } from '../api/queries.js'
import { openTask } from '../components/task-form/index.js'
import { Button } from '../components/ui/button.js'
import { formatDayHeading } from '../parts/format-dates.js'
import { useRowBasis } from './task-rows.js'
import { PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'

export function TaskPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const task = useTask(id === '' ? null : id)
  const basis = useRowBasis()

  const detail = task.data
  return (
    <div className="space-y-7">
      <PageBody query={task} isEmpty={false} emptyCopy="">
        <PageSection name="Task">
          <header className="flex min-h-14 items-start justify-between gap-6">
            <div className="min-w-0">
              <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
                {detail?.title}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {detail?.folder.name}
                {detail?.due_date === null || detail === undefined
                  ? null
                  : ` · Due ${formatDayHeading(detail.due_date, basis.today)}`}
                {detail?.assignee?.display_name === undefined ||
                detail.assignee === null
                  ? null
                  : ` · ${detail.assignee.display_name ?? 'Someone'}`}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-[var(--control-height)] shrink-0 px-3 text-sm"
              onClick={() => {
                openTask(id)
              }}
            >
              Open editor
            </Button>
          </header>
          {detail?.notes === null || detail?.notes === undefined ? null : (
            <p className="mt-4 text-sm leading-6 whitespace-pre-wrap text-[var(--color-graphite-700)]">
              {detail.notes}
            </p>
          )}
          {detail === undefined || detail.steps.length === 0 ? null : (
            <ul className="mt-4 space-y-1">
              {detail.steps.map((step) => (
                <li
                  key={step.id}
                  className={
                    step.done
                      ? 'text-sm leading-6 text-[var(--color-graphite-400)] line-through'
                      : 'text-sm leading-6 text-[var(--color-graphite-700)]'
                  }
                >
                  {step.title}
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      </PageBody>
    </div>
  )
}
