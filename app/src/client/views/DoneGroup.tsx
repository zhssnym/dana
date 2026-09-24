/*
Finished work under a list, read from Q6 (`/views/done`) only while "Show
completed" is on, and narrowed by the page to what belongs to it (Upcoming
keeps what has a date). Q6 pages by 50 over everything the viewer finished,
so "Show more" reaches older rows. Abandoned rows need no group of their own:
they come with the page's open rows and stay in place, struck.
*/
import type { TaskCard } from '../../shared/tasks.js'
import { mergeCompletedDays, useDoneView } from '../api/queries.js'
import { MorePages } from '../components/page/PageStates.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import { TaskRows } from '../pages/task-rows.js'
import { PlaceGroup } from './usePlace.js'
import type { Place } from './usePlace.js'

export function DoneGroup({
  place,
  context,
  actions,
  onAsk,
  keep = () => true,
}: {
  readonly place: Place
  readonly context: RowContext
  readonly actions: RowActions
  readonly onAsk: (question: string, act: () => void) => void
  readonly keep?: (task: TaskCard) => boolean
}): React.JSX.Element | null {
  const completed = useDoneView(true)
  const done: readonly TaskCard[] = mergeCompletedDays(completed.data?.pages).flatMap((day) =>
    day.rows.filter(keep),
  )
  if (done.length === 0 && !completed.hasNextPage) return null
  return (
    <PlaceGroup name="Done" heading="Done">
      <TaskRows tasks={place.narrow(done)} context={context} actions={actions} onAsk={onAsk} />
      <MorePages query={completed} />
    </PlaceGroup>
  )
}
