/*
/app/tasks/:id, a task's one page and its own address (7.17, 9.1; M4).

Every way into a task lands here: a row, a canvas task block, Today, search,
the calendar, a copied link, a notification and a Dana Link. It sits in the
folder page's reading column, inside the app's shell and sidebar. On a phone
it carries a close that goes back where the person came from; everywhere
else the browser's Back does that, and the thread restores its place.

The 10.2 not-found discipline holds: an id this viewer cannot read renders
`PageBody`'s 404 copy.
*/
import { useLocation, useNavigate, useParams } from 'react-router'

import { surfaceTask, useTaskEditing } from '../components/task-editing.js'
import { TaskView } from '../components/task-surface.js'
import type { TaskOpenState } from '../components/task-surface-host.js'
import { UPCOMING_OCCURRENCE } from '../components/task-copy.js'
import { useIsMobile } from '../components/ui/use-mobile.js'
import { TaskWriter } from '../tasks/task-writer.js'
import { useRowActions } from '../parts/useRowActions.js'
import { paths } from '../routes.js'
import { PageBody } from '../components/page/PageStates.js'

/** Below this width the page draws its own close (`ui/use-mobile.ts`). */
const PHONE_WIDTH = 768

export function TaskPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const editing = useTaskEditing(id === '' ? null : id)
  const acts = useRowActions()
  const navigate = useNavigate()
  const state = (useLocation().state ?? null) as TaskOpenState | null
  /* The hook answers false until its effect runs; the width answers at once. */
  const phone = useIsMobile() || (typeof window !== 'undefined' && window.innerWidth < PHONE_WIDTH)
  const detail = editing.detail

  function leave(): void {
    /* Back where the person came from, or the folder when there is no
       "from" (a link opened cold). */
    if (window.history.length > 1) void navigate(-1)
    else if (detail !== undefined) void navigate(paths.folder(detail.folder.id))
    else void navigate(paths.today)
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageBody query={editing.query} isEmpty={false} emptyCopy="">
        {editing.concept === null || detail === undefined ? null : (
          <TaskWriter patch={editing.write}>
            {editing.confirm}
            {state?.upcomingTask === true ? (
              <p role="status" className="sr-only">
                {UPCOMING_OCCURRENCE}
              </p>
            ) : null}
            <TaskView
              {...(phone ? { onClose: leave } : {})}
              task={{
                ...surfaceTask(id, editing.concept),
                /* Delete, to Trash with Undo; the page then leaves, its
                   subject gone. Status carries drop. */
                onDelete: () => {
                  acts.onDelete(detail)
                  leave()
                },
              }}
            />
          </TaskWriter>
        )}
      </PageBody>
    </div>
  )
}
