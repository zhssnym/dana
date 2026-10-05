/* The naming panel both folder gestures land in. */

import { useState } from "react"

import { InlineInput } from "../ui/inline-field.js"
import { FolderPlus } from "../../lib/icons.js"
import { cn } from "../ui/utils.js"
import { T_BASE, T_FAST } from "./motion.js"

export type PendingAction =
  | { kind: "merge"; ids: string[]; titles: string[] }
  | { kind: "promote"; id: string; title: string; steps: number }
  /* Every list of folders ends in "New folder…", so wanting one never means
     leaving what you were doing to go and make it first. All three arrive
     here, at the same naming panel, so a new folder is created one way rather
     than three. */
  | { kind: "folder-for"; ids: string[] }
  | { kind: "steps-to-folder"; taskId: string; indices: number[] }

/* The panel both gestures land in. Deliberately not a dialog: the point of
   these two ideas is that you never leave the list.

   The folder is drawn, what goes into it is shown as the things themselves
   rather than described in a sentence, and there is always a name in the field.
   The suggestion is a real name, the two titles have a shared word often enough
   to be worth trying, and it is selected on open, so Enter accepts and typing
   replaces. Nothing starts disabled. */
export function suggestFolderName(pending: PendingAction) {
  if (pending.kind === "promote") return pending.title
  if (pending.kind !== "merge") return "New page"

  /* The longest word both titles share, if there is one. "Book the venue" and
     "Pay the venue deposit" are obviously a venue folder, and a person who is
     handed that guess spends no time at all on the part they did not come
     here to do. */
  const words = (title: string) =>
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((word) => word.length > 3)
  const first = words(pending.titles[0] ?? "")
  const shared = words(pending.titles[1] ?? "").filter((word) => first.includes(word))
  const best = shared.sort((a, b) => b.length - a.length)[0]
  return best ? best.charAt(0).toUpperCase() + best.slice(1) : "New page"
}

export function PendingPanel({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingAction
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(() => suggestFolderName(pending))

  const destroys = pending.kind === "promote"
  const going: string[] =
    pending.kind === "merge"
      ? pending.titles
      : pending.kind === "promote"
        ? [`${pending.steps} subtask${pending.steps === 1 ? "" : "s"} become tasks`]
        : pending.kind === "folder-for"
          ? [`${pending.ids.length} task${pending.ids.length === 1 ? "" : "s"}`]
          : [
              `${pending.indices.length} subtask${
                pending.indices.length === 1 ? " becomes a task" : "s become tasks"
              }`,
            ]

  return (
    <div
      className={cn(
        "mb-2 overflow-hidden rounded-md bg-background ring-1 ring-border",
        T_BASE,
      )}
    >
      <div className="flex items-start gap-3 px-3 pt-3">
        {/* The folder mark, the same one the dwell badge closes its ring
            around, so the gesture and its panel are visibly one thing. */}
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <FolderPlus
            className="size-4 text-primary"
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {destroys ? "Turn this task into a page" : "New page"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {destroys
              ? "The task itself stops existing. This cannot be undone from here."
              : "Nothing is changed except where these live."}
          </p>

          <InlineInput
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim()) onConfirm(name.trim())
              if (event.key === "Escape") onCancel()
            }}
            placeholder="Page name"
            aria-label="Page name"
            className={cn(
              "mt-2.5 h-9 w-full rounded-sm border border-border bg-background px-2.5 text-sm text-foreground outline-none",
              "placeholder:text-muted-foreground focus-visible:border-primary",
            )}
          />

          {/* What goes in, shown rather than counted. A person checking they
              grabbed the right two tasks should be able to read the two
              titles, which a sentence saying "2 tasks" cannot do. */}
          <ul className="mt-2 flex flex-col gap-1">
            {going.map((line, index) => (
              <li
                key={`${line}-${index}`}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  className="ml-1 size-1.5 shrink-0 rounded-full bg-border"
                />
                <span className="truncate">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 bg-muted px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "rounded-sm px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
            T_FAST,
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onConfirm(name.trim())}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
            T_FAST,
          )}
        >
          <FolderPlus className="size-3.5" strokeWidth={2} aria-hidden="true" />
          {destroys ? "Convert" : "Create page"}
        </button>
      </div>
    </div>
  )
}
