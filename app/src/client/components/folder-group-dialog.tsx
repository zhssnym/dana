/*
Creating and renaming a folder group.

9.1 makes a group the label of 7.4's my-membership and nothing else, so
creating one is naming it on a folder and renaming one rewrites that label on
every folder carrying it. That is why the create mode picks folders and the
rename mode does not: with no folder selected there is nothing to write the
label to, and a group that exists nowhere is a group this data model cannot
hold. AC-180 names creating, renaming, moving a
folder between groups and deleting a group.

Deleting a group is not here, and that is deliberate rather than missing.
9.1 gives it a confirmation with normative copy, "Delete folder group? {N}
folders keep their tasks and move to the ungrouped list.", and every
confirmation of 9.3 to 9.9 is `ConfirmDialog` with 9.1's uniform "Continue"
and "Cancel". This dialog is a form and takes its own commit names, which is
the same split `new-folder-dialog.tsx` records.

Nothing here reads. The folder list arrives as a prop and `onSubmit` writes.
*/
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Folder } from '../lib/icons.js'

import { Button } from './ui/button.js'
import { Checkbox } from './ui/checkbox.js'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js'
import { Input } from './ui/input.js'

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
  preselected,
  existingLabels,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  mode: 'create' | 'rename'
  currentLabel?: string
  folders: FolderGroupOption[]
  /**
   * The folders already checked when the create dialog opens, which are the
   * folders the act was taken on.
   *
   * 9.1 makes creating a group "naming it on a folder": the action is taken from a
   * folder's own menu, so that folder is the group's first member and a dialog
   * that opened with nothing selected would ask a person to choose the folder
   * they had just pointed at. Rename ignores it and checks the whole group,
   * there being nothing else a rename could mean.
   *
   * **Two folders can arrive here**: resting one folder on another for a
   * second and a half proposes that the two become a group, and the hold
   * hands its pair to this dialog with both ticked rather than inventing a
   * surface of its own. One folder or two, the act is the same one.
   */
  preselected?: readonly string[]
  existingLabels: string[]
  onOpenChange: (open: boolean) => void
  onSubmit: (label: string, folderNames: string[]) => void
}) {
  const [name, setName] = useState('')
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(mode === 'rename' ? (currentLabel ?? '') : '')
    setSelectedFolders(
      mode === 'rename' ? folders.map((folder) => folder.name) : [...(preselected ?? [])],
    )
    setError('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [currentLabel, folders, mode, open, preselected])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = name.trim()

    if (!nextName) {
      setError('Give the collection a name')
      return
    }
    if (nextName.length > 40) {
      setError('Too long: limit 40 characters')
      return
    }

    const duplicate = existingLabels.some(
      (label) =>
        label.toLocaleLowerCase() === nextName.toLocaleLowerCase() &&
        label.toLocaleLowerCase() !== (currentLabel ?? '').toLocaleLowerCase(),
    )
    if (duplicate) {
      setError('That collection already exists. Move pages into it instead.')
      return
    }

    /* An empty shelf is allowed: 4.18 gives it a row of
       its own, so the folders can arrive later by drag or from its page. */

    onSubmit(nextName, selectedFolders)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(460px,calc(100vw-32px))]">
        <form onSubmit={submit}>
          <DialogHeader>
            {/* One word, collection, from the foot button
                through this dialog to the row's menu. */}
            <DialogTitle>
              {mode === 'rename' ? 'Rename collection' : 'New collection'}
            </DialogTitle>
            {/* An empty collection is legal and AC-313 names one, so the create
                sentence must not ask for at least one folder. */}
            <DialogDescription>
              {mode === 'rename'
                ? 'Collections are yours alone: renaming one changes nothing for other members.'
                : 'A collection holds pages, and is yours alone. Add pages now or drag them in later.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="folder-group-name"
                className="mb-1.5 block text-xs font-medium text-section-foreground"
              >
                Collection name
              </label>
              <Input
                ref={inputRef}
                id="folder-group-name"
                value={name}
                maxLength={41}
                placeholder="e.g. Family"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'folder-group-error' : undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  if (error) setError('')
                }}
              />
            </div>

            {mode === 'create' ? (
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-section-foreground">
                  Pages
                </legend>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-muted p-1">
                  {folders.map((folder) => {
                    const checked = selectedFolders.includes(folder.name)
                    const checkboxId = `folder-group-${folder.name
                      .toLocaleLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')}`

                    return (
                      <label
                        key={folder.name}
                        htmlFor={checkboxId}
                        className="flex min-h-[var(--control-height)] cursor-pointer items-center gap-3 rounded-md px-2.5 text-sm text-foreground hover:bg-accent"
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
                            if (error) setError('')
                          }}
                        />
                        <Folder
                          className="size-4 shrink-0"
                          style={{ color: folder.color }}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                        {folder.label ? (
                          <span className="truncate text-xs text-muted-foreground">
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
              className="h-[var(--control-height)] px-3"
            >
              {mode === 'rename' ? 'Rename collection' : 'Create collection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
