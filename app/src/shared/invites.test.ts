import { describe, expect, test } from 'vitest'

import {
  acceptInviteResponse,
  cancelInviteResponse,
  declineInviteResponse,
  emailAddress,
  getInvitesPendingResponse,
  getInvitesSentResponse,
  invite,
  inviteStatus,
  pendingInvite,
  postInvitesBody,
  postInvitesConversionResponse,
  postInvitesResponse,
  resendInviteResponse,
} from './invites.js'

const ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const THIRD_ID = '33333333-3333-4333-8333-333333333333'
const WHEN = '2026-08-09T10:00:00.000Z'

/** The settled 7.5 element, in its folder-invite form. */
const INVITE = {
  id: ID,
  email: 'someone@example.test',
  folder_id: OTHER_ID,
  folder_name: 'Shared',
  task_id: null,
  status: 'pending',
  created_at: WHEN,
  last_sent_at: WHEN,
  responded_at: null,
}

/** The 7.0 Folder object, the settled acceptance response's folder. */
const FOLDER = {
  id: OTHER_ID,
  name: 'Shared',
  is_default: false,
  is_owner: false,
  member_count: 2,
  counts: { pending: 1, completed: 0 },
  my_shelf: null,
  my_label: null,
  my_color: null,
  personal_labels: [],
  icon: null,
  color: null,
  cover_file_id: null,
  cover_preset: null,
  cover_focal_y: 50,
  description: null,
}

/** The 7.4 member element, the settled conversion response's membership. */
const MEMBERSHIP = {
  user: { id: THIRD_ID, display_name: 'Ada', avatar_url: null },
  role: 'member',
  // Issue #228: every member element carries its current Access preset. The
  // instant share grants the preset the invite named (R9 section 5).
  access: 'can_edit',
  joined_at: WHEN,
  is_owner: false,
}

// 320 characters exactly, the 10.3 ceiling, with a domain the format accepts.
const AT_LIMIT = `${'a'.repeat(314)}@e.com`
const OVER_LIMIT = `${'a'.repeat(315)}@e.com`

describe('emailAddress (10.3: up to 320, syntactically valid, lowercased)', () => {
  test('lowercases the address it parses, local part and domain alike', () => {
    const result = emailAddress.safeParse('Foo.Bar@Example.COM')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe('foo.bar@example.com')
  })

  test('accepts the 320 boundary and refuses one past it', () => {
    expect(AT_LIMIT.length, 'the fixture is the boundary itself').toBe(320)
    expect(emailAddress.safeParse(AT_LIMIT).success, 'at 320').toBe(true)
    expect(emailAddress.safeParse(OVER_LIMIT).success, 'at 321').toBe(false)
  })

  test('refuses syntactically invalid addresses', () => {
    for (const value of [
      'not-an-address',
      'no-domain@',
      '@no-local.test',
      'spaced address@example.test',
      'trailing@example.test ',
      '',
    ]) {
      expect(
        emailAddress.safeParse(value).success,
        `${JSON.stringify(value)} is not an address`,
      ).toBe(false)
    }
  })

  test('refuses every non-string', () => {
    for (const value of [123, true, null, undefined, ['a@b.test'], {}]) {
      expect(
        emailAddress.safeParse(value).success,
        `${JSON.stringify(value)} is not a string`,
      ).toBe(false)
    }
  })
})

