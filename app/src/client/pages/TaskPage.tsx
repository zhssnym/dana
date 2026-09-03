/*
/app/tasks/:id, the task's own address (7.17, 9.1).

9.1's roles table: the task surface is "a dialog when opened as one; a page
when opened as a tab or by its URL". This is the URL arm, added at S12
because 9.12 makes a notification row a pointer to exactly this address, and
an address that 404s until another package lands is a bell whose rows lie.

**Since the polish round of 2026-08-30 the page is the editor** (taskcard F3).
It drew the task's facts as text with an "Open editor" button that popped the
dialog over it, so 9.3's third home, the tab, was a weaker card than the other
two and the "Tab" setting had nothing honest to open. The page now renders the
same composition the dialog and the panel render, `task-surface.tsx`'s
`TaskPage` in its window presentation, over the same editing hook the host
uses, `components/task-editing.tsx`. One artifact, three homes (DES-117).

What a reader may rely on: the title is in the document, the 10.2 not-found
discipline holds (`PageBody` renders the 404 copy for an inaccessible id),
and the address never server-renders anything (7.17: the SPA resolves it
against existing reads).
*/
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { surfaceTask, useTaskEditing } from '../components/task-editing.js'
import { TaskPage as SurfaceTaskPage } from '../components/task-surface.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import {
  ABANDON_CONFIRM,
  DELETE_CONFIRM_LABEL,
  DELETE_TASK_CONFIRM,
  keepLabel,
} from '../components/ui/copy.js'
import { TaskWriter } from '../lib/task-writer.js'
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
  const detail = editing.detail

  return (
    <div className="space-y-7">
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
            <SurfaceTaskPage
              inWindow
              task={{
                ...surfaceTask(id, editing.concept),
                /* The two acts that end a task, the page layer's with its
                   confirms and its undo entries; a deleted task's page then
                   leaves for Desk, its subject having gone to Trash. */
                onAbandon: () => {
                  setPending({
                    message: ABANDON_CONFIRM,
                    run: () => {
                      acts.onAbandon(detail)
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
                      void navigate(paths.desk)
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
