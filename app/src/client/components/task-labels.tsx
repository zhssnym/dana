/*
A task's Labels (#208): the panel's Labels row, its picker, and the dialog that
renames, recolours, archives and restores them.

Two kinds, said in plain words rather than as scopes. **This page's** labels
belong to the page and everyone in it sees them on its tasks; **just for me**
labels are the viewer's own and nobody else ever sees them. Two labels with the
same name in the two kinds, or on two pages, are two labels: every act here
names a label by its id.

Who may do what is the server's table (`shared/folder-actions.ts`), read
through `lib/folder-authority.ts`. Anyone who can see a task may put their own
labels on it. The page's labels take Can edit, or Can contribute on a task
assigned to them, which only the server can decide under its lock: so a
contributor is offered them and a refusal comes back as the server's toast.
Making or changing the page's labels takes Can edit.
*/
import { useMemo, useState } from "react"

import type { LabelDefinition } from "../../shared/labels.js"
import { useFolders } from "../api/queries.js"
import {
  useArchiveLabel,
  useCreateLabel,
  useLabels,
  usePatchLabel,
  useSetTaskLabel,
} from "../api/labels.js"
import { folderGates } from "../lib/folder-authority.js"
import { Check, Plus } from "../lib/icons.js"
import { IDENTITY_COLORS } from "../parts/identity-colors.js"
import type { ConceptTask } from "../tasks/task-model.js"

import { byName, LabelChip, LabelDot } from "./label-chip.js"
import { PROPERTY_LABEL, PROPERTY_ROW } from "./task-pickers.js"
import { Button } from "./ui/button.js"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog.js"
import { Input } from "./ui/input.js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
import { cn } from "./ui/utils.js"

/*
The colour a new label starts with: the least used here, taken in an order that
puts far-apart hues next to each other, so the first few labels on a page are
told apart at a glance rather than drawn as three neighbouring warm dots. Grey
is never picked for you.
*/
const SPREAD = ["Blue", "Green", "Orange", "Purple", "Pink", "Yellow", "Red"]
  .map((name) => IDENTITY_COLORS.find(([colour]) => colour === name)?.[1])
  .filter((hex): hex is string => hex !== undefined)

function nextColor(taken: readonly { readonly color: string }[]): string {
  const uses = (hex: string) => taken.filter((label) => same(label.color, hex)).length
  let pick = SPREAD[0] ?? "#8a8a8a"
  for (const hex of SPREAD) if (uses(hex) < uses(pick)) pick = hex
  return pick
}

