/* An unknown path. Inside /app it renders in the chrome; outside it, without. */
import { Link, useLocation } from 'react-router'

import { useMe } from '../api/queries.js'
import { paths } from '../routes.js'
import { Button } from '../components/ui/button.js'

export function NotFoundPage(): React.JSX.Element {
  const signedIn = useMe().isSuccess
  const inApp = useLocation().pathname.startsWith(`${paths.home}/`)
  return (
    <div className={inApp ? 'flex flex-col items-start gap-3 pt-2' : 'flex flex-col items-start gap-3 px-4 py-16'}>
      {/* The shared app chrome owns the location breadcrumb, including this 404. */}
      <h1 className="text-sm font-normal text-muted-foreground">
        {inApp ? 'That page does not exist.' : 'Not found. That page does not exist.'}
      </h1>
      <Button render={<Link to={signedIn ? paths.today : paths.landing} />}>
        {signedIn ? 'Go to Today' : 'Go to Dana'}
      </Button>
    </div>
  )
}
