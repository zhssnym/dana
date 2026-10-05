/* An unknown path. Inside /app it renders in the chrome; outside it, without. */
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
    <div className={inApp ? 'flex flex-col items-start gap-3 pt-2' : 'flex flex-col items-start gap-3 px-4 py-16'}>
      {inApp ? (
        <WindowBarLead>
          <BreadcrumbTrail folderId={null} current="Not found" />
        </WindowBarLead>
      ) : null}
      {/* The trail already says "Not found"; the line says only why. */}
      <h1 className="text-sm font-normal text-muted-foreground">
        {inApp ? 'That page does not exist.' : 'Not found. That page does not exist.'}
      </h1>
      <Button render={<Link to={signedIn ? paths.today : paths.landing} />}>
        {signedIn ? 'Go to Today' : 'Go to Dana'}
      </Button>
    </div>
  )
}
