/*
 * Sign out. Clears every first-paint preference mirror so a shared device does not show the last person's
 * settings. A new mirror must be cleared here too. A full document load drops the cached rows.
 */
import { mutateApi } from '../api/http.js'
import { queryClient } from '../api/queryClient.js'
import { clearCalendarZoomMirror } from '../lib/calendar-zoom.js'
import { clearTaskOpenMirror } from '../lib/task-surface-preference.js'
import { clearThemeMirror } from '../lib/theme.js'
import { paths } from '../routes.js'

export function signOut(): void {
  clearCalendarZoomMirror()
  clearTaskOpenMirror()
  clearThemeMirror()
  void mutateApi(null, { method: 'POST', path: '/auth/logout' }).finally(() => {
    /* The session is gone: nothing may refetch while the document unloads. */
    const client = queryClient()
    if (client !== undefined) {
      void client.cancelQueries()
      client.clear()
      client.unmount()
    }
    window.location.assign(paths.landing)
  })
}
