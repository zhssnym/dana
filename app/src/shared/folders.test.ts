import { describe, expect, test } from 'vitest'

import { FOLDER_ACCESS_PRESETS } from './folder-access.js'
import {
  deleteFolderResponse,
  folder,
  folderMember,
  folderPendingInvite,
  getFolderResponse,
  getFoldersResponse,
  patchFolderBody,
  patchFolderMyMembershipBody,
  postFolderMembersBody,
  postFoldersBody,
} from './folders.js'

describe('postFoldersBody and patchFolderBody (7.4: { name }, 10.3: 1 to 100)', () => {
  const bodies = [
    ['postFoldersBody', postFoldersBody],
    ['patchFolderBody', patchFolderBody],
  ] as const

  test('accepts both length boundaries', () => {
    for (const [label, body] of bodies) {
      expect(body.safeParse({ name: 'x' }).success, `${label} at 1`).toBe(true)
      expect(
        body.safeParse({ name: 'x'.repeat(100) }).success,
        `${label} at 100`,
      ).toBe(true)
    }
  })

  test('refuses both out-of-range lengths', () => {
    for (const [label, body] of bodies) {
      expect(body.safeParse({ name: '' }).success, `${label} empty`).toBe(false)
      expect(
        body.safeParse({ name: 'x'.repeat(101) }).success,
        `${label} at 101`,
      ).toBe(false)
    }
  })

  test('refuses wrong types; the create requires the name, the patch does not', () => {
    for (const [label, body] of bodies) {
      for (const name of [123, true, null, ['x'], { name: 'x' }]) {
        expect(
          body.safeParse({ name }).success,
          `${label}: ${JSON.stringify(name)} is not a string`,
        ).toBe(false)
      }
    }
    expect(
      postFoldersBody.safeParse({}).success,
      'the create: missing name',
    ).toBe(false)
    // RFC 0005: the PATCH carries the 4.3 identity beside the rename, any
    // subset, so a nameless body is a legal dressing-only edit.
    expect(
      patchFolderBody.safeParse({}).success,
      'the patch: any subset, name included out',
    ).toBe(true)
    expect(
      patchFolderBody.safeParse({ icon: 'plane', color: '#1a92d1' }).success,
      'the patch: the identity fields alone',
    ).toBe(true)
    expect(
      patchFolderBody.safeParse({ color: 'blue' }).success,
      'the patch: a colour is #RRGGBB or refused',
    ).toBe(false)
  })

  test('names the field in its issue path', () => {
    const result = postFoldersBody.safeParse({ name: 123 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['name'])
    }
  })

  test('strips unknown fields rather than refusing them (7.0)', () => {
    const result = patchFolderBody.safeParse({ name: 'ok', extra: 'field' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ name: 'ok' })
    }
  })
})

describe('patchFolderMyMembershipBody (7.4: { shelf, color }, either nullable)', () => {
  test('accepts both fields, upper or lower hex (the 4.4 CHECK admits both)', () => {
    for (const color of ['#AB12CD', '#ab12cd']) {
      const result = patchFolderMyMembershipBody.safeParse({
        shelf: 'Deep work',
        color,
      })
      expect(result.success, `${color} is #RRGGBB`).toBe(true)
    }
  })

  test('accepts both length boundaries of the shelf membership', () => {
    expect(patchFolderMyMembershipBody.safeParse({ shelf: 'x' }).success).toBe(true)
    expect(
      patchFolderMyMembershipBody.safeParse({ shelf: 'x'.repeat(40) }).success,
    ).toBe(true)
  })

  test('accepts null as the clear signal for either field', () => {
    const result = patchFolderMyMembershipBody.safeParse({
      shelf: null,
      color: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ shelf: null, color: null })
    }
  })

  test('accepts any subset, keeping absent distinct from null', () => {
    const labelOnly = patchFolderMyMembershipBody.safeParse({ shelf: 'Home' })
    expect(labelOnly.success).toBe(true)
    if (labelOnly.success) {
      expect(labelOnly.data).toEqual({ shelf: 'Home' })
      expect('color' in labelOnly.data, 'absent color stays absent').toBe(false)
    }
    expect(
      patchFolderMyMembershipBody.safeParse({ color: '#00AA00' }).success,
    ).toBe(true)
    expect(
      patchFolderMyMembershipBody.safeParse({}).success,
      'the empty patch is a no-op, not a refusal',
    ).toBe(true)
  })

  test('refuses the AC-023 limit and format probes', () => {
    const refusals: readonly [unknown, string][] = [
      [{ shelf: '' }, 'an empty label is under the 1 to 40 range'],
      [{ shelf: 'x'.repeat(41) }, 'a 41-character label is over the range'],
      [{ shelf: 'ok', color: 'red' }, 'a named color is not #RRGGBB'],
      [{ shelf: 'ok', color: '#12345' }, 'five hex digits are not #RRGGBB'],
      [{ shelf: 'ok', color: '#GGHHII' }, 'non-hex digits are not #RRGGBB'],
      [{ shelf: 7, color: '#AB12CD' }, 'a wrong-typed label is a refusal'],
      [{ color: '#AB12CD1' }, 'seven hex digits are not #RRGGBB'],
    ]
    for (const [body, why] of refusals) {
      expect(patchFolderMyMembershipBody.safeParse(body).success, why).toBe(false)
    }
  })

  test('names the failing field in its issue path', () => {
    const result = patchFolderMyMembershipBody.safeParse({
      shelf: 'ok',
      color: 'red',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['color'])
    }
  })

  test('strips unknown fields rather than refusing them (7.0)', () => {
    const result = patchFolderMyMembershipBody.safeParse({
      shelf: 'ok',
      role: 'owner',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ shelf: 'ok' })
    }
  })
})

