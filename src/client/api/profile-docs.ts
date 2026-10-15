import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { getContributionActivityResponse } from '../../shared/contribution-activity.js'
import { folder } from '../../shared/folders.js'
import {
  getProfileDocsResponse, getProfileDocSharingResponse, migrateProfileDocsResponse, postProfileDocResponse,
} from '../../shared/profile-docs.js'
import type { ProfileDocAudience, ProfileDocGrant, ProfileDocRoot } from '../../shared/profile-docs.js'
import { getPlain, mutateApi } from './http.js'
import { queryKeys } from './keys.js'

const pathOf = (folderId: string, userId: string) =>
  `/folders/${folderId}/members/${userId}/profile-docs`

export function useProfileDocs(folderId: string, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.profileDocs(folderId, userId),
    enabled,
    queryFn: () => getPlain(getProfileDocsResponse, pathOf(folderId, userId)),
  })
}

export function useContributionActivity(folderId: string, userId: string) {
  return useQuery({
    queryKey: ['contribution-activity', folderId, userId],
    queryFn: () => getPlain(getContributionActivityResponse,
      `/folders/${folderId}/members/${userId}/contribution-activity`),
  })
}

export function useProfilePages(rootId: string | null) {
  return useQuery({
    queryKey: queryKeys.profilePages(rootId ?? ''),
    enabled: rootId !== null,
    queryFn: () => getPlain(z.object({ pages: z.array(folder) }), `/folders/${rootId}/profile-pages`),
  })
}

export function useMigrateProfileDocs(folderId: string, userId: string) {
  return useMutation({
    mutationFn: () => mutateApi(migrateProfileDocsResponse, {
      method: 'POST', path: `${pathOf(folderId, userId)}/migrate`, body: {},
    }),
  })
}

export function useCreateProfileDoc(folderId: string, userId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: ({ name, custody }: { name: string; custody: ProfileDocRoot['custody'] }) =>
      mutateApi(postProfileDocResponse, {
        method: 'POST', path: pathOf(folderId, userId), body: { name, custody },
      }),
    onSuccess: () => cache.invalidateQueries({ queryKey: queryKeys.profileDocs(folderId, userId) }),
  })
}

export function useMoveProfileDoc(folderId: string, userId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: ({ rootId, beforeId, afterId }: {
      rootId: string; beforeId: string | null; afterId: string | null
    }) => mutateApi(null, {
      method: 'PATCH', path: `${pathOf(folderId, userId)}/${rootId}/position`,
      body: { before_id: beforeId, after_id: afterId },
    }),
    onSuccess: () => cache.invalidateQueries({ queryKey: queryKeys.profileDocs(folderId, userId) }),
  })
}

export function useProfileDocSharing(folderId: string, userId: string, rootId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['profile-doc-sharing', rootId], enabled: enabled && rootId !== null,
    queryFn: () => getPlain(getProfileDocSharingResponse, `${pathOf(folderId, userId)}/${rootId}/sharing`),
  })
}

export function useChangeProfileDocAudience(folderId: string, userId: string, rootId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: (body: { audience: ProfileDocAudience; grants: ProfileDocGrant[] }) =>
      mutateApi(null, { method: 'PATCH', path: `${pathOf(folderId, userId)}/${rootId}/audience`, body }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: queryKeys.profileDocs(folderId, userId) }),
        cache.invalidateQueries({ queryKey: ['profile-doc-sharing', rootId] }),
      ])
    },
  })
}
