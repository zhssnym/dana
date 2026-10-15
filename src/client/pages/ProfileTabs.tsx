import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import type { Folder } from '../../shared/folders.js'
import type { ProfileDocRoot } from '../../shared/profile-docs.js'
import { useCreateProfileDoc, useMigrateProfileDocs, useMoveProfileDoc, useProfileDocs, useProfilePages } from '../api/profile-docs.js'
import { queryKeys } from '../api/keys.js'
import { useDeleteFolder, useRenameFolder } from '../api/mutations.js'
import { useFolderPage } from '../api/queries.js'
import { FolderTabs } from '../components/folder-tabs.js'
import { ProfilePageContext } from '../components/page/canvas/profile-page-context.js'
import { Button } from '../components/ui/button.js'
import { useRowActions } from '../parts/useRowActions.js'
import { useRowBasis } from './task-rows.js'
import type { AskConfirm } from './MemberDetails.js'
import { ProfileSharing } from './ProfileSharing.js'

const FolderCanvas = lazy(() => import('../components/page/canvas/FolderCanvas.js'))
const prepared = new Set<string>()

interface ProfileTab extends Pick<Folder, 'id' | 'project_id' | 'kind' | 'name' | 'tab_position'> {
  readonly is_default?: boolean
  readonly may_manage?: boolean
  readonly root?: ProfileDocRoot
}

export function ProfileTabs({ folderId, userId, viewerId, canManageProject, overview, migrationFallback, ask }: {
  readonly folderId: string
  readonly userId: string
  readonly viewerId: string | null
  readonly canManageProject: boolean
  readonly overview: React.ReactNode
  readonly migrationFallback: React.ReactNode
  readonly ask: AskConfirm
}): React.JSX.Element {
  const [search, setSearch] = useSearchParams()
  const migration = useMigrateProfileDocs(folderId, userId)
  const key = `${folderId}:${userId}`
  const [ready, setReady] = useState(() => prepared.has(key))
  const begun = useRef(false)
  const prepare = (): void => {
    if (ready || begun.current) return
    begun.current = true
    void migration.mutateAsync().then(() => {
      prepared.add(key)
      setReady(true)
    }).catch(() => { begun.current = false })
  }
  useEffect(() => {
    prepare()
  }, [key, ready])
  const list = useProfileDocs(folderId, userId, ready)
  const create = useCreateProfileDoc(folderId, userId)
  const move = useMoveProfileDoc(folderId, userId)
  const rename = useRenameFolder()
  const remove = useDeleteFolder()
  const cache = useQueryClient()
  const roots = list.data?.roots ?? []
  const activeId = search.get('profile_tab') ?? folderId
  const active = roots.find((root) => root.id === activeId)
  const tabs = useMemo<ProfileTab[]>(() => [
    { id: folderId, project_id: folderId, kind: 'work', name: 'Overview', tab_position: 'a0', is_default: true },
    ...roots.map((root) => ({
      id: root.id, project_id: root.id, kind: 'doc' as const, name: root.name,
      tab_position: root.tab_position, may_manage: root.may_manage, root,
    })),
  ], [folderId, roots])
  const select = (rootId: string | null, pageId: string | null = null): void => {
    setSearch((previous) => {
      const next = new URLSearchParams(previous)
      if (rootId === null) next.delete('profile_tab')
      else next.set('profile_tab', rootId)
      if (pageId === null) next.delete('profile_page')
      else next.set('profile_page', pageId)
      return next
    })
  }
  const editable = viewerId === userId || canManageProject
  return <section aria-label="Profile pages" className="min-w-0 space-y-[var(--space-group)]">
    {migration.isError ? <div role="alert" className="text-sm text-destructive">
      Could not prepare profile writing. <Button variant="outline" size="sm" onClick={prepare}>Try again</Button>
    </div> : null}
    {list.isError ? <p role="alert" className="text-sm text-destructive">Could not load profile pages.</p> : null}
    {ready ? <>
      <FolderTabs tabs={tabs} activeId={active?.id ?? folderId} profile editable={editable}
        onSelect={(tab) => select(tab.root?.id ?? null)}
        onAdd={() => {
          void create.mutateAsync({ name: 'Untitled', custody: viewerId === userId ? 'person' : 'project' })
            .then((made) => select(made.id))
        }}
        onReorder={(dragged, ordered) => {
          const index = ordered.findIndex((tab) => tab.id === dragged.id)
          if (index < 0 || dragged.root === undefined) return
          const before = ordered.slice(0, index).reverse().find((tab) => tab.root !== undefined)
          const after = ordered.slice(index + 1).find((tab) => tab.root !== undefined)
          move.mutate({ rootId: dragged.id, beforeId: before?.id ?? null, afterId: after?.id ?? null })
        }}
        onRename={(tab, name) => {
          if (tab.root === undefined) return
          void rename.mutateAsync({ id: tab.id, body: { name } }).then(() =>
            cache.invalidateQueries({ queryKey: queryKeys.profileDocs(folderId, userId) }))
        }}
        onDelete={(tab) => {
          if (tab.root === undefined) return
          ask(`Move ${tab.name} to Trash?`, () => {
            void remove.mutateAsync(tab.id).then(() => {
              select(null)
              void cache.invalidateQueries({ queryKey: queryKeys.profileDocs(folderId, userId) })
            })
          }, { confirmLabel: 'Move to Trash', cancelLabel: 'Cancel' })
        }}/>
      <ProfileSharing folderId={folderId} userId={userId} root={active}/>
      {active === undefined ? overview : <ProfileDocBody
        userId={userId} root={active}
        pageId={search.get('profile_page')}
        onOpen={(id) => select(active.id, id)} onBack={() => select(active.id)} ask={ask}/>}
    </> : migration.isError ? migrationFallback :
      <p className="text-sm text-muted-foreground">Preparing profile pages…</p>}
  </section>
}

