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
copy always gets.
*/
import { useRestoreFolder, useTransitionTask } from '../api/mutations.js'
import { useTrash } from '../api/queries.js'
import { InlineError, SkeletonList } from '../components/state-patterns.js'
import { Button } from '../components/ui/button.js'
import { RESTORE } from '../components/ui/copy.js'
import { Trash2 } from '../lib/icons.js'

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

export function TrashPage(): React.JSX.Element {
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{row.title}</p>
                {/* 9.11's "each row naming what it was, where it lived": the
                    kind and the context, which for a folder is what comes
                    back with it. */}
                <p className="truncate text-xs text-muted-foreground">
                  {row.kind === 'folder' ? 'Folder' : 'Task'} &middot; {row.where}
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
