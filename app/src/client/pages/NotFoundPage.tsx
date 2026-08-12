/*
A path under /app that 9.1's route table does not name.

It renders inside the chrome rather than replacing it, which is the same rule
the 404 of an inaccessible folder follows: the shell survives, so the person
can navigate away from a page they cannot see.
*/

import { Compass } from 'lucide-react'

export function NotFoundPage(): React.JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-state-media">
        <Compass aria-hidden="true" />
      </span>
      <h1 className="page-title">Not found</h1>
      <p className="empty-state-text">
        That page does not exist. Everything Dana has is in the sidebar.
      </p>
    </div>
  )
}
