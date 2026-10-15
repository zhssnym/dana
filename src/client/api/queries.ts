/*
 * Every read this client makes. A page calls one hook from here; nothing below a page fetches (spec 11.4). View
 * endpoints use `getView` (with tz); everything else uses `getPlain`.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { QueryClient, UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query'

import { getSettingsResponse } from '../../shared/bundle.js'
import type { GetSettingsResponse } from '../../shared/bundle.js'
import { getConnectionsResponse } from '../../shared/connections.js'
import { discussionSchema } from '../../shared/consultation.js'
import type { Discussion } from '../../shared/consultation.js'
import { getEventsResponse, getNotificationsResponse } from '../../shared/events.js'
import type { GetEventsResponse, GetNotificationsResponse } from '../../shared/events.js'
import { getPlaceCoversResponse } from '../../shared/covers.js'
import type { GetPlaceCoversResponse } from '../../shared/covers.js'
import { getPlaceDescriptionsResponse } from '../../shared/place-descriptions.js'
import type { GetPlaceDescriptionsResponse } from '../../shared/place-descriptions.js'
import { getPageResponse } from '../../shared/pages.js'
import { getPageFacetsResponse } from '../../shared/page-facets.js'
import type { GetPageFacetsResponse } from '../../shared/page-facets.js'
import type { GetPageResponse } from '../../shared/pages.js'
import type { GetConnectionsResponse } from '../../shared/connections.js'
import { getFolderResponse, getFoldersResponse } from '../../shared/folders.js'
import type { GetFolderResponse, GetFoldersResponse } from '../../shared/folders.js'
import { getInvitesPendingResponse, getInvitesSentResponse } from '../../shared/invites.js'
import type { GetInvitesPendingResponse, GetInvitesSentResponse } from '../../shared/invites.js'
import { meResponse } from '../../shared/me.js'
import type { MeResponse } from '../../shared/me.js'
import { getShelvesResponse, shelf } from '../../shared/shelves.js'
import type { GetShelvesResponse, Shelf } from '../../shared/shelves.js'
import { getTaskResponse } from '../../shared/tasks.js'
import { getTaskDependenciesResponse } from '../../shared/task-dependencies.js'
import type { TaskDependencies } from '../../shared/task-dependencies.js'
import { getReferenceSearchResponse } from '../../shared/references.js'
import type { GetReferenceSearchResponse } from '../../shared/references.js'
import { getTrashResponse } from '../../shared/trash.js'
import type { GetTrashResponse } from '../../shared/trash.js'
import type { TaskCard, TaskDetail } from '../../shared/tasks.js'
import {
  getAllResponse,
  getFocusResponse,
  getFolderTasksCompletedResponse,
  getFolderTasksOpenResponse,
  getPlannedCalendarResponse,
  getSearchResponse,
} from '../../shared/views.js'
import type {
  FocusGroup,
  FocusWhen,
  GetAllResponse,
  GetDoneResponse,
  GetFocusResponse,
  GetFolderTasksOpenResponse,
  GetPlannedCalendarResponse,
  GetSearchResponse,
} from '../../shared/views.js'

import { getFolderAccessHistoryResponse } from '../../shared/folder-access.js'
import type { FolderAccessHistoryEntry } from '../../shared/folder-access.js'
import {
  getFolderMemberDetailsResponse,
  getResponsibilityHistoryResponse,
} from '../../shared/responsibility.js'
import type {
  GetFolderMemberDetailsResponse,
  ResponsibilityHistoryEntry,
} from '../../shared/responsibility.js'

import { getPlain, getView } from './http.js'
import { queryKeys } from './keys.js'

export function useMe(): UseQueryResult<MeResponse> {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => getPlain(meResponse, '/me'),
  })
}

export function useFolders(): UseQueryResult<GetFoldersResponse> {
  return useQuery({
    queryKey: queryKeys.folders(),
    queryFn: () => getPlain(getFoldersResponse, '/folders'),
  })
}

/**
 * Every page, a project's tabs included. The plain list keeps the Library's shape; the tab row reads tabs from
 * this one.
 */
export function useAllPages(enabled = true): UseQueryResult<GetFoldersResponse> {
  return useQuery({
    queryKey: queryKeys.allPages(),
    queryFn: () => getPlain(getFoldersResponse, '/folders?tabs=1'),
    enabled,
  })
}

