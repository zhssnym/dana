/*
9.6's folder page, ported at P8R session R8 from the designer's
`src/screens/folder-screen.tsx` onto our view hooks and our mutations.

His composition and his class strings; the rows, the quick-add and the
primitives are what R2 and R3 landed, and every display value comes from
`parts/presenters.ts`. Four things about the port are decisions rather than
transcription, and each is here because a reader of his file would otherwise
find them missing.

**One open list, not two.** 9.6 fixed a Scheduled section and an Unscheduled
section from the day it was written and the owner ruled for a single list on
2026-08-13, which RFC 0002 carries as text. Q7 already returns one ordered
result in two arrays, Scheduled first with Q3's order and Unscheduled second
with Q2's, so the list below is those two arrays concatenated in that order and
nothing else: no sort, no merge key, no interleave. Section 6's own sentence is
that every view returns rows already ordered and clients never re-sort, and
7.11 makes a rule existing only in the client a specification violation. The
filter partitions the same two arrays, which is why it can be a question about
the response rather than a predicate this file invents over `due_date`.

**The filter's four strings are the change control's, character for
character.** 9.1's names table gives the control "Filter open tasks" and its
three options "All open tasks", "With a due date" and "Without a due date". His
prototype reads "With due date" and "Without due date", which is two words the
specification does not use, and a name in that table is not a paraphrase.

**It is a native select, and that is forced rather than preferred.** His
control is a dropdown menu of `menuitemradio`, which is the right semantics for
a one-of-three choice and is not what AC-176 can address: that criterion picks
an option by `option` or `menuitem` role, and two of the three names contain
the words "due date", so a menu would also make the narrow options ambiguous to
a name match. A select answers both, its options being matched in document
order. This is the same reading R7 recorded for the form's ten fields.

**The header is a named region and its menu is "More actions".** 9.1 named
"Folder header" at the second P8 change control precisely because 9.6 puts a
third control answering to that name here, after the task form's and a task
row's, and reaching it as the first match on the page is addressing by
position. His trigger is labelled "More folder actions", which is a fourth name
for a control the section deliberately gives one; the region is what tells the
four apart. The header's four entries are 9.6's own list and are each offered
only to the actor 5.4 permits, because a menu that offers a person a 403 is a
menu that lies. His "Move to group" is not among them: 9.6 enumerates this
menu, and the sidebar's folder row is where 9.1 puts that action.

The Completed section is collapsed on arrival and does not fetch until it is
opened, which is what makes the collapse real rather than cosmetic. Once open
it pages: Q7's third section is Q6 entire, so it carries Q6's cursor and Q6's
"Show more", from the same hook Done uses. Its control carries the section's
name and nothing else, no count, because AC-176 addresses it exactly and 9.1
spells a count in that table only where it means one, on My Day's
"Done today (N)".
*/
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  Folder as FolderIcon,
  LogOut,
  MoreHorizontal,
  Palette,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react'

import {
  useCreateTask,
  useDeleteFolder,
  useRemoveFolderMember,
  useRenameFolder,
  useUpdateMyMembership,
} from '../api/mutations.js'
import {
  mergeCompletedDays,
  useConnections,
  useFolder,
  useFolderCompletedTasks,
  useFolderOpenTasks,
} from '../api/queries.js'
import { FolderLabelDialog } from '../components/folder-label-dialog.js'
import { QuickAdd } from '../components/quick-add.js'
import { NativeSelect } from '../components/ui/native-select.js'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
} from '../components/ui/avatar.js'
import { Button } from '../components/ui/button.js'
import { MORE_ACTIONS } from '../components/ui/copy.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { Input } from '../components/ui/input.js'
import { formatDayHeading } from '../parts/format-dates.js'
import { folderLabelFields, initialsOf } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import { paths } from '../routes.js'
import { openTaskForm } from '../shell/overlays.js'
import { CollapsibleSection, PageSection } from '../states/PageSection.js'
import { MorePages, PageBody } from '../states/PageStates.js'
import { FOLDER_EMPTY } from './empty-states.js'
import { FolderSharingPanel } from './FolderSharingPanel.js'
import { ConfirmDialog, TaskRows, useConfirm, useRowBasis } from './task-rows.js'

