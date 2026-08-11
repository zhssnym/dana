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
import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { getConnectionsResponse } from '../../shared/connections.js'
import type { GetConnectionsResponse } from '../../shared/connections.js'
import { getFolderResponse, getFoldersResponse } from '../../shared/folders.js'
import type { GetFolderResponse, GetFoldersResponse } from '../../shared/folders.js'
import { getInvitesPendingResponse } from '../../shared/invites.js'
import type { GetInvitesPendingResponse } from '../../shared/invites.js'
import { getMeSettingsResponse, meResponse } from '../../shared/me.js'
import type { MeResponse, Settings } from '../../shared/me.js'
import { getTaskResponse } from '../../shared/tasks.js'
import type { TaskDetail } from '../../shared/tasks.js'
import {
  getAllResponse,
  getDoneResponse,
  getFolderTasksCompletedResponse,
  getFolderTasksOpenResponse,
  getImportantResponse,
  getMyDayResponse,
  getPlannedCalendarResponse,
  getPlannedResponse,
  getSearchResponse,
  getTasksViewResponse,
} from '../../shared/views.js'
import type {
  GetAllResponse,
  GetDoneResponse,
  GetFolderTasksCompletedResponse,
  GetFolderTasksOpenResponse,
  GetImportantResponse,
  GetMyDayResponse,
  GetPlannedCalendarResponse,
  GetPlannedResponse,
  GetSearchResponse,
  GetTasksViewResponse,
} from '../../shared/views.js'

import { getPlain, getView } from './http.js'
import { queryKeys } from './keys.js'

export function useMe(): UseQueryResult<MeResponse> {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => getPlain(meResponse, '/me'),
  })
}

export function useSettings(): UseQueryResult<Settings> {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => getPlain(getMeSettingsResponse, '/me/settings'),
  })
}

export function useFolders(): UseQueryResult<GetFoldersResponse> {
  return useQuery({
    queryKey: queryKeys.folders(),
    queryFn: () => getPlain(getFoldersResponse, '/folders'),
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
 * request or from a widened frozen shape.
 */
export function useMultiMemberFolderIds(): ReadonlySet<string> {
  const folders = useFolders()
  return new Set(
    (folders.data ?? []).filter((f) => f.member_count > 1).map((f) => f.id),
  )
}

export function useFolder(id: string): UseQueryResult<GetFolderResponse> {
  return useQuery({
    queryKey: queryKeys.folder(id),
    queryFn: () => getPlain(getFolderResponse, `/folders/${id}`),
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

export function useMyDayView(): UseQueryResult<GetMyDayResponse> {
  return useQuery({
    queryKey: queryKeys.view('my-day'),
    queryFn: () => getView(getMyDayResponse, '/views/my-day'),
  })
}

export function useTasksView(): UseQueryResult<GetTasksViewResponse> {
  return useQuery({
    queryKey: queryKeys.view('tasks'),
    queryFn: () => getView(getTasksViewResponse, '/views/tasks'),
  })
}

export function usePlannedView(): UseQueryResult<GetPlannedResponse> {
  return useQuery({
    queryKey: queryKeys.view('planned'),
    queryFn: () => getView(getPlannedResponse, '/views/planned'),
  })
}

export function useImportantView(): UseQueryResult<GetImportantResponse> {
  return useQuery({
    queryKey: queryKeys.view('important'),
    queryFn: () => getView(getImportantResponse, '/views/important'),
  })
}

export function useAllView(): UseQueryResult<GetAllResponse> {
  return useQuery({
    queryKey: queryKeys.view('all'),
    queryFn: () => getView(getAllResponse, '/views/all'),
  })
}

/**
 * Done's first page only.
 *
 * Q6 is keyset-paginated and 9.5 renders it as infinite scroll, which needs
 * `useInfiniteQuery` and a cursor the client hands back byte for byte (7.10).
 * The first page is what makes the page render, which is what this session
 * owes; the infinite arm is marked provisional in README.md and is the next
 * session's to extend.
 */
export function useDoneView(): UseQueryResult<GetDoneResponse> {
  return useQuery({
    queryKey: queryKeys.view('done'),
    queryFn: () => getView(getDoneResponse, '/views/done'),
  })
}

export function useFolderOpenTasks(id: string): UseQueryResult<GetFolderTasksOpenResponse> {
  return useQuery({
    queryKey: queryKeys.folderTasks(id, 'open'),
    queryFn: () =>
      getView(getFolderTasksOpenResponse, `/folders/${id}/tasks`, { section: 'open' }),
  })
}

export function useFolderCompletedTasks(
  id: string,
  enabled: boolean,
): UseQueryResult<GetFolderTasksCompletedResponse> {
  return useQuery({
    queryKey: queryKeys.folderTasks(id, 'completed'),
    queryFn: () =>
      getView(getFolderTasksCompletedResponse, `/folders/${id}/tasks`, {
        section: 'completed',
      }),
    // Q7 renders the Completed section collapsed, and a collapsed section that
    // fetched anyway would make the collapse cosmetic. AC-058's P8 half reads
    // on the control's expanded state; this is what that state controls.
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
export function useTask(id: string | null): UseQueryResult<TaskDetail> {
  return useQuery({
    queryKey: queryKeys.task(id ?? ''),
    queryFn: () => getPlain(getTaskResponse, `/tasks/${id ?? ''}`),
    enabled: id !== null,
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
