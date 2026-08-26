/*
Trash, 9.11, at /app/trash.

One page listing every deleted task and folder the viewer can still reach,
inside the 30-day window, newest first, each row naming what it was, where it
lived, who deleted it and when. This is S9's one page; every other surface in
this package is chrome.

**The two kinds are one list on the screen and two in the response.** 7.13
answers tasks and folders separately because they carry different facts, and
9.11 draws one list newest first, so the page interleaves them by
`deleted_at` rather than showing two sections. A person who deleted a folder
and then a task inside another folder sees them in the order they did it,
which is the only order "newest first" can mean.

**Restore is offered on every row, not only on rows the viewer deleted.**
9.11 states it: "Anyone with access to the object may restore it, Trash is
scoped by access, not by who deleted." The server enforces it (AC-190
restores a task deleted by one member on behalf of another), and the page
must not be narrower than the rule, because a control that is missing is a
rule nobody can discover.

**The two restores take two hooks and one address between them.** A folder
goes to 7.13's own `POST /folders/:id/restore`; a task goes to
`POST /tasks/:id/restore`, which frozen 7.6 already owned and which S3 forked
on the row's state rather than duplicating. So the task arm reuses the
transition hook this client has had since P5, and that is not a shortcut.

**No capture anywhere on the page**, which 9.11 says in terms and which the
shell honours by the floating button's own rule; this file adds none.

**The rule is stated once, at the top**, in 9.11's words character for
character. It is transcribed rather than imported, the discipline section 9's
copy always gets. **The row says its own share of that window beside it**, and
`daysLeft` carries the argument: the banner says what the rule is and the
countdown says where this row stands in it, which are two different facts and
not the same one twice.

**Who deleted it is 9.11's clause and this page cannot draw it.** That section
requires each row to name "who deleted it and when (from 4.13)", and the 7.13
read carries `deleted_at` and no actor: `shared/trash.ts` has no field for one
and `server/domain/trash.ts` selects none, though the event log records one for
every delete. No client-side work reaches it, so it is escalated rather than
approximated, at RFC 0005 change control item 34 (b), with a recommendation:
`deleted_by` as the person stub AC-250 already uses for `created_by`, joined
from the delete event and null where the actor's account has been scrubbed. The
"and when" half is what the countdown answers today.

**Nothing here deletes permanently, and that is a reading rather than an
omission.** The designer's `trash-screen.tsx` offers "Delete for ever" behind a
confirm and calls it "the only act in Dana with no way back". 7.13 disagrees,
"purge is the tick's, at 30 days, permanent", 9.11 enumerates this page and
names restore alone, and no such route exists in `app/src/server/routes/`. RFC
0005 change control item 20 sends a prototype-versus-numbered-section
disagreement to a ruling rather than to a session, so this file follows the
sections and item 34 (a) carries the escalation. AC-256 asserts the absence, so
a reversal moves a criterion rather than leaving a defect unrecorded.
*/
import { useRestoreFolder, useTransitionTask } from '../api/mutations.js'
import { useTrash } from '../api/queries.js'
import { InlineError, SkeletonList } from '../components/state-patterns.js'
import { Button } from '../components/ui/button.js'
import { RESTORE } from '../components/ui/copy.js'
import { Folder as FolderIcon, ListTodo, Trash2 } from '../lib/icons.js'

import { PageHeading } from './page-heading.js'

/** 9.11, transcribed. The page states the rule once. */
const RETENTION_RULE = "Deleted things stay here for 30 days, then they're gone for good."

/** 9.11's empty state, transcribed. */
const NOTHING_IN_THE_TRASH = 'Nothing in the Trash.'

/**
 * One row of either kind, flattened so the page can order the two together.
 *
 * `where` is 9.11's "where it lived": a task names its folder, and a folder
 * names what comes back with it, which is the same question asked of the two
 * kinds and answered from what each one carries.
 */
