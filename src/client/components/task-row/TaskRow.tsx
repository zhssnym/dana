import { useEffect } from "react"

import { repeatShort } from "../../tasks/task-model.js"
import { cn } from "../ui/utils.js"
import { RowMeta } from "../task-meta.js"
import { T_FAST } from "./motion.js"
import { Check } from "./Check.js"
import { ExpandShell } from "./ExpandShell.js"
import type { TaskRowProps } from "./types.js"
import { useCardWiring } from "./use-card-wiring.js"

/* Screen-modelled facts are read from props every render; fields the screen
   never modelled (notes, reminder, steps) are held here as local edits on top. */
export function TaskRow(props: TaskRowProps) {
  const { task, patch } = useCardWiring(props)

  /* The list's drag engine calls this back on a tap. */
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
      /* The peek steps through rows in the order they are drawn. */
      data-task-id={props.id}
      data-task-title={task.title}
      /* `row-keys.ts` makes this row the list's Tab stop. */
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
        /* Only where no drag engine tracks the row; in a list the engine resolves the tap. */
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
