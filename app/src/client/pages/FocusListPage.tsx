/*
/app/lists/<key>: the address of a Focus list a viewer once added (Important,
Overdue, No date, All open). Those lists are gone (M4): the star stays on a
row, and dated work is on Today and Upcoming. An old link lands on Today.
*/
import { Navigate } from 'react-router'

import { paths } from '../routes.js'

export function FocusListPage(): React.JSX.Element {
  return <Navigate to={paths.today} replace />
}
