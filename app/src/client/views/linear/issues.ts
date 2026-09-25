/*
The Linear view as GitHub Issues (m2 ghissues): the rules the list and the
issue page share. A task is an issue; pending is Open, completed is Closed as
completed, abandoned is Closed as not planned. A section is a milestone.
See scratchpad m2/ghissues/DESIGN.md.
*/
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { commentCountsResponse } from '../../../shared/comments.js'
import type { PageView } from '../../../shared/pages.js'
import type { TaskCard } from '../../../shared/tasks.js'
import { getPlain } from '../../api/http.js'
import { useConnections, useFolder, useMe } from '../../api/queries.js'
import { personDisplay } from '../../parts/presenters.js'
import type { Person } from '../../components/person-face.js'

export type IssueState = 'open' | 'completed' | 'not-planned'

export function issueState(task: Pick<TaskCard, 'status'>): IssueState {
  return task.status === 'completed' ? 'completed' : task.status === 'abandoned' ? 'not-planned' : 'open'
}

export const STATE_WORD: Record<IssueState, string> = {
  open: 'Open',
  completed: 'Closed',
  'not-planned': 'Not planned',
}

/** A task's labels as one list: the page's, then the viewer's own; never archived ones. */
export function labelsOf(task: TaskCard): { id: string; name: string; color: string }[] {
  return [...task.labels.folder, ...task.labels.personal].filter((label) => !label.archived)
}

export interface IssueGroup {
  /** The section's block id; null for tasks outside every section. */
  readonly id: string | null
  readonly name: string | null
  readonly tasks: readonly TaskCard[]
}

/** The page's own order: id → position. */
export function pageRank(page: Pick<PageView, 'items'>): ReadonlyMap<string, number> {
  const map = new Map<string, number>()
  for (const item of page.items) if (!map.has(item.id)) map.set(item.id, map.size)
  return map
}

/** Each task's section (milestone), as the page places it; null outside every section. */
export function sectionReader(page: PageView): {
  readonly sections: readonly { id: string; name: string }[]
  readonly sectionOf: (task: Pick<TaskCard, 'id' | 'section_block_id'>) => string | null
} {
  const rank = pageRank(page)
  const sections = page.blocks
    .filter((block) => block.kind === 'section' && block.section_block_id === null)
    .sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    .map((block) => ({ id: block.id, name: block.text?.trim() || 'Untitled' }))
  const known = new Set(sections.map((s) => s.id))
  const placement = new Map((page.task_placements ?? []).map((row) => [row.id, row.section_block_id]))
  return {
    sections,
    sectionOf: (task) => {
      const id = placement.get(task.id) ?? task.section_block_id ?? null
      return id !== null && known.has(id) ? id : null
    },
  }
}

/**
 * The Open tab: pending tasks by milestone, in page order. Tasks outside every
 * section come first under no heading. A milestone with no open tasks is left
 * out once it has closed ones (it is done); a new, empty one stays, so it is
 * a place to add to.
 */
export function openGroups(
  page: PageView,
  open: readonly TaskCard[],
  closed: readonly TaskCard[],
): IssueGroup[] {
  const rank = pageRank(page)
  const { sections, sectionOf } = sectionReader(page)
  const ordered = open
    .filter((task) => task.status === 'pending')
    .sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER))
  const groups: IssueGroup[] = []
  const loose = ordered.filter((task) => sectionOf(task) === null)
  if (loose.length > 0) groups.push({ id: null, name: null, tasks: loose })
  for (const section of sections) {
    const own = ordered.filter((task) => sectionOf(task) === section.id)
    if (own.length === 0 && closed.some((task) => sectionOf(task) === section.id)) continue
    groups.push({ id: section.id, name: section.name, tasks: own })
  }
  return groups
}

/** GET /folders/:id/comment-counts: task id → comments, absent when none. */
export function useCommentCounts(folderId: string): ReadonlyMap<string, number> {
  const query = useQuery({
    queryKey: ['folders', folderId, 'comment-counts'] as const,
    queryFn: () => getPlain(commentCountsResponse, `/folders/${folderId}/comment-counts`),
  })
  return useMemo(
    () => new Map((query.data?.counts ?? []).map((row) => [row.task_id, row.comments])),
    [query.data],
  )
}

/** Who someone is, from the rosters this client already reads (viewer, page members, connections). */
export function usePeople(folderId: string | null): (id: string | null | undefined) => Person {
  const me = useMe()
  const connections = useConnections()
  const members = useFolder(folderId ?? '', folderId !== null).data?.members
  const people = useMemo(() => {
    const map = new Map<string, Person>()
    const add = (user: { id: string; display_name: string | null; avatar_url: string | null }): void => {
      if (!map.has(user.id)) map.set(user.id, personDisplay(user))
    }
    const viewer = me.data?.user
    if (viewer !== undefined) add(viewer)
    for (const member of members ?? []) add(member.user)
    for (const connection of connections.data ?? []) add(connection.user)
    return map
  }, [connections.data, me.data?.user, members])
  return (id) => (id == null ? undefined : people.get(id)) ?? personDisplay({ display_name: null })
}
