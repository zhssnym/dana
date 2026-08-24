import { useEffect, useRef, useState, type FormEvent } from "react"
import { Folders } from "@/lib/icons"
import { FolderMark } from "@/components/folder-mark"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export interface FolderGroupOption {
  name: string
  color: string
  label: string | null
}

export function FolderGroupDialog({
  open,
  mode,
  currentLabel,
  folders,
  preselect,
  existingLabels,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  mode: "create" | "rename"
  currentLabel?: string
  folders: FolderGroupOption[]
  /* Folders already chosen when the dialog opens. The sidebar's drag gesture
     arrives here with the two that met, so the only thing left to do is the
     one thing the gesture cannot say: what the group is called. */
  preselect?: string[]
  existingLabels: string[]
  onOpenChange: (open: boolean) => void
  onSubmit: (label: string, folderNames: string[]) => void
}) {
  const [name, setName] = useState("")
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(mode === "rename" ? (currentLabel ?? "") : "")
    setSelectedFolders(
      mode === "rename" ? folders.map((folder) => folder.name) : (preselect ?? []),
    )
    setError("")
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [currentLabel, folders, mode, open, preselect])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = name.trim()

    if (!nextName) {
      setError("Give the group a name")
      return
    }
    if (nextName.length > 40) {
      setError("Too long: limit 40 characters")
      return
    }

    const duplicate = existingLabels.some(
      (label) =>
        label.toLocaleLowerCase() === nextName.toLocaleLowerCase() &&
        label.toLocaleLowerCase() !== (currentLabel ?? "").toLocaleLowerCase(),
    )
    if (duplicate) {
      setError("That group already exists. Move folders into it instead.")
      return
    }

    if (mode === "create" && selectedFolders.length === 0) {
      setError("Select at least one folder")
      return
    }

    onSubmit(nextName, selectedFolders)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(460px,calc(100vw-32px))]">
        <form onSubmit={submit}>
          <DialogHeader>
            <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-[var(--color-graphite-100)] text-[var(--color-graphite-700)]">
              <Folders className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <DialogTitle>
              {mode === "rename" ? "Rename shelf" : "New shelf"}
            </DialogTitle>
            <DialogDescription>
              {mode === "rename"
                ? "This changes your personal label on every folder in this group. Other members are unaffected."
                : "Groups are personal labels. Select at least one folder because Dana cannot save an empty group."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="folder-group-name"
                className="mb-1.5 block text-xs font-medium text-[var(--color-graphite-700)]"
              >
                Group name
              </label>
              <Input
                ref={inputRef}
                id="folder-group-name"
                value={name}
                maxLength={41}
                placeholder="e.g. Family"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "folder-group-error" : undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  if (error) setError("")
                }}
              />
            </div>

            {mode === "create" ? (
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-[var(--color-graphite-700)]">
                  Folders
                </legend>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-[var(--color-graphite-25)] p-1">
                  {folders.map((folder) => {
                    const checked = selectedFolders.includes(folder.name)
                    const checkboxId = `folder-group-${folder.name
                      .toLocaleLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")}`

                    return (
                      <label
                        key={folder.name}
                        htmlFor={checkboxId}
                        className="flex min-h-[var(--control-height)] cursor-pointer items-center gap-3 rounded-md px-2.5 text-sm text-[var(--color-graphite-800)] hover:bg-[var(--color-graphite-100)]"
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={checked}
                          onCheckedChange={(nextChecked) => {
                            setSelectedFolders((current) =>
                              nextChecked
                                ? [...current, folder.name]
                                : current.filter((name) => name !== folder.name),
                            )
                            if (error) setError("")
                          }}
                        />
                        {/* The glyph its owner chose, not the generic one —
                            you are picking folders out of a list here, and a
                            list where every folder looks the same is a list
                            you have to read rather than scan. */}
                        <FolderMark
                          name={folder.name}
                          color={folder.color}
                          className="size-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                        {folder.label ? (
                          <span className="truncate text-xs text-[var(--color-graphite-500)]">
                            {folder.label}
                          </span>
                        ) : null}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ) : null}

            {error ? (
              <p id="folder-group-error" className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="h-[var(--control-height)] px-3"
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              variant="commit" className="h-[var(--control-height)] px-3"
            >
              {mode === "rename" ? "Rename group" : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