interface TrashRow {
  readonly kind: 'task' | 'folder'
  readonly id: string
  readonly title: string
  readonly where: string
  readonly deletedAt: string
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** 4.3 and 4.5's window, which the rule sentence at the top states in words. */
const TRASH_DAYS = 30

/**
 * How long this row has left, in whole days.
 *
 * **The countdown is on the row and not in a banner**, which the designer's
 * `trash-screen.tsx` argues rather than assumes: "thirty days is per item, so
 * a page-level 'items are deleted after 30 days' would be true and useless.
 * The thing you need is how long *this* has, and that is a fact about the
 * row." The page keeps 9.11's rule sentence, which says what the window is,
 * and every row says where it stands inside it.
 *
 * **Rounded up, and that is the safe direction.** A row deleted 29.5 days ago
 * has less than a day left and this says "1 day left" rather than "0 days
 * left": a countdown that reads zero while the thing is still restorable tells
 * a person they have missed a chance they still have. The 11.7 purge runs on
 * the instant and never on this number, so the display can afford to be
 * generous and cannot afford to be short.
 *
 * Clamped at zero for a row past the window the tick has not reached yet,
 * which is an ordinary state between the 30-day mark and the next tick.
 */
function daysLeft(deletedAt: string, now: number): number {
  const elapsed = now - Date.parse(deletedAt)
  return Math.max(0, Math.ceil(TRASH_DAYS - elapsed / (24 * 60 * 60 * 1000)))
}

/** The row's own line, in the register 9.11's rule sentence sets. */
function countdown(days: number): string {
  return days === 0 ? 'Gone within the day' : `${plural(days, 'day', 'days')} left`
}

export function TrashPage(): React.JSX.Element {
  /*
  Read once per render rather than per row, so every countdown on the page is
  measured against one instant: two rows deleted in the same second must not
  read as different numbers because the clock crossed midnight between them.
  */
  const now = Date.now()
  const trash = useTrash()
  const restoreFolder = useRestoreFolder()
  const restoreTask = useTransitionTask()

  const rows: readonly TrashRow[] = [
    ...(trash.data?.tasks ?? []).map(
      (task): TrashRow => ({
        kind: 'task',
        id: task.id,
        title: task.title,
        where: task.folder_name,
        deletedAt: task.deleted_at,
      }),
    ),
    ...(trash.data?.folders ?? []).map(
      (folder): TrashRow => ({
        kind: 'folder',
        id: folder.id,
        title: folder.name,
        where: plural(folder.task_count, 'task', 'tasks'),
        deletedAt: folder.deleted_at,
      }),
    ),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))

  function restore(row: TrashRow): void {
    if (row.kind === 'folder') restoreFolder.mutate(row.id)
    else restoreTask.mutate({ id: row.id, event: 'restore' })
  }

  return (
    <main className="mx-auto flex w-full max-w-[var(--shell-content-max)] flex-col gap-4 px-6 py-6">
      <PageHeading icon={Trash2} title="Trash" subtitle={RETENTION_RULE} />

      {trash.isPending ? <SkeletonList /> : null}
      {trash.isError ? <InlineError onRetry={() => void trash.refetch()} /> : null}

      {trash.isSuccess && rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          {NOTHING_IN_THE_TRASH}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li
              key={`${row.kind}:${row.id}`}
              className="flex min-h-[var(--task-row-height)] items-center gap-3 rounded-md border border-border bg-card px-3"
            >
              {/*
              9.11's "what it was", as a glyph since S17b.

              The designer's own reason: a person here is answering "what did I
              delete", and they "usually know roughly *when* rather than
              *what*", so the kind is "a glyph on the row rather than a heading
              you have to pick first". It replaces the word rather than joining
              it, which is the difference between a row that reads at a glance
              and one that spends its first line saying what everything on this
              page already is.

              The glyph is `aria-hidden` and the row's kind is carried in the
              text beside it instead, because a decorative mark that also
              announced itself would put "Folder" back on the row in the one
              place a screen reader hears it twice.
              */}
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-graphite-100)] text-[var(--color-graphite-500)]"
                title={row.kind === 'folder' ? 'Folder' : 'Task'}
              >
                {row.kind === 'folder' ? (
                  <FolderIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <ListTodo className="size-4" strokeWidth={1.75} aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{row.title}</p>
                {/* 9.11's "where it lived", which for a folder is what comes
                    back with it, and the row's own share of the 30-day window
                    beside it. */}
                <p className="truncate text-xs text-muted-foreground">
                  {row.where} &middot; {countdown(daysLeft(row.deletedAt, now))}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => restore(row)}
                // 9.5's name, which 9.11 reuses rather than inventing a
                // second word for the same act.
                aria-label={RESTORE}
              >
                {RESTORE}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  )
}
