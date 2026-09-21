/*
The unit tests for `presenters.ts`, and the only thing in this repository that
checks it.

No acceptance criterion reads this module. The thirteen criteria RFC 0002 adds
and the ones already green assert rendered roles, names, regions and copy, and
every one of them would still pass if the label below read the wrong date or
the initials came out backwards, because they assert that a due badge exists
and never what it says. That asymmetry is why the module was written pure and
why these tests exist: protocol section 8 makes unit tests inside a role's own
module its own, and this is the module where the absence of one is expensive.

Each case names the sentence it pins. Where the specification is silent the
case says so and pins this session's recorded choice instead, so that a later
session changing the choice changes a test that tells it what it is changing.
*/
import { describe, expect, test } from 'vitest'

// Vite's own `?raw` rather than node:fs, because this project typechecks under
// `vite/client` and carries no node types; that declaration is where the
// suffix's string type comes from.
import presentersSource from './presenters.ts?raw'

import { markIcon } from '../components/page/icon-manifest.js'

import {
  DEFAULT_FOLDER_COLOR,
  DELETED_USER,
  dueDisplay,
  folderDisplay,
  folderGroupLabels,
  folderGroupOptions,
  folderIdsForNames,
  folderLabelFields,
  folderMark,
  folderRowDisplay,
  formatDueDate,
  initialsOf,
  inviteRowDisplay,
  personDisplay,
  presenterToday,
  taskRowDisplay,
} from './presenters.js'
import type { RowContext } from './presenters.js'
import type { Folder } from '../../shared/folders.js'
import type { TaskCard } from '../../shared/tasks.js'

const VIEWER = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const INBOX = '00000000-0000-4000-8000-0000000000a1'
const WORK = '00000000-0000-4000-8000-0000000000a2'

/** Every field 7.0 gives a TaskCard, so a case fails on the thing it names. */
function card(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: '00000000-0000-4000-8000-0000000000f1',
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
    // RFC 0005 unit 12a's two additions to 7.0's TaskCard; nothing here
    // reads either, so both take the value a task under no section and a
    // scrubbed creator would.
    section_block_id: null,
    created_by: null,
    labels: { personal: [], folder: [] },
    created_at: '2026-08-01T09:00:00.000Z',
    updated_at: '2026-08-01T09:00:00.000Z',
    ...overrides,
  }
}

/** Every field 7.0 gives a Folder. */
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
    // Sole owner, so Full control (4.4 as widened by migration 0023).
    my_access: 'full_control',
    icon: null,
    color: null,
    cover_file_id: null,
    cover_preset: null,
    cover_focal_y: 50,
    description: null,
    ...overrides,
  }
}

const TODAY = '2026-08-10'

function context(overrides: Partial<RowContext> = {}): RowContext {
  return { today: TODAY, viewerId: VIEWER, folders: [], ...overrides }
}

describe('formatDueDate: the design fixes the format and section 9 says so', () => {
  /*
  9.1: "the format of a date is the design's and this section has never
  spelled one." What the design gives is the literal strings its rows show,
  measured off the running prototype on 2026-08-13, because it carries no
  formatter at all: every due label in his `fixtures.ts` is a hand-written
  string. These four are his, character for character.
  */
  test('reproduces the designer\'s own strings, day first and no leading zero', () => {
    expect(formatDueDate('2026-08-06', TODAY)).toBe('6 Aug')
    expect(formatDueDate('2026-08-09', TODAY)).toBe('9 Aug')
    expect(formatDueDate('2026-08-14', TODAY)).toBe('14 Aug')
    expect(formatDueDate('2026-08-18', TODAY)).toBe('18 Aug')
  })

  test('every month abbreviates the way the design writes August', () => {
    const months = [
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
      '2026-06-05',
      '2026-07-05',
      '2026-08-05',
      '2026-09-05',
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
    ].map((date) => formatDueDate(date, TODAY))
    expect(months).toEqual([
      '5 Jan',
      '5 Feb',
      '5 Mar',
      '5 Apr',
      '5 May',
      '5 Jun',
      '5 Jul',
      '5 Aug',
      '5 Sep',
      '5 Oct',
      '5 Nov',
      '5 Dec',
    ])
  })

  /*
  A silence, and this session's recorded choice. The design's screens show no
  year because every date on them falls in the fixture's own year, so they
  settle the same-year form and say nothing about any other. The suffix
  appears only when the years differ, so it changes no string the design shows.
  */
  test('carries the year only when it is not the year the reader is in', () => {
    expect(formatDueDate('2027-08-06', TODAY)).toBe('6 Aug 2027')
    expect(formatDueDate('2025-12-31', TODAY)).toBe('31 Dec 2025')
    expect(formatDueDate('2026-12-31', TODAY)).toBe('31 Dec')
  })

  test('a value that is not a 4.11 date is returned untouched rather than guessed at', () => {
    expect(formatDueDate('', TODAY)).toBe('')
    expect(formatDueDate('2026-13-01', TODAY)).toBe('2026-13-01')
    expect(formatDueDate('not a date', TODAY)).toBe('not a date')
  })

  test('no locale reaches the month name', () => {
    // The table exists so that a French browser, which this machine's own
    // tooling is, never renders "aout" beside section 9's English copy.
    expect(formatDueDate('2026-08-06', TODAY)).not.toContain('aût')
  })
})

