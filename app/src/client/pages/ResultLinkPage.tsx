/* `/app/results/:id`: find the Result's page and replace with its address plus `?result=<id>`. */
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
          to={`${paths.folder(read.data.folder_id)}?${new URLSearchParams({ result: read.data.id }).toString()}`}
        />
      )}
    </PageBody>
  )
}