/** What this viewer may do with labels on one task's page. */
function useLabelRights(folderId: string | null): { apply: boolean; manage: boolean } {
  const folders = useFolders()
  const row = folderId === null ? undefined : folders.data?.find((folder) => folder.id === folderId)
  if (row === undefined) return { apply: false, manage: false }
  const gates = folderGates({ access: row.my_access, isOwner: row.is_owner, isDefault: row.is_default })
  return {
    apply: gates.applyLabel || row.my_access === "can_contribute",
    manage: gates.labels,
  }
}

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** The panel's Labels row. `defaultOpen` when "Add property" just revealed it. */
export function TaskLabelsRow({
  task,
  defaultOpen = false,
  onOpenChange,
}: {
  readonly task: ConceptTask
  readonly defaultOpen?: boolean
  readonly onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [editing, setEditing] = useState(false)
  const worn = byName(task.labels ?? [])
  function change(next: boolean) {
    setOpen(next)
    onOpenChange?.(next)
  }
  const folderId = task.folder?.id ?? null
  return (
    <>
      <Popover open={open} onOpenChange={change}>
        <PopoverTrigger
          render={
            <button type="button" onClick={(event) => event.stopPropagation()} className={PROPERTY_ROW}>
              <span className={PROPERTY_LABEL}>Labels</span>
              {worn.length === 0 ? (
                <span className="text-muted-foreground">Empty</span>
              ) : (
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-foreground">
                  {worn.map((label) => (
                    <LabelChip key={label.id} label={label} />
                  ))}
                </span>
              )}
            </button>
          }
        />
        <PopoverContent align="start" className="w-64 p-2">
          {open ? (
            <LabelPicker
              taskId={task.id}
              folderId={folderId}
              worn={worn.map((label) => label.id)}
              onEdit={() => {
                /* The row stays claimed until the dialog closes, or a task
                   wearing no label would take the dialog away with its row. */
                setOpen(false)
                setEditing(true)
              }}
            />
          ) : null}
        </PopoverContent>
      </Popover>
      {editing ? (
        <LabelEditor
          folderId={folderId}
          onClose={() => {
            setEditing(false)
            onOpenChange?.(false)
          }}
        />
      ) : null}
    </>
  )
}

function LabelOption({
  label,
  on,
  onToggle,
}: {
  readonly label: LabelDefinition
  readonly on: boolean
  readonly onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="flex h-[var(--control-height)] w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
    >
      <LabelDot color={label.color} />
      <span className="flex-1 truncate">{label.name}</span>
      <Check
        className={cn("size-3.5 shrink-0", on ? "opacity-100" : "opacity-0")}
        strokeWidth={2.5}
        aria-hidden="true"
      />
    </button>
  )
}

function Heading({ children }: { readonly children: string }) {
  return <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground">{children}</p>
}

function LabelPicker({
  taskId,
  folderId,
  worn,
  onEdit,
}: {
  readonly taskId: string
  readonly folderId: string | null
  readonly worn: readonly string[]
  readonly onEdit: () => void
}) {
  const [query, setQuery] = useState("")
  const labels = useLabels(folderId)
  const rights = useLabelRights(folderId)
  const setLabel = useSetTaskLabel()
  const create = useCreateLabel()
  const rows = labels.data?.rows ?? []
  const typed = query.trim()
  const matches = (label: LabelDefinition) => typed === "" || label.name.toLowerCase().includes(typed.toLowerCase())
  const pageLabels = rows.filter((label) => label.scope === "folder" && matches(label))
  const mine = rows.filter((label) => label.scope === "personal" && matches(label))
  const shownPage = rights.apply ? pageLabels : []
  const canMakePage =
    rights.manage && folderId !== null && typed !== "" && !rows.some((l) => l.scope === "folder" && same(l.name, typed))
  const canMakeMine = typed !== "" && !rows.some((l) => l.scope === "personal" && same(l.name, typed))

  function toggle(label: LabelDefinition) {
    setLabel.mutate({ taskId, labelId: label.id, on: !worn.includes(label.id) })
  }

  function make(scopeFolder: string | null) {
    create.mutate(
      { folderId: scopeFolder, name: typed, color: nextColor(rows) },
      {
        onSuccess: (made) => {
          setQuery("")
          setLabel.mutate({ taskId, labelId: made.id, on: true })
        },
      },
    )
  }

  return (
    <div className="flex flex-col">
      <Input
        autoFocus
        aria-label="Find or make a label"
        placeholder="Find or make a label"
        value={query}
        maxLength={40}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          event.preventDefault()
          const exact = [...shownPage, ...mine].find((label) => same(label.name, typed))
          if (exact !== undefined) toggle(exact)
          else if (canMakePage) make(folderId)
          else if (canMakeMine) make(null)
        }}
      />
      <div className="mt-1 max-h-72 overflow-y-auto">
        {shownPage.length > 0 ? (
          <>
            <Heading>This page</Heading>
            {shownPage.map((label) => (
              <LabelOption key={label.id} label={label} on={worn.includes(label.id)} onToggle={() => toggle(label)} />
            ))}
          </>
        ) : null}
        {mine.length > 0 ? (
          <>
            <Heading>Just for me</Heading>
            {mine.map((label) => (
              <LabelOption key={label.id} label={label} on={worn.includes(label.id)} onToggle={() => toggle(label)} />
            ))}
          </>
        ) : null}
        {labels.isSuccess && rows.length === 0 && typed === "" ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">Type a name to make your first label.</p>
        ) : null}
      </div>
      {canMakePage || canMakeMine ? (
        <div className="mt-1 border-t border-border pt-1">
          {canMakePage ? (
            <MakeOption onSelect={() => make(folderId)}>{`Make “${typed}” for this page`}</MakeOption>
          ) : null}
          {canMakeMine ? (
            <MakeOption onSelect={() => make(null)}>{`Make “${typed}” just for me`}</MakeOption>
          ) : null}
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="mt-1 border-t border-border pt-1">
          <MakeOption onSelect={onEdit} plain>
            Edit labels
          </MakeOption>
        </div>
      ) : null}
    </div>
  )
}

