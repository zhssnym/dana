/*
9.3's header strip of chips, and the pickers each one opens in place.

The v2 section replaces a column of labelled fields with a strip: "a header
strip of chips - due date, folder, assignee, reminder, repeat - each opening
its picker in place. The pickers open on the answer, not the instrument:
resolved presets first, a calendar or list behind them, one shape at one
width."

**Two rules of the v2 table are the whole point of this file**, and they are
the pair AC-219 reads on one task. A due date is a day, so the due picker
carries a month grid, the three resolved presets, and nothing a person could
put a clock time into; the reminder is "one picker, a time on that day,
writing 4.8's time_of_day mode", so the reminder picker carries a clock and
the due picker does not. A client that strips time from both, or offers it on
both, fails exactly one half of that criterion and reads as consistent while
doing it.

**The assignee menu gains the way out** (9.3's v2 row and DES-194): the
folder's members, "Invite by email", then a separator, then "Unassigned"
last. Last is where the design put it and the order is asserted, because a
menu offering the value first has copied it and lost the reason. INV-5 still
hides the whole control in a single-member folder, which is where the server
refuses the null with AC-032's 409, so nothing is lost at the only place the
refusal bites.

**Why this directory is new and what still sits beside it.** 9.3's v2 opening
is "There is no task form", and the reunion it asks for is larger than these
chips: it retires the Save control, commits every edit as it is made, and
expands a row in place into this same surface. Seven acceptance criteria
still address the v1 form by its expander and its ten labelled fields
(AC-092, AC-093, AC-094, AC-161, AC-169, AC-170, AC-179), and protocol
section 8 does not let this role edit them so an implementation passes. So
the strip lands here, above the form, as the v2 surface those criteria will
be reworked onto; the fields below it stay until they are. The chips carry
names that are deliberately *not* the ten field names of 9.3's v1 table, so
that the suite's `formField` helper still resolves one control per field and
never two.

**A chip commits where a chip can commit.** On an existing task the write is
issued the moment the picker answers, which is the v2 rule; on a creation
there is no row to write to, so the value goes into the form's own state and
rides the create body. Both paths set the same form state, so the strip and
the fields below it never disagree about what the surface holds.
*/
import { useState } from 'react'

import {
  Bell,
  CalendarDays,
  Folder as FolderIcon,
  Repeat2,
  UserRound,
} from '../../lib/icons.js'
import type { LucideIcon } from '../../lib/icons.js'

import type { Folder } from '../../../shared/folders.js'
import { formatDueDate } from '../../parts/presenters.js'
import { Button } from '../ui/button.js'
import { Calendar } from '../ui/calendar.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js'
import { cn } from '../ui/utils.js'
import { DATE_CLEAR, DATE_TODAY, DATE_TOMORROW, INVITE_BY_EMAIL } from '../task-form/copy.js'
import { PRESET_LABELS, PRESET_ORDER } from '../task-form/presets.js'
import type { RepeatPreset, RepeatState } from '../task-form/presets.js'
import {
  CHIP_ASSIGNEE,
  CHIP_DUE,
  CHIP_FOLDER,
  CHIP_REMINDER,
  CHIP_REPEAT,
  DATE_DEPENDENT_HELPER,
  PICKER_DUE,
  PICKER_REMINDER,
  REMINDER_NONE,
  REMINDER_TIME,
  UNASSIGNED,
} from './copy.js'

/** The one shape at one width 9.3 asks the pickers to keep. */
const PICKER = 'w-[300px] p-3'

const CHIP =
  'h-8 shrink-0 gap-1.5 rounded-full border border-border bg-transparent px-3 text-[13px] font-normal text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/60'

/** A chip's value when the field holds none, so the strip never renders a gap. */
const EMPTY = '—'

/**
 * A civil date as a `Date` in the browser's own zone, and back.
 *
 * The grid takes and answers `Date`s; 4.11's column is a civil date with no
 * zone at all. Both directions go through the date's own parts rather than
 * through `toISOString`, which would re-anchor a floating day to UTC and move
 * it by one west of Greenwich.
 */
