/*
The filter, and the strip control that opens it.

Imran's direction, 2026-08-18 (DES-140): the window bar is native to every
window, so the controls in it cannot belong to one screen. The filter model
and its panel move here, and the folder page, My Day, Tasks, Planned,
Important and All all read the same one — same variables, same wording, same
active count, wherever you are.

Broader than a due-date toggle, which is where this started: due, assignee,
importance and abandoned state are the variables a row actually carries, so
they are the variables the filter offers.
*/

import { useState, type ReactNode } from "react"

import {
  Ban,
  CalendarDays,
  Check as CheckIcon,
  ListFilter,
  Star,
  UserRound,
  X,
} from "@/lib/icons"
import { Face } from "@/components/task-card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { PEOPLE } from "@/lib/task-model"
import type { TaskRowProps } from "@/components/task-row"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

export interface TaskFilters {
  due: "any" | "with" | "without" | "overdue"
  assignee: "any" | "unassigned" | string
  importantOnly: boolean
  showAbandoned: boolean
}

export const DEFAULT_FILTERS: TaskFilters = {
  due: "any",
  assignee: "any",
  importantOnly: false,
  showAbandoned: true,
}

export function activeFilterCount(filters: TaskFilters) {
  return (
    Number(filters.due !== "any") +
    Number(filters.assignee !== "any") +
    Number(filters.importantOnly) +
    Number(!filters.showAbandoned)
  )
}

export function applyTaskFilters<T extends TaskRowProps>(
  tasks: T[],
  filters: TaskFilters,
): T[] {
  return tasks.filter((task) => {
    if (filters.due === "with" && !task.due) return false
    if (filters.due === "without" && task.due) return false
    if (filters.due === "overdue" && !task.due?.overdue) return false
    if (filters.assignee === "unassigned" && task.assignee) return false
    if (
      filters.assignee !== "any" &&
      filters.assignee !== "unassigned" &&
      task.assignee?.name !== filters.assignee
    )
      return false
    if (filters.importantOnly && !task.important) return false
    if (!filters.showAbandoned && task.status === "abandoned") return false
    return true
  })
}

/* The window bar's control tier: 32px in a 40px strip. Chrome is thin. */
export const stripButtonClass = (active: boolean) =>
  cn(
    "relative flex size-7 items-center justify-center rounded-md transition-[background-color,color] disabled:pointer-events-none disabled:opacity-35",
    T_FAST,
    FOCUS,
    active
      ? "bg-[var(--color-graphite-100)] text-[var(--color-graphite-800)]"
      : "text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]",
  )

/* A row inside the filter panel — Dana's menu row, radio-flavoured. */
function FilterChoice({
  label,
  selected,
  onSelect,
  leading,
}: {
  label: string
  selected: boolean
  onSelect: () => void
  leading?: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-5 transition-colors",
        T_FAST,
        FOCUS,
        selected
          ? "bg-[var(--color-graphite-100)] text-[var(--color-graphite-900)]"
          : "text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-50)]",
      )}
    >
      {leading}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected ? (
        <CheckIcon className="size-3.5 shrink-0 text-[var(--color-graphite-700)]" strokeWidth={2.5} aria-hidden="true" />
      ) : null}
    </button>
  )
}

export function FilterControl({
  filters,
  setFilters,
}: {
  filters: TaskFilters
  setFilters: (next: (current: TaskFilters) => TaskFilters) => void
}) {
  const filterCount = activeFilterCount(filters)

  return (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={`Filters${filterCount ? ` — ${filterCount} active` : ""}`}
                className={cn(
                  stripButtonClass(filterCount > 0),
                  filterCount > 0 && "w-auto gap-1.5 px-2.5",
                )}
              >
                <ListFilter className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
                {filterCount > 0 ? (
                  <span className="text-[12px] leading-4 font-medium tabular-nums">
                    {filterCount}
                  </span>
                ) : null}
              </button>
            }
          />
          <PopoverContent align="end" className="w-[272px] p-2">
            <p className="flex items-center gap-1.5 px-1 pb-1 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
              <CalendarDays className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Due date
            </p>
            <FilterChoice label="Any" selected={filters.due === "any"} onSelect={() => setFilters((f) => ({ ...f, due: "any" }))} />
            <FilterChoice label="With a due date" selected={filters.due === "with"} onSelect={() => setFilters((f) => ({ ...f, due: "with" }))} />
            <FilterChoice label="Without a due date" selected={filters.due === "without"} onSelect={() => setFilters((f) => ({ ...f, due: "without" }))} />
            <FilterChoice
              label="Overdue"
              leading={<span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--color-danger-600)]" />}
              selected={filters.due === "overdue"}
              onSelect={() => setFilters((f) => ({ ...f, due: "overdue" }))}
            />

            <p className="flex items-center gap-1.5 px-1 pt-2 pb-1 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
              <UserRound className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Assignee
            </p>
            <FilterChoice label="Anyone" selected={filters.assignee === "any"} onSelect={() => setFilters((f) => ({ ...f, assignee: "any" }))} />
            {PEOPLE.map((person) => (
              <FilterChoice
                key={person.name}
                label={person.name}
                leading={<Face person={person} className="size-4 data-[size=sm]:size-4" />}
                selected={filters.assignee === person.name}
                onSelect={() => setFilters((f) => ({ ...f, assignee: person.name }))}
              />
            ))}
            <FilterChoice label="Unassigned" selected={filters.assignee === "unassigned"} onSelect={() => setFilters((f) => ({ ...f, assignee: "unassigned" }))} />

            <div className="mx-1 my-2 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
            {/* Toggles are switches — the state is on/off, not one-of-many,
                and the control should say which kind of question it is. */}
            <label
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] leading-5 text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-50)]",
                T_FAST,
              )}
            >
              <Star className="size-3.5 shrink-0 text-[var(--color-graphite-500)]" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1">Important only</span>
              <Switch
                checked={filters.importantOnly}
                onCheckedChange={(checked) =>
                  setFilters((f) => ({ ...f, importantOnly: checked === true }))
                }
                aria-label="Important only"
              />
            </label>
            <label
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] leading-5 text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-50)]",
                T_FAST,
              )}
            >
              <Ban className="size-3.5 shrink-0 text-[var(--color-graphite-500)]" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1">Show abandoned</span>
              <Switch
                checked={filters.showAbandoned}
                onCheckedChange={(checked) =>
                  setFilters((f) => ({ ...f, showAbandoned: checked === true }))
                }
                aria-label="Show abandoned"
              />
            </label>
            {filterCount > 0 ? (
              <>
                <div className="mx-1 my-2 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setFilters(() => DEFAULT_FILTERS)}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] leading-5 text-[var(--color-graphite-500)] transition-colors hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]",
                    T_FAST,
                    FOCUS,
                  )}
                >
                  <X className="size-3.5 data-[size=sm]:size-3.5" strokeWidth={2} aria-hidden="true" />
                  Clear filters
                </button>
              </>
            ) : null}
          </PopoverContent>
    </Popover>
  )
}