describe('dueDisplay: 8.10\'s three cases and Q3C\'s restriction', () => {
  test('a task with no date carries no badge', () => {
    expect(dueDisplay(card({ due_date: null }), TODAY)).toBeUndefined()
  })

  test('D = today(V) reads "Due today", which is 8.10\'s middle case', () => {
    expect(dueDisplay(card({ due_date: TODAY }), TODAY)).toEqual({ label: 'Due today' })
  })

  test('D > today(V) reads "Due {date}"', () => {
    expect(dueDisplay(card({ due_date: '2026-08-18' }), TODAY)).toEqual({
      label: 'Due 18 Aug',
    })
  })

  /*
  8.10: "overdue when D < today(V)". 9.4: "due badge (overdue styled when
  due_date < today)". The separator and the wording are the design's, from
  STATE-02 of his state lab.
  */
  test('D < today(V) on a pending row reads "Overdue" and sets the flag', () => {
    expect(dueDisplay(card({ due_date: '2026-08-06' }), TODAY)).toEqual({
      label: 'Overdue · 6 Aug',
      overdue: true,
    })
  })

  /*
  Q3C: "Pending renders normal (overdue styled on past dates), completed faded
  and checked, abandoned faded and struck." A finished task's date is history.
  The designer's STATE-03 agrees: a completed row on a past date carries "Due 9
  Aug" and not the overdue form.
  */
  test('a completed row on a past date is not overdue', () => {
    expect(dueDisplay(card({ due_date: '2026-08-09', status: 'completed' }), TODAY)).toEqual({
      label: 'Due 9 Aug',
    })
  })

  test('an abandoned row on a past date is not overdue', () => {
    expect(dueDisplay(card({ due_date: '2026-08-09', status: 'abandoned' }), TODAY)).toEqual({
      label: 'Due 9 Aug',
    })
  })

  /*
  Q4: dated rows "show due date and time like a Planned row", and the seconds
  Postgres renders on a TIME column are dropped rather than assumed absent.

  **The notation is the viewer's since S17b, where this test pinned 24-hour.**
  9.7 gives a person the clock and 4.19 stores it, so `dueDisplay` takes it and
  a row's `RowContext` carries it. The corpus-wide 24-hour convention this test
  used to cite is this repository's rule for its own documents and was never a
  rule about somebody's rows; the default is 12-hour, which is
  `lib/time-format.ts`'s and Imran's ruling of 2026-08-18.

  Both clocks are asserted rather than only the new default. This function
  gained an input, and a test reading only the value it happens to pass would
  not notice the other stopping working, which is exactly how the fixed
  24-hour formatter survived unnoticed beside a 12-hour picker until S17b.
  */
  test("a due time rides the label on the viewer's clock, seconds dropped", () => {
    expect(dueDisplay(card({ due_date: TODAY, due_time: '09:00:00' }), TODAY)).toEqual({
      label: 'Due today 9:00 AM',
    })
    expect(dueDisplay(card({ due_date: TODAY, due_time: '09:00:00' }), TODAY, '24')).toEqual({
      label: 'Due today 09:00',
    })
    expect(dueDisplay(card({ due_date: '2026-08-18', due_time: '18:30' }), TODAY, '24')).toEqual({
      label: 'Due 18 Aug 18:30',
    })
    expect(dueDisplay(card({ due_date: '2026-08-18', due_time: '18:30' }), TODAY, '12')).toEqual({
      label: 'Due 18 Aug 6:30 PM',
    })
    expect(dueDisplay(card({ due_date: '2026-08-06', due_time: '23:45:00' }), TODAY, '24')).toEqual({
      label: 'Overdue · 6 Aug 23:45',
      overdue: true,
    })
  })

  /*
  Midnight and noon, the two a 12-hour clock gets wrong when anybody
  reimplements it: 0 and 12 both read as 12 there, which `to12Hour` handles and
  a bare remainder does not. Asserted through the label because that is the
  path a row actually takes to the screen.
  */
  test('midnight and noon read correctly on a 12-hour label', () => {
    expect(dueDisplay(card({ due_date: TODAY, due_time: '00:00:00' }), TODAY, '12')).toEqual({
      label: 'Due today 12:00 AM',
    })
    expect(dueDisplay(card({ due_date: TODAY, due_time: '12:00:00' }), TODAY, '12')).toEqual({
      label: 'Due today 12:00 PM',
    })
  })

  test('the comparison is chronological across a year boundary', () => {
    const newYear = '2026-01-01'
    expect(dueDisplay(card({ due_date: '2025-12-31' }), newYear)?.overdue).toBe(true)
    expect(dueDisplay(card({ due_date: '2026-01-02' }), newYear)?.overdue).toBeUndefined()
  })

  test('the day before today is overdue and the day itself is not', () => {
    expect(dueDisplay(card({ due_date: '2026-08-09' }), TODAY)?.overdue).toBe(true)
    expect(dueDisplay(card({ due_date: '2026-08-10' }), TODAY)?.overdue).toBeUndefined()
  })
})