/** Read from the folder list, which every page already holds: a task card's folder stub has no member_count. */
export function useMultiMemberFolderIds(): ReadonlySet<string> {
  /* Every page, tabs included: a task on a Work or Doc tab names its page. */
  const folders = useAllPages()
  return new Set(
    (folders.data ?? []).filter((f) => f.member_count > 1).map((f) => f.id),
  )
}

export function useFolder(
  id: string,
  /* Off until the caller has a folder: `/folders/` would hit the list endpoint and fail this schema. */
  enabled = true,
): UseQueryResult<GetFolderResponse> {
  return useQuery({
    queryKey: queryKeys.folder(id),
    queryFn: () => getPlain(getFolderResponse, `/folders/${id}`),
    enabled,
  })
}

export function useConnections(): UseQueryResult<GetConnectionsResponse> {
  return useQuery({
    queryKey: queryKeys.connections(),
    queryFn: () => getPlain(getConnectionsResponse, '/connections'),
  })
}

export function usePendingInvites(): UseQueryResult<GetInvitesPendingResponse> {
  return useQuery({
    queryKey: queryKeys.pendingInvites(),
    queryFn: () => getPlain(getInvitesPendingResponse, '/invites/pending'),
  })
}

/** The People screen shows the pending subset, so a bare invite stays visible after it is sent. */
export function useSentInvites(): UseQueryResult<GetInvitesSentResponse> {
  return useQuery({
    queryKey: queryKeys.sentInvites(),
    queryFn: () => getPlain(getInvitesSentResponse, '/invites/sent'),
  })
}

export interface FocusAsk {
  readonly when: FocusWhen
  readonly important?: boolean
  readonly group: FocusGroup
}

/** The one query behind Today, Upcoming, Assigned and custom lists. The server filters and groups. */
export function useFocusView(ask: FocusAsk): UseQueryResult<GetFocusResponse> {
  const important = ask.important === true ? 'true' : 'false'
  return useQuery({
    queryKey: [...queryKeys.view('focus'), ask.when, important, ask.group],
    queryFn: () =>
      getView(getFocusResponse, '/views/focus', { when: ask.when, important, group: ask.group }),
  })
}

export function useAllView(): UseQueryResult<GetAllResponse> {
  return useQuery({
    queryKey: queryKeys.view('all'),
    queryFn: () => getView(getAllResponse, '/views/all'),
  })
}

/** Done and a folder's Completed section share one query and cursor format (spec 6, 7.10). */
type CompletedPage = GetDoneResponse

/** Cursors are opaque. Only a null `next_cursor` ends the list; an empty page does not. */
function nextPageParam(page: CompletedPage): string | undefined {
  return page.next_cursor ?? undefined
}

/**
 * Pages can split one day across a seam, so merge groups with the same date. The pages arrive in server order,
 * so this appends and never re-sorts.
 */
export interface CompletedDay {
  readonly date: string
  readonly rows: readonly TaskCard[]
}

export function mergeCompletedDays(
  pages: readonly CompletedPage[] | undefined,
): readonly CompletedDay[] {
  const order: string[] = []
  const byDate = new Map<string, TaskCard[]>()
  for (const page of pages ?? []) {
    for (const day of page.days) {
      const existing = byDate.get(day.date)
      if (existing === undefined) {
        order.push(day.date)
        byDate.set(day.date, [...day.rows])
        continue
      }
      existing.push(...day.rows)
    }
  }
  return order.map((date) => ({ date, rows: byDate.get(date) ?? [] }))
}

export function useFolderOpenTasks(
  id: string,
  enabled = true,
): UseQueryResult<GetFolderTasksOpenResponse> {
  return useQuery({
    queryKey: queryKeys.folderTasks(id, 'open'),
    queryFn: () =>
      getView(getFolderTasksOpenResponse, `/folders/${id}/tasks`, { section: 'open' }),
    enabled,
  })
}