/**
 * 9.1's names table for this page's filter: the control, then its three
 * options in the order that table writes them.
 *
 * The values are the two arrays Q7 answers with, which is what the filter
 * actually chooses between; naming them after the response rather than after a
 * predicate is what keeps this a question about the server's own split.
 */
const FILTER_OPEN_TASKS = 'Filter open tasks'
type OpenFilter = 'all' | 'scheduled' | 'unscheduled'
const FILTER_OPTIONS: readonly { value: OpenFilter; label: string }[] = [
  { value: 'all', label: 'All open tasks' },
  { value: 'scheduled', label: 'With a due date' },
  { value: 'unscheduled', label: 'Without a due date' },
]

/**
 * The line his screen shows when the filter has excluded everything, which is
 * a different situation from Q7's empty folder and says so.
 *
 * Q7's own empty copy answers "this folder has nothing in it"; these answer
 * "your question has no matches", which is a state his design draws and no
 * numbered section reaches, the filter itself being three days old. His words,
 * transcribed.
 */
const FILTER_EMPTY: Record<OpenFilter, string> = {
  all: 'No open tasks.',
  scheduled: 'No tasks with a due date.',
  unscheduled: 'No tasks without a due date.',
}

/**
 * 9.6's delete confirm, word for word, with the folder and its three counts.
 *
 * The section writes the counts as "28 open, 12 completed, and 3 abandoned",
 * which is a shape rather than a value, and it is the only place a person is
 * told the deletion reaches every member rather than only their own view.
 */
function folderDeleteConfirm(
  name: string,
  open: number,
  completed: number,
  abandoned: number,
): string {
  return (
    `Delete ${name}? This permanently deletes ${String(open)} open, ` +
    `${String(completed)} completed, and ${String(abandoned)} abandoned tasks for every member.`
  )
}

/**
 * 9.6's leave confirm, added to that section at the second P8 change control
 * and normative since.
 *
 * One sentence in one element, which AC-183 turns on: his prototype rewords it
 * and delivers it as a dialog title plus a description, and a block boundary is
 * where a reader stops hearing one sentence.
 */
function leaveFolderConfirm(name: string): string {
  return (
    `Leave ${name}? You lose access to it, and anything in it assigned to ` +
    'you becomes unassigned.'
  )
}

