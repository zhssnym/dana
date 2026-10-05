/* The 7.3 roster: one response shape; the GET and DELETE take no body. */
import { z } from 'zod'

import { folderMemberUser } from './folders.js'

/*
GET /connections. The only person shape with an email: the sharing panel
re-shares to it. `email` is non-nullable because the roster excludes deleted
users (7.3), unlike me.ts where it is nullable; a contract test then catches a
query that lost its deleted_at filter. Ordered by display_name, then id.
*/
export const connectionUser = folderMemberUser.extend({
  email: z.string().min(1),
})
export type ConnectionUser = z.infer<typeof connectionUser>

export const connection = z.object({
  user: connectionUser,
  connected_at: z.iso.datetime(),
})
export type Connection = z.infer<typeof connection>

export const getConnectionsResponse = z.array(connection)
export type GetConnectionsResponse = z.infer<typeof getConnectionsResponse>

/* DELETE /connections/:userId: no body, 204 or 404. Either side may call it;
   memberships the pair sponsored are untouched (7.3). */
