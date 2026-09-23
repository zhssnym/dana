/*
The collapsed section of finished work that closes a page listing tasks.

Every page that lists tasks ends the same way: finished work, collapsed, in the
grammar a folder's Completed section and My Day's recap already use. Q3 keeps
completed rows out of the *list*, and this is a section under it rather than
rows in it, so the ordering rule is untouched. 9.5 gives the collapsed foot to
All in terms and is silent, not contradictory, on Important and Scheduled.

**One implementation for every page.** What varies between the pages is one
predicate, so that is what this takes.

**The read waits on the control.** `useDoneView` is fetched only while the
section is open, the rule `useFolderCompletedTasks` already follows for Q7's
third section: a collapsed section that fetched anyway would make the collapse
cosmetic, and this section is closed for almost all of a page's life.

**The narrowing is the page's spine, applied client-side, and its one seam is
recorded here rather than discovered.** There is exactly one completed read in
this client, Q6's `/views/done`, and it answers everything the viewer has
finished with no filter of its own. So a page whose foot is meant to be *its
own* work finished has to narrow what comes back: Important keeps the starred,
Scheduled keeps the dated. The seam is that Q6 pages by 50 rows on
(completed_at desc, id desc) and the narrowing runs after the page arrives, so
a page of fifty completed rows holding no starred one contributes nothing to
Important's foot while starred rows sit further back. `MorePages` reaches them
and the count says how many are loaded rather than how many exist. A
spine-scoped completed read is the shape that closes it, and it is a section 7
read that does not exist, and this does not invent a client-side estimate of a
total it cannot know.
*/
import { useState } from 'react'

import { mergeCompletedDays, useDoneView } from '../../api/queries.js'
import type { RowContext } from '../../parts/presenters.js'
import type { RowActions } from '../../parts/useRowActions.js'
import { MorePages } from './PageStates.js'
import { CollapsibleSection, PageSection } from './PageSection.js'
import { TaskRows } from '../../pages/task-rows.js'
import type { TaskCard } from '../../../shared/tasks.js'

export function CompletedFoot({
  keep,
  context,
  actions,
  onAsk,
}: {
  /**
   * This page's own spine, as a predicate over Q6's rows.
   *
   * Omitted by a page whose spine is everything, which is All: Q5's union is
   * the whole account, so its foot is Q6 unnarrowed and a predicate there
   * would be a filter that removes nothing.
   */
  readonly keep?: (task: TaskCard) => boolean
  readonly context: RowContext
  readonly actions: RowActions
  readonly onAsk: (question: string, act: () => void) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const completed = useDoneView(open)
  const days = mergeCompletedDays(completed.data?.pages)
    .map((day) => ({ ...day, rows: keep === undefined ? day.rows : day.rows.filter(keep) }))
    /* A day whose every row the predicate removed is not an empty day, it is a
       day this page had nothing on. Drawing its heading would name a date and
       then say nothing under it, and 9.1's regions rule makes that heading a
       named region with no content in it. */
    .filter((day) => day.rows.length > 0)

  return (
    /* "Done", the page's own word, everywhere the pile is named. */
    <CollapsibleSection name="Done" defaultOpen={false} onOpenChange={setOpen}>
      <div className="space-y-6">
        {days.map((day) => (
          <PageSection key={day.date} name={day.date}>
            <TaskRows tasks={day.rows} context={context} actions={actions} onAsk={onAsk} />
          </PageSection>
        ))}
        {/* Q6 is keyset-paginated, so the way to the rest is asking for it.
            It matters more here than on All: a narrowed foot can show nothing
            on a page that holds fifty completed rows of somebody else's work. */}
        <MorePages query={completed} />
      </div>
    </CollapsibleSection>
  )
}
