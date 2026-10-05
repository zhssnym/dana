/* The floating bar that acts on selected task rows. */

import { FolderPlus } from "../../lib/icons.js"
import { FolderMark } from "../folder-mark.js"
import { folderLibrary } from "../../lib/folder-library.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.js"
import type { ConceptTask } from "../../tasks/task-model.js"
import { cn } from "../ui/utils.js"
import { T_FAST } from "./motion.js"
import type { BulkDate } from "./use-row-selection.js"

export function BulkBar({
  selected,
  onMove,
  onNewFolder,
  onBulk,
  onDate,
  onDelete,
  exit,
}: {
  selected: string[]
  onMove: (ids: string[], folder: { id: string; name: string; color: string }) => void
  onNewFolder: (ids: string[]) => void
  onBulk: (ids: string[], fields: Partial<ConceptTask>) => void
  onDate?: (ids: string[], when: BulkDate) => void
  onDelete: (ids: string[]) => void
  exit: () => void
}) {
  const count = selected.length
  const act = cn(
    "h-7 rounded-sm px-2 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-muted data-popup-open:bg-muted",
    T_FAST,
  )

  return (
    <div
      role="toolbar"
      aria-label="Selected tasks"
      /* Floating, so selecting never pushes the list it is selecting from. */
      className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] animate-in max-md:bottom-20 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 shadow-[var(--elevation-2)] duration-150 fade-in-0 slide-in-from-bottom-1"
    >
      <span className="mr-2 px-1 text-sm whitespace-nowrap text-muted-foreground">
        {count} selected
      </span>
      <button
        type="button"
        className={act}
        onClick={() => {
          onBulk(selected, { done: true })
          exit()
        }}
      >
        Complete
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" className={act} />}>
          Move
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          {folderLibrary().map((f) => (
            <DropdownMenuItem
              key={f.name}
              onClick={() => {
                onMove(selected, f)
                exit()
              }}
            >
              <FolderMark name={f.name} color={f.color} />
              {f.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              onNewFolder(selected)
              exit()
            }}
          >
            <FolderPlus />
            New folder…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {onDate ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={act} />}>
            Date
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(
              [
                ["today", "Today"],
                ["tomorrow", "Tomorrow"],
                ["next-week", "Next week"],
                [null, "No date"],
              ] as const
            ).map(([when, label]) => (
              <DropdownMenuItem
                key={label}
                onClick={() => {
                  onDate(selected, when)
                  exit()
                }}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <button
        type="button"
        className={cn(act, "hover:text-destructive")}
        onClick={() => {
          onDelete(selected)
          exit()
        }}
      >
        Delete
      </button>
      <button type="button" className={cn(act, "text-muted-foreground")} onClick={exit}>
        Clear
      </button>
    </div>
  )
}
