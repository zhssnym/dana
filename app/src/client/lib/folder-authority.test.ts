/*
What a folder's menus offer, asserted preset by preset.

**This is the only evidence in the vitest suite that any of #228's screen work
is right.** `vitest.config.ts` sets `environment: 'node'` for the whole suite,
so nothing here renders; what makes these assertions real rather than a
compile check is that the decision itself was moved out of the JSX and into
`folderGates`, which is a pure function of four facts. A surface that spreads
its result over `actsFor`'s handlers cannot offer an act this file says it may
not — and if one stops doing that, `folder-authority` is still right and the
screen is still wrong, which is what the browser leg is for and why the pull
request says plainly that it was not run.

The expected table below is written from the criteria and **not** re-derived
from `shared/folder-actions.ts`. A test that computes its expectation the way
the code does proves only that the code is self-consistent; these rows are
transcribed from AC-011, AC-012, AC-015, AC-019, AC-024 and AC-202 as those
criteria read after Hassan's ruling of 2026-09-20,
https://github.com/zhssnym/dana/issues/228#issuecomment-5750892771.

The two rows that are the defect this work exists to fix are marked where they
appear: a Full-control member who is not the owner, and an owner whose Access
has been lowered.
*/
import { describe, expect, test } from 'vitest'

import { FOLDER_ACCESS_PRESETS } from '../../shared/folder-access.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import type { FolderMember } from '../../shared/folders.js'
import {
  eligibleSuccessors,
  folderGates,
  otherMembers,
  viewerFacts,
  viewerMembership,
} from './folder-authority.js'

const VIEWER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const THIRD = '33333333-3333-4333-8333-333333333333'

function member(
  id: string,
  access: FolderAccessPreset,
  options: { isOwner?: boolean; joined?: string; name?: string } = {},
): FolderMember {
  return {
    user: {
      id,
      display_name: options.name ?? `Person ${id.slice(0, 1)}`,
      avatar_url: null,
    },
    role: 'member',
    access,
    joined_at: options.joined ?? '2026-01-01T00:00:00.000Z',
    is_owner: options.isOwner ?? false,
  }
}

/** A shared folder's facts, with the viewer's preset and custody varied. */
function facts(
  access: FolderAccessPreset,
  options: { isOwner?: boolean; isDefault?: boolean; otherFullControl?: boolean } = {},
) {
  return {
    access,
    isOwner: options.isOwner ?? false,
    isDefault: options.isDefault ?? false,
    otherFullControl: options.otherFullControl ?? true,
  }
}

describe('a folder’s identity: rename, icon, colour, cover, description', () => {
  /* AC-011 and AC-012, rewritten 2026-09-20: a folder's identity is ordinary
     shared Folder work, changed by Can edit and above and by nobody below.
     Accepted #209 R8A. */
  const EXPECTED: Record<FolderAccessPreset, boolean> = {
    full_control: true,
    can_edit: true,
    can_contribute: false,
    assigned_work: false,
    can_comment: false,
    can_view: false,
  }

  for (const preset of FOLDER_ACCESS_PRESETS) {
    test(`${preset} holder who is not the owner: ${String(EXPECTED[preset])}`, () => {
      expect(folderGates(facts(preset)).identity).toBe(EXPECTED[preset])
    })
  }

  test('the defect, first half: a Full-control member who is not the owner is offered Rename', () => {
    expect(folderGates(facts('full_control', { isOwner: false })).identity).toBe(true)
  })

  test('ownership alone confers nothing: an owner holding Can view is offered no Rename', () => {
    expect(folderGates(facts('can_view', { isOwner: true })).identity).toBe(false)
  })

  test('the owner who kept Full control still renames', () => {
    expect(folderGates(facts('full_control', { isOwner: true })).identity).toBe(true)
  })
})

