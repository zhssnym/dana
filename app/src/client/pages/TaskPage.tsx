/*
/app/tasks/:id, the task's full page and its own address (7.17, 9.1).

It is the address a copied link, a notification and a Dana Link carry, and
what "Open as full page" in a peek leads to, so it is always the page itself:
the same `TaskView` the peeks draw, in the folder page's reading column,
inside the app's shell and sidebar. On a phone it is the only way a task
opens, and it carries a close that goes back where the person came from.

The 10.2 not-found discipline holds: an id this viewer cannot read renders
`PageBody`'s 404 copy.
*/
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { surfaceTask, useTaskEditing } from '../components/task-editing.js'
import { TaskView } from '../components/task-surface.js'
import { isPhoneWidth } from '../components/task-surface-host.js'
import { useIsMobile } from '../components/ui/use-mobile.js'
import { TaskWriter } from '../tasks/task-writer.js'
import { useRowActions } from '../parts/useRowActions.js'
import { paths } from '../routes.js'
import { PageBody } from '../components/page/PageStates.js'

export function TaskPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const editing = useTaskEditing(id === '' ? null : id)
  const acts = useRowActions()
  const navigate = useNavigate()
  /* Read once synchronously for the first render (the hook answers false
     until its effect runs), then kept live. */
  const mobileHook = useIsMobile()
  const [firstPhone] = useState(isPhoneWidth)
  const phone = mobileHook || firstPhone
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
            <TaskView
              kind="page"
              {...(phone ? { onClose: leave } : {})}
              task={{
                ...surfaceTask(id, editing.concept),
                /* Delete, with the row's confirm and undo entry; the page
                   then leaves, its subject gone. Status carries abandon. */
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
