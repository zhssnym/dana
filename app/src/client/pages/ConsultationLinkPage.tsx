/*
The two Dana Link addresses of #320: `/app/discussions/:id` and `/app/outcomes/:id`.

Neither is a page of its own. This reads the one row the address names and
replaces itself with its page's address carrying `?discussion=` (and
`&outcome=` for an Outcome, which the Discussion view scrolls to); the page
takes it on to its project's Discussion tab when there is one (step 7).
`replace`, so the back button never bounces off this hop.

A 404 answers with the same not-found copy a task's address does (`PageBody`),
which is also what an inaccessible id gets: the server answers 404 there too.
*/
import { Navigate, useParams } from 'react-router'

import { useOutcome } from '../api/consultation.js'
import { useDiscussion } from '../api/queries.js'
import { PageBody } from '../components/page/PageStates.js'
import { paths } from '../routes.js'

function Opening(): React.JSX.Element {
  return (
    <p role="status" className="py-6 text-sm text-muted-foreground">
      Opening discussion…
    </p>
  )
}

function ToFolder(props: {
  readonly folderId: string
  readonly discussionId: string
  readonly outcomeId: string | null
}): React.JSX.Element {
  const query = new URLSearchParams()
  query.set('discussion', props.discussionId)
  if (props.outcomeId !== null) query.set('outcome', props.outcomeId)
  return <Navigate replace to={`${paths.folder(props.folderId)}?${query.toString()}`} />
}

export function DiscussionLinkPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const read = useDiscussion(id)
  if (read.isPending) return <Opening />
  return (
    <PageBody query={read} isEmpty={false} emptyCopy="">
      {read.data === undefined ? null : (
        <ToFolder folderId={read.data.folder_id} discussionId={read.data.id} outcomeId={null} />
      )}
    </PageBody>
  )
}

export function OutcomeLinkPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const read = useOutcome(id === '' ? null : id)
  if (read.isPending) return <Opening />
  return (
    <PageBody query={read} isEmpty={false} emptyCopy="">
      {read.data === undefined ? null : (
        <ToFolder
          folderId={read.data.discussion.folder_id}
          discussionId={read.data.discussion.id}
          outcomeId={read.data.outcome.id}
        />
      )}
    </PageBody>
  )
}
