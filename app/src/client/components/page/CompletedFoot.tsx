/*
The collapsed section of finished work that closes a page listing tasks.

**The owner ruled it on 2026-08-22 and `prototype-v2` carries the ruling in its
own comments**, which is where a session should read it rather than from a
brief: `screens/important-screen.tsx` says "every page that lists tasks ends
the same way (Imran, 2026-08-22): finished work, collapsed, in the grammar a
folder's Completed section and My Day's recap already use", and
`screens/planned-screen.tsx` says the same and then answers the objection a
reader of section 6 will have: "Spec Q3 keeps completed rows out of the *list*,
and this is a section under it rather than rows in it, so the ordering rule is
untouched."

**9.5 is quiet here rather than contradictory, and the difference is why this
file exists rather than an escalation.** That section gives the collapsed foot
to All in terms and does not mention one on Important or Scheduled; it also
does not forbid one, and it enumerates neither page closely enough to make the
silence a rule. Where the prototype and a numbered section disagree, RFC 0005
change control item 20 sends the question to a ruling; where the section is
silent and an owner's ruling and the prototype agree, the package builds it and
records the reading, which this paragraph is.

**One implementation rather than a third**, which is S17b's whole theme: All
had one written inline and the folder page has its own, and Important and
Scheduled were about to acquire a fourth and a fifth. What varies between the
pages is one predicate, so that is what this takes.

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
read that does not exist; S17b named it in its log row rather than inventing a
client-side estimate of a total it cannot know.
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
    /* polish: places F11: "Done", the page's own word, everywhere the pile is named. */
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
