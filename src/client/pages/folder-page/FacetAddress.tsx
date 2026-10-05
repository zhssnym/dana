import { Navigate, useLocation, useSearchParams } from 'react-router'

import { useAllPages } from '../../api/queries.js'
import { paths } from '../../routes.js'

/* An old `?facet=` address goes to the tab with that id, if the viewer has one,
   or else to this page without the parameter. */
export function FacetAddress({ facetId }: { readonly facetId: string }): React.JSX.Element | null {
  const pages = useAllPages()
  const { pathname } = useLocation()
  const [search] = useSearchParams()
  if (pages.data === undefined && !pages.isError) return null
  const rest = new URLSearchParams(search)
  rest.delete('facet')
  const query = rest.size === 0 ? '' : `?${rest.toString()}`
  const found = pages.data?.some((page) => page.id === facetId) === true
  return <Navigate replace to={`${found ? paths.folder(facetId) : pathname}${query}`} />
}
