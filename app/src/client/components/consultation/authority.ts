/*
Which Consultation acts to draw for this viewer (#212, #320), from the
server's own table (`shared/folder-actions.ts`) and never a second copy of it
— `lib/folder-authority.ts`'s rule, whose header carries the argument.

The `discussion.*` rules have a creator arm (`whenCreatorAtLeast`), which is
authorship: a per-row fact the page does know (`created_by`), and like a
comment's author it is provenance and not standing authority. So each act is
asked twice — "as anybody" and "as this Discussion's creator" — and the second
answer is used only when the viewer *is* the creator. `mayDraw` narrows its
target to `authorId` on purpose (see its header), so this file asks
`mayPerform` directly, with the same projected actor, rather than widen it.

Two refusals are row state rather than preset and are drawn here too, because
the page holds the facts: a resolved Discussion is not edited or resolved, an
open one is not reopened. **The General discussion's** resolve and trash also
need Full control (`discussion.purge`'s bar) on top, 7.28's interim rule.
The own-unshared trash path needs "nobody else has contributed", which the
caller computes from the thread and Outcome history it has read; what it
cannot see (a structured-input response) the server refuses with a sentence.

None of this is authorization. The route decides under the row lock.
*/
import { mayPerform } from '../../../shared/folder-actions.js'
import type { FolderAction } from '../../../shared/folder-actions.js'
import type { Discussion } from '../../../shared/consultation.js'
import type { FolderViewerFacts } from '../../lib/folder-authority.js'

/** Everything the Consultation surfaces need to know about the viewer. */
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

/** Starting a Discussion: Can comment and above. */
export function mayStartDiscussion(viewer: ConsultationViewer): boolean {
  return may(viewer, 'discussion.create', false)
}

/** Permanently deleting a trashed Discussion, and the General discussion's extra bar. */
export function hasFullControlBar(viewer: ConsultationViewer): boolean {
  return may(viewer, 'discussion.purge', false)
}

export interface DiscussionPowers {
  readonly edit: boolean
  readonly resolve: boolean
  readonly reopen: boolean
  readonly trash: boolean
  /** Writing into its conversation at all (Can comment), before frozen state. */
  readonly comment: boolean
  /** Asking for structured input (#321), `InputRoundsPanel`'s `canOpen`. */
  readonly openRound: boolean
}

export function discussionPowers(
  viewer: ConsultationViewer,
  discussion: Pick<Discussion, 'created_by' | 'state' | 'is_general' | 'trashed_at'>,
  /** Nobody but the creator has commented and it has never had an Outcome.
   * Pass false when unknown; the creator's trash then waits for Can edit. */
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
    openRound: open && either('input_round.open'),
  }
}
