/*
Every read this client makes, one hook per surface.

The convention this file exists to establish: **a page declares its data
dependency by calling exactly one hook from here, and nothing below a page
fetches anything.** Components take rows as props and callbacks as props. That
is 11.4's "data fetching belongs to the query layer alone" read as a rule about
where a `useQuery` may appear, and it is what keeps a component reusable
between the two pages that render it.

Every hook here is `getView` or `getPlain` from `http.ts`, so the tz rule of
7.0 is decided by which of the two an endpoint takes rather than by anyone
remembering. The split is 7.0's own: view endpoints evaluate dates and take
tz, the roster and the folder list and settings do not and carry none.
*/
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { QueryClient, UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query'

import { getSettingsResponse } from '../../shared/bundle.js'
import { sampleStatus } from '../../shared/sample.js'
import type { SampleStatus } from '../../shared/sample.js'
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
  getDoneResponse,
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
 * Every page the viewer is in, a project's tabs included (`?tabs=1`, step 7).
 * The plain list keeps the Library's shape (roots only, a page under a tab
 * listed under its project); the tab row reads its tabs from this one
 * (`projectTabs`).
 */
export function useAllPages(enabled = true): UseQueryResult<GetFoldersResponse> {
  return useQuery({
    queryKey: queryKeys.allPages(),
    queryFn: () => getPlain(getFoldersResponse, '/folders?tabs=1'),
    enabled,
  })
}

/**
 * The accessible folders holding more than one member.
 *
 * Q3's "unassigned" chip is conditional on the folder having more than one
 * member, and 7.0's TaskCard carries the {id, name, is_default} folder stub
 * rather than the Folder object, deliberately: a group heading needs what a
 * card's label needs and no more. member_count is on the Folder object, which
 * is the folder list the chrome already reads, so the condition is answered
 * from a query that is in the cache on every page rather than from a second
 * request or from a widened response shape.
 */
export function useMultiMemberFolderIds(): ReadonlySet<string> {
  /* Every page, tabs included: a task on a Work or Doc tab names its page. */
  const folders = useAllPages()
  return new Set(
    (folders.data ?? []).filter((f) => f.member_count > 1).map((f) => f.id),
  )
}