function toLocalDate(civilDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(civilDate)
  if (match === null) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function toCivilDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * The element every chip trigger renders, and nothing else.
 *
 * A trigger clones the element handed to its `render` prop, so that element
 * has to be the button itself: a component in that slot receives the props
 * and drops them, and the chip then takes the press while its picker never
 * opens. Measured against a live server rather than reasoned, which is the
 * only way this class of fault is ever visible.
 */
function chipButton(disabled?: boolean, title?: string): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      className={CHIP}
      disabled={disabled}
      title={title}
    />
  )
}

/**
 * A chip's contents: the field's name for a screen reader and its current
 * value for an eye, which is 9.1's addressing sentence applied to a control
 * whose visible text is data rather than a label.
 */
function ChipBody({
  icon: Icon,
  name,
  value,
}: {
  readonly icon: LucideIcon
  readonly name: string
  readonly value: string
}): React.JSX.Element {
  return (
    <>
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">{name}</span>
      <span className="max-w-40 truncate">{value}</span>
    </>
  )
}

export interface TaskChipsProps {
  /** 4.11's civil date, or empty. */
  readonly dueDate: string
  readonly onDueDateChange: (next: string) => void
  readonly folderId: string
  readonly folders: readonly Folder[]
  readonly onFolderChange: (next: string) => void
  /** 9.3: hidden entirely in a single-member folder (INV-5). */
  readonly assigneeVisible: boolean
  readonly assigneeId: string | null
  readonly members: readonly { readonly user: { readonly id: string; readonly display_name: string | null } }[]
  readonly onAssigneeChange: (next: string | null) => void
  readonly onInvite: () => void
  /** 4.8's time-of-day arm, HH:MM or empty. The only mode v2 writes. */
  readonly reminderTime: string
  readonly onReminderTimeChange: (next: string) => void
  readonly repeat: RepeatState
  readonly onRepeatChange: (next: RepeatPreset) => void
  /** The viewer's today, from `api/tz.ts` through the form. */
  readonly today: string
}