function MakeOption({
  onSelect,
  plain = false,
  children,
}: {
  readonly onSelect: () => void
  readonly plain?: boolean
  readonly children: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex h-[var(--control-height)] w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
    >
      {plain ? null : <Plus className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />}
      <span className="truncate">{children}</span>
    </button>
  )
}

/* ------------------------------------------------------------- editing */

/**
 * Every label this viewer has here, archived ones last, each renamed in place,
 * recoloured from the swatches, and archived or restored. Archiving keeps the
 * label on the tasks that wear it and takes it out of the picker; there is no
 * delete, because a label is cheap and its history is not.
 */
export function LabelEditor({ folderId, onClose }: { readonly folderId: string | null; readonly onClose: () => void }) {
  const labels = useLabels(folderId, "all")
  const rights = useLabelRights(folderId)
  const rows = labels.data?.rows ?? []
  const groups = useMemo(() => {
    const order = (a: LabelDefinition, b: LabelDefinition) =>
      Number(a.archived) - Number(b.archived) || a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    return [
      { name: "This page", rows: rows.filter((l) => l.scope === "folder").sort(order), editable: rights.manage },
      { name: "Just for me", rows: rows.filter((l) => l.scope === "personal").sort(order), editable: true },
    ].filter((group) => group.rows.length > 0)
  }, [rows, rights.manage])
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="w-[min(460px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Labels</DialogTitle>
        </DialogHeader>
        <div className="mt-3 max-h-[60vh] space-y-4 overflow-y-auto">
          {groups.map((group) => (
            <section key={group.name} aria-label={group.name}>
              <h3 className="mb-1 text-xs text-muted-foreground">{group.name}</h3>
              <ul className="flex flex-col">
                {group.rows.map((label) => (
                  <LabelEditRow key={label.id} label={label} editable={group.editable} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LabelEditRow({ label, editable }: { readonly label: LabelDefinition; readonly editable: boolean }) {
  const patch = usePatchLabel()
  const archive = useArchiveLabel()
  const [name, setName] = useState(label.name)
  function commit() {
    const next = name.trim()
    if (next === "" || next === label.name) {
      setName(label.name)
      return
    }
    patch.mutate({ label, fields: { name: next } }, { onError: () => setName(label.name) })
  }
  return (
    <li className="flex items-center gap-2 py-0.5">
      <Popover>
        <PopoverTrigger
          disabled={!editable}
          render={
            <button
              type="button"
              aria-label={`Colour of ${label.name}`}
              className="flex size-[var(--control-height)] shrink-0 items-center justify-center rounded-md hover:bg-accent disabled:pointer-events-none"
            >
              <LabelDot color={label.color} className="size-2.5" />
            </button>
          }
        />
        <PopoverContent align="start" className="w-auto p-2">
          <div className="grid grid-cols-4 gap-1">
            {IDENTITY_COLORS.map(([colourName, hex]) => (
              <button
                key={hex}
                type="button"
                aria-label={colourName}
                aria-pressed={same(hex, label.color)}
                onClick={() => patch.mutate({ label, fields: { color: hex } })}
                className="flex size-[var(--control-height)] items-center justify-center rounded-md hover:bg-accent aria-pressed:bg-accent"
              >
                <LabelDot color={hex} className="size-3" />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        bare
        aria-label={`Name of ${label.name}`}
        value={name}
        maxLength={40}
        readOnly={!editable}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") setName(label.name)
        }}
        className={cn(
          "h-[var(--control-height)] flex-1 rounded-md px-2",
          editable && "transition-colors hover:bg-accent focus-visible:bg-accent",
          label.archived && "text-muted-foreground",
        )}
      />
      {editable ? (
        <Button
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          onClick={() => archive.mutate({ label, archived: !label.archived })}
        >
          {label.archived ? "Restore" : "Archive"}
        </Button>
      ) : null}
    </li>
  )
}
