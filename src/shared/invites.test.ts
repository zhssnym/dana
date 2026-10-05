import { describe, expect, it } from 'vitest'

import {
  declineInviteResponse,
  postInvitesResponse,
} from './invites.js'

const instantShare = {
  converted_to_share: true as const,
  membership: {
    user: {
      id: '00000000-0000-4000-8000-000000000002',
      display_name: 'Member',
      avatar_url: null,
    },
    role: 'member' as const,
    access: 'can_edit' as const,
    joined_at: '2026-10-04T03:00:00.000Z',
    is_owner: false,
  },
}

describe('POST /invites response', () => {
  it('accepts the instant-share response as a successful create response', () => {
    expect(postInvitesResponse.parse(instantShare)).toEqual(instantShare)
  })

  it('does not widen invite transition responses to the conversion shape', () => {
    expect(declineInviteResponse.safeParse(instantShare).success).toBe(false)
  })
})