function ProfileDocBody({ userId, root, pageId, onOpen, onBack, ask }: {
  readonly userId: string
  readonly root: ProfileDocRoot
  readonly pageId: string | null
  readonly onOpen: (id: string) => void
  readonly onBack: () => void
  readonly ask: AskConfirm
}): React.JSX.Element {
  const cache = useQueryClient()
  const pages = useProfilePages(root.id)
  const selected = pageId !== null && pages.data?.pages.some((page) => page.id === pageId)
    ? pageId : root.id
  const page = useFolderPage(selected)
  const basis = useRowBasis()
  const actions = useRowActions()
  const context = { ...basis, showFolder: false, starTooltip: actions.starTooltipMode }
  const href = (id: string): string => {
    const url = new URL(window.location.href)
    url.searchParams.set('member', userId)
    url.searchParams.set('team', 'full')
    url.searchParams.set('profile_tab', root.id)
    url.searchParams.set('profile_page', id)
    return `${url.pathname}${url.search}`
  }
  return <ProfilePageContext.Provider value={{ pages: pages.data?.pages ?? [], pending: pages.isPending, open: onOpen, href }}>
    {selected !== root.id ? <Button variant="ghost" size="sm" onClick={onBack}>Back to {root.name}</Button> : null}
    {page.data ? <Suspense fallback={<p className="text-sm text-muted-foreground">Loading Doc…</p>}>
      <FolderCanvas key={selected} page={page.data} folderId={selected} tasks={[]} completed={[]}
        context={context} actions={actions} onAsk={ask} arrangeable={root.may_edit}
        presentationHeadings onCreatePage={(id) => {
          void cache.invalidateQueries({ queryKey: queryKeys.profilePages(root.id) })
            .then(() => onOpen(id))
        }}/>
    </Suspense> : page.isError ? <p role="alert" className="text-sm text-destructive">Could not load this Doc.</p>
      : <p className="text-sm text-muted-foreground">Loading Doc…</p>}
  </ProfilePageContext.Provider>
}