describe('initialsOf: the design\'s avatar, the specification being silent', () => {
  test('one word gives one letter, which is his "S" beside "Sara"', () => {
    expect(initialsOf('Sara')).toBe('S')
  })

  test('two words give the first and the last', () => {
    expect(initialsOf('Imran Hassan')).toBe('IH')
  })

  test('three words give the first and the last, never the middle', () => {
    expect(initialsOf('Ada Byron Lovelace')).toBe('AL')
  })

  test('surrounding and repeated whitespace does not become a letter', () => {
    expect(initialsOf('  sara   ali  ')).toBe('SA')
  })

  test('the result is upper-cased whatever the name is', () => {
    expect(initialsOf('sara')).toBe('S')
  })

  test('an empty name yields nothing rather than throwing', () => {
    expect(initialsOf('')).toBe('')
    expect(initialsOf('   ')).toBe('')
  })

  test('a name outside the basic plane contributes a whole code point', () => {
    // charAt would take half a surrogate pair and render a replacement glyph.
    expect(initialsOf('\u{1D4D0}da Lovelace')).toBe('\u{1D4D0}L')
  })
})

describe('personDisplay: 4.1\'s "Deleted user"', () => {
  test('a name is carried and its initials derived from it', () => {
    expect(personDisplay({ display_name: 'Sara' })).toEqual({ initials: 'S', name: 'Sara' })
  })

  /*
  4.1 gives display_name the note "null after deletion, rendered 'Deleted
  user'", and AC-178 asserts that string. Unreachable from an assignee in
  practice, 8.10 step 4 clearing the deleted account's assignments before it
  scrubs the row, which is why the branch is pinned here rather than left to a
  page to discover.
  */
  test('a scrubbed row renders 4.1\'s string, and its initials come from it', () => {
    expect(personDisplay({ display_name: null })).toEqual({
      initials: 'DU',
      name: DELETED_USER,
    })
  })

  /*
  **The three cases below are the regression that shipped, and they were the
  gap this file had.** Until the polish round of 2026-08-30 this function
  dropped `avatar_url` on the floor, so a person's own photograph appeared on a
  card and on a board and vanished the moment the same person was drawn on a
  row: one seam, one omission, every list view in the product. It was found by
  a human looking at the product, not by anything here.

  The fix landed and the guard did not. Every fixture in this file passed
  `avatar_url: null`, which exercises only the branch that was never broken, so
  the same omission could be reintroduced today and this suite would stay
  green. The first case pins it; the other two pin the shape the fallback
  depends on.
  */
  test('a picture is carried through, which is what the row draws', () => {
    expect(
      personDisplay({ display_name: 'Sara Ali', avatar_url: 'https://example.test/sara.jpg' }),
    ).toEqual({ initials: 'SA', name: 'Sara Ali', image: 'https://example.test/sara.jpg' })
  })

  /*
  Absent and null are one answer, and the answer is the absence of the key
  rather than `image: null`. `components/person-face.tsx` chooses the tinted
  disc on the key not being there, so a null carried through would be a picture
  the browser tries and fails to load.
  */
  test('a null picture leaves no image key at all, which is the disc', () => {
    const shown = personDisplay({ display_name: 'Sara', avatar_url: null })
    expect(shown).toEqual({ initials: 'S', name: 'Sara' })
    expect('image' in shown).toBe(false)
  })

  test('a caller whose shape has no such column gets the same two-key answer', () => {
    const shown = personDisplay({ display_name: 'Sara' })
    expect(shown).toEqual({ initials: 'S', name: 'Sara' })
    expect('image' in shown).toBe(false)
  })
})