export function useFolder(
  id: string,
  /* Off where the caller has no folder yet, which is what an assignee picker
     mounted before its task is known has. Without it the query fires at
     `/folders/`, and a trailing slash is not a 404 here, it is the list
     endpoint answering an array this shape refuses. The default keeps every
     existing call site as it was, which is `useShelves`'s own arrangement. */
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

/**
 * GET /invites/sent, 7.5: the viewer's own invites, newest first, any status.
 * The People screen shows the pending subset so a bare invite is visible
 * somewhere after it is sent, the way a folder invite is visible in the sharing
 * panel.
 */
export function useSentInvites(): UseQueryResult<GetInvitesSentResponse> {
  return useQuery({
    queryKey: queryKeys.sentInvites(),
    queryFn: () => getPlain(getInvitesSentResponse, '/invites/sent'),
  })
}

/** What a Focus list asks GET /views/focus for (shared/views.ts `focusQuery`). */
export interface FocusAsk {
  readonly when: FocusWhen
  readonly important?: boolean
  readonly group: FocusGroup
}

/**
 * GET /views/focus: the one query behind Today, Upcoming, Assigned and the
 * lists a viewer adds. The server filters and groups; a page draws the
 * groups it is given.
 */
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

/**
 * A day-grouped page of completed rows, which is the shape Q6 answers and the
 * shape Q7's third section answers, one page at a time.
 *
 * The two hooks below are one function because section 6 says they are one
 * query: "Completed: Q6 predicate, order, and pagination, folder_id = F". 7.10:
 * a cursor's kind names the order it pages rather than the endpoint that issued
 * it, so the same cursor is legal at both endpoints. One hook body for one
 * order is that sentence as code.
 */
type CompletedPage = GetDoneResponse

/**
 * The cursor rules of 7.10, in the three lines a client owes them.
 *
 * A cursor is opaque, so `undefined` is the first page and every later page is
 * the previous response's `next_cursor` handed back byte for byte; nothing
 * here reads a character of it. A null `next_cursor` is the only end-of-list
 * signal, and returning `undefined` for it is what tells TanStack Query there
 * is no next page: an empty final page is not an end signal and would leave a
 * "load more" control offering a page that does not exist.
 */
function nextPageParam(page: CompletedPage): string | undefined {
  return page.next_cursor ?? undefined
}

/**
 * The pages of a completed list, flattened back into the day groups 9.5 and
 * 9.6 render.
 *
 * A day is not a page. Q6 pages by 50 rows on (completed_at desc, id desc) and
 * groups for display by the completed date, so a busy day spans two pages and
 * arrives as two groups carrying one date. Concatenating the pages' `days`
 * arrays would render that day's heading twice with the rows split under it,
 * which is 9.1's region table broken as well: Done's regions are named by the
 * day each one groups, and two regions cannot carry one name.
 *
 * Merging by date is safe rather than a re-sort, which section 6's preamble
 * forbids. The pages arrive in the server's own order and each page's days are
 * in it, so a date's second appearance is always immediately after its first
 * across the seam; this appends within the existing group and never reorders
 * either the days or the rows inside one.
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

/**
 * Done, as the infinite scroll 9.5 asks for.
 *
 * `useInfiniteQuery` rather than a page-index scheme because Q6 is keyset
 * paginated: there is no page two to ask for, only the position the last
 * response reported. The pages accumulate in the cache, so 8.3's unfiltered
 * invalidation refetches every page a person has scrolled through rather than
 * dropping them back to the first, which is what keeps a completion made in
 * another tab from moving the ground under them.
 */
export function useDoneView(
  /**
   * False while All's collapsed "Completed" section is closed (9.5). The Done
   * page itself always wants this and passes nothing; a section that fetched
   * while collapsed would make the collapse cosmetic, which is the same rule
   * `useFolderCompletedTasks` follows for Q7's third section.
   */
  enabled = true,
): UseInfiniteQueryResult<{ readonly pages: readonly CompletedPage[] }, Error> {
  return useInfiniteQuery({
    queryKey: queryKeys.view('done'),
    queryFn: ({ pageParam }) =>
      getView(getDoneResponse, '/views/done', { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageParam,
    enabled,
  })
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
    // Q7 renders the Completed section collapsed, and a collapsed section that
    // fetched anyway would make the collapse cosmetic. AC-058 reads the
    // control's expanded state; this is what that state controls.
    enabled,
  })
}

/**
 * Q3C's range, which the calendar of 9.5 asks for and this hook carries.
 *
 * The range is the client's to choose and Q3C answers whatever it receives;
 * 9.5 fixes the month zoom's at the whole six weeks overlapping the month,
 * which is 42 days and never approaches Q3C's 62-day refusal. The dates are
 * part of the key rather than of the hook's identity, so changing zoom or
 * paging a month is a different cache entry rather than a refetch of the same
 * one, and going back to a month already seen is answered from the cache.
 *
 * Disabled while the range is unknown: the calendar reports its own dates
 * after it has laid them out, so the first render has none, and a request
 * without start and end is a 422 naming the pair.
 */
export function usePlannedCalendarView(
  start: string | null,
  end: string | null,
): UseQueryResult<GetPlannedCalendarResponse> {
  return useQuery({
    queryKey: [...queryKeys.view('planned-calendar'), start, end],
    queryFn: () =>
      getView(getPlannedCalendarResponse, '/views/planned/calendar', {
        start: start ?? '',
        end: end ?? '',
      }),
    enabled: start !== null && end !== null,
  })
}

/**
 * One task in full, which 9.3's edit mode pre-fills from.
 *
 * `getPlain` rather than `getView`: 7.0 scopes its tz sentence to the view
 * endpoints, and GET /tasks/:id evaluates no date. It answers TaskDetail,
 * whose eight extra fields over TaskCard are exactly what the form needs and
 * no list response carries: notes, the rule, the reminder and the steps.
 */
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

/** 7.25's read of one task's dependencies, both directions (#225). */
export function useTaskDependencies(id: string | null): UseQueryResult<TaskDependencies> {
  return useQuery({
    queryKey: queryKeys.taskDependencies(id ?? ''),
    queryFn: () => getPlain(getTaskDependenciesResponse, `/tasks/${id ?? ''}/dependencies`),
    enabled: id !== null,
  })
}

/** 7.24's picker search; `folder` makes that Folder's matches lead. Disabled
 * below `searchQ`'s two characters, which the server would refuse. */
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

/**
 * The 9.9 overlay's results. The overlay itself is the Complex Interaction
 * engineer's; this is the read it consumes, here because every read in this
 * client is here.
 */
export function useSearch(q: string, enabled: boolean): UseQueryResult<GetSearchResponse> {
  return useQuery({
    queryKey: [...queryKeys.view('search'), q],
    queryFn: () => getView(getSearchResponse, '/search', { q }),
    enabled,
  })
}

/* ------------------------------------------------------------------ *
 * Settings, events
 * ------------------------------------------------------------------ */

/**
 * The person's bundle of 4.19, and the client's only settings read.
 *
 * It owns the pin list that 7.2's three page flags derive into when nobody has
 * written pins yet, so the sidebar reads this one: the pin list is what decides
 * which entries exist. The flags still exist on the server and still derive,
 * and this client never asks for them on their own.
 */
export function useBundle(): UseQueryResult<GetSettingsResponse> {
  return useQuery({
    queryKey: queryKeys.bundle(),
    queryFn: () => getPlain(getSettingsResponse, '/settings'),
  })
}

/** Item 60: whether the sample workspace is present, and how big it is. */
export function useSample(): UseQueryResult<SampleStatus> {
  return useQuery({
    queryKey: queryKeys.sample(),
    queryFn: () => getPlain(sampleStatus, '/sample'),
  })
}

/**
 * The viewer's shelves (7.16), the Library block's groups.
 *
 * `enabled` exists because the chrome reads this only to put a name on a
 * shelf's tab, and a request every page pays for so that one kind of tab can
 * be labelled is a request most pages do not need.
 */
export function useShelves(enabled = true): UseQueryResult<GetShelvesResponse> {
  return useQuery({
    queryKey: queryKeys.shelves(),
    queryFn: () => getPlain(getShelvesResponse, '/shelves'),
    enabled,
  })
}

/**
 * The 7.13 Trash listing, which 9.11 draws as one page.
 *
 * No tz: the endpoint evaluates no calendar date, it reports instants, and
 * 7.0's split is what decides that rather than habit.
 */
export function useTrash(): UseQueryResult<GetTrashResponse> {
  return useQuery({
    queryKey: queryKeys.trash(),
    queryFn: () => getPlain(getTrashResponse, '/trash'),
  })
}

/**
 * The recent events of one thing (7.12), which the window bar's Activity line
 * and the history surfaces read.
 *
 * `subject` is 4.13's `kind:id` reference. Disabled for a null subject rather
 * than called with a placeholder, because a place page has no history of its
 * own and asking for one would be a 404 the bar then has to ignore.
 */
export function useSubjectEvents(subject: string | null): UseQueryResult<GetEventsResponse> {
  return useQuery({
    queryKey: queryKeys.events(subject ?? ''),
    queryFn: () => getPlain(getEventsResponse, '/events', { subject: subject ?? '' }),
    enabled: subject !== null,
  })
}

/**
 * 7.12's other read: everything that happened inside one folder, newest first,
 * for the folder's History sheet.
 */
export function useFolderEvents(folderId: string | null): UseQueryResult<GetEventsResponse> {
  return useQuery({
    queryKey: queryKeys.events(`folder-scope:${folderId ?? ''}`),
    queryFn: () => getPlain(getEventsResponse, '/events', { folder: folderId ?? '' }),
    enabled: folderId !== null,
  })
}

/* ------------------------------------------------------------------ *
 * Pages, shelves, notifications, threads
 * ------------------------------------------------------------------ */

/** One shelf's identity (7.16), which its page's head renders. */
export function useShelf(id: string, enabled = true): UseQueryResult<Shelf> {
  return useQuery({
    queryKey: queryKeys.shelf(id),
    queryFn: () => getPlain(shelf, `/shelves/${id}`),
    /* Off where the caller holds no shelf, which `lib/page-identity.ts` does
       on every page that is not a shelf's, the same arrangement `useFolder`
       has for the folder half. */
    enabled,
  })
}

/** A folder page's block list (7.16, 4.17), which 9.6 draws. */
export function useFolderPage(id: string, enabled = true): UseQueryResult<GetPageResponse> {
  return useQuery({
    queryKey: queryKeys.folderPage(id),
    queryFn: () => getPlain(getPageResponse, `/folders/${id}/page`),
    enabled,
  })
}

/** A shelf page's block list (7.16), which 9.10 draws. */
export function useShelfPage(id: string): UseQueryResult<GetPageResponse> {
  return useQuery({
    queryKey: queryKeys.shelfPage(id),
    queryFn: () => getPlain(getPageResponse, `/shelves/${id}/page`),
  })
}

/**
 * The viewer's notifications (7.12), which the 9.12 bell renders.
 *
 * `poll`: the bell polls every twenty seconds while the app's tab is visible
 * (r7: a bell that only moved on focus missed every mention), and TanStack
 * pauses the interval in a hidden tab, so an idle Dana in a background tab
 * costs the server nothing.
 */
export function useNotifications(poll: boolean): UseQueryResult<GetNotificationsResponse> {
  return useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: () => getPlain(getNotificationsResponse, '/notifications'),
    refetchInterval: poll ? 20_000 : false,
  })
}

