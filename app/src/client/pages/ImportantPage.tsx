/*
9.5's Important page: a single list per Q4, one region, no quick-add row.

9.1 puts the inline quick-add at the bottom of Tasks groups, the Planned list
and folder sections, and this page is none of them; 9.1's region table says
Important carries one section and needs no name. So this page is the plain
case, and it is here to be the plain case: whatever a page needs beyond rows
and a state, it declares itself.

The star's outward tooltip of Q4 ("Also in Planned, due ...") is the row's,
which is the Component engineer's file, and is recorded as owed in
`src/client/README.md`.
*/
import { useImportantView, useMe } from '../api/queries.js'
import { TaskList } from '../parts/TaskRow.js'
import { useRowActions } from '../parts/useRowActions.js'
import { PageBody } from '../states/PageStates.js'
import { IMPORTANT_EMPTY } from './empty-states.js'

export function ImportantPage(): React.JSX.Element {
  const view = useImportantView()
  const me = useMe()
  const actions = useRowActions()
  return (
    <div>
      <h1>Important</h1>
      <PageBody
        query={view}
        isEmpty={(view.data?.rows.length ?? 0) === 0}
        emptyCopy={IMPORTANT_EMPTY}
      >
        <TaskList
          tasks={view.data?.rows ?? []}
          viewerId={me.data?.user.id ?? null}
          {...actions}
        />
      </PageBody>
    </div>
  )
}
