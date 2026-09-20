/*
The three pickers that answer a question about time, and the parts they are
built from.

Extracted from `screens/row-concepts.tsx` on 2026-08-18 with the port of the
row into the shell. DES-123 is why this is a module and not a copy: the date
and time pickers are constant to the Dana brand, so they are one component
wherever they appear and changing them changes every place at once. A picker
copied into a second place is a picker that will one day disagree with itself.

DES-120 is the shape they all share, the answers somebody probably wants, a
hairline, then one option that opens everything exact, and the reasoning for
it lives in that entry rather than being restated here. DES-109 is the
behaviour: there is no Save and no Done, choosing commits. DES-122 is why the
Due panel has no clock in it.
*/

import { Ban, Repeat2, type LucideIcon } from "../lib/icons.js"
import { ConfirmDialog } from "./ui/ConfirmDialog.js"
import { CLEAR_DATE_WARNING, DATE_CLEAR } from "./task-copy.js"
import { createContext, useContext, useState, type ReactNode } from "react"
import { Check as CheckIcon } from "../lib/icons.js"

/* Seam, S23: `TimeRow` no longer crosses. It is the prototype's two-spinner
   clock, built for a reminder measured as an offset from a due date; 9.3's v2
   row is "one picker, a time on that day", so what the panel asks for is a
   time and the plainest control that takes one is the platform's. The
   primitive stays exactly as lifted in `ui/calendar.tsx` for whatever asks it
   next. */
import { Calendar, sameDay } from "./ui/calendar.js"
/*
**Seam, S23: a picker writes its own field, and `tasks/task-writer.tsx` said
so before this file arrived.**

That module's header names exactly what it does not send and why: "a due
date, a reminder and a repeat rule arrive here as the *words a chip says*
rather than as values, because that is what `ConceptTask` holds; their
pickers carry the values and their own endpoints (7.6's PATCH, 7.9's PUT),
and those pickers are `components/task-pickers.tsx`, which lands at S23."
This is S23 and this is that file, so the endpoints are called here.

**Why the words are not enough, which is the fault this closes.** A panel
that only calls `patch` writes into the card's local edits layer, so the
chip updates, the row behind it updates, and nothing reaches the server:
`conceptPatchToBody` drops `due` and `reminder` deliberately, and
`unwritten()` exists to name that. AC-169 and AC-170 measure it exactly,
"fifteen seconds after the edit the page had sent no request to /api/v1 at
all", and 9.3 is what they measure against: "every edit commits as it is
made, there is no Save control and no draft state", so an edit that reaches
no endpoint is a value held in the browser and nowhere else. **A due date
had the same fault and no criterion catches it**, which is why it is fixed
here beside the reminder rather than only where a red pointed.

**`patch` is still called, and both calls are load-bearing.** The local one
is what makes the strip right in the same render, which AC-092 requires of
the two date-dependent chips, "a strip that enables on the response renders
a chip a person cannot press while the answer sits beside it"; the endpoint
is what makes it true. 8.3's refetch is what reconciles them, which is this
client's whole invalidation strategy and is why neither call is optimistic.

**The repeat rule is deliberately not wired here**, and the omission is
named rather than left: 4.11's subset needs a rule built from the preset's
operands, and the builder for that left with the retired
`components/task-form/presets.ts`. Nothing in the leg measures it, and
shipping a half-built rule is worse than shipping none, so the repeat stays
a value the card holds and section 13 carries what is owed.
*/
import { useDeleteReminder, usePutReminder, useUpdateTask } from "../api/mutations.js"
import { isoDay } from "../tasks/task-model.js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
import { formatTime, useTimeFormat } from "../lib/time-format.js"
/*
**Seam, S23: `LAB_TODAY` becomes `today()`.** The prototype froze a Monday in
August 2026 so its screens and its calendar would agree with each other, and
RFC 0004's close forbids a fixture crossing in any form. `tasks/task-model.ts`
carries the replacement and the reason it is a function rather than a
constant: a constant is evaluated at module load, so a browser left open
across midnight goes on offering yesterday as "Today" in every picker on the
page. The value itself is 4.11's today in the viewer's own zone, from
`api/tz.ts`, which is the one place this client evaluates a date.
*/
import {
  DAY_LONG,
  MONTH_SHORT,
  WEEKDAY_KEYS,
  WORKING_WEEK,
  addDays,
  dueLabelFor,
  nextWeekday,
  ordinal,
  parseDueLabel,
  repeatAnchor,
  repeatSummary,
  shortDate,
  today,
  type ConceptTask,
} from "../tasks/task-model.js"
import { cn } from "./ui/utils.js"