/**
 * GET /place-covers (7.19): the covers this viewer has given Dana's own
 * place pages, one entry per place they chose one for.
 *
 * One query for the whole set, and it is 4.20's own shape rather than a
 * convenience: the table's primary key is `(user_id, place)` and its only
 * read is one viewer's covers, so the page that wants Today's cover reads
 * the same response as the page that wants Done's. It is unconditional
 * because every place page mounts the head that draws one, and a cover the
 * head has to wait a request for is a band that appears after the page has
 * already settled.
 */
export function usePlaceCovers(): UseQueryResult<GetPlaceCoversResponse> {
  return useQuery({
    queryKey: queryKeys.placeCovers(),
    queryFn: () => getPlain(getPlaceCoversResponse, '/place-covers'),
  })
}

/**
 * A person's wording for Dana's native pages. The response is dense, so a
 * missing sentence is always `null` and means "show Dana's friendly default".
 */
export function usePlaceDescriptions(
  enabled = true,
): UseQueryResult<GetPlaceDescriptionsResponse> {
  return useQuery({
    queryKey: queryKeys.placeDescriptions(),
    queryFn: () => getPlain(getPlaceDescriptionsResponse, '/place-descriptions'),
    enabled,
  })
}

/** GET /discussions/:id (7.27): one Discussion, for its Folder id and state. */
export function useDiscussion(id: string, enabled = true): UseQueryResult<Discussion> {
  return useQuery({
    queryKey: queryKeys.discussion(id),
    queryFn: () => getPlain(discussionSchema, `/discussions/${id}`),
    enabled,
  })
}

/** One member of a page, for the sharing panel's member details (#209). */
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

/**
 * A member's Access and Responsibility history as one list, newest first. The
 * two records stay separate on the server (#230); the panel reads them as one.
 */
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
