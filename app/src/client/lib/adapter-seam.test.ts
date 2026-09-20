/*
The unit tests for RFC 0004's S22 adapter seam, and the only thing that checks
it until S23 draws a surface over it.

**Why they are here and not in the browser leg.** S22's row asks for one
prototype screen running end to end on real data as its proof, and that proof
could not be produced at this position in the dependency order: every screen
in `docs/design/prototype-v2/src/screens/` was either fed by `task-row.tsx`,
`task-card.tsx` or `shell-page.tsx`, which are S23's and S24's files, or was
wired to its own `useState` and writes that reach nothing. That prototype is
deleted (`a7886df`, 2026-09-01) and is in git history before that commit. The finding and its
recommendation are in the session report and in RFC 0005's change control.
Until the proof screen lands, these cases are what stands behind the seam, and
they are deliberately about the *seams* rather than about the mappings being
exercised: the header of each module names what it crosses, and a case here
pins each of those sentences.

Pure functions only. The hooks over them are three lines of `useMemo` around
these, and a case that mounted one would be testing TanStack Query.
*/
import { describe, expect, test, vi } from 'vitest'

import type { Folder, GetFolderResponse } from '../../shared/folders.js'
import type { MeResponse } from '../../shared/me.js'
import type { TaskCard, TaskDetail } from '../../shared/tasks.js'
import { folderLibrary } from './folder-library.js'
import { folderLink, parameterTarget, shelfLink, taskLink } from './nav-links.js'
import { isSamePerson, peopleLibrary } from './people-library.js'
import { conceptPatchToBody, toConceptTask } from '../tasks/task-concept.js'
import type { ConceptContext } from '../tasks/task-concept.js'
import { unwritten } from '../tasks/task-writer.js'

const VIEWER = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const INBOX = '00000000-0000-4000-8000-0000000000a1'
const WORK = '00000000-0000-4000-8000-0000000000a2'
const TASK = '00000000-0000-4000-8000-0000000000f1'
const TODAY = '2026-08-10'

function card(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: TASK,
    title: 'Send the venue deposit',
    status: 'pending',
    important: false,
    start_date: null,
    due_date: null,
    due_time: null,
    folder: { id: WORK, name: 'Work', is_default: false },
    assignee: null,
    is_recurring: false,
    steps_done: 0,
    steps_total: 0,
    pulled: false,
    pending_invite_email: null,
    section_block_id: null,
    created_by: null,
    labels: { personal: [], folder: [] },
    created_at: '2026-08-01T09:00:00.000Z',
    updated_at: '2026-08-01T09:00:00.000Z',
    ...overrides,
  }
}

function detail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...card(),
    notes: null,
    recurrence_rule: null,
    series_id: null,
    reminder: null,
    steps: [],
    completed_at: null,
    completed_by: null,
    ...overrides,
  }
}

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: WORK,
    name: 'Work',
    is_default: false,
    is_owner: true,
    member_count: 1,
    counts: { pending: 3, completed: 1 },
    my_shelf: null,
    my_color: null,
    personal_labels: [],
    icon: null,
    color: null,
    cover_file_id: null,
    cover_preset: null,
    cover_focal_y: 50,
    description: null,
    ...overrides,
  }
}

function context(overrides: Partial<ConceptContext> = {}): ConceptContext {
  return { today: TODAY, folders: [], ...overrides }
}

function member(
  id: string,
  name: string | null,
): GetFolderResponse['members'][number] {
  return {
    user: { id, display_name: name, avatar_url: null },
    role: 'member',
    joined_at: '2026-08-01T09:00:00.000Z',
    is_owner: false,
  }
}

const viewer: MeResponse['user'] = {
  id: VIEWER,
  email: 'imran@example.com',
  display_name: 'Imran Wafa',
  avatar_url: null,
  timezone: 'Europe/Paris',
}