/*
**Seam, S23: a picker closes once its question is answered.**

9.3: "The pickers open on the answer, not the instrument: resolved presets
first, a calendar or list behind them." AC-092 reads the second half of that
as a state rather than a layout, "the picker closes once the day is answered,
which is what 'opens on the answer' means", and the prototype's panels leave
the popover standing: they commit on choosing, DES-109, and then wait to be
dismissed.

**A context rather than a prop, because the answer is given three levels
down.** `PickerChip` owns the popover; the panels inside it own the question;
the options inside those are what a person presses. Threading a close through
all three would put a callback on every panel's signature for a fact only one
of them uses, and the panels are lifted files.

**And it is per option rather than per press**, which is the distinction
AC-092 turns on twice. A due preset answers the whole question and closes; a
repeat preset does not, its operands living behind it, and that case says so
in as many words: "The repeat picker stays open on purpose, its operands
living behind the preset." So an option asks to close only where choosing it
finishes the field.
*/
const PickerClose = createContext<(() => void) | null>(null)

/** Closes the picker this control sits in, where there is one. */
export function usePickerClose(): () => void {
  const close = useContext(PickerClose)
  return () => close?.()
}

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

/* A chip that opens a panel rather than a list. Same anatomy as PropChip so
   the strip reads as one row of equals. */
/*
**Seam, S23: the chip announces its field, and F2 of the criteria triage is
why.**

The prototype names this control by its `tooltip` alone, which is the field's
name, and renders the value as its only text; `PropChip` in
`components/task-card.tsx` renders the value and carries no field name at all.
9.3 puts the strip's five chips in its field table by field, and 9.1's
addressing paragraph makes every control it names reachable by role and by
name, so the triage's F2 reads the pair together: the harness reads a chip as
a button whose accessible name is the field and then the value, "Due date 3
Sep", and "a strip whose chips did not say which field they were would be five
values and no questions."

**Fifty browser cases reach the task surface through this**, by `taskChip`,
`formField`, `openChipPicker` or `setReminderTime`, and every one is green
today. 11.13 settles the conflict without a ruling: the role and the name are
the section's, so the lift owes them at a named seam.

So the field's name is a **visually hidden run before the value** rather than
an `aria-label`, and the reasons are the ones `ui/StarButton.tsx` closed at P8
and the retired `task-card/copy.ts` restated. A label overrides the content,
so a chip labelled "Due date" would answer to that name while showing
something else, and the harness's `chipValue` could not read the value off it.
The order matters, because the harness matches the field as a prefix and
deliberately does not anchor the tail, the value "being what a person reads
off the strip without opening anything". And the glyph stays `aria-hidden`, so
a glyph swap is never a rename.

The prototype's tooltip stays exactly as it wrote it, because a tooltip is for
the eye and this run is for the reader. What it stops doing is standing in for
the name, which is the half F2 measured as wrong: "PickerChip carries the
field name in a tooltip, which is not an accessible name."
*/
export function PickerChip({
  icon: Icon,
  value,
  tooltip,
  field,
  muted = false,
  color,
  disabled = false,
  children,
}: {
  icon: LucideIcon
  value: string
  tooltip: string
  /* 9.3's own name for the field, announced before the value. It defaults to
     the tooltip, which is that name for the three chips the card draws today,
     and is a prop rather than the tooltip outright so a caller whose tooltip
     is a sentence can still say which field it is. */
  field?: string
  muted?: boolean
  color?: string
  /* Reminder and repeat stay visible but inoperable until the task has a due
     date. Their position immediately after the due-date control communicates
     the dependency without adding a permanent instruction below the strip. */
  disabled?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            title={tooltip}
            disabled={disabled}
            onClick={(event) => event.stopPropagation()}
            className={cn("rounded-md disabled:pointer-events-none", FOCUS)}
          >
            <span
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-1.5 text-[12px] leading-4 transition-[background-color,border-color]",
                T_FAST,
                "hover:border-[var(--color-graphite-300)] hover:bg-card data-popup-open:border-[var(--color-graphite-300)] data-popup-open:bg-card",
                muted
                  ? "text-[var(--color-graphite-500)]"
                  : "text-[var(--color-graphite-800)]",
                disabled && "opacity-50",
              )}
            >
              <Icon
                className="size-3.5 shrink-0"
                style={color ? { color } : undefined}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="sr-only">{field ?? tooltip}</span>
              <span className="truncate">{value}</span>
            </span>
          </button>
        }
      />
      <PopoverContent align="start" className="w-auto p-2">
        <PickerClose value={() => setOpen(false)}>{children}</PickerClose>
      </PopoverContent>
    </Popover>
  )
}