describe('folderDisplay: the id-keyed to name-keyed bridge', () => {
  /*
  **The colour is 4.3's since S17a and no longer 4.4's.** 9.6 retires the
  per-member column from every v2 surface in terms, so what a chip paints is
  the folder's own identity, the value its page's mark writes and every member
  reads. The second case below is the discriminating one and proves the
  opposite of what the first used to: a folder carrying a personal colour and
  no identity colour paints the neutral token, because nothing in v2 reads
  that column.
  */
  test('resolves the colour by id from the folders useFolders() returns', () => {
    const resolved = folderDisplay({ id: WORK, name: 'Work' }, [folder({ color: '#3366ff' })])
    expect(resolved.name).toBe('Work')
    expect(resolved.color).toBe('#3366ff')
  })

  test('the personal colour of 4.4 is not read at all', () => {
    expect(
      folderDisplay({ id: WORK, name: 'Work' }, [folder({ my_color: '#3366ff' })]).color,
    ).toBe(DEFAULT_FOLDER_COLOR)
  })

  /*
  4.3 makes the identity colour nullable, so a folder nobody has dressed needs
  a value. It is the token the designer's own fixtures give every folder, so
  no raw colour is written outside tokens.css (11.4).
  */
  test('a folder with no identity colour takes the design\'s neutral token', () => {
    expect(folderDisplay({ id: WORK, name: 'Work' }, [folder()]).color).toBe(
      DEFAULT_FOLDER_COLOR,
    )
    expect(DEFAULT_FOLDER_COLOR.startsWith('var(--')).toBe(true)
  })

  /*
  The mark travels with the colour, which is the whole of AC-243: one folder
  wears one glyph on its sidebar row, on a task's chip and in the tab menu
  because one function answers all three. An unset icon answers the plain
  folder, which is what makes replacing the literal safe.

  **It is read off `folderMark` rather than off `folderDisplay` since S23**,
  which is where it always came from and is now the only place it is offered.
  The lifted task row asks `components/folder-mark.tsx` for its own glyph, so
  the display trio carries the id the row cannot resolve for itself in place
  of a mark it can. One resolver either way, which is what this asserts.
  */
  test('the glyph is the folder\'s chosen one, and the plain folder where none is', () => {
    const chosen = folderMark(folder({ icon: 'car' })).icon
    const unset = folderMark(folder()).icon
    expect(chosen).toBe(markIcon('car'))
    expect(unset).toBe(markIcon(null))
    expect(chosen).not.toBe(unset)
  })

  /* The id the row needs and cannot resolve, which is what replaced the mark
     on this trio. It is the stub's own, so a card naming a folder the list
     has not caught up with still addresses the right one. */
  test('the folder\'s id rides the display, resolved or not', () => {
    expect(folderDisplay({ id: WORK, name: 'Work' }, [folder()]).id).toBe(WORK)
    expect(folderDisplay({ id: WORK, name: 'Work' }, []).id).toBe(WORK)
  })

  test('the id decides, not the name: two folders may share one name', () => {
    const mine = folder({ id: WORK, name: 'Home', color: '#111111' })
    const shared = folder({ id: INBOX, name: 'Home', color: '#222222' })
    expect(folderDisplay({ id: INBOX, name: 'Home' }, [mine, shared]).color).toBe('#222222')
  })

  test('the card\'s own stub is the fallback before the folder list arrives', () => {
    const resolved = folderDisplay({ id: WORK, name: 'Work' }, [])
    expect(resolved.name).toBe('Work')
    expect(resolved.color).toBe(DEFAULT_FOLDER_COLOR)
    expect(folderMark(undefined).icon).toBe(markIcon(null))
  })

  test('a folder renamed since the card was fetched renders its current name', () => {
    expect(
      folderDisplay({ id: WORK, name: 'Work' }, [folder({ name: 'Studio' })]).name,
    ).toBe('Studio')
  })
})

