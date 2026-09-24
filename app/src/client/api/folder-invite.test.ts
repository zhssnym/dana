/*
Regression: the Share panel's "Invite by email" once sent a folder_id with no
access, which the shared schema (and the server) refuse, so every folder
invite failed with "Nothing was saved."
*/
import { describe, expect, test } from 'vitest'

import { postInvitesBody } from '../../shared/invites.js'
import { folderInviteBody } from './folder-invite.js'

describe('folderInviteBody', () => {
  test('a folder invite parses, carrying Can edit by default', () => {
    const body = folderInviteBody('a@example.com', '00000000-0000-4000-8000-000000000001')
    expect(postInvitesBody.parse(body).access).toBe('can_edit')
  })
})
