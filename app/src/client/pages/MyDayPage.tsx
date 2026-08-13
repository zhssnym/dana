/*
9.4. Header with the date, the important-only toggle, the Carried and Today
groups, and the recap at the bottom.

The designer's `src/screens/my-day-screen.tsx`, ported at P8R session R6 onto
our view hooks through `parts/presenters.ts`. His composition, his spacing and
his class strings; the rows are ours, and what changed is named here.

**His per-screen centring wrapper is gone.** Every one of his screens opens
with `mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6` because he
has no shell to put it in. Ours does, and R5 put it there: thirteen pages each
choosing their own measure is thirteen chances to disagree. Verified against
`shell/app-shell.tsx` rather than taken on report.

**The three region names are 9.1's table, exactly as the headings read, the
count included:** "Carried over", "Today", and "Done today (N)". His groups are
`section` elements labelled by their headings, which is the same region under
another attribute, and the recap keeps this client's own heading-plus-button
because 9.1 makes a collapsible section a region and a control of one name.

**The important-only toggle is a client-side filter over rows already fetched,
which is Q1's own sentence: "it changes no query".** AC-167 measures that from
the wire, so a toggle that refetched would fail it while looking correct. It is
named, which his is not: his switch sits inside a `label` whose text names
nothing a screen reader can reach, and 9.1's addressing sentence makes the
control reachable by its name. "Important only" is the label he already draws.

**The pending-invite list this page carries is on its way out and is kept
deliberately.** 9.8 as RFC 0002 amends it renders the invites as a gate in
place of the application, "and no page inside the application carries them", so
this block is specified away. It is still here because R10 delivers that gate
and AC-172 asserts an invite row reachable at /app in the meantime: removing it
now would take a passing criterion red and leave an account holding an invite
with no surface at all to answer it. It goes with the gate, in R10's hands, and
this paragraph is the note that says so.

**One presenter this page wanted and did not find.** 9.4 heads the page with
the date and the design writes it long, "Monday, 10 August". `presenters.ts`
formats a date as "10 Aug" and offers no long or weekday form, and computing
one here would be the second clock and the second formatter that module exists
to prevent. So the header shows the presenter's own format and the gap is a
request against R4's file, in the session report.
*/
import { useMemo, useState } from 'react'
import { CalendarCheck2, Star, SunMedium } from 'lucide-react'

import type { TaskCard } from '../../shared/tasks.js'
import { useMyDayView, usePendingInvites } from '../api/queries.js'
import { Switch } from '../components/ui/switch.js'
import { formatDueDate } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import { CollapsibleSection, PageSection } from '../states/PageSection.js'
import { PageBody } from '../states/PageStates.js'
import { MY_DAY_EMPTY } from './empty-states.js'
import { PageHeading } from './page-heading.js'
import { PendingInviteList } from './PendingInvites.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'

/** 9.4's own words for the switch, which is also its accessible name. */
const IMPORTANT_ONLY = 'Important only'

function onlyImportant(rows: readonly TaskCard[], on: boolean): readonly TaskCard[] {
  return on ? rows.filter((row) => row.important) : rows
}

export function MyDayPage(): React.JSX.Element {
  const view = useMyDayView()
  const invites = usePendingInvites()
  const actions = useRowActions()
  const confirm = useConfirm()
  const basis = useRowBasis()
  const [importantOnly, setImportantOnly] = useState(false)

  const context = { ...basis, showPullMarker: true }

  const carried = useMemo(
    () => onlyImportant(view.data?.carried ?? [], importantOnly),
    [view.data, importantOnly],
  )
  const today = useMemo(
    () => onlyImportant(view.data?.today ?? [], importantOnly),
    [view.data, importantOnly],
  )
  const recap = onlyImportant(view.data?.recap ?? [], importantOnly)

  return (
    <div className="space-y-7">
      {/* The surface 9.8 replaces with a gate at R10; see this file's header. */}
      <PendingInviteList invites={invites.data ?? []} />
      <PageHeading
        icon={SunMedium}
        title="My Day"
        subtitle={formatDueDate(basis.today, basis.today)}
        actions={
          /* 9.4's important-only filter, drawn as the switch it announces
             itself to be. The label is a `label` because the design draws the
             glyph and the words as one target, and the name is spelled on the
             control because that is what AC-167 and 9.1 address. */
          <label className="flex h-[var(--control-height)] shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)]">
            <Star className="size-4" strokeWidth={1.75} aria-hidden="true" />
            <span>{IMPORTANT_ONLY}</span>
            <Switch
              aria-label={IMPORTANT_ONLY}
              checked={importantOnly}
              onCheckedChange={(checked) => setImportantOnly(checked)}
            />
          </label>
        }
      />

      <PageBody
        query={view}
        // Emptiness is the fetched groups rather than the filtered ones: the
        // filter is a view over rows that exist, and Q1's empty copy is about
        // a day with nothing on it.
        isEmpty={(view.data?.carried.length ?? 0) + (view.data?.today.length ?? 0) === 0}
        emptyCopy={MY_DAY_EMPTY}
        emptyIcon={CalendarCheck2}
        // Section 6's cap counts across a response's arrays rather than per
        // array (ruled 2026-08-07), which is why one flag serves three
        // sections and the notice sits above all of them.
        truncated={view.data?.truncated ?? false}
      >
        <div className="space-y-6">
          {/* An empty group is absent rather than a heading over nothing, which
              is his own rule for these two and is what keeps a day with only
              carried work from opening on a bare "Today". 9.4 fixes the two
              groups and their headings; it does not ask for a heading over an
              empty list, and AC-097 reads "Carried over" on a page that has
              one. */}
          {carried.length === 0 ? null : (
            <PageSection name="Carried over" heading="Carried over">
              <TaskRows tasks={carried} context={context} actions={actions} onAsk={confirm.ask} />
            </PageSection>
          )}
          {today.length === 0 ? null : (
            <PageSection name="Today" heading="Today">
              <TaskRows tasks={today} context={context} actions={actions} onAsk={confirm.ask} />
            </PageSection>
          )}

          {/* Q1R: the section is hidden entirely while empty, so it is absent
              rather than rendered with a zero. AC-158 reads that absence. */}
          {recap.length === 0 ? null : (
            <CollapsibleSection name={`Done today (${recap.length})`} defaultOpen={false}>
              <TaskRows tasks={recap} context={context} actions={actions} onAsk={confirm.ask} />
            </CollapsibleSection>
          )}
        </div>
      </PageBody>

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