describe('postFolderMembersBody (7.4: { user_id, access })', () => {
  test('accepts a uuid in either case', () => {
    for (const user_id of [
      '123e4567-e89b-42d3-a456-426614174000',
      '123E4567-E89B-42D3-A456-426614174000',
    ]) {
      expect(
        postFolderMembersBody.safeParse({ user_id, access: 'can_edit' })
          .success,
      ).toBe(true)
    }
  })

  test('refuses non-uuids, wrong types, and the absent field', () => {
    for (const user_id of ['abc', '', 42, null, ['x'], {}]) {
      expect(
        postFolderMembersBody.safeParse({ user_id, access: 'can_edit' })
          .success,
        `${JSON.stringify(user_id)} is not a uuid`,
      ).toBe(false)
    }
    expect(
      postFolderMembersBody.safeParse({ access: 'can_edit' }).success,
      'missing user_id',
    ).toBe(false)
  })

  /*
  Issue #228 made `access` a required field of this body (R9 section 6: a
  direct member add "requires an explicit Access preset"). It has no default
  on purpose -- a default would be one person's authority chosen by nobody --
  so the body is refused without it, and refused with a value outside R8A's
  six. AC-512 proves the same two refusals on the wire and reads the stored
  preset back, which is the half a schema test cannot do.
  */
  test('requires an explicit Access preset, and one of R8A\'s six', () => {
    const user_id = '123e4567-e89b-42d3-a456-426614174000'
    expect(
      postFolderMembersBody.safeParse({ user_id }).success,
      'a member add with no preset names an authority nobody chose',
    ).toBe(false)
    expect(
      postFolderMembersBody.safeParse({ user_id, access: 'manager' }).success,
      'and R8A forbids inventing a seventh preset to express narrower authority',
    ).toBe(false)
    for (const access of FOLDER_ACCESS_PRESETS) {
      expect(
        postFolderMembersBody.safeParse({ user_id, access }).success,
        `${access} is one of the six`,
      ).toBe(true)
    }
  })

  test('names the field in its issue path', () => {
    const result = postFolderMembersBody.safeParse({
      user_id: 'abc',
      access: 'can_edit',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['user_id'])
    }
  })
})

describe('folder (7.0: the shared Folder object)', () => {
  const valid = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    name: 'Groceries',
    is_default: false,
    is_owner: true,
    member_count: 2,
    counts: { pending: 3, completed: 0 },
    my_shelf: null,
    /* One column under two keys for one release (issue #226); #247 drops
       this one with `folder_members.label`. */
    my_label: null,
    my_color: null,
    personal_labels: [],
    /* Issue #228, Hassan's Ruling 4 of 2026-09-20: the *viewer's own* preset,
       which is why it is a `my_` field and not a folder one. */
    my_access: 'full_control',
    icon: null,
    color: null,
    cover_file_id: null,
    cover_preset: null,
    cover_focal_y: 50,
    description: null,
  }

  test('accepts the shape with and without personal fields set', () => {
    expect(folder.safeParse(valid).success).toBe(true)
    expect(
      folder.safeParse({ ...valid, my_shelf: 'Home', my_color: '#00aa00' })
        .success,
    ).toBe(true)
  })

  test('refuses a member_count of zero (INV-10: the owner is a member)', () => {
    expect(folder.safeParse({ ...valid, member_count: 0 }).success).toBe(false)
  })

  test('refuses negative and missing counts', () => {
    expect(
      folder.safeParse({ ...valid, counts: { pending: -1, completed: 0 } })
        .success,
    ).toBe(false)
    const { counts, ...withoutCounts } = valid
    void counts
    expect(folder.safeParse(withoutCounts).success).toBe(false)
  })

  test('refuses a missing or non-uuid id', () => {
    expect(folder.safeParse({ ...valid, id: 'f1' }).success).toBe(false)
    const { id, ...withoutId } = valid
    void id
    expect(folder.safeParse(withoutId).success).toBe(false)
  })

  /* my_access, 7.4's amendment of 2026-09-20. Required rather than optional
     and non-nullable rather than nullable, for one reason each: a Folder
     object exists only for somebody who is a member, and INV-10 with
     migration 0023 puts a preset on every membership row there is. An
     optional field here would let a server that forgot the column answer a
     Folder the client then gates on `undefined`, which every ladder
     comparison reads as "below everything" -- a silent, total loss of
     function rather than a validation error a person sees. */
  test('requires my_access: a Folder with no preset is not a Folder', () => {
    const { my_access, ...withoutAccess } = valid
    void my_access
    expect(folder.safeParse(withoutAccess).success).toBe(false)
    expect(folder.safeParse({ ...valid, my_access: null }).success).toBe(false)
  })

  test('my_access admits the six presets and nothing else', () => {
    for (const preset of [
      'full_control',
      'can_edit',
      'can_contribute',
      'assigned_work',
      'can_comment',
      'can_view',
    ]) {
      expect(
        folder.safeParse({ ...valid, my_access: preset }).success,
        `${preset} is one of R8A's six`,
      ).toBe(true)
    }
    expect(folder.safeParse({ ...valid, my_access: 'owner' }).success).toBe(
      false,
    )
    expect(folder.safeParse({ ...valid, my_access: 'member' }).success).toBe(
      false,
    )
  })
})

