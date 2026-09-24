/*
A path 9.1's route table does not name, inside /app or outside it.

Inside /app it renders within the chrome, so the shell survives; outside it
there is no sidebar to point at. Either way the page says the one thing it
knows and offers one way on: Today for a signed-in person, the front page for
anyone else. Whether there is a session is the `/me` read `main.tsx` already
prefetches, so the answer costs no request.
*/
import { Link } from 'react-router'

import { useMe } from '../api/queries.js'
import { paths } from '../routes.js'

export function NotFoundPage(): React.JSX.Element {
  const signedIn = useMe().isSuccess
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <h1 className="text-base font-semibold text-foreground">Not found</h1>
      <p className="text-sm text-muted-foreground">That page does not exist.</p>
      <Link
        to={signedIn ? paths.today : paths.landing}
        className="mt-2 rounded-md text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        {signedIn ? 'Go to Today' : 'Go to Dana'}
      </Link>
    </div>
  )
}
