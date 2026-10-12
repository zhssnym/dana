// One task right-click menu across lists, Board, Calendar and Freeform.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { useDeleteTask, useTransitionTask } from '../api/mutations.js'
import { useTask } from '../api/queries.js'
import { taskContextTarget } from '../lib/task-context.js'
import { actsFor } from '../lib/object-acts.js'
import { copyTaskLink, duplicateTask } from '../tasks/task-acts.js'
import { paths } from '../routes.js'
import { openInNewTab } from '../shell/tabs.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { TaskHistory } from './thread/TaskHistory.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'

interface MenuPosition {
  readonly id: string
  readonly title: string
  readonly x: number
  readonly y: number
}

export function TaskContextMenuHost(): React.JSX.Element {
  const [menu, setMenu] = useState<MenuPosition | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const navigate = useNavigate()
  const remove = useDeleteTask()
  const transition = useTransitionTask()
  const detail = useTask(menu?.id ?? historyId)

  useEffect(() => {
    const open = (event: MouseEvent): void => {
      if (event.defaultPrevented) return
      const task = taskContextTarget(event.target)
      if (task === null) return
      const selection = document.getSelection()
      if (selection !== null && !selection.isCollapsed && selection.toString().trim() !== '') return
      event.preventDefault()
      // BlockNote's right-click Insert menu must not also open on a task.
      event.stopPropagation()
      setMenu({ ...task, x: event.clientX, y: event.clientY })
    }
    document.addEventListener('contextmenu', open, true)
    return () => document.removeEventListener('contextmenu', open, true)
  }, [])

  const acts = actsFor('task', menu === null ? {} : {
    'open-tab': () => { void navigate(openInNewTab(paths.task(menu.id))) },
    history: () => setHistoryId(menu.id),
    'copy-link': () => copyTaskLink(menu.id),
    duplicate: () => duplicateTask(menu.id, menu.title),
    delete: () => {
      const { id, title } = menu
      remove.mutate(id)
      pushUndo(undoLabel('Deleted', title), () => {
        transition.mutate({ id, event: 'restore' })
      })
    },
  })

  return (
    <>
      <DropdownMenu open={menu !== null} onOpenChange={(open) => { if (!open) setMenu(null) }}>
        <DropdownMenuTrigger
          nativeButton={false}
          render={<span aria-hidden="true" tabIndex={-1} />}
          style={{ position: 'fixed', left: menu?.x ?? 0, top: menu?.y ?? 0, width: 0, height: 0 }}
        />
        <DropdownMenuContent align="start" className="w-56" finalFocus={() => false}>
          {acts.map(({ spec, handler, startsGroup }) => (
            <div key={spec.key} className="contents">
              {startsGroup ? <DropdownMenuSeparator /> : null}
              {typeof handler === 'function' ? (
                <DropdownMenuItem
                  variant={spec.destructive === true ? 'destructive' : undefined}
                  onClick={handler}
                >
                  <spec.icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {spec.label}
                </DropdownMenuItem>
              ) : null}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {historyId === null ? null : (
        <TaskHistory
          taskId={historyId}
          folderId={detail.data?.id === historyId ? detail.data.folder.id : null}
          open
          onOpenChange={(open) => { if (!open) setHistoryId(null) }}
        />
      )}
    </>
  )
}
