/*
The Label reads and writes (#208), over the twelve routes #226, #227 and #274
put on the server. A request and a shape each, like `mutations.ts`: the query
client invalidates on every success and raises the toasts.
*/
import { useMutation, useQuery } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import {
  getLabelsResponse,
  patchLabelResponse,
  postLabelResponse,
} from '../../shared/labels.js'
import type {
  GetLabelsResponse,
  LabelDefinition,
  LabelScope,
} from '../../shared/labels.js'
import { getTaskResponse } from '../../shared/tasks.js'
import type { TaskDetail } from '../../shared/tasks.js'

import { getPlain, mutateApi } from './http.js'
import { queryKeys } from './keys.js'

/**
 * The viewer's Personal Labels and, where a page is named, that page's Labels.
 * `all` includes archived ones, which only the edit dialog asks for.
 */
export function useLabels(
  folderId: string | null,
  state: 'active' | 'all' = 'active',
): UseQueryResult<GetLabelsResponse> {
  return useQuery({
    queryKey: queryKeys.labels(folderId, state),
    queryFn: () =>
      getPlain(getLabelsResponse, '/labels', {
        state,
        /* No page: the Personal half alone, never every page's vocabulary. */
        scope: folderId === null ? 'personal' : 'all',
        ...(folderId === null ? {} : { folder_id: folderId }),
      }),
  })
}

function definitionPath(label: { scope: LabelScope; id: string; folder_id: string | null }): string {
  return label.scope === 'personal'
    ? `/labels/personal/${label.id}`
    : `/folders/${label.folder_id ?? ''}/labels/${label.id}`
}

export interface CreateLabelVariables {
  /** Null makes a Personal Label; a page id makes one of that page's. */
  readonly folderId: string | null
  readonly name: string
  readonly color: string
}

export function useCreateLabel(): UseMutationResult<LabelDefinition, Error, CreateLabelVariables> {
  return useMutation({
    mutationFn: ({ folderId, name, color }: CreateLabelVariables) =>
      mutateApi(postLabelResponse, {
        method: 'POST',
        path: folderId === null ? '/labels/personal' : `/folders/${folderId}/labels`,
        body: { name, color },
      }),
  })
}

export interface PatchLabelVariables {
  readonly label: LabelDefinition
  readonly fields: { readonly name?: string; readonly color?: string }
}

export function usePatchLabel(): UseMutationResult<LabelDefinition, Error, PatchLabelVariables> {
  return useMutation({
    mutationFn: ({ label, fields }: PatchLabelVariables) =>
      mutateApi(patchLabelResponse, { method: 'PATCH', path: definitionPath(label), body: fields }),
  })
}

export interface ArchiveLabelVariables {
  readonly label: LabelDefinition
  readonly archived: boolean
}

export function useArchiveLabel(): UseMutationResult<LabelDefinition, Error, ArchiveLabelVariables> {
  return useMutation({
    mutationFn: ({ label, archived }: ArchiveLabelVariables) =>
      mutateApi(patchLabelResponse, {
        method: 'POST',
        path: `${definitionPath(label)}/${archived ? 'archive' : 'restore'}`,
      }),
  })
}

export interface TaskLabelVariables {
  readonly taskId: string
  readonly labelId: string
  readonly on: boolean
}

export function useSetTaskLabel(): UseMutationResult<TaskDetail, Error, TaskLabelVariables> {
  return useMutation({
    mutationFn: ({ taskId, labelId, on }: TaskLabelVariables) =>
      mutateApi(getTaskResponse, {
        method: on ? 'PUT' : 'DELETE',
        path: `/tasks/${taskId}/labels/${labelId}`,
      }),
  })
}

/**
 * Gives a task just made under a Label filter that label, so it does not
 * vanish the moment it is made. Only a label still active in `folderId`'s
 * scope (the viewer's own, and that page's) is put on: the filter can still
 * name one archived since, which the server would refuse with a toast about a
 * label nobody chose in this act.
 */
export function useWearFilterLabel(folderId: string | null): (taskId: string, labelId: string | null) => void {
  const labels = useLabels(folderId)
  const set = useSetTaskLabel()
  return (taskId, labelId) => {
    if (labelId === null) return
    if (!(labels.data?.rows ?? []).some((label) => label.id === labelId && !label.archived)) return
    set.mutate({ taskId, labelId, on: true })
  }
}