describe('folderRowDisplay: the sidebar row', () => {
  test('carries 8.11\'s pending tally and 9.1\'s route', () => {
    expect(folderRowDisplay(folder({ color: '#abcdef' }))).toEqual({
      name: 'Work',
      color: '#abcdef',
      icon: markIcon(null),
      pending: 3,
      href: `/app/folders/${WORK}`,
    })
  })

  test('a folder with no colour takes the same neutral token a row does', () => {
    expect(folderRowDisplay(folder()).color).toBe(DEFAULT_FOLDER_COLOR)
  })
})

describe('folder groups: his dialog is keyed by name and ours by id', () => {
  const home = folder({ id: INBOX, name: 'Home', my_shelf: 'Personal' })
  const work = folder({ id: WORK, name: 'Work', my_shelf: 'Studio' })
  const twin = folder({
    id: '00000000-0000-4000-8000-0000000000a3',
    name: 'Home',
    my_shelf: null,
  })

  test('an option carries the name, the colour and the label and no id', () => {
    expect(folderGroupOptions([home])).toEqual([
      { name: 'Home', color: DEFAULT_FOLDER_COLOR, label: 'Personal' },
    ])
  })

  /*
  4.3 puts one unique index on folders, one Inbox per account, and none on the
  name, so two accessible folders may share one. His onSubmit hands back
  display names, so a selected name resolves to every id that carries it: the
  alternative picks one of two identical rows and writes to a folder the
  person did not choose.
  */
  test('a name that two folders share resolves to both ids', () => {
    expect(folderIdsForNames(['Home'], [home, work, twin])).toEqual([home.id, twin.id])
  })

  test('a name nothing carries resolves to nothing', () => {
    expect(folderIdsForNames(['Nowhere'], [home, work])).toEqual([])
  })

  test('the ids come back in the order the folder list holds them', () => {
    expect(folderIdsForNames(['Work', 'Home'], [home, work])).toEqual([home.id, work.id])
  })

  test('the labels in use are distinct and ascending, per 9.1', () => {
    expect(folderGroupLabels([work, home, folder({ my_shelf: 'Personal' })])).toEqual([
      'Personal',
      'Studio',
    ])
  })

  test('a folder in no group contributes no label', () => {
    expect(folderGroupLabels([twin])).toEqual([])
  })
})

describe('folderLabelFields: 9.6 takes the label and the colour together', () => {
  /*
  4.4 makes both columns nullable and 7.4 takes them in one body, so this
  mapping is null-to-absent in both directions and nothing else. The colour's
  absence is `undefined` rather than a hex of this module's own, which is
  11.4's ruling: a client that supplied one from its own swatches would tell a
  person they picked a colour they did not. AC-181 reads both values back
  through 7.4 and asserts the colour is the one that was chosen.
  */
  test('a folder carrying both hands both back', () => {
    expect(
      folderLabelFields({ my_shelf: 'Personal', my_color: '#7B2D8E' }),
    ).toEqual({ label: 'Personal', color: '#7B2D8E' })
  })

  test('no label is the empty string, which is what a text box holds', () => {
    expect(folderLabelFields({ my_shelf: null, my_color: '#7B2D8E' }).label).toBe('')
  })

  test('no colour is undefined and never the token a dot is painted with', () => {
    const fields = folderLabelFields({ my_shelf: 'Personal', my_color: null })
    expect(fields.color).toBeUndefined()
    expect(fields.color).not.toBe(DEFAULT_FOLDER_COLOR)
  })
})

