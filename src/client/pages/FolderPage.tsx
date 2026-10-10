/*
A project's page: the root's header, its tab row, and the tab's body. Each tab
is its own page (`/app/folders/<id>`); a sub-page draws its own header and no tab row.
*/
import { useCallback, useEffect, useRef, useState } from 'react'
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

/* Retired storage keys, never to be read or reused: `dana.folder.show-completed`,
   `dana.folder-view` and `dana.linear.*`. */

/** `folderId` overrides the route parameter for Desk, which renders at /app
 *  (the installed app's start_url) and so has no id in the path. */
export function FolderPage({
  folderId,
}: {
  readonly folderId?: string
} = {}): React.JSX.Element {
  const [search] = useSearchParams()
  /* Old addresses redirect before any of the page's reads start. */
  const issueId = search.get('issue') ?? ''
  if (issueId !== '') return <Navigate to={paths.task(encodeURIComponent(issueId))} replace />
  /* A tab's id is its old facet's id. */
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
  const initialTeamRoute = useRef(search.get('team') === 'full' || search.has(MEMBER_PARAM))
  /* Set when this page is trashed so its reads stop and nothing refetches a 404.
     Keyed by id: the delete lands on the parent, drawn without a remount. */
  const [leftId, setLeftId] = useState<string | null>(null)
  const leaving = leftId === id
  const {
    here, herePage, kind, onTab, headId, atProject, folder, folderOk, writes, open, page, allPages, tabs, projectName,
  } = useFolderReads(id, leaving)
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
  useEffect(() => {
    if (!initialTeamRoute.current || herePage === undefined) return
    initialTeamRoute.current = false
    setSharing(true)
  }, [herePage, setSharing])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferTo, setTransferTo] = useState<string | null>(null)
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

  /* A folder's cover is shared by every member, unlike a page's per-viewer cover. */
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
     back after the last one went to Trash. */
  const shownTabs = onTab ? tabs : []
  const discussionTab = tabs.find((tab) => tab.kind === 'discussion')
  const threadHere = useThreadAddress({ search, navigate, id, kind, isDefault, discussionTab })
  useThreadScroll(id, kind === 'work' && page.data !== undefined && completedReady)

  /* Replace, so Back leaves the project rather than stepping through its tabs. */
  const selectTab = useCallback((tab: Folder): void => {
    void navigate(paths.folder(tab.id), { replace: true })
  }, [navigate])

  /* A stale ?member= would reopen that member later without being asked. */
  const dropParam = useCallback((name: string): void => {
    setSearch((current) => {
      if (!current.has(name)) return current
      const next = new URLSearchParams(current)
      next.delete(name)
      return next
    }, { replace: true })
  }, [setSearch])

  const personOf = useAuthorPeople(members, connections.data)

  const acts = folderActs({
    id, headId, detail, herePage, tabs, projectName, scheduled, unscheduled, pageData: page.data, cache,
    navigate, setLeftId, selectTab, confirm, mutations,
  })

  useFolderActionParam({ search, setSearch, detail, gates, setRenaming, setCoverOpen, setHistoryOpen, acts })

  const headerActions = (
    <>
      {/* With one tab the row is not drawn, so its "+" waits here. */}
      {shownTabs.length === 1 && tabsEditable && kind !== null && kind !== 'work' ? (
        <AddTabMenu tabs={shownTabs} onAdd={acts.addTab} />
      ) : null}
      {/* Discussion shows once the project has another member or a thread. */}
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
      {/* No Rename here: the title renames in place. */}
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

  /* Trashed: nothing stays mounted to read again while the navigation commits. */
  if (leaving) return <div />

  return (
    <div className="space-y-6">
      {/* A page the viewer cannot see reads as nonexistent, never forbidden. */}
      <PageBody query={here} isEmpty={false} emptyCopy="">
        {/* A focused Discussion has its own head, so these step aside. */}
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


      {/* Lines come from `lib/history.ts`'s `lineFor`, shared with the Activity sentence. */}
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