describe('nav-links: the prototype navigates by parameter and 9.1 navigates by path', () => {
  /*
  The prototype's own `taskLink` is `?task=<id>` on the current URL
  (`src/lib/folder-duplicate.ts:345`). 9.1's route table fixes
  `/app/tasks/:id`, and `routes.ts` transcribes it. This is the whole scheme
  seam in three assertions.
  */
  test('every address is 9.1s path on the current origin, never a parameter', () => {
    vi.stubGlobal('location', { origin: 'https://dana.so' })
    try {
      expect(taskLink(TASK)).toBe(`https://dana.so/app/tasks/${TASK}`)
      expect(folderLink(WORK)).toBe(`https://dana.so/app/folders/${WORK}`)
      expect(shelfLink(WORK)).toBe(`https://dana.so/app/shelves/${WORK}`)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  /* The guarded branch, which this suite runs in: no location at all, and the
     path alone is the honest answer rather than a throw or a "undefined/app". */
  test('with no location, the path is the answer', () => {
    expect(taskLink(TASK)).toBe(`/app/tasks/${TASK}`)
  })

  test('an address copied out of the prototype still resolves to a task', () => {
    expect(parameterTarget(`?task=${TASK}`)).toBe(`/app/tasks/${TASK}`)
    expect(parameterTarget('?state=folder&folder=Travel&task=' + TASK)).toBe(
      `/app/tasks/${TASK}`,
    )
  })

  /*
  The key seam, refused rather than resolved. The prototype addresses a folder
  by name; this client addresses one by id; a resolver here would let a
  name-keyed call site keep working, which is how the habit survives a port.
  */
  test('a folder parameter answers nothing, because a name is not an address', () => {
    expect(parameterTarget('?state=folder&folder=Travel')).toBeNull()
    expect(parameterTarget('')).toBeNull()
    expect(parameterTarget('?task=')).toBeNull()
  })
})

describe('task-concept: 7.0s task as a lifted card reads it', () => {
  /*
  The prototype's own warning, from `TaskRowProps.detail`: a mapper that had
  only a step count "had to *invent* the steps from it, Step 1, Step 2, which
  meant a task could round-trip through the shell and come back with its steps
  renamed". So a card maps to no steps at all.
  */
  test('a card carries no steps, whatever its counts say', () => {
    const mapped = toConceptTask(card({ steps_done: 2, steps_total: 5 }), context())
    expect(mapped.steps).toBeUndefined()
  })

  test('a detail carries the items themselves, titles and all', () => {
    const mapped = toConceptTask(
      detail({
        steps: [
          { id: TASK, title: 'Call the venue', done: true, position: 1 },
          { id: OTHER, title: 'Send the transfer', done: false, position: 2 },
        ],
        notes: 'Bank details are in the thread.',
      }),
      context(),
    )
    /* The id rides since item 58 (C): `tasks/task-acts.ts` promotes by it. */
    expect(mapped.steps).toEqual([
      { id: '00000000-0000-4000-8000-0000000000f1', title: 'Call the venue', done: true },
      { id: '00000000-0000-4000-8000-000000000002', title: 'Send the transfer', done: false },
    ])
    expect(mapped.notes).toBe('Bank details are in the thread.')
  })

  /*
  9.4's "assignee chip when not the viewer" is a rule about what a row draws
  under a heading that has already said who is carrying the work.
  `taskRowDisplay` applies it; a card shows the task, so this does not.
  */
  test('the assignee is mapped plainly, viewer or not, because a card is not a row', () => {
    const mine = toConceptTask(
      card({ assignee: { id: VIEWER, display_name: 'Imran Wafa', avatar_url: null } }),
      context(),
    )
    expect(mine.assignee).toEqual({ id: VIEWER, name: 'Imran Wafa', initials: 'IW' })
  })

  test('a face crosses when there is one and the key is absent when there is not', () => {
    const withFace = toConceptTask(
      card({
        assignee: { id: OTHER, display_name: 'Sara Khan', avatar_url: 'https://x/y.png' },
      }),
      context(),
    )
    expect(withFace.assignee?.image).toBe('https://x/y.png')
    expect(toConceptTask(card(), context()).assignee).toBeUndefined()
  })

  /* Structure crosses; wording does not. 4.11 stores an RRULE and the words a
     chip says are the picker's, which lands at S23. */
  test('a frequency crosses as a unit and no repeat wording is invented', () => {
    const mapped = toConceptTask(
      detail({ is_recurring: true, recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO,WE' }),
      context(),
    )
    expect(mapped.repeatUnit).toBe('week')
    expect(mapped.recurrence).toBe(true)
    expect(mapped.repeatEvery).toBeUndefined()
    expect(mapped.repeatDays).toBeUndefined()
    expect(mapped.repeatEnds).toBeUndefined()
  })

  test('the due badge is presenters.ts and never a second clock', () => {
    expect(toConceptTask(card({ due_date: TODAY }), context()).due).toEqual({
      label: 'Due today',
    })
    expect(toConceptTask(card({ due_date: '2026-08-06' }), context()).due).toEqual({
      label: 'Overdue · 6 Aug',
      overdue: true,
    })
  })

  test('the folder carries its id as well as its name, which is the second seam', () => {
    const mapped = toConceptTask(card(), context({ folders: [folder()] }))
    expect(mapped.folder).toEqual({ id: WORK, name: 'Work', color: expect.any(String) })
  })

  test('the two statuses are two flags, as the card reads them', () => {
    expect(toConceptTask(card({ status: 'completed' }), context()).done).toBe(true)
    expect(toConceptTask(card({ status: 'abandoned' }), context()).abandoned).toBe(true)
    expect(toConceptTask(card(), context()).done).toBe(false)
  })
})

describe('task-concept: what a PATCH may carry, and what it refuses', () => {
  test('the three fields that map field for field', () => {
    expect(
      conceptPatchToBody({ title: 'Pay the deposit', notes: 'By Friday', important: true }),
    ).toEqual({ title: 'Pay the deposit', notes: 'By Friday', important: true })
  })

  /* Every one of these has a verb of its own: 7.6's transition, 7.8's pull,
     7.9's PUT, 7.7's step routes. A body carrying them would be one the server
     refuses, or worse one it accepts having dropped the field. */
  test('a field with a verb of its own never reaches the body', () => {
    expect(
      conceptPatchToBody({
        done: true,
        abandoned: false,
        pulled: true,
        steps: [{ title: 'Call the venue', done: true }],
        reminder: '30 minutes before',
        due: { label: 'Due today' },
        comments: [],
      }),
    ).toEqual({})
  })

  test('a folder maps through its id and never through its name', () => {
    expect(conceptPatchToBody({ folder: { name: 'Work', color: '#000000' } })).toEqual({})
    expect(
      conceptPatchToBody({ folder: { name: 'Work', color: '#000000', id: WORK } }),
    ).toEqual({ folder_id: WORK })
  })

  /* Ledger L-094, closed: unassigned is a member of the set, not the absence
     of one. 7.6 distinguishes a null from an absent key and so does this. */
  test('clearing an assignee sends null rather than sending nothing', () => {
    expect(conceptPatchToBody({ assignee: { name: 'Nobody', initials: 'N' } })).toEqual({
      assignee_id: null,
    })
    expect(conceptPatchToBody({})).toEqual({})
  })

  /*
  Issue #169, and the case the type could not state until it was fixed. The
  menu's Unassigned said `undefined`, which this function reads as "the field
  was not touched", so the body came out empty, no request was made, and the
  chip cleared in the browser over a task the server still had assigned. The
  two empties are two values now, and this asserts both of them: null clears,
  absent leaves alone. AC-220 reads the same pair through the browser.
  */
  test('a null assignee clears and an untouched one is left alone', () => {
    expect(conceptPatchToBody({ assignee: null })).toEqual({ assignee_id: null })
    expect(conceptPatchToBody({ title: 'Pay the deposit' })).toEqual({
      title: 'Pay the deposit',
    })
    expect(conceptPatchToBody({ assignee: undefined })).toEqual({})
  })
})

describe('task-writer: the seam names what it dropped', () => {
  test('a report that is entirely verbs leaves nothing for the PATCH', () => {
    expect(unwritten({ done: true, pulled: false, abandoned: false })).toEqual([])
  })

  test('the fields this client cannot send are listed rather than swallowed', () => {
    /* Steps left this list at item 58: `writeSteps` performs them. */
    expect(unwritten({ title: 'x', steps: [], reminder: 'in an hour' })).toEqual(['reminder'])
  })

  test('a folder named without an id counts as unwritten', () => {
    expect(unwritten({ folder: { name: 'Work', color: '#000000' } })).toEqual(['folder'])
    expect(unwritten({ folder: { name: 'Work', color: '#000000', id: WORK } })).toEqual([])
  })
})

describe('folder-library: the real library, and 7.4s order kept', () => {
  /* 7.4 answers default-first then by name, and section 6's rule that clients
     never re-sort is a rule about every ordered response. */
  test('maps rather than sorts, so the menu and the sidebar cannot disagree', () => {
    const rows = [
      folder({ id: INBOX, name: 'Desk', is_default: true }),
      folder({ id: WORK, name: 'Work' }),
    ]
    expect(folderLibrary(rows).map((choice) => choice.name)).toEqual(['Desk', 'Work'])
    expect(folderLibrary(rows)[0]).toEqual({
      id: INBOX,
      name: 'Desk',
      color: expect.any(String),
      isDefault: true,
    })
  })

  /* L-059's "New folder…" entry is 9.3's and is owed to S23 with S24's
     dialog. A list of folders that ended in something that is not a folder
     would make every caller filter it back out. */
  test('offers folders and nothing that is not one', () => {
    expect(folderLibrary([folder()])).toHaveLength(1)
    expect(folderLibrary([])).toEqual([])
  })
})

describe('people-library: the roster is the folders members, viewer first', () => {
  test('the viewer leads, because a list that omits you is one you translate', () => {
    const roster = peopleLibrary(viewer, [
      member(OTHER, 'Sara Khan'),
      member(VIEWER, 'Imran Wafa'),
    ])
    expect(roster.map((person) => person.name)).toEqual(['Imran Wafa', 'Sara Khan'])
  })

  test('the viewer appears once, whether or not the member list carries them', () => {
    expect(peopleLibrary(viewer, [member(VIEWER, 'Imran Wafa')])).toHaveLength(1)
    expect(peopleLibrary(viewer, [])).toHaveLength(1)
    expect(peopleLibrary(undefined, [member(OTHER, 'Sara Khan')])).toHaveLength(1)
  })

  /* 4.1's scrubbed account, rendered rather than blank, through the presenter
     that owns that string. */
  test('a scrubbed member is still a roster entry', () => {
    const roster = peopleLibrary(undefined, [member(OTHER, null)])
    expect(roster[0]).toEqual({ id: OTHER, name: 'Deleted user', initials: 'DU' })
  })

  /*
  The prototype matches by first name and says so: "will be one row after the
  port". This is after the port, so two colleagues sharing a first name are
  two people.
  */
  test('two people are the same person only by id', () => {
    const sara = { id: OTHER, name: 'Sara Khan', initials: 'SK' }
    const other = { id: VIEWER, name: 'Sara Ahmed', initials: 'SA' }
    expect(isSamePerson(sara, { ...sara, name: 'Sara' })).toBe(true)
    expect(isSamePerson(sara, other)).toBe(false)
  })

  test('two unknowns are not one person', () => {
    expect(isSamePerson({ name: 'Sara', initials: 'S' }, { name: 'Sara', initials: 'S' })).toBe(
      false,
    )
    expect(isSamePerson(undefined, undefined)).toBe(false)
  })
})
