/*
9.6's page, in step 7's shape: a project's header (mark and name with
"Share" and one "…" at the right), its row of tabs, and the tab's body. Every
tab is a page of its own (`/app/folders/<id>`), and the header on each of
them is the project root's: the project is its root row, and renaming,
sharing or deleting it acts on the project. A sub-page (no `tab_position`)
draws its own header and no tab row.

The body is drawn by the page's kind: Work is the canvas drawn as the thread
(M4), where a finished Task stays in place, checked and muted; Freeform groups
finished Tasks by Section. A Doc is the
same canvas with flat headings and no thread; a Discussion is the project's
threads; a new project nobody has picked a kind for is the picker. Linear,
Board and the issue page are gone; an old `?issue=<id>` address lands on
`/app/tasks/<id>`, the one task page, and an old `?facet=<id>` address on
that tab's own page (0061 kept each facet's id).

What is deliberate rather than transcription:

**The identity is the folder's, written through 4.3's shared columns.** The mark
opens the icon-and-colour picker and PATCHes icon and color; the cover uploads
through 7.15 (kind 'cover') and PATCHes cover_file_id; the description PATCHes
description; the name renders as a heading for everybody and becomes an inline
field on a click, the title being rename's one home on this page.

**All of these are Can edit's.** Can view is read only, and a folder's identity
is shared Folder work, which Can edit may change. AC-011, AC-012 and AC-193
carry it, and `lib/folder-authority.ts` answers it here from the same table the
routes resolve against (issue #228).

A reader below that bar is offered no control a 403 would answer, and still has
a heading, a band and a paragraph to read; the heading is always drawn (AC-226).
4.4's per-member color column is written by no surface here.

**Tasks sit under their sections.** `server/views/cards.ts` projects
`section_block_id` on the folder read, each section carries its own rows and its own quick-add, and the loose
list holds exactly the tasks under no section.

**One Task filter, no view strip, no board.** Filtering hides non-matching Task
placements only. The thread remains the same document: authored blocks,
ordering, progress and the canonical Next Task do not change.

**Delete asks nothing and the undo bar answers** (9.6: "with the undo bar and no
confirmation: two ways back is why the question left"). The inverse is 7.13's
restore, registered the way every page registers one. Leave keeps its sentence
verbatim and its confirm (AC-183), and walks through DELETE /my-membership.

**An owner with other members is offered Transfer ownership rather than Leave,
and that is the server's rule.** There is no automatic succession: the owner's
leave is 409 until they have handed custody to a member who *currently holds
Full control*, and the picker offers exactly those. A sole owner is offered
Delete, and Desk neither.

**The overflow menu sits at the header's right, beside Share**, named "More
actions", offering exactly the acts this viewer's Access permits: History, Copy link, Duplicate, Save as workflow to
everyone; **Delete folder at Full control, Leave
folder to any member who is not the owner and is not the last Full control, and
Transfer ownership to the owner alone**, all through `lib/folder-authority.ts`.
Duplicate is the server's; Save as workflow is a client-side export, structure
and titles only.

**A stale block write is handled visibly**: the 409 carries 5.1's copy, which
the mutation cache already raises as the toast, and the page refetches its
blocks at the same moment so the winning write replaces the loser on screen.

**A project's conversation has one home: its Discussion tab.** A thread's
address (`?discussion=`, or a notification's `?conversation=open`) on any
page of the project moves there; a project with no Discussion tab (and the
Desk) draws the thread on the page it was reached on.

**The "…" is the project's list** (`lib/object-acts.ts`) on a project and its
tabs, and the page's on a sub-page: History, Copy link, Duplicate, Export
project (a project only), then Leave or Delete by role. Rename's home is the
title.
*/
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'

import { useConnections } from '../api/queries.js'
import { usePageHasCover } from '../components/page-head.js'
import { FolderCoverDialog } from '../components/folder-head.js'
import { FOLDER_PREFIX } from '../lib/page-identity.js'
import { ConsultationPanel } from '../components/consultation/ConsultationPanel.js'
import { HistorySheet } from '../components/history-sheet.js'
import { Button } from '../components/ui/button.js'
import { UsersRound } from '../lib/icons.js'