/* One choice in a picker, shaped like a menu item rather than a pill: full
   width, on its own line, with the value it resolves to on the right where a
   person reads it instead of working it out. "Tomorrow" is only useful next
   to the date it means.

   Every picker in the card now leads with a list of these, because nearly
   every date anybody sets is one of about five, and making the common answer
   one click is worth more than the calendar it sits above. */
/*
**Seam, S23: an option's role is the ordinary one, and the repeat list is the
one exception.**

The prototype gives every option `role="menuitemradio"`, which is what its
`role="menu"` container asked for. Neither survives: the container is a group
now, one role per picker, and `menuitemradio` is a role nothing in the suite
addresses, `getByRole('menuitem')` matching that role exactly rather than its
subtypes. So an option resting inside a group answered to nothing at all.

9.1's addressing sentence settles what it should be: "a control not named here
is reached by its role in the ordinary sense", and the ordinary role of a
control that sets a value is a button. AC-092 reads the due picker's presets
exactly that way, `getByRole('button', { name: 'Tomorrow', exact: true })`.

**The repeat list is a menu and says so**, which is not an inconsistency but
the distinction the harness itself draws: "A picker asking for a day or a time
is a small modal surface and carries the dialog role; one offering a list of
named choices is a menu." The due and reminder panels put a calendar or a
clock under their presets and are the first kind; the repeat panel is a list
of named rules and is the second, and AC-092 reads its presets through
`chipChoices`, which is `menuitem` or `option`. The client this replaces drew
the same split, buttons in the due and reminder pickers and menu items in the
repeat one, and it is recorded here rather than rediscovered.

The chosen option is `aria-pressed` on a button and font weight on a menu
item, because a menu item takes no pressed state and 9.3 asserts neither.
*/
export function PickerOption({
  icon: Icon,
  label,
  hint,
  active,
  onSelect,
  menu = false,
  finishes = false,
}: {
  icon?: LucideIcon
  label: string
  hint?: string
  active: boolean
  onSelect: () => void
  /* Choosing this answers the whole field, so the picker closes. See the
     context above; a repeat preset deliberately does not set it. */
  finishes?: boolean
  /* One of a list of named rules rather than a value the field takes. Only
     the repeat panel passes it; see the header above. */
  menu?: boolean
}) {
  const close = usePickerClose()
  return (
    <button
      type="button"
      {...(menu ? { role: "menuitem" } : { "aria-pressed": active })}
      onClick={() => {
        onSelect()
        if (finishes) close()
      }}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] leading-5 transition-colors",
        T_FAST,
        FOCUS,
        "hover:bg-[var(--color-graphite-100)]",
        active
          ? "font-medium text-[var(--color-graphite-900)]"
          : "text-[var(--color-graphite-700)]",
      )}
    >
      {Icon ? (
        <Icon
          className="size-4 shrink-0 text-[var(--color-graphite-400)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      ) : null}
      <span className="flex-1 truncate">{label}</span>
      {/*
      **Seam, S23: the hint is drawn and not announced.**

      It is the day a preset resolves to, "Sat 15 Aug" beside "This weekend",
      and the prototype puts it in the button's own content, so the control's
      accessible name is "This weekend Sat 15 Aug". AC-092 asks for the preset
      by `{ name: 'Tomorrow', exact: true }`, and 9.1's addressing sentence is
      why exact is the right ask: a control is reached by its name, and a name
      that carries today's date changes every day.

      `aria-hidden` rather than moving the hint out of the button, because
      the hint belongs inside the target a person presses, which is DES-120's
      whole point about resolved answers, and because a screen reader is told
      the same fact by the calendar the panel opens onto.
      */}
      {hint ? (
        <span
          aria-hidden="true"
          className="shrink-0 text-[12px] leading-4 tabular-nums text-[var(--color-graphite-400)]"
        >
          {hint}
        </span>
      ) : null}
      {/* The tick holds its place whether or not it is showing, so a list of
          options never reflows by a few pixels as the selection moves. */}
      <CheckIcon
        className={cn(
          "size-3.5 shrink-0 text-[var(--color-graphite-800)] transition-opacity",
          T_FAST,
          active ? "opacity-100" : "opacity-0",
        )}
        strokeWidth={2.5}
        aria-hidden="true"
      />
    </button>
  )
}

