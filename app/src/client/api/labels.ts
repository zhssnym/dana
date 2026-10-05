/* Label reads and writes. The query client invalidates on success and raises the toasts. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

/** `all` includes archived labels, which only the edit dialog asks for. */
export function useLabels(
  folderId: string | null,
  state: 'active' | 'all' = 'active',
  enabled = true,
): UseQueryResult<GetLabelsResponse> {
  return useQuery({
    queryKey: queryKeys.labels(folderId, state),
    enabled,
    queryFn: () =>
      getPlain(getLabelsResponse, '/labels', {
        state,
        /* No page: only Personal labels, never every page's. */
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
 * Puts the active filter label on a task just made, so the task does not vanish from the filtered list. Only a
 * label still active in scope: the filter can name one archived since.
 */
export function useWearFilterLabel(folderId: string | null): (taskId: string, labelId: string | null) => void {
  const client = useQueryClient()
  const set = useSetTaskLabel()
  return (taskId, labelId) => {
    if (labelId === null) return
    void client.fetchQuery({
      queryKey: queryKeys.labels(folderId, 'active'),
      queryFn: () => getPlain(getLabelsResponse, '/labels', {
        state: 'active', scope: folderId === null ? 'personal' : 'all',
        ...(folderId === null ? {} : { folder_id: folderId }),
      }),
    }).then((labels) => {
      if (labels.rows.some((label) => label.id === labelId && !label.archived)) {
        set.mutate({ taskId, labelId, on: true })
      }
    }).catch(() => { /* The query cache reports the read failure. */ })
  }
}
