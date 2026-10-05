// Who a comment's author is on the folder page, off the roster and connections.
import { useCallback, useMemo } from 'react'

import type { PersonResolver } from '../../lib/thread.js'
import type { GetConnectionsResponse } from '../../../shared/connections.js'
import type { FolderMember } from '../../../shared/folders.js'

export function useAuthorPeople(
  members: readonly FolderMember[],
  connections: GetConnectionsResponse | undefined,
): PersonResolver {
  /**
   * Who a comment's author is, off the members already read; a face the roster
   * cannot resolve says "Someone" rather than leaking an id.
   *
   * The picture rides with the name. 7.14 carries an author's id alone, so this
   * directory is the only route an avatar has onto the thread, and both reads
   * behind it — 7.4's members and 7.3's connections — carry `avatar_url`.
   */
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

  /*
  Who a comment's author is, for the lifted thread, and stable so the mapping
  memoises. A face the roster cannot resolve says "Someone" rather than leaking
  an id, which is the rule the history sheet and the bell both keep.
  */
  const personOf = useCallback(
    (authorId: string) => authorPeople.get(authorId) ?? { name: 'Someone' },
    [authorPeople],
  )
  return personOf
}