/* The hairline between a picker's easy answers and its exact ones. */
export function PickerDivider() {
  return <div aria-hidden="true" className="my-1 h-px bg-[var(--color-graphite-200)]" />
}

export function PickerLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-1 text-[11px] leading-4 font-medium tracking-wide text-[var(--color-graphite-400)] uppercase">
      {children}
    </div>
  )
}

/* One row of short exclusive choices, behaving like a segmented control. The
   only shape left in the pickers where a pill row is still right: a
   recurrence interval and its weekdays are a set you compare at a glance,
   not a menu you read down. */
export function PickerSegments({
  label,
  options,
  active,
  onPick,
}: {
  label: string
  options: { key: string; label: string }[]
  active: string
  onPick: (key: string) => void
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className="w-12 shrink-0 text-[12px] leading-4 text-[var(--color-graphite-500)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={active === option.key}
            onClick={() => onPick(option.key)}
            className={cn(
              "h-7 rounded-md px-2.5 text-[12px] leading-4 transition-colors",
              T_FAST,
              FOCUS,
              active === option.key
                ? "bg-[var(--color-graphite-900)] font-medium text-white"
                : "bg-[var(--color-graphite-50)] text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- the pickers, */
/*
Due, Reminder and Repeat, rebuilt 2026-08-18 at Imran's direction.

What they were: a label, a row of three or four pills, and a bare month grid
underneath that never showed which day was selected. What was wrong with that
is not that it was ugly, though it was; it is that it made the rare answer and
the common one cost the same. Nearly every date anybody sets is today,
tomorrow, this weekend or next week, and all four of those were being spelled
out on a calendar.

So all three now open on the answers somebody probably wants, each showing the
date it resolves to, and keep the exact controls below a hairline. The shape is
deliberately identical across the three, so learning one teaches the other two,
and it is the shape the rest of the product's menus already have.

DES-109 governs the behaviour: there is no Save and no Done. Choosing commits.
*/

export interface PanelProps {
  task: ConceptTask
  patch: (id: string, fields: Partial<ConceptTask>) => void
}

/*
All three panels are one shape, settled 2026-08-18: the answers somebody
probably wants, a hairline, then one option that opens everything exact. Only
that last option can expand, and only one thing is ever expanded, so the panel
is the size of the question being asked rather than the size of the largest
question it could ask.

The version before this stood a calendar and two sixty-row time columns open
at all times. Every panel was the same size as the worst case.
*/

/*
**Seam, S23: the field has a Clear, and 8.4's warning stands in front of it.**

The prototype offers "No date" as one option among the presets and empties the
field on the press. Two sentences of section 9 change that here and neither is
about wording.

**9.3 keeps 8.4's warning verbatim and keeps it before the cascade**:
"Clearing the date also ends the repeat and removes the reminder." AC-092 is
explicit that this is a gate and not a notice, because "a warning the person
declines must leave the date, the repeat and the reminder exactly as they
were", and "a dialog that clears first and explains afterwards passes the
criterion's own sentence, since the copy did show and the fields did clear".
So the confirm runs first and only a Continue writes.

**And the control is named "Clear"**, which is the retired chip strip's own
constant and its reason: 9.3 "fixes that the form carries an inline quick-set
for the due date and spells no control, so these are the design's and are
adopted with it. Clear is offered only while a date is set, which is his
behaviour, and it runs the same 8.4 warning any other way of emptying the
field runs." The harness reaches it by that name in both this picker and the
reminder's, so the two are one control seen twice.

**The warning is skipped where there is nothing to cascade**, which is 8.4
read rather than softened: a task with no repeat and no reminder loses nothing
by being undated, and a confirmation whose consequence is empty is the dead
control DES-144 removes. AC-092 always arms both before it clears.
*/
/* polish: taskcard F7. "Next week" is next Monday, the Monday after when
   next Monday is tomorrow. */
function nextWeekAfter(from: Date): Date {
  const monday = nextWeekday(from, 1)
  return sameDay(monday, addDays(from, 1)) ? addDays(monday, 7) : monday
}

export function DuePanel({ task, patch }: PanelProps) {
  const selected = task.due ? parseDueLabel(task.due.label) : null
  /*
  **Seam, S23: the due picker opens with its grid showing.**

  DES-120 arranges every picker as "the answers somebody probably wants, a
  hairline, then one option that opens everything exact", and the
  prototype's due panel keeps its calendar behind that last option. 9.3
  and AC-219 read the due field differently, and the reason is DES-178's:
  a due date **is** a day, so the grid is not the exact option behind the
  easy ones, it is the field itself. The criterion says so in as many
  words, "the due picker opens on a day grid, a due date being a day".

  The presets stay above it and lose nothing: what changes is that the
  instrument for the field's own type is not folded away. The reminder and
  repeat panels keep DES-120's arrangement exactly, their exact answers
  being a clock and a rule rather than the field itself.
  */
  const [confirming, setConfirming] = useState(false)
  const close = usePickerClose()
  /*
  polish: taskcard F7. A time under the day, so "next Tuesday at 9" is one
  picker rather than two chips. A due date stays a day (4.11, Imran's ruling
  of 2026-08-18): the time is 4.8's reminder on that day, the same value the
  Reminder chip writes, said here where the person is already choosing when.
  */
  const format = useTimeFormat()
  const put = usePutReminder()
  const drop = useDeleteReminder()
  const at = task.reminder?.match(/(\d{1,2}:\d{2})/)?.[1] ?? null
  const setAt = (time: string) => {
    const due = task.due ? parseDueLabel(task.due.label) : null
    patch(task.id, { reminder: due ? `${shortDate(due)} at ${time}` : `at ${time}` })
    put.mutate({ taskId: task.id, body: { offset_minutes: null, time_of_day: time } })
  }
  const clearAt = () => {
    patch(task.id, { reminder: undefined })
    drop.mutate(task.id)
  }
  /* Choosing a day answers the field, from the grid exactly as from a preset,
     so both close. Seam, S23; see `PickerClose`. */
  const update = useUpdateTask()
  const set = (date: Date) => {
    patch(task.id, { due: dueLabelFor(date) })
    update.mutate({ id: task.id, body: { due_date: isoDay(date) } })
    close()
  }
  /* 8.4's own cascade, which is what the sentence describes. */
  const cascades = Boolean(task.recurrence) || Boolean(task.reminder)
  const clear = () => {
    patch(task.id, {
      due: undefined,
      /* The client says what it believes so the strip is right in the same
         render; 8.4 is the server's and runs whatever this sends. */
      recurrence: false,
      reminder: undefined,
    })
    /* One request, because 8.4's cascade is the server's: clearing the date
       ends the repeat and removes the reminder inside 7.6's own transaction,
       which is what the warning above this promised. */
    update.mutate({ id: task.id, body: { due_date: null } })
  }

  const presets = [
    { label: "Today", date: today() },
    { label: "Tomorrow", date: addDays(today(), 1) },
    { label: "This weekend", date: nextWeekday(today(), 6) },
    /* polish: taskcard F7. Next Monday, and never the same day as
       "Tomorrow": on a Sunday the two presets both read Monday, so the
       Monday after is what "next week" means there. */
    { label: "Next week", date: nextWeekAfter(today()) },
  ]

  /* A due date is a day and not a moment, ruled by Imran 2026-08-18, so there
     is no clock in this panel at all. It is the one of the three where a time
     was decoration: "due at 17:45" is a reminder wearing a due date's clothes,
     and Dana already has somewhere to say that. */
  return (
    <div className="w-[268px]">
      {/*
      **Seam, S23: the panel is the picker, and it carries one role.**

      The prototype wraps its preset list in `role="menu"` inside a popover
      that already carries `role="dialog"`, so a press on a chip answers with
      two things that are both "the picker". The harness admits either shape
      and says why in its own comment: "A picker asking for a day or a time is
      a small modal surface and carries the dialog role; one offering a list
      of named choices is a menu." Both at once is neither, and it died of
      strict mode against a client doing exactly what 9.3 asks.

      The dialog is the one that stays, because that is what this is: three of
      these panels put a calendar or a clock below their presets, so none of
      them is a list of named choices. The list keeps its label as a group, so
      the presets are still announced as belonging to the field.
      */}
      <div role="group" aria-label="Due date" className="flex flex-col">
        {presets.map((preset) => (
          <PickerOption
            finishes
            key={preset.label}
            label={preset.label}
            hint={shortDate(preset.date)}
            active={sameDay(selected, preset.date)}
            onSelect={() => set(preset.date)}
          />
        ))}
        <PickerOption
          icon={Ban}
          label={task.due ? DATE_CLEAR : "No date"}
          active={!task.due}
          onSelect={() => {
            if (!task.due) return
            /* The warning lives in this popover, so clearing closes it only
               where there is nothing to ask. Seam, S23. */
            if (cascades) setConfirming(true)
            else {
              clear()
              close()
            }
          }}
        />
      </div>
      {confirming ? (
        <ConfirmDialog
          message={CLEAR_DATE_WARNING}
          onContinue={() => {
            setConfirming(false)
            clear()
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      <PickerDivider />

      {/* polish: taskcard F7. The grid stands plainly below the hairline;
          the "Custom date…" row that toggled it carried a tick and read as a
          setting rather than a way to show the calendar. */}
      <div className="pt-1">
        <Calendar selected={selected} onSelect={set} today={today()} />
      </div>

      {task.due ? (
        <>
          <PickerDivider />
          <label className="flex items-center gap-2 px-2 pt-1.5 text-[12px] leading-4 text-[var(--color-graphite-500)]">
            <span className="w-10 shrink-0">Time</span>
            <input
              type="time"
              aria-label="Due time"
              value={at ?? ""}
              onChange={(event) => {
                const time = event.target.value
                if (time === "") clearAt()
                else setAt(time)
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-[var(--color-graphite-300)] bg-card px-2 text-[13px] leading-5 text-[var(--color-graphite-800)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
            />
            {at === null ? null : (
              <span className="shrink-0 text-[var(--color-graphite-400)]">
                {formatTime(at, format) ?? at}
              </span>
            )}
          </label>
        </>
      ) : null}
    </div>
  )
}

/*
**Seam, S23, and it is the largest one this file takes: 9.3 retired the
offsets that this panel is made of.**

The prototype offers four relative answers, "On the day it is due", "1 day
before", "2 days before", "1 week before", each measured from the due date,
and its header calls them "the whole point of the list". They were the whole
point in v1, where 4.8 stored a reminder either way. 9.3's v2 reminder row
retires one of the two arms in one clause: "requires a due date; **one picker,
a time on that day**, writing 4.8's time_of_day mode". AC-169 says the same
from the other side and says why it matters: "A picker offering an offset is
the v1 control surviving its own row", and AC-212 names what the write stores
(no test since the 2026-09-20 cut).

So the presets go and a clock takes their place. What survives from the
prototype is everything else about the panel: the shape, the width, the
hairline, the Clear, and DES-109's rule that choosing commits.

**The three quick answers are times rather than offsets**, which keeps
DES-120's arrangement, "the answers somebody probably wants, a hairline, then
one option that opens everything exact", without keeping the thing 9.3
removed. They are the three a reminder is usually set to and they are the
design's rather than the section's, which writes none.

**The helper is 9.3's own and not the prototype's sentence.** A reminder
"requires a due date", and the chip is disabled without one, so this panel is
never opened undated; the sentence the prototype draws for that case is
therefore unreachable and goes with the presets it explained.
*/
export function ReminderPanel({ task, patch }: PanelProps) {
  const format = useTimeFormat()
  const put = usePutReminder()
  const drop = useDeleteReminder()
  const due = task.due ? parseDueLabel(task.due.label) : null
  const at = task.reminder?.match(/(\d{1,2}:\d{2})/)?.[1] ?? null

  /* The words a reminder is stored as, which `tasks/task-model.ts`'s
     `reminderChipValue` reads back and re-clocks for the viewer. The day is
     the task's own, 4.8's time_of_day mode being a time on the due date. */
  const wordsFor = (time: string) =>
    due ? `${shortDate(due)} at ${time}` : `at ${time}`

  /* 4.8's two modes are exclusive and 9.3 takes the second: "one picker, a
     time on that day, writing 4.8's time_of_day mode". So the body carries a
     clock and never an offset, which is the arm the section retired. */
  const setAt = (time: string) => {
    patch(task.id, { reminder: wordsFor(time) })
    put.mutate({ taskId: task.id, body: { offset_minutes: null, time_of_day: time } })
  }
  const clearAt = () => {
    patch(task.id, { reminder: undefined })
    /* Frozen 7.9's own removal, "no task body expressing a removal". */
    drop.mutate(task.id)
  }

  const quick = ["09:00", "12:00", "17:00"]

  return (
    <div className="w-[268px]">
      {/* Seam, S23: one role per picker. See the due panel above. */}
      <div role="group" aria-label="Reminder" className="flex flex-col">
        {quick.map((time) => (
          <PickerOption
            finishes
            key={time}
            label={formatTime(time, format) ?? time}
            active={at === time}
            onSelect={() => setAt(time)}
          />
        ))}
        {/*
        **The way back out**, offered only while a reminder is set, the same
        rule as the due picker's. Frozen 7.9 makes the write behind it
        `DELETE /tasks/:id/reminder`, "no task body expressing a removal", and
        nothing cascades from it, so unlike the due date's it asks nothing.
        */}
        <PickerOption
          finishes
          icon={Ban}
          label={task.reminder ? DATE_CLEAR : "No reminder"}
          active={!task.reminder}
          onSelect={clearAt}
        />
      </div>

      <PickerDivider />

      {/*
      9.3's "one picker, a time on that day", exact. It is open rather than
      behind a disclosure, which is the one place this departs from DES-120's
      arrangement and is AC-169's own requirement: the picker is opened and
      the time is answered, with nothing to unfold first.
      */}
      <div className="px-2 pt-1.5">
        <input
          type="time"
          aria-label="Reminder time"
          value={at ?? ""}
          onChange={(event) => {
            const time = event.target.value
            if (time === "") clearAt()
            else setAt(time)
          }}
          className="h-8 w-full rounded-md border border-[var(--color-graphite-300)] bg-card px-2 text-[13px] leading-5 text-[var(--color-graphite-800)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
        />
      </div>
    </div>
  )
}

export function RepeatPanel({ task, patch }: PanelProps) {
  const anchor = repeatAnchor(task)
  const [custom, setCustom] = useState(false)
  const summary = repeatSummary(task)

  /* Five answers cover essentially every repeating task anybody writes down,
     and each is spelled out against this task's own date rather than left as
     a word somebody has to translate. */
  const presets: { label: string; fields: Partial<ConceptTask> }[] = [
    {
      label: "Daily",
      fields: { recurrence: true, repeatUnit: "day", repeatEvery: "1", repeatDays: [] },
    },
    {
      label: `Weekly on ${DAY_LONG[anchor.getDay()]}`,
      fields: {
        recurrence: true,
        repeatUnit: "week",
        repeatEvery: "1",
        /* The filter is `noUncheckedIndexedAccess`, which this client compiles
           with and the prototype does not (11.4). The index is a `% 7` and can
           never miss, so nothing is ever dropped; it is written this way
           rather than as a non-null assertion because an assertion is a claim
           and this is a proof. */
        repeatDays: [WEEKDAY_KEYS[(anchor.getDay() + 6) % 7]].filter(
          (day): day is string => day !== undefined,
        ),
      },
    },
    {
      label: "Every weekday",
      fields: {
        recurrence: true,
        repeatUnit: "week",
        repeatEvery: "1",
        repeatDays: [...WORKING_WEEK],
      },
    },
    {
      label: `Monthly on the ${ordinal(anchor.getDate())}`,
      fields: { recurrence: true, repeatUnit: "month", repeatEvery: "1", repeatDays: [] },
    },
    {
      label: `Yearly on ${anchor.getDate()} ${MONTH_SHORT[anchor.getMonth()]}`,
      fields: { recurrence: true, repeatUnit: "year", repeatEvery: "1", repeatDays: [] },
    },
  ]

  return (
    <div className="w-[268px]">
      {/* Seam, S23: one role per picker. See the due panel above. */}
      <div role="group" aria-label="Repeat" className="flex flex-col">
        <PickerOption
          menu
          icon={Ban}
          label="Does not repeat"
          active={!task.recurrence}
          onSelect={() =>
            patch(task.id, {
              recurrence: false,
              repeatDays: [],
              repeatEnds: undefined,
            })
          }
        />
        {presets.map((preset) => (
          <PickerOption
          menu
            key={preset.label}
            label={preset.label}
            active={task.recurrence === true && summary === preset.label}
            onSelect={() => patch(task.id, preset.fields)}
          />
        ))}
      </div>

      <PickerDivider />

      <PickerOption
          menu
        icon={Repeat2}
        label="Custom repeat…"
        active={custom}
        onSelect={() => {
          setCustom((open) => !open)
          if (!task.recurrence) patch(task.id, { recurrence: true, repeatUnit: "week" })
        }}
      />

      {custom ? (
        <div className="pt-1">
          <PickerSegments
            label="Every"
            active={task.repeatEvery ?? "1"}
            options={[
              { key: "1", label: "1" },
              { key: "2", label: "2" },
              { key: "3", label: "3" },
              { key: "4", label: "4" },
            ]}
            onPick={(key) => patch(task.id, { repeatEvery: key })}
          />
          <PickerSegments
            label=""
            active={task.repeatUnit ?? "week"}
            options={[
              { key: "day", label: "days" },
              { key: "week", label: "weeks" },
              { key: "month", label: "months" },
            ]}
            onPick={(key) =>
              patch(task.id, { repeatUnit: key as ConceptTask["repeatUnit"] })
            }
          />
          {(task.repeatUnit ?? "week") === "week" ? (
            <div className="px-2 py-1">
              {/* The weekday row gets its own line and a seven-column grid.

                  It was a label plus seven 28px circles on one line: 48 + 8 +
                  7×28 + 6×4 = 292px inside a 268px panel, so the last day sat
                  outside the popover's own edge, the thing Imran saw as
                  "elements out of the margins". A row of seven fixed circles
                  beside a fixed label cannot fit a panel sized for prose, and
                  widening the panel to suit one row would make every other
                  picker wider for nothing (DES-147: a popover is as wide as
                  what it holds). A grid divides whatever width there is, so
                  this row cannot overflow at any panel size. */}
              <span className="mb-1 block text-[12px] leading-4 text-[var(--color-graphite-500)]">
                On
              </span>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_KEYS.map((day) => {
                  const on = task.repeatDays?.includes(day) ?? false
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      aria-label={day}
                      onClick={() =>
                        patch(task.id, {
                          repeatDays: on
                            ? (task.repeatDays ?? []).filter((d) => d !== day)
                            : [...(task.repeatDays ?? []), day],
                        })
                      }
                      className={cn(
                        "flex h-7 w-full items-center justify-center rounded-full text-[11px] leading-4 transition-colors",
                        T_FAST,
                        FOCUS,
                        on
                          ? "bg-[var(--color-graphite-900)] font-medium text-white"
                          : "bg-[var(--color-graphite-50)] text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]",
                      )}
                    >
                      {day.slice(0, 1)}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          <PickerSegments
            label="Until"
            active={task.repeatEnds ?? ""}
            options={[
              { key: "", label: "No end" },
              { key: "12 Sep", label: "12 Sep" },
              { key: "31 Dec", label: "31 Dec" },
            ]}
            onPick={(key) => patch(task.id, { repeatEnds: key || undefined })}
          />
        </div>
      ) : null}
    </div>
  )
}
