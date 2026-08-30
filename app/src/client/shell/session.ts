/*
The one way out, shared by the account menu and the Settings row (S27).

Two surfaces offer Sign out, 9.1's menu and 9.7's Account section, and until
S27 each wrote its own call. One function, so the two things that have to
happen at a sign-out happen at both: 10.1's session ends, and the theme mirror
RFC 0005 change control item 43 keeps in the browser leaves with the person,
so a shared device does not paint the previous person's theme.

A full document load rather than a client navigation: the query cache holds
the previous person's rows, and 10.1 destroys their session, so nothing in it
is theirs to keep.
*/
import { mutateApi } from '../api/http.js'
import { clearThemeMirror } from '../lib/theme.js'
import { paths } from '../routes.js'

export function signOut(): void {
  clearThemeMirror()
  void mutateApi(null, { method: 'POST', path: '/auth/logout' }).finally(() => {
    window.location.assign(paths.landing)
  })
}
