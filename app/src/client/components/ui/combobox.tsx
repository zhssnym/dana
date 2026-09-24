/*
The one picker. Every choice-from-a-list in the app is this control: a quiet
trigger that opens a menu-surfaced listbox, never a native <select> (the
spec's rule: all dropdowns are custom, searchable when long).

- **Searchable past ten options** (the timezone list): a filter field sits on
  top of the list and takes focus on open; typing narrows by label, and the
  arrows move through what is left.
- **Keyboard**: the trigger is a `combobox`; ArrowDown/ArrowUp/Enter/Space
  open it; inside, ArrowUp/ArrowDown/Home/End move, Enter picks, Esc closes
  and gives focus back to the trigger.
- The value is a string; an empty string is "nothing picked" and shows the
  placeholder.
*/
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { CheckIcon, ChevronDownIcon, Search } from '../../lib/icons.js'
import { Popover, PopoverContent, PopoverTrigger } from './popover.js'
import { cn } from './utils.js'

export interface ComboboxOption {
  readonly value: string
  readonly label: string
}

const SEARCH_THRESHOLD = 10

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = 'Choose…',
  searchPlaceholder = 'Search',
  searchable,
  disabled,
  className,
  contentClassName,
  'aria-label': ariaLabel,
}: {
  value: string
  onValueChange: (next: string) => void
  options: readonly ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  /** Defaults to "more than ten options". */
  searchable?: boolean
  disabled?: boolean
  className?: string
  contentClassName?: string
  'aria-label': string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const withSearch = searchable ?? options.length > SEARCH_THRESHOLD

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return options
    /* Spaces and underscores read alike, so "new york" finds New_York. */
    const loose = (text: string) => text.toLowerCase().replace(/[_/]/g, ' ')
    return options.filter((option) => loose(option.label).includes(loose(needle)) || loose(option.value).includes(loose(needle)))
  }, [options, query])

  const selected = options.find((option) => option.value === value)

  function openWith(next: boolean) {
    setOpen(next)
    if (next) {
      setQuery('')
      setActive(Math.max(0, options.findIndex((option) => option.value === value)))
    }
  }

  /* Keep the active row in view as the arrows move it. */
  useEffect(() => {
    if (!open) return
    const row = list.current?.querySelector<HTMLElement>(`[data-index="${String(active)}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [active, open, shown])

  function pick(option: ComboboxOption | undefined) {
    if (!option) return
    if (option.value !== value) onValueChange(option.value)
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent) {
    const last = shown.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((index) => Math.min(last, index + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((index) => Math.max(0, index - 1))
        break
      case 'Home':
        if (withSearch) break
        event.preventDefault()
        setActive(0)
        break
      case 'End':
        if (withSearch) break
        event.preventDefault()
        setActive(last)
        break
      case 'Enter':
        event.preventDefault()
        pick(shown[active])
        break
      case ' ':
        if (withSearch) break
        event.preventDefault()
        pick(shown[active])
        break
    }
  }

  const activeId = shown[active] ? `${listId}-${String(active)}` : undefined

  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            openWith(true)
          }
        }}
        className={cn(
          'inline-flex h-8 max-w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-sm px-2 text-sm text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-accent',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate text-left', selected ? null : 'text-muted-foreground')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        initialFocus={withSearch ? search : list}
        className={cn('flex w-(--anchor-width) min-w-56 flex-col p-1', contentClassName)}
      >
        {withSearch ? (
          <div className="flex items-center gap-2 border-b border-border px-2 pb-1">
            <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <input
              ref={search}
              value={query}
              placeholder={searchPlaceholder}
              aria-label={`${ariaLabel}: search`}
              aria-controls={listId}
              aria-activedescendant={activeId}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        ) : null}
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={withSearch ? -1 : 0}
          aria-activedescendant={withSearch ? undefined : activeId}
          onKeyDown={withSearch ? undefined : onKeyDown}
          className={cn('max-h-72 overflow-y-auto outline-none', withSearch ? 'pt-1' : null)}
        >
          {shown.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No results</li>
          ) : (
            shown.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${String(index)}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                onMouseMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(option)}
                className={cn(
                  'flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm text-foreground',
                  index === active ? 'bg-accent' : null,
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.value === value ? (
                  <CheckIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                ) : null}
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
