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
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import {
  ABANDON_CONFIRM,
  DELETE_CONFIRM_LABEL,
  DELETE_TASK_CONFIRM,
  keepLabel,
} from '../components/ui/copy.js'
import { useIsMobile } from '../components/ui/use-mobile.js'
import { TaskWriter } from '../tasks/task-writer.js'
import { useRowActions } from '../parts/useRowActions.js'
import { paths } from '../routes.js'
import { PageBody } from '../components/page/PageStates.js'

interface PendingAct {
  readonly message: string
  readonly run: () => void
  readonly confirmLabel?: string
  readonly cancelLabel?: string
}

export function TaskPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const editing = useTaskEditing(id === '' ? null : id)
  const acts = useRowActions()
  const navigate = useNavigate()
  const [pending, setPending] = useState<PendingAct | null>(null)
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
            {pending === null ? null : (
              <ConfirmDialog
                message={pending.message}
                onContinue={() => {
                  const run = pending.run
                  setPending(null)
                  run()
                }}
                onCancel={() => setPending(null)}
                {...(pending.confirmLabel === undefined
                  ? {}
                  : { confirmLabel: pending.confirmLabel })}
                {...(pending.cancelLabel === undefined ? {} : { cancelLabel: pending.cancelLabel })}
              />
            )}
            <TaskView
              kind="page"
              {...(phone ? { onClose: leave } : {})}
              task={{
                ...surfaceTask(id, editing.concept),
                /* The two acts that end a task, with the row's confirms and
                   undo entries; the page then leaves, its subject gone. */
                onAbandon: () => {
                  setPending({
                    message: ABANDON_CONFIRM,
                    run: () => {
                      acts.onAbandon(detail)
                      leave()
                    },
                  })
                },
                onDelete: () => {
                  setPending({
                    message: DELETE_TASK_CONFIRM,
                    confirmLabel: DELETE_CONFIRM_LABEL,
                    cancelLabel: keepLabel(1),
                    run: () => {
                      acts.onDelete(detail)
                      leave()
                    },
                  })
                },
              }}
            />
          </TaskWriter>
        )}
      </PageBody>
    </div>
  )
}