export function useFolderCompletedTasks(
  id: string,
  enabled: boolean,
): UseInfiniteQueryResult<{ readonly pages: readonly CompletedPage[] }, Error> {
  return useInfiniteQuery({
    queryKey: queryKeys.folderTasks(id, 'completed'),
    queryFn: ({ pageParam }) =>
      getView(getFolderTasksCompletedResponse, `/folders/${id}/tasks`, {
        section: 'completed',
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageParam,
    // The Completed section starts collapsed; it fetches only when expanded (AC-058).
    enabled,
  })
}

/**
 * The dates are part of the key, so a range already seen is answered from the cache. Disabled until the
 * calendar reports its range; a request without start and end is a 422.
 */
export function usePlannedCalendarView(
  start: string | null,
  end: string | null,
  folderId?: string,
): UseQueryResult<GetPlannedCalendarResponse> {
  return useQuery({
    queryKey: [...queryKeys.view('planned-calendar'), start, end, folderId ?? null],
    queryFn: () =>
      getView(getPlannedCalendarResponse, '/views/planned/calendar', {
        start: start ?? '',
        end: end ?? '',
        ...(folderId === undefined ? {} : { folder_id: folderId }),
      }),
    enabled: start !== null && end !== null,
  })
}

/** Starts `useTask`'s read early (a row pressed or hovered), so a peek opens
 * on data already here. Fresh reads within a few seconds are not repeated. */
export function prefetchTask(client: QueryClient, id: string): void {
  void client.prefetchQuery({
    queryKey: queryKeys.task(id),
    queryFn: () => getPlain(getTaskResponse, `/tasks/${id}`),
    staleTime: 5_000,
  })
}

export function useTask(id: string | null): UseQueryResult<TaskDetail> {
  return useQuery({
    queryKey: queryKeys.task(id ?? ''),
    queryFn: () => getPlain(getTaskResponse, `/tasks/${id ?? ''}`),
    enabled: id !== null,
  })
}

export function useTaskDependencies(id: string | null): UseQueryResult<TaskDependencies> {
  return useQuery({
    queryKey: queryKeys.taskDependencies(id ?? ''),
    queryFn: () => getPlain(getTaskDependenciesResponse, `/tasks/${id ?? ''}/dependencies`),
    enabled: id !== null,
  })
}

/** `folder` makes that Folder's matches lead. Disabled below two characters, which the server refuses. */
export function useReferenceSearch(
  q: string,
  folder: string | null,
): UseQueryResult<GetReferenceSearchResponse> {
  const trimmed = q.trim()
  return useQuery({
    queryKey: queryKeys.referenceSearch(trimmed, folder),
    queryFn: () =>
      getPlain(getReferenceSearchResponse, '/references/search', {
        q: trimmed,
        folder: folder ?? undefined,
      }),
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
  })
}

export function useSearch(q: string, enabled: boolean): UseQueryResult<GetSearchResponse> {
  return useQuery({
    queryKey: [...queryKeys.view('search'), q],
    queryFn: () => getView(getSearchResponse, '/search', { q }),
    enabled,
  })
}

/** The only settings read. It holds the pin list, which decides which sidebar entries exist. */
export function useBundle(): UseQueryResult<GetSettingsResponse> {
  return useQuery({
    queryKey: queryKeys.bundle(),
    queryFn: () => getPlain(getSettingsResponse, '/settings'),
  })
}

/** `enabled` lets the chrome skip this read on pages with no shelf tab to label. */
export function useShelves(enabled = true): UseQueryResult<GetShelvesResponse> {
  return useQuery({
    queryKey: queryKeys.shelves(),
    queryFn: () => getPlain(getShelvesResponse, '/shelves'),
    enabled,
  })
}

export function useTrash(): UseQueryResult<GetTrashResponse> {
  return useQuery({
    queryKey: queryKeys.trash(),
    queryFn: () => getPlain(getTrashResponse, '/trash'),
  })
}

/** `subject` is a `kind:id` reference. Disabled for null: a place page has no history and would answer 404. */
export function useSubjectEvents(subject: string | null): UseQueryResult<GetEventsResponse> {
  return useQuery({
    queryKey: queryKeys.events(subject ?? ''),
    queryFn: () => getPlain(getEventsResponse, '/events', { subject: subject ?? '' }),
    enabled: subject !== null,
  })
}

export function useFolderEvents(folderId: string | null): UseQueryResult<GetEventsResponse> {
  return useQuery({
    queryKey: queryKeys.events(`folder-scope:${folderId ?? ''}`),
    queryFn: () => getPlain(getEventsResponse, '/events', { folder: folderId ?? '' }),
    enabled: folderId !== null,
  })
}

export function useShelf(id: string, enabled = true): UseQueryResult<Shelf> {
  return useQuery({
    queryKey: queryKeys.shelf(id),
    queryFn: () => getPlain(shelf, `/shelves/${id}`),
    /* Off where the caller holds no shelf (`lib/page-identity.ts` on non-shelf pages). */
    enabled,
  })
}

export function usePageFacets(id: string, enabled: boolean): UseQueryResult<GetPageFacetsResponse> {
  return useQuery({
    queryKey: queryKeys.pageFacets(id),
    queryFn: () => getPlain(getPageFacetsResponse, `/pages/${id}/facets`),
    enabled,
  })
}

export function usePageFacetDocument(
  pageId: string,
  facetId: string | null,
): UseQueryResult<GetPageResponse> {
  return useQuery({
    queryKey: queryKeys.pageFacetDocument(pageId, facetId ?? ''),
    queryFn: () => getPlain(getPageResponse,
      `/pages/${pageId}/facets/${facetId}/document`),
    enabled: facetId !== null,
  })
}

export function useFolderPage(id: string, enabled = true): UseQueryResult<GetPageResponse> {
  return useQuery({
    queryKey: queryKeys.folderPage(id),
    queryFn: () => getPlain(getPageResponse, `/folders/${id}/page`),
    enabled,
  })
}

export function useShelfPage(id: string): UseQueryResult<GetPageResponse> {
  return useQuery({
    queryKey: queryKeys.shelfPage(id),
    queryFn: () => getPlain(getPageResponse, `/shelves/${id}/page`),
  })
}

/** `poll`: the bell polls every twenty seconds; TanStack pauses intervals in a hidden tab. */
export function useNotifications(poll: boolean): UseQueryResult<GetNotificationsResponse> {
  return useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: () => getPlain(getNotificationsResponse, '/notifications'),
    refetchInterval: poll ? 20_000 : false,
  })
}

