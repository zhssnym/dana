/* An old facet address. Migration 0061 gave each facet's page the facet's id, so this only redirects. */
import { Navigate, useParams } from 'react-router'

import { paths } from '../routes.js'

export function FacetEntryPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>()
  return <Navigate to={paths.folder(encodeURIComponent(id))} replace />
}
