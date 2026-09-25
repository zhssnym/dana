/*
A native Result's Dana Link, `/app/results/:id` (#213).

Not a page of its own: a Result is a block of its Folder's Results tab, so
this reads where it lives and replaces itself with the Folder's address,
`?facet=<results>&result=<id>`, which the Result block scrolls to
(`CanvasResult`). `replace`, so back never bounces off this hop. A Result the
viewer cannot open is the same not-found a missing one is.
*/
import { useQuery } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router'

import { getResultLocationResponse } from '../../shared/references.js'
import { getPlain } from '../api/http.js'
import { PageBody } from '../components/page/PageStates.js'
import { paths } from '../routes.js'

export function ResultLinkPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const read = useQuery({
    queryKey: ['results', id],
    queryFn: () => getPlain(getResultLocationResponse, `/results/${encodeURIComponent(id)}`),
    retry: false,
  })
  return (
    <PageBody query={read} isEmpty={false} emptyCopy="">
      {read.data === undefined ? null : (
        <Navigate
          replace
          to={`${paths.folder(read.data.folder_id)}?${new URLSearchParams({ facet: read.data.facet_id, result: read.data.id }).toString()}`}
        />
      )}
    </PageBody>
  )
}