export function TaskChips({
  dueDate,
  onDueDateChange,
  folderId,
  folders,
  onFolderChange,
  assigneeVisible,
  assigneeId,
  members,
  onAssigneeChange,
  onInvite,
  reminderTime,
  onReminderTimeChange,
  repeat,
  onRepeatChange,
  today,
}: TaskChipsProps): React.JSX.Element {
  const [dueOpen, setDueOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)

  const dated = dueDate !== ''
  const selected = toLocalDate(dueDate)
  const todayDate = toLocalDate(today) ?? new Date()
  const folderName = folders.find((folder) => folder.id === folderId)?.name ?? EMPTY
  const assignee = members.find((member) => member.user.id === assigneeId)
  const assigneeName =
    assigneeId === null ? UNASSIGNED : (assignee?.user.display_name ?? UNASSIGNED)

  return (
    <div data-task-chips className="flex flex-wrap items-center gap-1.5 px-1 pt-1 pb-2">
      {/* Due date. The picker is a day grid and three resolved presets; 9.3's
          v2 table refuses it a clock, and AC-219 reads that refusal as the
          absence of any control a time could be typed into. */}
      <Popover open={dueOpen} onOpenChange={setDueOpen}>
        <PopoverTrigger render={chipButton()}>
          <ChipBody
            icon={CalendarDays}
            name={CHIP_DUE}
            value={dated ? formatDueDate(dueDate, today) : EMPTY}
          />
        </PopoverTrigger>
        <PopoverContent role="dialog" aria-label={PICKER_DUE} className={PICKER}>
          <div className="flex flex-wrap gap-1 pb-2">
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2.5 text-xs"
              onClick={() => {
                onDueDateChange(today)
                setDueOpen(false)
              }}
            >
              {DATE_TODAY}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2.5 text-xs"
              onClick={() => {
                onDueDateChange(toCivilDate(new Date(todayDate.getTime() + 86_400_000)))
                setDueOpen(false)
              }}
            >
              {DATE_TOMORROW}
            </Button>
            {dated ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onDueDateChange('')
                  setDueOpen(false)
                }}
              >
                {DATE_CLEAR}
              </Button>
            ) : null}
          </div>
          <Calendar
            selected={selected}
            today={todayDate}
            onSelect={(date) => {
              onDueDateChange(toCivilDate(date))
              setDueOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Folder. 9.3's v2 row is "the real folder library"; the "New folder…"
          entry it also names is owed with the reunion, and its absence is
          recorded in this directory's README rather than left to be found. */}
      <DropdownMenu>
        <DropdownMenuTrigger render={chipButton()}>
          <ChipBody icon={FolderIcon} name={CHIP_FOLDER} value={folderName} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
          {folders.map((folder) => (
            <DropdownMenuItem
              key={folder.id}
              onClick={() => {
                onFolderChange(folder.id)
              }}
              className="min-h-[var(--control-height)] text-sm"
            >
              {folder.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Assignee, with the way out last after a separator (DES-194, AC-220). */}
      {assigneeVisible ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={chipButton()}>
            <ChipBody icon={UserRound} name={CHIP_ASSIGNEE} value={assigneeName} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {members.map((member) => (
              <DropdownMenuItem
                key={member.user.id}
                onClick={() => {
                  onAssigneeChange(member.user.id)
                }}
                className="min-h-[var(--control-height)] text-sm"
              >
                {member.user.display_name ?? 'Someone'}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onClick={onInvite}
              className="min-h-[var(--control-height)] text-sm"
            >
              {INVITE_BY_EMAIL}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onAssigneeChange(null)
              }}
              className="min-h-[var(--control-height)] text-sm"
            >
              {UNASSIGNED}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {/* Reminder. One picker, a time on that day, and it is disabled rather
          than hidden without a date, which is 9.3's own word for it. */}
      <Popover open={reminderOpen} onOpenChange={setReminderOpen}>
        <PopoverTrigger
          disabled={!dated}
          render={chipButton(!dated, dated ? undefined : DATE_DEPENDENT_HELPER)}
        >
          <ChipBody
            icon={Bell}
            name={CHIP_REMINDER}
            value={reminderTime === '' ? REMINDER_NONE : reminderTime}
          />
        </PopoverTrigger>
        <PopoverContent role="dialog" aria-label={PICKER_REMINDER} className={PICKER}>
          <label
            htmlFor="task-chip-reminder-time"
            className="block px-1 pb-1 text-[13px] font-medium text-muted-foreground"
          >
            {REMINDER_TIME}
          </label>
          <div className="flex items-center gap-1">
            <input
              id="task-chip-reminder-time"
              type="time"
              value={reminderTime}
              onChange={(event) => {
                onReminderTimeChange(event.target.value)
              }}
              className="h-[var(--control-height)] w-full min-w-0 rounded-md border border-border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            {reminderTime === '' ? null : (
              <Button
                type="button"
                variant="ghost"
                className="h-[var(--control-height)] shrink-0 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onReminderTimeChange('')
                  setReminderOpen(false)
                }}
              >
                {DATE_CLEAR}
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Repeat, preset-driven exactly as v1 and never a raw RRULE box. The
          chosen-days and every-N arms stay on the field below until the
          reunion moves them, which the README records. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!dated}
          render={chipButton(!dated, dated ? undefined : DATE_DEPENDENT_HELPER)}
        >
          <ChipBody icon={Repeat2} name={CHIP_REPEAT} value={PRESET_LABELS[repeat.preset]} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {PRESET_ORDER.map((preset) => (
            <DropdownMenuItem
              key={preset}
              onClick={() => {
                onRepeatChange(preset)
              }}
              className={cn('min-h-[var(--control-height)] text-sm')}
            >
              {PRESET_LABELS[preset]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
