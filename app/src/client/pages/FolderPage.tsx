/*
9.6's folder page, over Q7's three sections.

The two quick-add rows are the reason 9.1 gained named regions on 2026-08-11.
They have one accessible name between them, "Add a task", and 9.3 gives them
different defaults: the Scheduled section's opens with due date today and the
Unscheduled section's with it empty. Nothing about either input distinguishes
them, so the region does, and AC-093 addresses each within its own.

The floating add button is not one of the two. It sits on the page rather than
in a section, so it opens with the due date empty, which is what having no
section context means everywhere else in 9.3's table; the layout decides that,
because the button is chrome.

Q7's empty rule is read as the rows being absent rather than the sections:
"sections 1 and 2 absent when empty with a single line 'No tasks yet. Add one
below.' when both are empty". The single line is what the person reads, and
"add one below" is an instruction that needs the row it points at, so both
regions and both quick-add rows stay and only the lists go. Recorded here
because it is a reading, and it is the reading AC-093 and AC-158 are both
written against.

The Completed section is collapsed on arrival and does not fetch until it is
opened, which is what makes the collapse real rather than cosmetic. Once open
it pages: Q7's third section is Q6 entire, so it carries Q6's cursor and Q6's
"Show more", from the same hook Done uses.

The header carries all four entries 9.6 gives it. Rename, Label and Leave were
owed while this client had no mutation for any of them; each is now one hook
in `api/mutations.ts`, and each entry is offered only to the actor 5.4 permits,
because a menu that offers a person a 403 is a menu that lies.
*/
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import {
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
  useMe,
  useMultiMemberFolderIds,
} from '../api/queries.js'
import { todayInBrowserZone } from '../api/tz.js'
import {
  ConfirmDialog,
  initialsOf,
  OverflowMenu,
  QuickAddRow,
  TaskList,
} from '../components/ui/index.js'
import type { MenuEntry } from '../components/ui/index.js'
import { paths } from '../routes.js'
import { useRowActions } from '../parts/useRowActions.js'
import { CollapsibleSection, PageSection } from '../states/PageSection.js'
import { MorePages, PageBody } from '../states/PageStates.js'
import { FOLDER_EMPTY } from './empty-states.js'
import { FolderSharingPanel } from './FolderSharingPanel.js'

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
 * The confirm before a member leaves a folder.
 *
 * **First pass**, like the removal confirm in the sharing panel and for the
 * same reason: 5.3's R-CLEAN makes leaving lose the person their assignments
 * and their My Day entries in this folder, which is exactly the invisible
 * consequence section 9's four written confirmations exist to state, and
 * section 9 does not write this one. Recorded as an open silence.
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
  const me = useMe()
  const actions = useRowActions()
  const multiMember = useMultiMemberFolderIds()
  const remove = useDeleteFolder()
  const rename = useRenameFolder()
  const relabel = useUpdateMyMembership()
  const leave = useRemoveFolderMember()
  const [completedOpen, setCompletedOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [labelling, setLabelling] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null)
  const completed = useFolderCompletedTasks(id, completedOpen)
  /*
  The roster, read here because the sharing panel needs it and nothing below a
  page fetches. It is one entry in the cache that the People screen and the
  9.3 assignee dropdown also read, so this costs a request the first time a
  folder page is opened in a document and nothing after that.
  */
  const connections = useConnections()
  const viewerId = me.data?.user.id ?? null

  const detail = folder.data
  const scheduled = open.data?.scheduled ?? []
  const unscheduled = open.data?.unscheduled ?? []
  const bothEmpty = scheduled.length === 0 && unscheduled.length === 0
  const completedDays = mergeCompletedDays(completed.data?.pages)
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

  /*
  9.6's header menu: "Rename owner-only, Label and color personal, Leave
  non-owner, Delete owner-only with confirm listing counts".

  Each entry is conditioned on the actor 5.4 permits, which is this section's
  own qualification of each of the four rather than a rule the client invented:
  rename and delete are the owner's, leave is everyone else's, and the label is
  every member's because 7.4 stores it on their own membership row. Delete is
  additionally withheld from a default folder, which 7.4 answers 409 for under
  INV-2.
  */
  const entries: MenuEntry[] = []
  if (detail !== undefined) {
    if (detail.is_owner) {
      entries.push({
        label: 'Rename folder',
        onSelect: () => setRenaming(detail.name),
      })
    }
    entries.push({
      label: 'Label and color',
      onSelect: () => setLabelling(detail.my_label ?? ''),
    })
    if (!detail.is_owner) {
      entries.push({ label: 'Leave folder', onSelect: () => setConfirm('leave') })
    }
    if (detail.is_owner && !detail.is_default) {
      entries.push({ label: 'Delete folder', onSelect: () => setConfirm('delete') })
    }
  }

  return (
    <div className="space-y-6">
      {/* The header is the folder read, so a folder the viewer cannot see
          renders 10.2's answer here: nonexistent, never forbidden. */}
      <PageBody query={folder} isEmpty={false} emptyCopy="">
        {/* 9.1's regions table gained "Folder header" at the second P8 change
            control, on the tester's escalation, and this is the whole of what
            it asked for. 9.6 puts an overflow menu here, which is a third
            control answering to "More actions" after the task form's and a
            task row's; giving it a name of its own was declined, because the
            two named menus share that name deliberately, being one control
            pointed at different objects. So the container is named instead,
            and AC-162's folder case stops reaching the menu by position. The
            ratio of 8.11, the Share button and the inline rename come inside
            it for free, all four having been addressable only by looking
            anywhere on the page. */}
        <PageSection name="Folder header">
        <header className="page-header">
        <div className="min-w-0 space-y-1">
        {/* 9.6: "name (inline rename for owner)". The heading becomes a field
            in place rather than opening a dialog, which is what inline means,
            and the field is offered only while the menu has put it there. */}
        {renaming === null ? (
          <h1 className="page-title">{detail?.name}</h1>
        ) : (
          <h1 className="page-title">
            <input
              className="input-base"
              type="text"
              aria-label="Folder name"
              value={renaming}
              autoFocus
              disabled={rename.isPending}
              onChange={(event) => setRenaming(event.target.value)}
              onBlur={() => setRenaming(null)}
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
        <p className="meta">
          {detail?.counts.completed ?? 0} of{' '}
          {(detail?.counts.completed ?? 0) + (detail?.counts.pending ?? 0)} done
        </p>
        <ul className="flex flex-wrap items-center gap-2">
          {(detail?.members ?? []).map((member) => (
            <li key={member.user.id} className="chip chip-outline">
              <span className="avatar avatar-chip" aria-hidden="true">
                {initialsOf(member.user.display_name)}
              </span>
              {member.user.display_name ?? 'Someone'}
            </li>
          ))}
        </ul>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <OverflowMenu entries={entries} />
        {/* 9.6's Share button, which is the entry point Q7's header names and
            the panel below is what it opens. */}
        <button
          type="button"
          className="button-base button-default"
          aria-expanded={sharing}
          onClick={() => setSharing(!sharing)}
        >
          Share
        </button>
        </div>
        </header>
        {labelling === null ? null : (
          <div className="space-y-2">
            <label className="text-label" htmlFor="folder-personal-label">Label</label>
            <input
              id="folder-personal-label"
              className="input-base"
              type="text"
              value={labelling}
              autoFocus
              disabled={relabel.isPending}
              onChange={(event) => setLabelling(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setLabelling(null)
                  return
                }
                if (event.key !== 'Enter') return
                event.preventDefault()
                const trimmed = labelling.trim()
                setLabelling(null)
                // 7.4 makes both fields nullable and null is what clears one,
                // so an emptied field clears the label rather than sending a
                // string 10.3 refuses for being shorter than one character.
                relabel.mutate({ id, body: { label: trimmed === '' ? null : trimmed } })
              }}
            />
          </div>
        )}
        </PageSection>
        {sharing && detail !== undefined ? (
          <FolderSharingPanel folder={detail} connections={connections.data} />
        ) : null}

        <PageSection name="Scheduled" heading="Scheduled">
          <PageBody
            query={open}
            isEmpty={bothEmpty}
            emptyCopy={FOLDER_EMPTY}
            truncated={open.data?.truncated ?? false}
          >
            <div className="list-card">
              <TaskList
                tasks={scheduled}
                viewerId={viewerId}
                multiMemberFolders={multiMember}
                {...actions}
              />
            </div>
          </PageBody>
          <QuickAddRow
            defaults={{ folder_id: id, due_date: todayInBrowserZone() }}
          />
        </PageSection>

        <PageSection name="Unscheduled" heading="Unscheduled">
          <div className="list-card">
            <TaskList
              tasks={unscheduled}
              viewerId={viewerId}
              multiMemberFolders={multiMember}
              {...actions}
            />
          </div>
          <QuickAddRow defaults={{ folder_id: id }} />
        </PageSection>

        {/* Q7 hides the third section while it is empty. Whether it is empty is
            only known once it has been fetched, and it is only fetched once it
            is opened, so the control is rendered on the strength of the
            folder's own completed count. */}
        {(detail?.counts.completed ?? 0) === 0 ? null : (
          <CollapsibleSection
            name="Completed"
            defaultOpen={false}
            onOpenChange={setCompletedOpen}
          >
            {completedDays.map((day) => (
              <PageSection key={day.date} name={day.date} heading={day.date} tone="day">
                <div className="list-card">
                  <TaskList tasks={day.rows} viewerId={viewerId} {...actions} />
                </div>
              </PageSection>
            ))}
            <MorePages query={completed} />
          </CollapsibleSection>
        )}
        {confirm === null ? null : (
          <ConfirmDialog
            message={
              confirm === 'delete'
                ? folderDeleteConfirm(
                    detail?.name ?? '',
                    detail?.counts.pending ?? 0,
                    detail?.counts.completed ?? 0,
                    abandoned,
                  )
                : leaveFolderConfirm(detail?.name ?? '')
            }
            onContinue={() => {
              const which = confirm
              setConfirm(null)
              // 8.8's cascade and 5.3's leave each take the page with them, so
              // the navigation is part of the action rather than something the
              // person does next: staying would render 10.2's answer for a
              // folder they can no longer see, which reads as an error.
              if (which === 'delete') {
                remove.mutate(id, { onSuccess: () => navigate(paths.myDay) })
                return
              }
              if (viewerId === null) return
              leave.mutate(
                { folderId: id, userId: viewerId },
                { onSuccess: () => navigate(paths.myDay) },
              )
            }}
            onCancel={() => setConfirm(null)}
          />
        )}
      </PageBody>
    </div>
  )
}