describe('inviteRowDisplay: 9.8\'s row sentence, in its two forms', () => {
  const inviter = { display_name: 'Hassan' }

  /*
  The sentence is normative in 9.8 and it is also how AC-172 tells one row's
  Accept from another's, the gate being a region the ruling deliberately left
  unnamed. So the two forms are pinned character for character.
  */
  test('a folder invite names the folder', () => {
    expect(
      inviteRowDisplay({ id: 'i1', inviter, folder_name: 'Wedding' }).sentence,
    ).toBe('Hassan invited you to Wedding')
  })

  test('a bare invite says connect, which is 7.5\'s null discriminator', () => {
    const row = inviteRowDisplay({ id: 'i1', inviter, folder_name: null })
    expect(row.sentence).toBe('Hassan invited you to connect')
    expect(row.isFolder).toBe(false)
  })

  /*
  7.5's element makes the inviter's display name nullable like every other
  person in this API. "Someone" and not "Deleted user": 8.10 scrubs an
  account's own invites, so a null here is a person who never set a name.
  */
  test('an inviter with no display name is Someone', () => {
    const row = inviteRowDisplay({
      id: 'i1',
      inviter: { display_name: null },
      folder_name: 'Wedding',
    })
    expect(row.sentence).toBe('Someone invited you to Wedding')
    expect(row.initials).toBe('S')
  })

  test('the initials come from the rendered name, so the two cannot disagree', () => {
    expect(
      inviteRowDisplay({
        id: 'i1',
        inviter: { display_name: 'Sara Khan' },
        folder_name: null,
      }).initials,
    ).toBe('SK')
  })
})

