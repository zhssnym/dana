// Which Discussion acts to draw, from the server's own table in
// `shared/folder-actions.ts`. The creator arm is asked separately and used only for
// the creator. None of this is authorization; the route decides.
import { mayPerform } from '../../../shared/folder-actions.js'
import type { FolderAction } from '../../../shared/folder-actions.js'
import type { Discussion } from '../../../shared/consultation.js'
import type { FolderViewerFacts } from '../../lib/folder-authority.js'

export interface ConsultationViewer {
  readonly viewerId: string
  readonly facts: FolderViewerFacts
}

const PROJECTED = 'the-viewer'

function may(
  viewer: ConsultationViewer,
  action: FolderAction,
  asCreator: boolean,
): boolean {
  return mayPerform(
    {
      folderId: '',
      name: '',
      actorId: PROJECTED,
      access: viewer.facts.access,
      isOwner: viewer.facts.isOwner,
      isDefault: viewer.facts.isDefault,
    },
    action,
    asCreator ? { creatorId: PROJECTED } : {},
  ).allowed
}

export function mayStartDiscussion(viewer: ConsultationViewer): boolean {
  return may(viewer, 'discussion.create', false)
}

export function hasFullControlBar(viewer: ConsultationViewer): boolean {
  return may(viewer, 'discussion.purge', false)
}

export interface DiscussionPowers {
  readonly edit: boolean
  readonly resolve: boolean
  readonly reopen: boolean
  readonly trash: boolean
  /** Writing into its conversation at all, before frozen state. */
  readonly comment: boolean
}

export function discussionPowers(
  viewer: ConsultationViewer,
  discussion: Pick<Discussion, 'created_by' | 'state' | 'is_general' | 'trashed_at'>,
  /**
   * Nobody but the creator has commented and it never had an Outcome. Pass false
   * when unknown.
   */
  unshared: boolean,
): DiscussionPowers {
  const mine = discussion.created_by === viewer.viewerId
  const open = discussion.state === 'open' && discussion.trashed_at === null
  const resolved = discussion.state === 'resolved' && discussion.trashed_at === null
  const either = (action: FolderAction): boolean =>
    may(viewer, action, false) || (mine && may(viewer, action, true))
  const generalBar = !discussion.is_general || hasFullControlBar(viewer)
  const trash =
    discussion.trashed_at === null &&
    generalBar &&
    (may(viewer, 'discussion.trash', false) ||
      (mine && unshared && may(viewer, 'discussion.trash.own_unshared', true)))
  return {
    edit: open && either('discussion.edit'),
    resolve: open && generalBar && either('discussion.resolve'),
    reopen: resolved && either('discussion.reopen'),
    trash,
    comment: may(viewer, 'comment.create', false),
  }
}
