import { useEffect, useRef, useState, type FormEvent } from "react"
import { FolderPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
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

export function NewFolderDialog({
  open,
  groupLabel,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  groupLabel?: string
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName("")
    setError("")
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = name.trim()
    if (!nextName) {
      setError("Give the folder a name")
      return
    }
    if (nextName.length > 100) {
      setError("Too long: limit 100 characters")
      return
    }

    onCreate(nextName)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-[var(--color-graphite-100)] text-[var(--color-graphite-700)]">
              <FolderPlus className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              {groupLabel
                ? `Create a private folder in “${groupLabel}”. You can color or share it afterward.`
                : "Create a private folder. You can label, color or share it afterward."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <label htmlFor="new-folder-name" className="mb-1.5 block text-xs font-medium text-[var(--color-graphite-700)]">
              Folder name
            </label>
            <Input
              ref={inputRef}
              id="new-folder-name"
              value={name}
              maxLength={101}
              placeholder="e.g. Finance"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? "new-folder-error" : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (error) setError("")
              }}
            />
            {error ? (
              <p id="new-folder-error" className="mt-1.5 text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" className="h-[var(--control-height)] px-3" />}
            >
              Cancel
            </DialogClose>
            <Button type="submit" className="h-[var(--control-height)] bg-[var(--color-graphite-900)] px-3 text-white hover:bg-[var(--color-graphite-800)]">
              Create folder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