describe('moving the folder to Trash', () => {
  /* AC-015, rewritten 2026-09-20 on **Hassan's ruling** and not on R8A, which
     settles it neither way: Full control's, and below it nobody's. */
  const EXPECTED: Record<FolderAccessPreset, boolean> = {
    full_control: true,
    can_edit: false,
    can_contribute: false,
    assigned_work: false,
    can_comment: false,
    can_view: false,
  }

  for (const preset of FOLDER_ACCESS_PRESETS) {
    test(`${preset} holder who is not the owner: ${String(EXPECTED[preset])}`, () => {
      expect(folderGates(facts(preset)).trash).toBe(EXPECTED[preset])
    })
  }

  test('the defect, second half: an owner whose Access dropped to Can edit is offered no Delete', () => {
    expect(folderGates(facts('can_edit', { isOwner: true })).trash).toBe(false)
  })

  test('a Full-control member who is not the owner may trash it', () => {
    expect(folderGates(facts('full_control', { isOwner: false })).trash).toBe(true)
  })

  test('INV-2: the default folder is never offered Delete, whatever the preset', () => {
    expect(
      folderGates(facts('full_control', { isOwner: true, isDefault: true })).trash,
    ).toBe(false)
  })
})

describe('leaving', () => {
  test('any preset may leave a shared folder', () => {
    for (const preset of FOLDER_ACCESS_PRESETS) {
      expect(folderGates(facts(preset)).leave).toBe(true)
    }
  })

  test('the owner is not offered Leave: R6 section 2 makes them transfer first', () => {
    expect(folderGates(facts('full_control', { isOwner: true })).leave).toBe(false)
  })

  test('INV-2: the default folder is never offered Leave', () => {
    expect(folderGates(facts('full_control', { isDefault: true })).leave).toBe(false)
  })

  test('the last Full-control member is not offered Leave (the continuity invariant)', () => {
    expect(
      folderGates(facts('full_control', { otherFullControl: false })).leave,
    ).toBe(false)
  })

  test('a member below Full control leaves even when nobody else holds it, because they are not the custodian', () => {
    expect(folderGates(facts('can_edit', { otherFullControl: false })).leave).toBe(true)
  })

  test('a surface that cannot know the roster offers Leave rather than hiding the only way out', () => {
    expect(folderGates({ access: 'full_control', isOwner: false, isDefault: false }).leave).toBe(
      true,
    )
  })
})

describe('custody and people', () => {
  test('transfer is the owner’s alone, and Full control does not confer it', () => {
    expect(folderGates(facts('full_control', { isOwner: false })).transferOwnership).toBe(
      false,
    )
    expect(folderGates(facts('can_view', { isOwner: true })).transferOwnership).toBe(true)
  })

  test('INV-2: the default folder never changes hands', () => {
    expect(
      folderGates(facts('full_control', { isOwner: true, isDefault: true }))
        .transferOwnership,
    ).toBe(false)
  })

  test('administering people and Access is Full control’s, and Can edit is denied by name (AC-024)', () => {
    const edit = folderGates(facts('can_edit'))
    expect(edit.addMember).toBe(false)
    expect(edit.administerAccess).toBe(false)

    const full = folderGates(facts('full_control'))
    expect(full.addMember).toBe(true)
    expect(full.administerAccess).toBe(true)
  })

  test('an owner below Full control administers nobody: custody is not standing authority', () => {
    const demoted = folderGates(facts('can_edit', { isOwner: true }))
    expect(demoted.addMember).toBe(false)
    expect(demoted.administerAccess).toBe(false)
  })
})