describe('the 7.4 response shapes (settled at the P2 shape review)', () => {
  const member = {
    user: {
      id: '123e4567-e89b-42d3-a456-426614174000',
      display_name: 'Sara',
      avatar_url: null,
    },
    role: 'member',
    // Issue #228: a member element carries its current Access preset, beside
    // `role` rather than instead of it -- `role` expressed no authority
    // before and expresses none now.
    access: 'full_control',
    joined_at: '2026-08-01T10:00:00.000Z',
    is_owner: true,
  }
  const invite = {
    id: '223e4567-e89b-42d3-a456-426614174000',
    email: 'friend@example.test',
    task_id: null,
    // Issue #228: the preset the invite will grant on acceptance (R9 s5).
    access: 'can_edit',
    created_at: '2026-08-02T10:00:00.000Z',
    last_sent_at: '2026-08-02T10:00:00.000Z',
  }
  const detail = {
    id: '323e4567-e89b-42d3-a456-426614174000',
    name: 'Groceries',
    is_default: false,
    is_owner: true,
    member_count: 1,
    counts: { pending: 0, completed: 0 },
    my_shelf: null,
    /* One column under two keys for one release (issue #226); #247 drops
       this one with `folder_members.label`. */
    my_label: null,
    my_color: null,
    personal_labels: [],
    my_access: 'full_control',
    icon: null,
    color: null,
    cover_file_id: null,
    cover_preset: null,
    cover_focal_y: 50,
    description: null,
    members: [member],
    pending_invites: [invite],
  }

  test('GET /folders is the bare array, and only an array', () => {
    expect(getFoldersResponse.safeParse([]).success).toBe(true)
    const { members, pending_invites, ...bare } = detail
    void members
    void pending_invites
    expect(getFoldersResponse.safeParse([bare]).success).toBe(true)
    expect(
      getFoldersResponse.safeParse({ folders: [bare] }).success,
      'the wrapper 7.4 never wrote is not the shape',
    ).toBe(false)
  })

  test('the detail extends Folder with members and pending_invites', () => {
    expect(getFolderResponse.safeParse(detail).success).toBe(true)
    const { members, ...withoutMembers } = detail
    void members
    expect(getFolderResponse.safeParse(withoutMembers).success).toBe(false)
  })

  test('a member element carries the 7.0 person shape and the v1 role', () => {
    expect(folderMember.safeParse(member).success).toBe(true)
    expect(
      folderMember.safeParse({ ...member, role: 'owner' }).success,
      '4.4 admits exactly member; ownership is the folder column (8.9)',
    ).toBe(false)
    const stripped = folderMember.safeParse({
      ...member,
      user: { ...member.user, email: 'sara@example.test' },
    })
    expect(stripped.success).toBe(true)
    if (stripped.success) {
      expect(
        'email' in stripped.data.user,
        'the ruled person shape carries no address; a parse strips one',
      ).toBe(false)
    }
  })

  test('a pending invite element matches 7.4 field for field', () => {
    expect(folderPendingInvite.safeParse(invite).success).toBe(true)
    expect(
      folderPendingInvite.safeParse({
        ...invite,
        task_id: '423e4567-e89b-42d3-a456-426614174000',
      }).success,
    ).toBe(true)
    expect(
      folderPendingInvite.safeParse({ ...invite, created_at: 'yesterday' })
        .success,
    ).toBe(false)
  })

  test('the DELETE response carries exactly the three deletion tallies', () => {
    expect(
      deleteFolderResponse.safeParse({
        deleted: { tasks_open: 2, tasks_completed: 1, tasks_abandoned: 0 },
      }).success,
    ).toBe(true)
    expect(
      deleteFolderResponse.safeParse({
        deleted: { tasks_open: -1, tasks_completed: 0, tasks_abandoned: 0 },
      }).success,
    ).toBe(false)
    expect(deleteFolderResponse.safeParse({}).success).toBe(false)
  })
})
