/* The task row: checkbox, title, meta and star. */

import { useEffect } from "react"

import { repeatShort } from "../../tasks/task-model.js"
import { cn } from "../ui/utils.js"
import { RowMeta } from "../task-meta.js"
import { T_FAST } from "./motion.js"
import { Check } from "./Check.js"
import { ExpandShell } from "./ExpandShell.js"
import type { TaskRowProps } from "./types.js"
import { useCardWiring } from "./use-card-wiring.js"

/* ------------------------------------------------------ the shipping row, */
/*
`TaskRow` is what the screens render: spread the task's fields, pass the
handlers.

**Where its state lives.** The screens own the facts they model: title,
completion, importance, My Day, folder, due, assignee, step counts. Those are
read from props every render, so a change made anywhere still flows down.
Everything the card can edit that the screen never modelled, notes, a reminder,
the recurrence rule, the step items themselves, is held here as a layer of local
edits on top.
*/

/*
The row: one line, 32–36px. Checkbox · title · muted meta on the right (date,
folder where the page spans folders, assignee face, repeat glyph and labels),
then the star, which shows on hover and whenever it is set. Labels use the same
compact pills as the task property and filters; no subtask count is drawn here.

Clicking anywhere on the row opens the task; the checkbox and the star are the
only controls inside it. No chevron, no row "…", no rename in the row: those
live in the task's own panel (the redesign's control map). Shift/Cmd-click
selects, see `useRowSelection`.
*/
export function TaskRow(props: TaskRowProps) {
  const { task, patch } = useCardWiring(props)

  /* The row tells its list how to open it; the list's drag engine calls back
     on a tap, so tap-to-open is the row's property rather than each screen's. */
  const { onRegisterOpen, onOpen } = props
  useEffect(() => {
    if (!onRegisterOpen) return
    onRegisterOpen(onOpen ? () => onOpen() : null)
    return () => onRegisterOpen(null)
  }, [onRegisterOpen, onOpen])

  const given = props.given ?? {}
  const struck = Boolean(task.abandoned)
  const finished = Boolean(task.done) || struck

  const row = (
    <div
      /* r3-peek: the peek steps through rows in the order they are drawn. */
      data-task-id={props.id}
      /* The keyboard path (`row-keys.ts`): a list page makes this row its one
         Tab stop; Enter opens the task and Space completes it. */
      data-row-key=""
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter") {
          event.preventDefault()
          props.onOpen?.()
        } else if (event.key === " ") {
          event.preventDefault()
          patch(task.id, { done: !task.done })
        }
      }}
      onClick={
        /* Where no drag engine tracks the row (a board card, say); inside a
           list the engine resolves the tap. */
        props.onOpen && !props.listProps
          ? (event) => {
              const target = event.target as HTMLElement
              if (target.closest('button, a, input, [role="checkbox"]')) return
              props.onOpen?.()
            }
          : undefined
      }
      className={cn(
        "group/row grid min-h-[var(--row-height)] w-full grid-cols-[var(--control-height)_minmax(0,1fr)_auto] items-center rounded-sm pr-1 text-sm transition-colors max-md:py-1 md:h-[var(--row-height)]",
        T_FAST,
        !props.isSelected && "hover:bg-muted",
        props.onOpen && "cursor-pointer",
      )}
    >
      <Check task={task} onToggle={() => patch(task.id, { done: !task.done })} />
      <span
        title={task.title}
        className={cn(
          /* A phone wraps the title to a second line rather than cutting it beside the meta. */
          "min-w-0 truncate max-md:line-clamp-2 max-md:whitespace-normal",
          finished ? "text-muted-foreground" : "text-foreground",
          struck && "line-through",
        )}
      >
        {task.title || <span className="text-muted-foreground">Untitled task</span>}
      </span>
      {props.dragState?.isActive && props.proposal !== undefined ? null : <RowMeta
        className="max-w-[60vw] pl-3 md:max-w-none"
        source={{
          ...(task.due === undefined ? {} : { due: task.due }),
          ...(props.starts === undefined ? {} : { starts: props.starts }),
          ...(task.folder === undefined ? {} : { folder: task.folder }),
          ...(task.assignee === undefined ? {} : { assignee: task.assignee }),
          ...(task.assignees === undefined ? {} : { assignees: task.assignees }),
          ...(task.labels === undefined ? {} : { labels: task.labels }),
          ...(task.recurrence ? { recurrence: repeatShort(task) } : {}),
          blockedBy: props.blockedBy ?? 0,
          finished,
          important: Boolean(task.important),
          ...(props.importantTooltip === undefined ? {} : { importantTooltip: props.importantTooltip }),
        }}
        given={given}
        onToggleImportant={() => {
          patch(task.id, { important: !task.important })
          props.onToggleImportant?.()
        }}
      />}
    </div>
  )

  return (
    <ExpandShell
      open={false}
      card={null}
      row={row}
      itemRef={props.itemRef}
      drag={props.listProps}
      isSelected={props.isSelected}
      isActive={props.dragState?.isActive}
      isDwelling={props.dragState?.isDwelling}
      isArmed={props.dragState?.isArmed}
      isSettling={props.dragState?.isSettling}
      offset={props.dragState?.offset}
      crossOffset={props.dragState?.crossOffset}
      proposal={props.proposal}
    />
  )
}