describe('taskRowDisplay: one 7.0 card as his row takes it', () => {
  test('the plain fields pass through unchanged', () => {
    const props = taskRowDisplay(
      card({ title: 'Water the plants', status: 'abandoned', important: true }),
      context(),
    )
    expect(props.title).toBe('Water the plants')
    expect(props.status).toBe('abandoned')
    expect(props.important).toBe(true)
  })

  test('the folder resolves by id and the page may suppress it (Q2)', () => {
    /* The identity of 4.3 rather than 4.4's personal pair, since S17a: what a
       chip draws is the folder's own mark and colour, so a car picked for
       Travel is on every row of it (AC-243). */
    const withFolders = context({ folders: [folder({ color: '#0f0f0f', icon: 'car' })] })
    /* The mark left this trio at S23 and the id took its place: the v2 row
       resolves its own glyph through `components/folder-mark.tsx`, which is
       the designer's own arrangement, and what it cannot resolve for itself
       is the id. `folderMark` is still the one resolver and is asserted
       above; AC-243 is unaffected either way. */
    expect(taskRowDisplay(card(), withFolders).folder).toEqual({
      id: WORK,
      name: 'Work',
      color: '#0f0f0f',
    })
    expect(
      taskRowDisplay(card(), { ...withFolders, showFolder: false }).folder,
    ).toBeUndefined()
  })

  /* 9.4: "assignee chip when not the viewer". */
  test('another person\'s row carries their initials and name', () => {
    const props = taskRowDisplay(
      card({ assignee: { id: OTHER, display_name: 'Sara Ali', avatar_url: null } }),
      context(),
    )
    expect(props.assignee).toEqual({ initials: 'SA', name: 'Sara Ali' })
  })

  test('the viewer\'s own row carries no assignee chip', () => {
    const props = taskRowDisplay(
      card({ assignee: { id: VIEWER, display_name: 'Hassan', avatar_url: null } }),
      context(),
    )
    expect(props.assignee).toBeUndefined()
  })

  /* Q2 and Q3: "assignee chip except on rows in V's own default folder". */
  test('a row in the viewer\'s own default folder carries no assignee chip', () => {
    const props = taskRowDisplay(
      card({
        folder: { id: INBOX, name: 'Inbox', is_default: true },
        assignee: { id: OTHER, display_name: 'Sara', avatar_url: null },
      }),
      context(),
    )
    expect(props.assignee).toBeUndefined()
  })

  /* Q3: null assignee, folder with more than one member. */
  test('the unassigned chip needs both a null assignee and a shared folder', () => {
    const shared = context({ multiMemberFolderIds: new Set([WORK]) })
    expect(taskRowDisplay(card(), shared).unassigned).toBe(true)
    expect(
      taskRowDisplay(
        card({ assignee: { id: OTHER, display_name: 'Sara', avatar_url: null } }),
        shared,
      ).unassigned,
    ).toBe(false)
    expect(
      taskRowDisplay(card(), context({ multiMemberFolderIds: new Set([INBOX]) })).unassigned,
    ).toBe(false)
  })

  test('a page that passes no member set shows no unassigned chip', () => {
    expect(taskRowDisplay(card(), context()).unassigned).toBe(false)
  })

  /*
  9.4: the pulled marker and its un-pull control are My Day's, and are "absent
  when the row also qualifies automatically". Q1's automatic disjunct is the
  whole condition: assigned to the viewer, dated, on or before today.
  */
  test('the pulled marker is My Day\'s alone', () => {
    const pulled = card({ pulled: true })
    expect(taskRowDisplay(pulled, context()).pulled).toBe(false)
    expect(taskRowDisplay(pulled, context({ showPullMarker: true })).pulled).toBe(true)
  })

  test('a row that qualifies automatically shows no un-pull control', () => {
    const qualifying = card({
      pulled: true,
      assignee: { id: VIEWER, display_name: 'Hassan', avatar_url: null },
      due_date: '2026-08-09',
    })
    expect(taskRowDisplay(qualifying, context({ showPullMarker: true })).pulled).toBe(false)
  })

  test('a pulled row assigned to someone else still shows the control', () => {
    const someoneElse = card({
      pulled: true,
      assignee: { id: OTHER, display_name: 'Sara', avatar_url: null },
      due_date: '2026-08-09',
    })
    expect(taskRowDisplay(someoneElse, context({ showPullMarker: true })).pulled).toBe(true)
  })

  test('a pulled row dated after today still shows the control', () => {
    const future = card({
      pulled: true,
      assignee: { id: VIEWER, display_name: 'Hassan', avatar_url: null },
      due_date: '2026-08-11',
    })
    expect(taskRowDisplay(future, context({ showPullMarker: true })).pulled).toBe(true)
  })

  /*
  The same rule read against the **activation** date, which is what Q1's
  clause compares since issue #217: the start date where a task has one and
  the due date otherwise.

  This is the case that was live on My Day between 2026-09-20 and the fix.
  The server admitted a started task automatically and this file still asked
  whether the due date had arrived, so the un-pull control was drawn on a row
  that qualifies without any entry - and 7.8 makes DELETE remove the entry and
  leave the task on the page, so pressing it deleted something and changed
  nothing a person could see. AC-165 pins the rule and has no test file, cut
  on 2026-09-20, so this is what watches it.
  */
  test('a row that qualifies from its start date shows no un-pull control', () => {
    const started = card({
      pulled: true,
      assignee: { id: VIEWER, display_name: 'Hassan', avatar_url: null },
      start_date: '2026-08-07',
      due_date: '2026-08-17',
    })
    expect(taskRowDisplay(started, context({ showPullMarker: true })).pulled).toBe(false)
    const startOnly = card({
      pulled: true,
      assignee: { id: VIEWER, display_name: 'Hassan', avatar_url: null },
      start_date: '2026-08-10',
    })
    expect(taskRowDisplay(startOnly, context({ showPullMarker: true })).pulled).toBe(false)
  })

  test('a pulled row whose Schedule has not begun still shows the control', () => {
    // The other arm of Q1's OR, and the one AC-450 seeds: a task starting
    // tomorrow is here by the entry alone, so the entry is removable.
    const notYet = card({
      pulled: true,
      assignee: { id: VIEWER, display_name: 'Hassan', avatar_url: null },
      start_date: '2026-08-11',
      due_date: '2026-08-20',
    })
    expect(taskRowDisplay(notYet, context({ showPullMarker: true })).pulled).toBe(true)
  })

  test('steps arrive as a done-and-total pair, and vanish when there are none', () => {
    expect(taskRowDisplay(card({ steps_done: 2, steps_total: 5 }), context()).steps).toEqual({
      complete: 2,
      total: 5,
    })
    expect(taskRowDisplay(card(), context()).steps).toBeUndefined()
  })

  test('9.8\'s pending assignment invite arrives as the exact address', () => {
    expect(
      taskRowDisplay(card({ pending_invite_email: 'sara@example.com' }), context())
        .invitePending,
    ).toBe('sara@example.com')
    expect(taskRowDisplay(card(), context()).invitePending).toBeUndefined()
  })

  /*
  Q4 turns the star's tooltip outward on Important and nowhere else, in its own
  words, and the date there is the card's own rather than the design's format
  because Q4's example writes it that way.
  */
  test('the star tooltip is silent inward and Q4\'s sentence outward', () => {
    expect(taskRowDisplay(card(), context()).importantTooltip).toBeUndefined()
    expect(
      taskRowDisplay(card({ due_date: '2026-07-28' }), context({ starTooltip: 'outward' }))
        .importantTooltip,
    ).toBe('Also in Scheduled, due 2026-07-28')
    expect(
      taskRowDisplay(card(), context({ starTooltip: 'outward' })).importantTooltip,
    ).toBe('Also in Anytime, in Work')
  })

  /*
  Q4's third form, and the reason it exists.

  The two blocks of Important are Q3's and Q2's membership since issue #216,
  not a column's, so a Start-only row leads the Scheduled block. This tooltip
  split on the due date, so the same page drew that row first and told the
  person it was "Also in Anytime" - a row contradicting the list it was
  sitting in. 9.5: the tooltip names "the fact that home would show", which
  for a Start-only row on Scheduled is the Start Date it is placed by.
  */
  test('a start-only row names Scheduled and the date it is placed by', () => {
    expect(
      taskRowDisplay(
        card({ start_date: '2026-09-28' }),
        context({ starTooltip: 'outward' }),
      ).importantTooltip,
    ).toBe('Also in Scheduled, starts 2026-09-28')
    // A pair still names its deadline, which is the date Scheduled places it
    // under: one form per Schedule state and no row gets two.
    expect(
      taskRowDisplay(
        card({ start_date: '2026-09-20', due_date: '2026-09-30' }),
        context({ starTooltip: 'outward' }),
      ).importantTooltip,
    ).toBe('Also in Scheduled, due 2026-09-30')
  })

  /*
  And the badge is the other half of the same page: 9.5 says "a Start Date
  passing is not overdue and is not styled as one", 8.1 keeping overdue a
  relation to the deadline. A Start-only row has no deadline to pass, so it
  draws no due badge at all and cannot draw the overdue one.
  */
  test('a spent start date draws no due badge and no overdue styling', () => {
    expect(taskRowDisplay(card({ start_date: '2026-08-01' }), context()).due).toBeUndefined()
    expect(
      taskRowDisplay(card({ start_date: '2026-08-01', due_date: '2026-08-20' }), context())
        .due,
    ).toEqual({ label: 'Due 20 Aug' })
  })

  /*
  polish: places F8. The row carries the one fact 7.0 gives a card about a
  repeat, that there is one; the rule itself is TaskDetail's and is never
  invented here. Left unset, the inline card said "Does not repeat" over a
  task the panel beside it called weekly.
  */
  test('a recurring card fills his recurrence prop with the fact and not a rule', () => {
    expect(taskRowDisplay(card({ is_recurring: true }), context()).recurrence).toBe('Repeats')
    expect(taskRowDisplay(card({ is_recurring: false }), context()).recurrence).toBeUndefined()
  })

  test('the same card and the same today give the same props', () => {
    const task = card({ due_date: '2026-08-06', steps_done: 1, steps_total: 3 })
    expect(taskRowDisplay(task, context())).toEqual(taskRowDisplay(task, context()))
  })
})

describe('the module reads no clock of its own', () => {
  const source = presentersSource

  /*
  api/tz.ts's header says it is the only place this client evaluates a date,
  and every function above takes today as an argument so that the answer is
  the one the tz parameter on the fetching request was computed against. A
  second clock here would disagree with the server's grouping in the hours
  around midnight, which is this role's named hazard: "client-side date
  filtering that contradicts the server's timezone anchor". The check is on the
  source because the failure is an absence, and no call can assert one.
  */
  test('no Date construction, no Date.now, no locale date formatting', () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/new Date\b/)
    expect(code).not.toMatch(/Date\.now\b/)
    expect(code).not.toMatch(/Intl\./)
    expect(code).not.toMatch(/toLocaleDateString|toLocaleTimeString/)
  })

  test('the one date read goes through api/tz.ts', () => {
    expect(source).toContain("from '../api/tz.js'")
    expect(typeof presenterToday()).toBe('string')
    expect(presenterToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
