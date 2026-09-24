/*
A path 9.1's route table does not name, inside /app or outside it.

Inside /app it renders within the chrome and names itself in the top bar's
trail; outside it there is no chrome. Either way: the one empty-state line and
one way on (Today when signed in, the front page otherwise).
*/
import { Link, useLocation } from 'react-router'

import { useMe } from '../api/queries.js'
import { paths } from '../routes.js'
import { BreadcrumbTrail } from '../components/breadcrumb-trail.js'
import { Button } from '../components/ui/button.js'
import { WindowBarLead } from '../components/window-bar.js'

export function NotFoundPage(): React.JSX.Element {
  const signedIn = useMe().isSuccess
  const inApp = useLocation().pathname.startsWith(`${paths.home}/`)
  return (
    <div className={inApp ? 'flex flex-col items-start gap-3' : 'flex flex-col items-start gap-3 px-4 py-16'}>
      {inApp ? (
        <WindowBarLead>
          <BreadcrumbTrail folderId={null} current="Not found" />
        </WindowBarLead>
      ) : null}
      <h1 className="text-sm font-normal text-muted-foreground">Not found. That page does not exist.</h1>
      <Button render={<Link to={signedIn ? paths.today : paths.landing} />}>
        {signedIn ? 'Go to Today' : 'Go to Dana'}
      </Button>
    </div>
  )
}
