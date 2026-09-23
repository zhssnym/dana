/*
The one way out, shared by the account menu and the Settings row.

Two surfaces offer Sign out, 9.1's menu and 9.7's Account section. One function, so the session ends and the
account-preference mirrors leave with it. A shared device must not briefly
paint the previous person's theme, open a task in their preferred surface, or
draw the calendar at the zoom they left it on (the third since issue #140).
Every durable preference that keeps a first-paint mirror is cleared here, and
a new one that is not is a bug nobody sees until two people share a browser.

A full document load rather than a client navigation: the query cache holds
the previous person's rows, and 10.1 destroys their session, so nothing in it
is theirs to keep.
*/
import { mutateApi } from '../api/http.js'
import { clearCalendarZoomMirror } from '../lib/calendar-zoom.js'
import { clearTaskOpenMirror } from '../lib/task-surface-preference.js'
import { clearThemeMirror } from '../lib/theme.js'
import { paths } from '../routes.js'

export function signOut(): void {
  clearCalendarZoomMirror()
  clearTaskOpenMirror()
  clearThemeMirror()
  void mutateApi(null, { method: 'POST', path: '/auth/logout' }).finally(() => {
    window.location.assign(paths.landing)
  })
}