describe('moderating somebody else’s comment', () => {
  /* AC-790, added 2026-09-20 by issue #268: `comment.moderate` is #228's
     Full-control list, which the route has resolved since R8A landed and the
     two conversation surfaces had not — they went on offering Delete on
     `is_owner`. Transcribed from AC-790 rather than re-derived from
     `shared/folder-actions.ts`, on this file's own rule. */
  const EXPECTED: Record<FolderAccessPreset, boolean> = {
    full_control: true,
    can_edit: false,
    can_contribute: false,
    assigned_work: false,
    can_comment: false,
    can_view: false,
  }

  for (const preset of FOLDER_ACCESS_PRESETS) {
    test(`${preset} holder who is not the owner: ${String(EXPECTED[preset])}`, () => {
      expect(folderGates(facts(preset)).moderate).toBe(EXPECTED[preset])
    })
  }

  test('the defect, first half: a Full-control member who owns nothing moderates', () => {
    expect(folderGates(facts('full_control', { isOwner: false })).moderate).toBe(true)
  })

  test('the defect, second half: an owner demoted to Can comment moderates nothing', () => {
    expect(folderGates(facts('can_comment', { isOwner: true })).moderate).toBe(false)
  })

  test('INV-2 is not this gate’s business: the default folder’s own thread is moderated', () => {
    expect(
      folderGates(facts('full_control', { isOwner: true, isDefault: true })).moderate,
    ).toBe(true)
  })
})

describe('the successor picker', () => {
  /* Governing #209 R6 section 2, and the server's own `isEligibleSuccessor`:
     a member who currently holds Full control, and nobody else. */
  const ROSTER: FolderMember[] = [
    member(VIEWER, 'full_control', { isOwner: true, joined: '2026-01-01T00:00:00.000Z' }),
    member(OTHER, 'can_edit', { joined: '2026-01-02T00:00:00.000Z' }),
    member(THIRD, 'full_control', { joined: '2026-01-03T00:00:00.000Z' }),
  ]

  test('only Full control, and never the viewer', () => {
    expect(eligibleSuccessors(ROSTER, VIEWER).map((m) => m.user.id)).toEqual([THIRD])
  })

  test('an eligible member who joined last is still eligible: there is no longest-standing rule', () => {
    const late = member(OTHER, 'full_control', { joined: '2030-01-01T00:00:00.000Z' })
    const roster = [ROSTER[0] as FolderMember, late]
    expect(eligibleSuccessors(roster, VIEWER).map((m) => m.user.id)).toEqual([OTHER])
  })

  test('a folder whose other members are all below Full control offers nobody', () => {
    const roster = [ROSTER[0] as FolderMember, ROSTER[1] as FolderMember]
    expect(eligibleSuccessors(roster, VIEWER)).toEqual([])
    /* And the folder is still shared, which is the distinction the dialog has
       to draw: somebody to hand it to is not the same as somebody in it. */
    expect(otherMembers(roster, VIEWER)).toHaveLength(1)
  })

  test('the viewer holding Full control does not make the viewer a successor', () => {
    expect(eligibleSuccessors([ROSTER[0] as FolderMember], VIEWER)).toEqual([])
  })
})

describe('reading the viewer’s own facts off the roster', () => {
  const ROSTER: FolderMember[] = [
    member(VIEWER, 'can_edit', { isOwner: true }),
    member(OTHER, 'full_control'),
  ]

  test('the preset is the viewer’s membership row and never inferred from ownership', () => {
    expect(viewerMembership(ROSTER, VIEWER)?.access).toBe('can_edit')
  })

  test('facts carry custody, the default flag and whether anybody else holds Full control', () => {
    const read = viewerFacts(
      { is_owner: true, is_default: false },
      ROSTER,
      VIEWER,
    )
    expect(read).toEqual({
      access: 'can_edit',
      isOwner: true,
      isDefault: false,
      otherFullControl: true,
    })
  })

  test('null while the folder or the roster has not arrived, so no menu draws early', () => {
    expect(viewerFacts(undefined, ROSTER, VIEWER)).toBeNull()
    expect(viewerFacts({ is_owner: true, is_default: false }, [], VIEWER)).toBeNull()
    expect(viewerFacts({ is_owner: true, is_default: false }, ROSTER, null)).toBeNull()
  })

  test('a sole member holds Full control and nobody else does', () => {
    const alone = [member(VIEWER, 'full_control', { isOwner: true })]
    expect(
      viewerFacts({ is_owner: true, is_default: false }, alone, VIEWER)
        ?.otherFullControl,
    ).toBe(false)
  })
})