export function FolderPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const folder = useFolder(id)
  const open = useFolderOpenTasks(id)
  const basis = useRowBasis()
  const actions = useRowActions()
  const confirm = useConfirm()
  const create = useCreateTask()
  const remove = useDeleteFolder()
  const rename = useRenameFolder()
  const relabel = useUpdateMyMembership()
  const leave = useRemoveFolderMember()
  const [completedOpen, setCompletedOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [labelling, setLabelling] = useState(false)
  const [filter, setFilter] = useState<OpenFilter>('all')
  const completed = useFolderCompletedTasks(id, completedOpen)
  /*
  The roster, read here because the sharing panel needs it and nothing below a
  page fetches. It is one entry in the cache that the People screen and the
  9.3 assignee dropdown also read, so this costs a request the first time a
  folder page is opened in a document and nothing after that.
  */
  const connections = useConnections()

  const detail = folder.data
  const scheduled = open.data?.scheduled ?? []
  const unscheduled = open.data?.unscheduled ?? []
  const bothEmpty = scheduled.length === 0 && unscheduled.length === 0
  /*
  Q7's order, kept rather than made: Scheduled first with Q3's order, then
  Unscheduled with Q2's. The filter chooses which of the two arrays to show and
  changes neither of them.
  */
  const visible =
    filter === 'scheduled'
      ? scheduled
      : filter === 'unscheduled'
        ? unscheduled
        : [...scheduled, ...unscheduled]
  const completedDays = mergeCompletedDays(completed.data?.pages)
  // Q7's rows are all in this folder, so the folder chip on each of them would
  // repeat the heading above the page. His screen drops it for the same reason.
  // No member set is passed, so no Unassigned chip renders here: the state lab
  // scopes that chip to the shared Planned context, and this page's roster is
  // one avatar stack away.
  const context: RowContext = {
    ...basis,
    showFolder: false,
    starTooltip: actions.starTooltipMode,
  }
  /*
  The third count of 9.6's confirm, which 8.11 does not compute.

  The folder object carries pending and completed and says so outright:
  "counts are 8.11's pending and completed tallies, abandoned rows on neither
  side". The copy names all three, so the third is counted off the rows this
  page already holds: Q3 and Q2 both admit pending and abandoned, so the open
  sections carry every abandoned row in the folder and nothing else does.
  Recorded as a reading in `src/client/README.md`, with the recommendation
  that 7.4's counts carry the number the copy asks for.
  */
  const abandoned = [...scheduled, ...unscheduled].filter(
    (task) => task.status === 'abandoned',
  ).length

  const isOwner = detail?.is_owner ?? false
  const isDefault = detail?.is_default ?? false

  function askDelete(): void {
    confirm.ask(
      folderDeleteConfirm(
        detail?.name ?? '',
        detail?.counts.pending ?? 0,
        detail?.counts.completed ?? 0,
        abandoned,
      ),
      () => {
        // 8.8's cascade takes the page with it, so the navigation is part of
        // the action rather than something the person does next: staying would
        // render 10.2's answer for a folder they can no longer see, which
        // reads as an error.
        remove.mutate(id, { onSuccess: () => navigate(paths.myDay) })
      },
    )
  }

  function askLeave(): void {
    confirm.ask(leaveFolderConfirm(detail?.name ?? ''), () => {
      const viewerId = basis.viewerId
      if (viewerId === null) return
      leave.mutate(
        { folderId: id, userId: viewerId },
        { onSuccess: () => navigate(paths.myDay) },
      )
    })
  }

  return (
    <div className="space-y-7">
      {/* The header is the folder read, so a folder the viewer cannot see
          renders 10.2's answer here: nonexistent, never forbidden. */}
      <PageBody query={folder} isEmpty={false} emptyCopy="">
        {/* 9.1's regions table gained "Folder header" at the second P8 change
            control, on the tester's escalation, and this is the whole of what
            it asked for: the overflow menu, the 8.11 ratio, the Share button
            and the inline rename were all addressable only by looking anywhere
            on the page. A `header` inside a `section` is content rather than a
            banner, which is what keeps AC-174's "no chrome outside the
            sidebar" true of every page. */}
        <PageSection name="Folder header">
          <header className="flex min-h-14 items-start justify-between gap-6">
            <div className="flex min-w-0 items-start gap-3">
              <FolderIcon
                className="mt-0.5 size-6 shrink-0"
                style={{ color: detail?.my_color ?? 'var(--color-graphite-900)' }}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div className="min-w-0">
                {/* 9.6: "name (inline rename for owner)". The heading becomes a
                    field in place rather than opening a dialog, which is what
                    inline means, and the field is offered only while the menu
                    has put it there. */}
                {renaming === null ? (
                  <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
                    {detail?.name}
                  </h1>
                ) : (
                  <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
                    <Input
                      aria-label="Folder name"
                      value={renaming}
                      autoFocus
                      maxLength={100}
                      disabled={rename.isPending}
                      className="h-[var(--control-height)]"
                      onChange={(event) => {
                        setRenaming(event.target.value)
                      }}
                      onBlur={() => {
                        setRenaming(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setRenaming(null)
                          return
                        }
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        const trimmed = renaming.trim()
                        setRenaming(null)
                        if (trimmed === '' || trimmed === detail?.name) return
                        rename.mutate({ id, body: { name: trimmed } })
                      }}
                    />
                  </h1>
                )}
                {/* 9.6's completion ratio, which 8.11 computes for us. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  {detail?.counts.completed ?? 0} /{' '}
                  {(detail?.counts.completed ?? 0) + (detail?.counts.pending ?? 0)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 9.6's filter, above the one open list. A select and not his
                  menu, for the reason in this file's header. */}
              <NativeSelect
                aria-label={FILTER_OPEN_TASKS}
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value as OpenFilter)
                }}
              >
                {FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>

              {/* 9.6's member avatar stack. */}
              <AvatarGroup>
                {(detail?.members ?? []).map((member) => (
                  <Avatar key={member.user.id} size="sm">
                    <AvatarFallback>
                      {initialsOf(member.user.display_name ?? 'Someone')}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </AvatarGroup>

              {/* 9.6's Share button, the entry point the panel below opens
                  from. Withheld on a default folder, which INV-2 makes
                  single-member and 5.3 refuses an add on. */}
              {isDefault ? null : (
                <Button
                  variant="outline"
                  className="h-[var(--control-height)] px-3 text-sm"
                  aria-expanded={sharing}
                  onClick={() => {
                    setSharing(!sharing)
                  }}
                >
                  <Share2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  Share
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-[var(--control-height)]"
                      // 9.1's names table. A third control answering to this
                      // string, told apart from the other three by the region
                      // it sits in rather than by a fourth name.
                      aria-label={MORE_ACTIONS}
                    />
                  }
                >
                  <MoreHorizontal className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {isOwner ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setRenaming(detail?.name ?? '')
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Rename folder
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onClick={() => {
                      setLabelling(true)
                    }}
                  >
                    <Palette className="size-4" aria-hidden="true" />
                    Label and color
                  </DropdownMenuItem>
                  {isOwner ? null : (
                    <DropdownMenuItem variant="destructive" onClick={askLeave}>
                      <LogOut className="size-4" aria-hidden="true" />
                      Leave folder
                    </DropdownMenuItem>
                  )}
                  {isOwner && !isDefault ? (
                    <DropdownMenuItem variant="destructive" onClick={askDelete}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete folder
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

        </PageSection>

        <div className="mt-7 space-y-7">
          <PageSection name="All open tasks">
            <PageBody
              query={open}
              isEmpty={bothEmpty}
              emptyCopy={FOLDER_EMPTY}
              emptyIcon={FolderIcon}
              truncated={open.data?.truncated ?? false}
            >
              {visible.length === 0 ? (
                <p className="h-[var(--control-height)] px-2 text-sm leading-[var(--control-height)] text-[var(--color-graphite-500)]">
                  {FILTER_EMPTY[filter]}
                </p>
              ) : (
                <TaskRows
                  tasks={visible}
                  context={context}
                  actions={actions}
                  onAsk={confirm.ask}
                />
              )}
            </PageBody>
            {/*
            9.6: "Inline quick-add at the foot of the open list". One on this
            page and not two, the two sections it used to sit between having
            gone, so 9.3's sixth entry-point row states its value outright:
            this folder, and no due date.
            */}
            <QuickAdd
              folderName={detail?.name ?? 'this folder'}
              onAdd={(title) => {
                create.mutate({ title, folder_id: id })
              }}
              onOpenFullForm={() => {
                openTaskForm({ folder_id: id })
              }}
            />
          </PageSection>

          {/* Q7 hides the third section while it is empty. Whether it is empty
              is only known once it has been fetched, and it is only fetched
              once it is opened, so the control is rendered on the strength of
              the folder's own completed count. */}
          {(detail?.counts.completed ?? 0) === 0 ? null : (
            <CollapsibleSection
              name="Completed"
              count={detail?.counts.completed ?? 0}
              defaultOpen={false}
              onOpenChange={setCompletedOpen}
            >
              {completedDays.map((day) => (
                <PageSection
                  key={day.date}
                  name={formatDayHeading(day.date, basis.today)}
                  heading={formatDayHeading(day.date, basis.today)}
                  tone="day"
                >
                  <TaskRows
                    tasks={day.rows}
                    context={context}
                    actions={actions}
                    onAsk={confirm.ask}
                  />
                </PageSection>
              ))}
              <MorePages query={completed} />
            </CollapsibleSection>
          )}
        </div>
      </PageBody>

      {sharing && detail !== undefined ? (
        <FolderSharingPanel
          folder={detail}
          connections={connections.data}
          onClose={() => {
            setSharing(false)
          }}
        />
      ) : null}

      {/*
      9.6's "Label and color", which takes the personal label and the colour
      together "both being the two fields of 7.4's my-membership and neither
      meaning anything without the other". It replaces the inline label field
      the P8 client offered here, which wrote one of the two: AC-181 asserts
      that both are taken and that both are written, and 7.4's PATCH takes them
      in one body, so a dialog offering one writes a null over the other.
      */}
      <FolderLabelDialog
        open={labelling}
        folderId={id}
        {...folderLabelFields({
          my_label: detail?.my_label ?? null,
          my_color: detail?.my_color ?? null,
        })}
        onOpenChange={setLabelling}
        onSubmit={(next) => {
          relabel.mutate({ id, body: next })
        }}
      />

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
