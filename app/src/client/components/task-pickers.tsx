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

import { Ban, CalendarDays, Repeat2, type LucideIcon } from "../lib/icons.js"
import { ConfirmDialog } from "./ui/ConfirmDialog.js"
import { CLEAR_DATE_WARNING, DATE_CLEAR } from "./task-copy.js"
import { useState, type ReactNode } from "react"
import { Check as CheckIcon } from "../lib/icons.js"

import { Calendar, TimeRow, sameDay } from "./ui/calendar.js"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
import { formatTime, useTimeFormat } from "../lib/time-format.js"
/*
**Seam, S23: `LAB_TODAY` becomes `today()`.** The prototype froze a Monday in
August 2026 so its screens and its calendar would agree with each other, and
RFC 0004's close forbids a fixture crossing in any form. `lib/task-model.ts`
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
} from "../lib/task-model.js"
import { cn } from "./ui/utils.js"

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
  /*
  **Seam, S23: 9.3's two date-dependent rows are visible and inoperable.**

  The prototype's chip is always pressable and its reminder panel explains
  itself once opened, "This task has no due date yet. These are measured from
  one." 9.3's field table asks for the state one step earlier: reminder and
  repeat each "requires a due date", and the disable column carries a helper,
  "Set a due date first". AC-092 reads exactly that pair, the chip visible and
  `toBeDisabled()`, "disabled means visible but inoperable, so it is still on
  the strip", and "a disabled control with no helper is what that column
  exists to forbid".

  The helper is not drawn here, and that is the second half of the same
  criterion: it asserts one helper on the surface while either chip is
  disabled, so a chip that carried its own would put two on a strip that has
  two disabled chips. `components/task-card.tsx` draws it once beside them.
  */
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Popover>
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
        {children}
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
}: {
  icon?: LucideIcon
  label: string
  hint?: string
  active: boolean
  onSelect: () => void
  /* One of a list of named rules rather than a value the field takes. Only
     the repeat panel passes it; see the header above. */
  menu?: boolean
}) {
  return (
    <button
      type="button"
      {...(menu ? { role: "menuitem" } : { "aria-pressed": active })}
      onClick={onSelect}
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
export function DuePanel({ task, patch }: PanelProps) {
  const selected = task.due ? parseDueLabel(task.due.label) : null
  const [custom, setCustom] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const set = (date: Date) => patch(task.id, { due: dueLabelFor(date) })
  /* 8.4's own cascade, which is what the sentence describes. */
  const cascades = Boolean(task.recurrence) || Boolean(task.reminder)
  const clear = () =>
    patch(task.id, {
      due: undefined,
      /* The client says what it believes so the strip is right in the same
         render; 8.4 is the server's and runs whatever this sends. */
      recurrence: false,
      reminder: undefined,
    })

  const presets = [
    { label: "Today", date: today() },
    { label: "Tomorrow", date: addDays(today(), 1) },
    { label: "This weekend", date: nextWeekday(today(), 6) },
    { label: "Next week", date: nextWeekday(today(), 1) },
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
            if (cascades) setConfirming(true)
            else clear()
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

      <PickerOption
        icon={CalendarDays}
        label="Custom date…"
        hint={custom || !selected ? undefined : shortDate(selected)}
        active={custom}
        onSelect={() => setCustom((open) => !open)}
      />

      {custom ? (
        <div className="pt-1">
          <Calendar selected={selected} onSelect={set} today={today()} />
        </div>
      ) : null}
    </div>
  )
}

export function ReminderPanel({ task, patch }: PanelProps) {
  const format = useTimeFormat()
  const due = task.due ? parseDueLabel(task.due.label) : null
  const [custom, setCustom] = useState(false)
  const customDate = task.reminder ? parseDueLabel(task.reminder) : null
  const customTime = task.reminder?.match(/(\d{1,2}:\d{2})/)?.[1] ?? null

  /* Relative reminders are the whole point of the list, and every one is
     measured from the due date. Showing the day each lands on is what stops
     "1 week before" being arithmetic somebody has to do in their head. */
  const presets = [
    { label: "On the day it is due", hint: due ? shortDate(due) : undefined },
    { label: "1 day before", hint: due ? shortDate(addDays(due, -1)) : undefined },
    { label: "2 days before", hint: due ? shortDate(addDays(due, -2)) : undefined },
    { label: "1 week before", hint: due ? shortDate(addDays(due, -7)) : undefined },
  ]

  return (
    <div className="w-[268px]">
      {!due ? (
        <p className="px-2 pt-1 pb-2 text-[12px] leading-4 text-[var(--color-graphite-500)]">
          This task has no due date yet. These are measured from one.
        </p>
      ) : null}

      {/* Seam, S23: one role per picker. See the due panel above. */}
      <div role="group" aria-label="Reminder" className="flex flex-col">
        {/*
        **Seam, S23: the field has a Clear.** 9.3's reminder row is "one
        picker, a time on that day", and a field with no way back out is the
        closed set `lib/people-library.ts` names one axis over. Frozen 7.9
        makes the write behind it `DELETE /tasks/:id/reminder`, "no task body
        expressing a removal", and nothing cascades from it, so unlike the due
        date's it needs no confirmation. Offered only while a reminder is set,
        the same rule as the due picker's.
        */}
        {task.reminder ? (
          <PickerOption
            icon={Ban}
            label={DATE_CLEAR}
            active={false}
            onSelect={() => patch(task.id, { reminder: undefined })}
          />
        ) : null}
        {presets.map((preset) => (
          <PickerOption
            key={preset.label}
            label={preset.label}
            hint={preset.hint}
            active={task.reminder === preset.label}
            onSelect={() => patch(task.id, { reminder: preset.label })}
          />
        ))}
        <PickerOption
          icon={Ban}
          label="No reminder"
          active={!task.reminder}
          onSelect={() => patch(task.id, { reminder: undefined })}
        />
      </div>

      <PickerDivider />

      {/* The one reminder that is not relative to anything. Everything exact
          lives behind this single option, and the clock lives at the foot of
          the calendar rather than beside it, because you pick the day first
          and the time is the refinement. */}
      <PickerOption
        icon={CalendarDays}
        label="Custom date & time…"
        active={custom}
        onSelect={() => setCustom((open) => !open)}
      />

      {custom ? (
        <div className="flex flex-col gap-2 pt-1">
          <Calendar
            selected={customDate}
            onSelect={(date) =>
              patch(task.id, {
                reminder: `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}${
                  customTime ? ` at ${customTime}` : ""
                }`,
              })
            }
            today={today()}
          />
          <TimeRow
            /* Seam, S23: 9.3's field name on the picker's one control. */
            label="Reminder time"
            value={customTime}
            onSelect={(time) =>
              patch(task.id, {
                reminder: `${(task.reminder ?? shortDate(today())).replace(
                  / at .*/,
                  "",
                )} at ${time}`,
              })
            }
            onClear={() =>
              patch(task.id, {
                reminder: (task.reminder ?? "").replace(/ at .*/, "") || undefined,
              })
            }
          />
          {/* What the two controls above add up to, in the person's own
              clock, so the panel answers its own question without them
              having to close it and read the chip. */}
          {customDate ? (
            <p className="px-1 pb-0.5 text-[12px] leading-4 text-[var(--color-graphite-500)]">
              Reminds on {shortDate(customDate)}
              {formatTime(customTime, format) ? ` at ${formatTime(customTime, format)}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
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
