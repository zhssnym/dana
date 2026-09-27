/*
/app/facets/:id, the Dana Link address of a Purpose or Results tab from
before step 7. Migration 0061 made each such facet a page with the facet's
own id, so the address is that page's: one replace, no server read. A page
the viewer cannot open answers there as any other does.
*/
import { Navigate, useParams } from 'react-router'

import { paths } from '../routes.js'

export function FacetEntryPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  return <Navigate to={paths.folder(encodeURIComponent(id))} replace />
}