/** One query for the whole set: the only read is one viewer's covers, and every place page draws one. */
export function usePlaceCovers(): UseQueryResult<GetPlaceCoversResponse> {
  return useQuery({
    queryKey: queryKeys.placeCovers(),
    queryFn: () => getPlain(getPlaceCoversResponse, '/place-covers'),
  })
}

/** The response is dense: a missing sentence is `null`, meaning "show Dana's default". */
export function usePlaceDescriptions(
  enabled = true,
): UseQueryResult<GetPlaceDescriptionsResponse> {
  return useQuery({
    queryKey: queryKeys.placeDescriptions(),
    queryFn: () => getPlain(getPlaceDescriptionsResponse, '/place-descriptions'),
    enabled,
  })
}

export function useDiscussion(id: string, enabled = true): UseQueryResult<Discussion> {
  return useQuery({
    queryKey: queryKeys.discussion(id),
    queryFn: () => getPlain(discussionSchema, `/discussions/${id}`),
    enabled,
  })
}

export function useFolderMember(
  folderId: string,
  userId: string,
): UseQueryResult<GetFolderMemberDetailsResponse> {
  return useQuery({
    queryKey: queryKeys.folderMember(folderId, userId),
    queryFn: () =>
      getPlain(getFolderMemberDetailsResponse, `/folders/${folderId}/members/${userId}`),
  })
}

export type MemberHistoryEntry =
  | { readonly kind: 'access'; readonly entry: FolderAccessHistoryEntry }
  | { readonly kind: 'responsibility'; readonly entry: ResponsibilityHistoryEntry }

/** Access and Responsibility history merged into one list, newest first. */
export function useFolderMemberHistory(
  folderId: string,
  userId: string,
  enabled: boolean,
): UseQueryResult<readonly MemberHistoryEntry[]> {
  return useQuery({
    queryKey: queryKeys.folderMemberHistory(folderId, userId),
    enabled,
    queryFn: async () => {
      const base = `/folders/${folderId}/members/${userId}`
      const [access, responsibility] = await Promise.all([
        getPlain(getFolderAccessHistoryResponse, `${base}/access-history`),
        getPlain(getResponsibilityHistoryResponse, `${base}/responsibility/history`),
      ])
      const merged: MemberHistoryEntry[] = [
        ...access.entries.map((entry) => ({ kind: 'access' as const, entry })),
        ...responsibility.entries.map((entry) => ({ kind: 'responsibility' as const, entry })),
      ]
      return merged.sort((a, b) => b.entry.effective_at.localeCompare(a.entry.effective_at))
    },
  })
}