import type { RowContext } from '../parts/presenters.js'
import { useRowActions } from '../parts/useRowActions.js'
import { paths } from '../routes.js'
import { useTeamPanelState } from '../state/collaboration.js'
import { AddTabMenu } from '../components/folder-tabs.js'
import { ProjectPicker } from '../components/project-picker.js'
import { PageBody } from '../components/page/PageStates.js'
import { MEMBER_PARAM } from './FolderSharingPanel.js'
import { ConfirmDialog, useConfirm, useRowBasis } from './task-rows.js'
import { useLabels } from '../api/labels.js'
import { useTaskFilter } from '../views/filter-store.js'
import { useCurrentWorkView } from '../views/work-view.js'
import type { WorkGroup } from '../views/WorkBoard.js'
import type { Folder } from '../../shared/folders.js'
import { FacetAddress } from './folder-page/FacetAddress.js'
import { folderActs } from './folder-page/folder-acts.js'
import { folderPageAuthority } from './folder-page/folder-page-authority.js'
import { FolderDiscussionButton } from './folder-page/FolderDiscussionButton.js'
import { FolderHead } from './folder-page/FolderHead.js'
import { FolderMoreMenu } from './folder-page/FolderMoreMenu.js'
import { FolderTabRow } from './folder-page/FolderTabRow.js'
import { FolderTeamPanel } from './folder-page/FolderTeamPanel.js'
import { FolderWorkBody } from './folder-page/FolderWorkBody.js'
import { FolderWorkTools } from './folder-page/FolderWorkTools.js'
import { TransferOwnershipDialog } from './folder-page/TransferOwnershipDialog.js'
import { useAuthorPeople } from './folder-page/use-author-people.js'
import { useFolderActionParam } from './folder-page/use-folder-action-param.js'
import { useFolderDiscussion } from './folder-page/use-folder-discussion.js'
import { useFolderMutations } from './folder-page/use-folder-mutations.js'
import { useFolderReads } from './folder-page/use-folder-reads.js'
import { useFolderRows } from './folder-page/use-folder-rows.js'
import { useTaskFilterOptions } from './folder-page/use-task-filter-options.js'
import { useThreadAddress } from './folder-page/use-thread-address.js'
import { useThreadScroll } from './folder-page/use-thread-scroll.js'

/*
Retired storage keys (M4), never to be read, renamed or reused:
`dana.folder.show-completed` was this page's "Show completed", gone with the
control; `dana.folder-view` and `dana.linear.*` are retired in
`views/view-mode.ts`. A stored value simply stops mattering.
*/

/**
 * The folder page of 9.6.
 *
 * `folderId` overrides the route parameter and exists for exactly one
 * caller: Desk renders this page at /app, where 10.6 fixes the installed
 * app's start_url and so the folder's identity cannot be in the path.
 */
export function FolderPage({
  folderId,
}: {
  readonly folderId?: string
} = {}): React.JSX.Element {
  const [search] = useSearchParams()
  /* An old Linear issue address (`?issue=<task id>`) is the one task page now.
     Answered before any of the page's reads start, and only for a real id. */
  const issueId = search.get('issue') ?? ''
  if (issueId !== '') return <Navigate to={paths.task(encodeURIComponent(issueId))} replace />
  /* An old tab address (`?facet=<id>`, before step 7) is that tab's page now:
     0061 gave each tab its facet's id. */
  const facetId = search.get('facet') ?? ''
  if (facetId !== '') return <FacetAddress facetId={facetId} />
  return <FolderPageBody folderId={folderId} />
}

