/*
The one way out, shared by the account menu and the Settings row (S27).

Two surfaces offer Sign out, 9.1's menu and 9.7's Account section, and until
S27 each wrote its own call. One function, so the session ends and the two
account-preference mirrors leave with it. A shared device must not briefly
paint the previous person's theme or open a task in their preferred surface.

A full document load rather than a client navigation: the query cache holds
the previous person's rows, and 10.1 destroys their session, so nothing in it
is theirs to keep.
*/
import { mutateApi } from '../api/http.js'
import { clearTaskOpenMirror } from '../lib/task-surface-preference.js'
import { clearThemeMirror } from '../lib/theme.js'
import { paths } from '../routes.js'

export function signOut(): void {
  clearTaskOpenMirror()
  clearThemeMirror()
  void mutateApi(null, { method: 'POST', path: '/auth/logout' }).finally(() => {
    window.location.assign(paths.landing)
  })
}
