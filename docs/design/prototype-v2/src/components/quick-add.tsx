import { useEffect, useRef, useState } from "react"
import { Plus, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function QuickAdd({
  folderName,
  label = "Add task",
  onAdd,
  onOpenFullForm,
}: {
  folderName: string
  label?: string
  onAdd: (title: string) => void
  onOpenFullForm: () => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function submit() {
    const nextTitle = title.trim()
    if (!nextTitle) return
    if (nextTitle.length > 300) {
      setError("Too long: limit 300 characters")
      return
    }

    onAdd(nextTitle)
    setTitle("")
    setError("")
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        className="h-[var(--control-height)] w-full justify-start gap-2 px-2 text-sm font-normal text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {label}
      </Button>
    )
  }

  return (
    <div>
      <div className="flex min-h-[var(--control-height)] items-center gap-1 rounded-md bg-[var(--color-graphite-50)] px-2 focus-within:ring-2 focus-within:ring-ring/30">
        <Plus
          className="size-4 shrink-0 text-[var(--color-graphite-500)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (error) setError("")
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              submit()
            } else if (event.key === "Escape") {
              event.preventDefault()
              setTitle("")
              setError("")
              setOpen(false)
            }
          }}
          className="h-[var(--control-height)] border-0 bg-transparent px-1 text-sm shadow-none placeholder:text-[var(--color-graphite-400)] focus-visible:border-transparent focus-visible:ring-0 md:text-sm"
          placeholder={`${label} to ${folderName}`}
          aria-label={`Task title for ${folderName}`}
          aria-invalid={error ? true : undefined}
        />
        <span className="shrink-0 px-1 text-[11px] text-[var(--color-graphite-400)]">
          Enter to add
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]"
                aria-label={`Open full task form for ${folderName}`}
                onClick={onOpenFullForm}
              >
                <SlidersHorizontal
                  className="size-4"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Button>
            }
          />
          <TooltipContent>More options</TooltipContent>
        </Tooltip>
      </div>
      {error ? (
        <p className="mt-1 px-7 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