function FolderPageBody({
  folderId,
}: {
  readonly folderId?: string
}): React.JSX.Element {
  const { id: routeId = '' } = useParams<{ id: string }>()
  const id = folderId ?? routeId
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  /* Set as this page is trashed: its reads stop, so the delete's
     invalidation refetches none of them against a 404 while the page is
     still mounted, the navigation away not yet committed. */
  /* The page being left (deleted): nothing of it stays mounted. Keyed by id,
     because a delete lands on the parent page, which this same component
     draws without remounting. */
  const [leftId, setLeftId] = useState<string | null>(null)
  const leaving = leftId === id
  const {
    here, herePage, kind, onTab, headId, atProject, folder, folderOk, writes, open, page, allPages, tabs, projectName,
  } = useFolderReads(id, leaving)
  /* "Save as workflow" reads each row's 7.6 detail before it writes the
     file, through the cache the row already stores one in. */
  const cache = useQueryClient()
  const basis = useRowBasis()
  const [taskFilter, setTaskFilter] = useTaskFilter(id)
  const labelDefinitions = useLabels(id, 'all', folderOk && kind === 'work')
  const [workView] = useCurrentWorkView()
  const [boardGroup, setBoardGroup] = useState<WorkGroup>('section')
  const actions = useRowActions()
  const confirm = useConfirm()
  const mutations = useFolderMutations()
  const { patch, transfer, createTab, duplicate } = mutations
  const [sharing, setSharing] = useTeamPanelState(headId)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  /* The member picked in the transfer dialog; nothing moves until its button. */
  const [transferTo, setTransferTo] = useState<string | null>(null)
  /* An owner deleting a shared folder is asked one question first. */
  // 9.6's inline rename: the title is a heading until this is true.
  const [renaming, setRenaming] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)

  const connections = useConnections()
  const { dockOpen, threadRows, unreadThreads } = useFolderDiscussion(headId, basis.viewerId, sharing)

  const detail = folder.data
  const scheduled = open.data?.scheduled ?? []
  const unscheduled = open.data?.unscheduled ?? []
  const { openRows, completedReady, completedRows, filterRows } = useFolderRows({
    id, writes, kind, workView, scheduled, unscheduled, items: page.data?.items,
  })
  const context: RowContext = {
    ...basis,
    showFolder: false,
    starTooltip: actions.starTooltipMode,
  }

  /*
  The folder's own storage name for the lifted head, which is
  `lib/page-identity.ts`'s folder half: a place page's cover is 4.20's, per
  viewer, and a folder's is 4.3's `cover_file_id`, shared by every member.
  */
  const coverKey = `${FOLDER_PREFIX}${headId}`
  /* Off once trashed: the cover read is a folder read too. */
  const hasCover = usePageHasCover(leaving ? '' : coverKey)

  const isDefault = detail?.is_default ?? false
  const members = detail?.members ?? []
  const { facts, gates, sharedPageEditable, tabsEditable } = folderPageAuthority({
    detail, members, viewerId: basis.viewerId, headId, isDefault,
  })
  const { filterPeople, filterLabels, filteringTasks, canCreateInFilter } = useTaskFilterOptions({
    members, filterRows, labels: labelDefinitions.data, taskFilter, kind, gates,
  })
  /* The Desk's row is drawn even with Work alone, so its "+" can add a Doc
     back after the last one went to Trash (spec 9.14). */
  const shownTabs = onTab ? tabs : []
  const discussionTab = tabs.find((tab) => tab.kind === 'discussion')
  const threadHere = useThreadAddress({ search, navigate, id, kind, isDefault, discussionTab })
  useThreadScroll(id, kind === 'work' && page.data !== undefined && completedReady)

  /* A tab is a page of its own: choosing one goes there, in place, so Back
     leaves the project rather than stepping through its tabs. */
  const selectTab = useCallback((tab: Folder): void => {
    void navigate(paths.folder(tab.id), { replace: true })
  }, [navigate])

  /* Drops one parameter in place: a stale ?member= would reopen that member
     later without being asked. */
  const dropParam = useCallback((name: string): void => {
    setSearch((current) => {
      if (!current.has(name)) return current
      const next = new URLSearchParams(current)
      next.delete(name)
      return next
    }, { replace: true })
  }, [setSearch])
  /* No page or per-Section "N of M done": nobody measures tasks by count
     (round 7). A task's own subtask count stays on its row. */

  const personOf = useAuthorPeople(members, connections.data)

  const acts = folderActs({
    id, headId, detail, herePage, tabs, projectName, scheduled, unscheduled, pageData: page.data, cache,
    navigate, setLeftId, selectTab, confirm, mutations,
  })

  useFolderActionParam({ search, setSearch, detail, gates, setRenaming, setCoverOpen, setHistoryOpen, acts })

  const headerActions = (
    <>
      {/* With one tab the row is not drawn (a note still reads as a page),
          so its "+" waits here. */}
      {shownTabs.length === 1 && tabsEditable && kind !== null && kind !== 'work' ? (
        <AddTabMenu tabs={shownTabs} onAdd={acts.addTab} />
      ) : null}
      {/* This is the project's people surface, not external sharing. The label
          invites the solo creator to add teammates, then settles to Team once
          another member exists. */}
      {isDefault || kind === 'discussion' || (members.length <= 1 && threadRows.length === 0) ? null : (
        <FolderDiscussionButton
          dockOpen={dockOpen}
          unreadThreads={unreadThreads}
          headId={headId}
          setSharing={setSharing}
        />
      )}
      {isDefault ? null : (
        <Button
          variant="ghost"
          aria-expanded={sharing}
          className="text-muted-foreground"
          onClick={() => {
            setSharing(!sharing)
            dropParam(MEMBER_PARAM)
          }}
        >
          <UsersRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {members.length <= 1 ? 'Add teammates' : 'Team'}
        </Button>
      )}
      {/*
      The page's one "…" (`lib/object-acts.ts`): the project's list on a
      project or its tab, the page's on a sub-page. No Rename (the title
      renames in place) and no Add a page inside or Import (u2: the `/`
      menu's Page and the Library's Import project are their one way).
       */}
      <FolderMoreMenu
        atProject={atProject}
        name={detail?.name ?? ''}
        id={id}
        headId={headId}
        isDefault={isDefault}
        gates={gates}
        setHistoryOpen={setHistoryOpen}
        duplicate={duplicate}
        navigate={navigate}
        acts={acts}
      />
    </>
  )

  /* Trashed: nothing of the page stays mounted to read it again while the
     navigation away commits. */
  if (leaving) return <div />

  return (
    <div className="space-y-6">
      {/* The page read, so a page the viewer cannot see renders 10.2's
          answer here: nonexistent, never forbidden. */}
      <PageBody query={here} isEmpty={false} emptyCopy="">
        {/* Focused Discussion has its own contextual head. The Work identity
            and page tabs step aside for both the list and an open thread. */}
        <div className={threadHere ? 'hidden' : 'space-y-4'}>
          <FolderHead
            hasCover={hasCover}
            isDefault={isDefault}
            coverKey={coverKey}
            detail={detail}
            gates={gates}
            renaming={renaming}
            setRenaming={setRenaming}
            patch={patch}
            headId={headId}
            actions={headerActions}
          />
          <FolderTabRow
            failed={allPages.isError && onTab}
            tabs={shownTabs}
            activeId={id}
            onSelect={selectTab}
            editable={tabsEditable}
            acts={acts}
            tools={kind === 'work' ? (
              <FolderWorkTools
                taskFilter={taskFilter}
                setTaskFilter={setTaskFilter}
                people={filterPeople}
                labels={filterLabels}
                today={context.today}
                workView={workView}
                boardGroup={boardGroup}
                setBoardGroup={setBoardGroup}
              />
            ) : undefined}
          />
        </div>

        {herePage === undefined ? null : kind === null ? (
          <ProjectPicker
            editable={tabsEditable}
            pending={createTab.isPending}
            discussion={page.data !== undefined && page.data.blocks.length === 0 && page.data.items.length === 0}
            onPick={(pick) => {
              createTab.mutate({ folderId: id, kind: pick })
            }}
          />
        ) : threadHere ? (
          <ConsultationPanel
            folderId={id}
            viewer={facts === null || basis.viewerId === null ? null : { viewerId: basis.viewerId, facts }}
            personOf={personOf}
          />
        ) : (
          <FolderWorkBody
            id={id}
            kind={kind}
            tabs={tabs}
            open={open}
            page={page}
            completedReady={completedReady}
            openRows={openRows}
            completedRows={completedRows}
            workView={workView}
            boardGroup={boardGroup}
            taskFilter={taskFilter}
            setTaskFilter={setTaskFilter}
            filterPeople={filterPeople}
            filterLabels={filterLabels}
            filteringTasks={filteringTasks}
            context={context}
            actions={actions}
            facts={facts}
            canCreateInFilter={canCreateInFilter}
            sharedPageEditable={sharedPageEditable}
            onAsk={confirm.ask}
            navigate={navigate}
          />
        )}
      </PageBody>

      <FolderCoverDialog storageName={coverKey} open={coverOpen} onOpenChange={setCoverOpen} />

      <FolderTeamPanel
        sharing={sharing}
        detail={detail}
        projectName={projectName}
        connections={connections.data}
        facts={facts}
        viewerId={basis.viewerId}
        setSharing={setSharing}
        gates={gates}
        members={members}
        setTransferOpen={setTransferOpen}
      />


      {/*
      9.6's History, as a sheet that groups by day and puts the actor on every
      line: a record you are reading to settle a question should not make you
      look upwards. Both readers of an event draw it through `lib/history.ts`'s
      `lineFor`, so the window bar's Activity sentence and this one are one
      string rather than two formatters that will one day disagree.
       */}
      <HistorySheet
        kind="folder"
        subject={headId}
        name={detail?.name ?? ''}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        scope="folder"
      />

      <TransferOwnershipDialog
        transferOpen={transferOpen}
        setTransferOpen={setTransferOpen}
        transferTo={transferTo}
        setTransferTo={setTransferTo}
        members={members}
        viewerId={basis.viewerId}
        projectName={projectName}
        folderName={detail?.name}
        headId={headId}
        transfer={transfer}
        setSharing={setSharing}
      />

      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </div>
  )
}
