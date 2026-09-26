/*
What a Discussion's posts share across the thread components: where a post's
file is served, who wrote a post, and what this viewer's Access lets a
conversation offer.
*/

/** 7.15's serving path, which the browser sends the session cookie for, this
 *  being one origin (11.1). */
export function fileSrc(fileId: string): string {
  return `/api/v1/files/${fileId}`
}

/*
Who wrote a comment, as the thread's `Face` takes them.

7.14 carries an author's id and nothing else, so the resolver *is* the only
route a picture has onto this surface. The page resolves the id against the
members and connections it has already read, both of which carry
`avatar_url`, so nothing new is fetched to draw a photograph here.
*/
export type PersonResolver = (authorId: string) => { name: string; image?: string }

/**
 * What this viewer's Access lets a conversation offer, per folder. Every
 * answer is `folderGates(...)`'s, which is `shared/folder-actions.ts`'s, the
 * table the 7.14 routes resolve against. The per-comment half is authorship.
 */
export interface ThreadAuthority {
  /** `comment.moderate`: removing somebody **else's** comment. */
  readonly moderate: boolean
  /** `comment.mutate.own`'s standing half: editing and removing one's own. */
  readonly mutateOwnComment: boolean
  /** `comment.like`. */
  readonly likeComment: boolean
  /** `comment.create`: writing into this conversation at all. */
  readonly createComment: boolean
}
