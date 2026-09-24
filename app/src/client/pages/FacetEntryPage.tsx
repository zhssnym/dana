/*
/app/facets/:id is the stable Dana Link address of a native Purpose or Results facet.
The document itself still lives in the Folder workspace, so this page is only an
entry point: one access-safe location read, then a replace navigation into the
existing FolderPage with the stable facet id selected.

A hidden Purpose follows the same path. FolderPage may focus an explicitly
requested hidden Purpose without changing the shared hidden setting, so this
route never needs a second hide/unhide rule.
*/
import { Navigate, useParams } from 'react-router'

import { useFacetLocation } from '../api/queries.js'
import { PageBody } from '../components/page/PageStates.js'
import { paths } from '../routes.js'

export function FacetEntryPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  const location = useFacetLocation(id)

  return (
    <PageBody query={location} isEmpty={false} emptyCopy="">
      {location.data === undefined ? null : (
        <Navigate
          to={`${paths.folder(location.data.folder_id)}?facet=${encodeURIComponent(id)}`}
          replace
        />
      )}
    </PageBody>
  )
}
