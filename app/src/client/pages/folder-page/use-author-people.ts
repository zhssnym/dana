import { useCallback, useMemo } from 'react'

import type { PersonResolver } from '../../lib/thread.js'
import type { GetConnectionsResponse } from '../../../shared/connections.js'
import type { FolderMember } from '../../../shared/folders.js'

export function useAuthorPeople(
  members: readonly FolderMember[],
  connections: GetConnectionsResponse | undefined,
): PersonResolver {
  /* Threads carry only an author's id, so this is the only way an avatar reaches them. */
  const authorPeople = useMemo(() => {
    const people = new Map<string, { name: string; image?: string }>()
    for (const member of members) {
      const name = member.user.display_name
      if (name === null) continue
      const image = member.user.avatar_url
      people.set(member.user.id, { name, ...(image === null ? {} : { image }) })
    }
    for (const connection of connections ?? []) {
      const name = connection.user.display_name
      if (name === null || people.has(connection.user.id)) continue
      const image = connection.user.avatar_url
      people.set(connection.user.id, { name, ...(image === null ? {} : { image }) })
    }
    return people
  }, [members, connections])

  /* Stable so the mapping memoises. An unknown author is "Someone", never an id. */
  const personOf = useCallback(
    (authorId: string) => authorPeople.get(authorId) ?? { name: 'Someone' },
    [authorPeople],
  )
  return personOf
}
