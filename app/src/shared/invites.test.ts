import { describe, expect, test } from 'vitest'

import {
  acceptInviteResponse,
  acceptedFolder,
  createdInvite,
  emailAddress,
  getInvitesPendingResponse,
  inviteStatus,
  pendingInvite,
  postInvitesBody,
  postInvitesConversionResponse,
  postInvitesResponse,
} from './invites.js'

const ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

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

describe('postInvitesBody (7.5: { email, folder_id optional, task_id optional })', () => {
  test('accepts the three shapes 7.5 admits: bare, folder, folder plus task', () => {
    expect(postInvitesBody.safeParse({ email: 'a@b.test' }).success).toBe(true)
    expect(
      postInvitesBody.safeParse({ email: 'a@b.test', folder_id: ID }).success,
    ).toBe(true)
    expect(
      postInvitesBody.safeParse({
        email: 'a@b.test',
        folder_id: ID,
        task_id: OTHER_ID,
      }).success,
    ).toBe(true)
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

  test('201 { invite } carries an id and keeps the fields the review adds', () => {
    const result = postInvitesResponse.safeParse({
      invite: { id: ID, email: 'a@b.test', status: 'pending' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(
        result.data.invite.status,
        'the loose floor passes unsettled fields through rather than stripping them',
      ).toBe('pending')
    }
    expect(
      postInvitesResponse.safeParse({ invite: {} }).success,
      'the id is the floor',
    ).toBe(false)
    expect(
      createdInvite.safeParse({ id: 'not-a-uuid' }).success,
      'and it is a uuid',
    ).toBe(false)
  })

  test('the conversion answer fixes converted_to_share true', () => {
    expect(
      postInvitesConversionResponse.safeParse({ converted_to_share: true })
        .success,
    ).toBe(true)
    expect(
      postInvitesConversionResponse.safeParse({ converted_to_share: false })
        .success,
      'false would report the 201 case, which has its own status',
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
        folder: { id: ID, name: 'Shared' },
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

  test('the acceptance folder is a floor: an id, and the rest rides the review', () => {
    expect(acceptedFolder.safeParse({ id: ID }).success, 'the id alone').toBe(
      true,
    )
    expect(
      acceptedFolder.safeParse({ name: 'Shared' }).success,
      'without an id it names no folder',
    ).toBe(false)
  })
})
