// The redirect for an old `?facet=` address on the folder page.
import { Navigate, useLocation, useSearchParams } from 'react-router'

import { useAllPages } from '../../api/queries.js'
import { paths } from '../../routes.js'

/* Where an old `?facet=` address goes: the tab's own page when the viewer has
   one by that id, otherwise this page without the parameter (Work had no
   address of its own, and a Work facet over a heading became no page). */
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
