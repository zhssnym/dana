// Shared by the thread components: file paths, author resolution and what this viewer
// may do in a conversation.

/** Same origin, so the browser sends the session cookie. */
export function fileSrc(fileId: string): string {
  return `/api/v1/files/${fileId}`
}

// The server sends only an author id; the page resolves it from members and connections
// it already read.
export type PersonResolver = (authorId: string) => { name: string; image?: string }

/** Per-folder answers from `folderGates(...)`; the per-comment half is authorship. */
export interface ThreadAuthority {
  /** Removing somebody else's comment. */
  readonly moderate: boolean
  /** The standing half of editing and removing one's own. */
  readonly mutateOwnComment: boolean
  readonly likeComment: boolean
  /** Writing into this conversation at all. */
  readonly createComment: boolean
}