describe('postInvitesBody (7.5: { email, folder_id optional, task_id optional, access with a folder })', () => {
  test('accepts the three shapes 7.5 admits: bare, folder, folder plus task', () => {
    expect(postInvitesBody.safeParse({ email: 'a@b.test' }).success).toBe(true)
    expect(
      postInvitesBody.safeParse({
        email: 'a@b.test',
        folder_id: ID,
        access: 'can_edit',
      }).success,
    ).toBe(true)
    expect(
      postInvitesBody.safeParse({
        email: 'a@b.test',
        folder_id: ID,
        task_id: OTHER_ID,
        access: 'assigned_work',
      }).success,
    ).toBe(true)
  })

  /*
  Issue #228, R9 section 5: a pending folder invite persists the preset it
  will grant, so `access` is required exactly when `folder_id` is -- and
  refused without one, because a bare roster invite grants no Folder Access
  and a preset on it would be a value nothing could ever read. The table's
  `invites_access_requires_folder_check` says the same thing one layer down,
  and AC-480 drives it there.
  */
  test('binds access to folder_id in both directions', () => {
    expect(
      postInvitesBody.safeParse({ email: 'a@b.test', folder_id: ID }).success,
      'a folder invite with no intended Access',
    ).toBe(false)
    expect(
      postInvitesBody.safeParse({ email: 'a@b.test', access: 'can_edit' })
        .success,
      'and a preset on an invite that names no folder',
    ).toBe(false)
    expect(
      postInvitesBody.safeParse({
        email: 'a@b.test',
        folder_id: ID,
        access: 'manager',
      }).success,
      'and R8A forbids a seventh preset',
    ).toBe(false)
  })

  test('lowercases the email through the body, so V-INV compares one value', () => {
    const result = postInvitesBody.safeParse({ email: 'Someone@Example.TEST' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe('someone@example.test')
  })

  test('refuses task_id without folder_id, naming task_id (4.9, AC-065)', () => {
    const result = postInvitesBody.safeParse({
      email: 'a@b.test',
      task_id: OTHER_ID,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['task_id'])
    }
  })

  test('refuses an explicit null for either id: absent and null differ', () => {
    expect(
      postInvitesBody.safeParse({ email: 'a@b.test', folder_id: null }).success,
      'a nulled folder_id is not a bare invite',
    ).toBe(false)
    expect(
      postInvitesBody.safeParse({
        email: 'a@b.test',
        folder_id: ID,
        task_id: null,
      }).success,
      'a nulled task_id is not an absent one',
    ).toBe(false)
  })

  test('refuses ids that are not uuids, and the absent email', () => {
    expect(
      postInvitesBody.safeParse({ email: 'a@b.test', folder_id: 'nope' })
        .success,
    ).toBe(false)
    expect(postInvitesBody.safeParse({}).success, 'email is required').toBe(
      false,
    )
  })

  test('names the failing field in its issue path (10.3)', () => {
    const result = postInvitesBody.safeParse({ email: 'nope' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['email'])
    }
  })

  test('strips unknown fields rather than refusing them (7.0)', () => {
    const result = postInvitesBody.safeParse({
      email: 'a@b.test',
      role: 'owner',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ email: 'a@b.test' })
  })
})

describe('the 7.5 response shapes', () => {
  test('inviteStatus is 4.9\'s vocabulary and nothing else', () => {
    for (const status of [
      'pending',
      'accepted',
      'declined',
      'canceled',
      'invalidated',
    ]) {
      expect(inviteStatus.safeParse(status).success, status).toBe(true)
    }
    expect(inviteStatus.safeParse('cancelled').success, 'the other spelling')
      .toBe(false)
    expect(inviteStatus.safeParse('expired').success, 'no such state').toBe(
      false,
    )
  })

  test('the settled element parses, and a bare invite nulls both folder fields', () => {
    expect(invite.safeParse(INVITE).success, 'the folder invite').toBe(true)
    expect(
      invite.safeParse({ ...INVITE, folder_id: null, folder_name: null })
        .success,
      'the bare invite, which has no folder to name',
    ).toBe(true)
    expect(
      invite.safeParse({
        ...INVITE,
        status: 'declined',
        responded_at: WHEN,
      }).success,
      'a terminal invite, which is what "any status" admits to the sent list',
    ).toBe(true)
  })

  test('the settled element refuses what 4.9 cannot store', () => {
    for (const [patch, why] of [
      [{ id: 'not-a-uuid' }, 'the id is a uuid'],
      [{ status: 'expired' }, 'status is 4.9\'s vocabulary'],
      [{ created_at: null }, 'created_at is NOT NULL'],
      [{ last_sent_at: null }, 'last_sent_at is NOT NULL, moved by resend'],
      [{ email: null }, 'an invite is addressed to an address'],
    ] as const) {
      expect(
        invite.safeParse({ ...INVITE, ...patch }).success,
        why,
      ).toBe(false)
    }
  })

  test('201 { invite } and the sent list carry that one settled object', () => {
    expect(postInvitesResponse.safeParse({ invite: INVITE }).success).toBe(true)
    expect(
      postInvitesResponse.safeParse({ invite: { id: ID } }).success,
      'the floor is gone: a lone id is no longer the whole element',
    ).toBe(false)
    expect(
      getInvitesSentResponse.safeParse([INVITE]).success,
      'the sent list is the bare array of that same element',
    ).toBe(true)
  })

  test('decline, cancel and resend answer the 201\'s wrapper', () => {
    for (const [schema, name] of [
      [declineInviteResponse, 'decline'],
      [cancelInviteResponse, 'cancel'],
      [resendInviteResponse, 'resend'],
    ] as const) {
      expect(
        schema.safeParse({ invite: { ...INVITE, status: 'declined', responded_at: WHEN } })
          .success,
        `${name} answers { invite }`,
      ).toBe(true)
      expect(
        schema.safeParse({ id: ID }).success,
        `${name} wraps the invite rather than answering it bare`,
      ).toBe(false)
    }
  })

  test('the conversion answers converted_to_share true and the 7.4 membership', () => {
    expect(
      postInvitesConversionResponse.safeParse({
        converted_to_share: true,
        membership: MEMBERSHIP,
      }).success,
    ).toBe(true)
    expect(
      postInvitesConversionResponse.safeParse({
        converted_to_share: false,
        membership: MEMBERSHIP,
      }).success,
      'false would report the 201 case, which has its own status',
    ).toBe(false)
    expect(
      postInvitesConversionResponse.safeParse({ converted_to_share: true })
        .success,
      'the membership is the effect 7.5 promises, so the key is required',
    ).toBe(false)
    expect(
      postInvitesConversionResponse.safeParse({
        converted_to_share: true,
        membership: { ...MEMBERSHIP, role: 'owner' },
      }).success,
      '4.4 admits only member in v1; ownership is the folder column (8.9)',
    ).toBe(false)
  })

  test('the pending element is frozen 7.5\'s, folder_name null for a bare invite', () => {
    const bare = {
      id: ID,
      inviter: { display_name: 'Ada', avatar_url: null },
      folder_name: null,
      created_at: '2026-08-09T10:00:00.000Z',
    }
    expect(pendingInvite.safeParse(bare).success, 'the bare invite').toBe(true)
    expect(
      pendingInvite.safeParse({ ...bare, folder_name: 'Shared' }).success,
      'the folder invite',
    ).toBe(true)
    expect(
      getInvitesPendingResponse.safeParse([bare]).success,
      'the list is the bare array 7.5 writes',
    ).toBe(true)
  })

  test('the pending element\'s inviter carries the two keys 7.5 gives it', () => {
    const result = pendingInvite.safeParse({
      id: ID,
      inviter: { display_name: null, avatar_url: null, id: OTHER_ID },
      folder_name: null,
      created_at: '2026-08-09T10:00:00.000Z',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(
        result.data.inviter,
        'a recipient has no claim on the inviter\'s id, so the shape does not carry it',
      ).toEqual({ display_name: null, avatar_url: null })
    }
  })

  test('the acceptance body admits both nulls and refuses a non-boolean flag', () => {
    expect(
      acceptInviteResponse.safeParse({
        connection_created: true,
        folder: null,
        assigned_task_id: null,
      }).success,
      'the bare acceptance',
    ).toBe(true)
    expect(
      acceptInviteResponse.safeParse({
        connection_created: false,
        folder: FOLDER,
        assigned_task_id: OTHER_ID,
      }).success,
      'the folder acceptance that assigned a task',
    ).toBe(true)
    expect(
      acceptInviteResponse.safeParse({
        connection_created: null,
        folder: null,
        assigned_task_id: null,
      }).success,
      'connection_created reports a fact, never an absence',
    ).toBe(false)
  })

  test('the acceptance folder is the settled 7.0 Folder, not 7.10\'s stub', () => {
    expect(
      acceptInviteResponse.safeParse({
        connection_created: true,
        folder: { id: OTHER_ID, name: 'Shared', is_default: false },
        assigned_task_id: null,
      }).success,
      'the {id, name, is_default} stub the owner ruled for 7.10 is not this shape',
    ).toBe(false)
    for (const key of [
      'is_owner',
      'member_count',
      'counts',
      'my_shelf',
      'my_color',
    ] as const) {
      const partial: Record<string, unknown> = { ...FOLDER }
      delete partial[key]
      expect(
        acceptInviteResponse.safeParse({
          connection_created: true,
          folder: partial,
          assigned_task_id: null,
        }).success,
        `${key} is one of the five a client acquiring a folder cannot learn elsewhere here`,
      ).toBe(false)
    }
  })
})
