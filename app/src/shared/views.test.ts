/*
Unit tests for the 7.10 contract: the query parameters, the cursor codec, the
cap allocation, and the nine bodies.

These do not overlap the acceptance suite and cannot: nothing under app/tests
imports app/src/shared, by the standing Steward ruling that the suite measures
this directory and cannot borrow its definition of correct. So AC-125 to
AC-130 will judge the routes when they land, and these judge the schemas the
routes are built from. Where a case pins the same sentence a criterion pins,
it says which criterion, so a later reader can tell a duplicate from a
coincidence.

Each case below was red-proven against a specific wrong implementation, named
where it is not obvious, because a green assertion with no discrimination
evidence cannot be told apart from one that asserts nothing.
*/
import { describe, expect, test } from 'vitest'

import type { TaskCard } from './tasks.js'
import {
  LIST_ROW_CAP,
  decodeCompletedCursor,
  decodeSearchCursor,
  doneQuery,
  encodeCompletedCursor,
  encodeSearchCursor,
  folderTasksQuery,
  getAllResponse,
  getDoneResponse,
  getFolderTasksCompletedResponse,
  getFolderTasksOpenResponse,
  getImportantResponse,
  getMyDayResponse,
  getPlannedCalendarResponse,
  getPlannedResponse,
  getSearchResponse,
  getTasksViewResponse,
  plannedCalendarQuery,
  searchQuery,
  takeCapped,
  viewQuery,
} from './views.js'

const UUID = '11111111-1111-4111-8111-111111111111'
const OTHER_UUID = '22222222-2222-4222-8222-222222222222'

/** Every field 7.0 gives a TaskCard, so a body under test fails on the thing
 * it is about rather than on a row that was never a card. */
function card(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: UUID,
    title: 'a card',
    status: 'pending',
    important: false,
    due_date: null,
    due_time: null,
    folder: { id: OTHER_UUID, name: 'Inbox', is_default: true },
    assignee: null,
    is_recurring: false,
    steps_done: 0,
    steps_total: 0,
    pulled: false,
    pending_invite_email: null,
    created_at: '2026-08-07T10:00:00.000Z',
    updated_at: '2026-08-07T10:00:00.000Z',
    ...overrides,
  }
}

function cards(count: number): TaskCard[] {
  return Array.from({ length: count }, () => card())
}

/** The field names a failure blames, which is what 10.3 requires of every 422
 * it produces and what sendValidationError reads. */
function fieldsOf(result: { success: boolean; error?: { issues: readonly { path: readonly PropertyKey[] }[] } }): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.path.map(String).join('.'))
}

describe('the tz every view endpoint takes (7.0, AC-130)', () => {
  test('a valid IANA identifier parses', () => {
    expect(viewQuery.parse({ tz: 'Pacific/Honolulu' })).toEqual({
      tz: 'Pacific/Honolulu',
    })
  })

  test('a tzdb alias is a valid zone, not an invalid one', () => {
    // 8.1 counts US/Eastern and America/New_York as one zone. Red-proven
    // against tightening the validator into a canonical-name whitelist.
    expect(viewQuery.parse({ tz: 'US/Eastern' }).tz).toBe('US/Eastern')
  })

  test('an absent tz fails, naming the field', () => {
    /*
    The sharper half of 7.0's rule as the owner ruled it on 2026-08-07, and
    the reason viewTz carries no default: an implementation reading tz through
    a schema defaulted to UTC satisfies the invalid half exactly, because a
    present wrong value reaches the validator and an absent one never does.
    Red-proven by giving viewTz .default('UTC'), which turns this case red
    and leaves every other case in this file green.
    */
    const result = viewQuery.safeParse({})
    expect(result.success).toBe(false)
    expect(fieldsOf(result)).toEqual(['tz'])
  })

  test('an empty tz fails like an absent one rather than defaulting', () => {
    expect(viewQuery.safeParse({ tz: '' }).success).toBe(false)
  })

  test('an ECMA-402 offset identifier fails', () => {
    // 11.15's hole: bare Intl.DateTimeFormat accepts +05:30, which the 11.9
    // zone math cannot use. Red-proven against refining with bare Intl
    // instead of the shared isIanaTimezone and its sign guard.
    for (const value of ['+05:30', '-08:00']) {
      expect(viewQuery.safeParse({ tz: value }).success, value).toBe(false)
    }
  })

  test('shapes that are not IANA names fail', () => {
    for (const value of ['Not/AZone', 'Europe/Atlantis', 'UTC+2', 'Etc/GMT+99']) {
      expect(viewQuery.safeParse({ tz: value }).success, value).toBe(false)
    }
  })

  test('a repeated parameter is an array and fails, naming the field', () => {
    // Express hands a repeated query parameter through as an array under both
    // parsers. Red-proven against z.coerce.string(), which would take the
    // array's join and validate a zone nobody sent.
    const result = viewQuery.safeParse({ tz: ['Asia/Tokyo', 'UTC'] })
    expect(result.success).toBe(false)
    expect(fieldsOf(result)).toEqual(['tz'])
  })

  test('an unknown parameter is stripped, not refused (7.0)', () => {
    expect(viewQuery.parse({ tz: 'UTC', zoom: 'month' })).toEqual({ tz: 'UTC' })
  })
})

describe("the calendar's start and end (7.10, 6 Q3C)", () => {
  test('two calendar dates parse', () => {
    expect(
      plannedCalendarQuery.parse({
        tz: 'UTC',
        start: '2026-07-01',
        end: '2026-08-31',
      }),
    ).toEqual({ tz: 'UTC', start: '2026-07-01', end: '2026-08-31' })
  })

  test('a date that does not exist fails, naming the field', () => {
    const result = plannedCalendarQuery.safeParse({
      tz: 'UTC',
      start: '2026-02-30',
      end: '2026-03-05',
    })
    expect(result.success).toBe(false)
    expect(fieldsOf(result)).toEqual(['start'])
  })

  test('an instant is not a calendar date', () => {
    // 4.11's boundaries are civil dates. Red-proven against z.string(), which
    // would let a timestamp through and reintroduce the zone the floating
    // format exists to remove.
    expect(
      plannedCalendarQuery.safeParse({
        tz: 'UTC',
        start: '2026-07-01T00:00:00Z',
        end: '2026-08-31',
      }).success,
    ).toBe(false)
  })

  test('both are required', () => {
    const result = plannedCalendarQuery.safeParse({ tz: 'UTC' })
    expect(result.success).toBe(false)
    expect(fieldsOf(result).sort()).toEqual(['end', 'start'])
  })

  test('the range rules are not asserted here, and the reason is recorded', () => {
    /*
    An inverted range and a 400-day range both parse: this schema validates
    shapes, and Q3C's two range rules are calendar arithmetic, which
    src/server/time owns and the route asks. The case exists so that a reader
    who expects the refusal here finds the seam rather than concluding it was
    forgotten; AC-125 pins both refusals on the wire.
    */
    expect(
      plannedCalendarQuery.safeParse({
        tz: 'UTC',
        start: '2026-08-31',
        end: '2026-07-01',
      }).success,
    ).toBe(true)
  })
})

describe('the search query (6 Q8, 10.3, AC-128)', () => {
  test('two characters are accepted and one is refused', () => {
    expect(searchQuery.parse({ tz: 'UTC', q: 'zq' }).q).toBe('zq')
    const result = searchQuery.safeParse({ tz: 'UTC', q: 'z' })
    expect(result.success).toBe(false)
    expect(fieldsOf(result)).toEqual(['q'])
  })

  test('one hundred characters are accepted and one hundred and one refused', () => {
    const long = 'x'.repeat(100)
    expect(searchQuery.parse({ tz: 'UTC', q: long }).q).toBe(long)
    expect(searchQuery.safeParse({ tz: 'UTC', q: `${long}x` }).success).toBe(
      false,
    )
  })

  test('the length is measured after trimming', () => {
    // Verified against the installed zod 4.4.3 rather than recalled (11.15):
    // .trim() runs before the length checks, so this is a query of one.
    expect(searchQuery.safeParse({ tz: 'UTC', q: '   z   ' }).success).toBe(
      false,
    )
  })

  test('and the trimmed value is what the query gets', () => {
    // The other half of the same operation, which an implementation can do
    // separately: red-proven against dropping .trim(), which passes the case
    // above only when the length check is written over a trimmed copy while
    // the untrimmed original is what reaches the pattern.
    expect(searchQuery.parse({ tz: 'UTC', q: '  zq  ' }).q).toBe('zq')
  })

  test('an empty and an absent q both fail', () => {
    expect(searchQuery.safeParse({ tz: 'UTC', q: '' }).success).toBe(false)
    expect(searchQuery.safeParse({ tz: 'UTC' }).success).toBe(false)
  })

  test("the value is the user's literal, unescaped", () => {
    /*
    Q8's wildcard escaping, ruled on 2026-08-07, happens where the ILIKE
    pattern is built. Escaping here would hand the query a value it would
    escape a second time, so a search for "50%" would look for "50\%" in the
    text. The parsed value is the literal the user typed.
    */
    expect(searchQuery.parse({ tz: 'UTC', q: '50% off_now\\then' }).q).toBe(
      '50% off_now\\then',
    )
  })
})

describe("the folder page's section (7.10 as ruled 2026-08-07, AC-058)", () => {
  test('an absent section defaults to open', () => {
    expect(folderTasksQuery.parse({ tz: 'UTC' })).toEqual({
      tz: 'UTC',
      section: 'open',
    })
  })

  test('both enumerated values parse', () => {
    expect(folderTasksQuery.parse({ tz: 'UTC', section: 'completed' }).section).toBe(
      'completed',
    )
    expect(folderTasksQuery.parse({ tz: 'UTC', section: 'open' }).section).toBe(
      'open',
    )
  })

  test('a value outside the enumeration fails, naming the field', () => {
    // Absent means open by the ruling, and a wrong value is not absent.
    // Red-proven against .catch('open'), which would silently answer the open
    // section to a request for a section that does not exist.
    const result = folderTasksQuery.safeParse({ tz: 'UTC', section: 'abandoned' })
    expect(result.success).toBe(false)
    expect(fieldsOf(result)).toEqual(['section'])
  })

  test('an empty section is a present wrong value, not an absent one', () => {
    expect(folderTasksQuery.safeParse({ tz: 'UTC', section: '' }).success).toBe(
      false,
    )
  })
})

describe('the cursor Q6 and Q8 page by', () => {
  const completedAt = '2026-08-07T10:11:12.123456Z'

  test('a completed position round trips', () => {
    const cursor = encodeCompletedCursor({ completed_at: completedAt, id: UUID })
    expect(decodeCompletedCursor(cursor)).toEqual({
      completed_at: completedAt,
      id: UUID,
    })
  })

  test('microsecond precision survives the round trip', () => {
    /*
    The defect this pins: a codec that parses the instant into a Date loses
    everything below the millisecond, and Postgres stores timestamptz to the
    microsecond. Two rows completed inside one millisecond then sit either
    side of a rounded cursor, so one is re-emitted or skipped at a page
    boundary. This build has already shipped one false green from that family.

    The second assertion is the discrimination evidence, measured here rather
    than asserted about: it shows that the truncating implementation produces a
    different string, so the first assertion cannot pass under it.
    */
    const decoded = decodeCompletedCursor(
      encodeCompletedCursor({ completed_at: completedAt, id: UUID }),
    )
    expect(decoded?.completed_at).toBe(completedAt)
    expect(new Date(completedAt).toISOString()).not.toBe(completedAt)
  })

  test('a Date is refused rather than truncated', () => {
    // The same hazard on the way in: a caller handing over a driver-parsed
    // Date gets a throw here instead of a millisecond-rounded position.
    expect(() =>
      encodeCompletedCursor({
        completed_at: new Date(completedAt) as unknown as string,
        id: UUID,
      }),
    ).toThrow()
  })

  test('an instant with no zone marker is refused', () => {
    expect(() =>
      encodeCompletedCursor({ completed_at: '2026-08-07 10:11:12', id: UUID }),
    ).toThrow()
  })

  test('a search position round trips with its status', () => {
    const cursor = encodeSearchCursor({
      status: 'completed',
      updated_at: completedAt,
      id: UUID,
    })
    expect(decodeSearchCursor(cursor)).toEqual({
      status: 'completed',
      updated_at: completedAt,
      id: UUID,
    })
  })

  test("one endpoint's cursor does not decode as another's", () => {
    /*
    The behavior a caller depends on, and the one case in this file that no
    single mutation turns red: two guards refuse this independently, the kind
    stamped in the envelope and the payload schema, and removing either leaves
    the other holding. That is why each is proven on its own below, in "the
    kind is what separates them" and in "a payload missing a key does not
    decode", rather than through this one.
    */
    const search = encodeSearchCursor({
      status: 'pending',
      updated_at: completedAt,
      id: UUID,
    })
    expect(decodeCompletedCursor(search)).toBeUndefined()
    const completed = encodeCompletedCursor({
      completed_at: completedAt,
      id: UUID,
    })
    expect(decodeSearchCursor(completed)).toBeUndefined()
  })

  test('and the kind is what separates them, not the payload happening to differ', () => {
    /*
    The case above passes with the kind removed entirely, because Q6's keys
    and Q8's keys have no shape in common today: a search payload has no
    completed_at and fails the completed schema on its own. That makes the
    kind an unproven guard, and an unproven guard is one nobody notices
    breaking, so it is asserted directly here instead: an envelope stamped
    search carrying a payload the completed schema would accept must still not
    decode as a completed position. Measured rather than assumed, since the
    two key sets could converge later; Q7's completed section already pages
    the same keys as Q6 and is one kind with it deliberately.

    Red-proven against dropping the k comparison from decodeCursor.
    */
    const forged = btoa(
      JSON.stringify({
        v: 1,
        k: 'search',
        p: { completed_at: completedAt, id: UUID },
      }),
    )
    expect(decodeCompletedCursor(forged)).toBeUndefined()
  })

  test('a cursor from another version does not decode', () => {
    const forged = btoa(
      JSON.stringify({ v: 2, k: 'completed', p: { completed_at: completedAt, id: UUID } }),
    )
    expect(decodeCompletedCursor(forged)).toBeUndefined()
  })

  test('a truncated or scrambled cursor does not decode', () => {
    const cursor = encodeCompletedCursor({ completed_at: completedAt, id: UUID })
    expect(decodeCompletedCursor(cursor.slice(0, -4))).toBeUndefined()
    expect(decodeCompletedCursor('not-a-cursor')).toBeUndefined()
    expect(decodeCompletedCursor('')).toBeUndefined()
  })

  test('a payload missing a key does not decode', () => {
    const forged = btoa(JSON.stringify({ v: 1, k: 'completed', p: { id: UUID } }))
    expect(decodeCompletedCursor(forged)).toBeUndefined()
  })

  test('every cursor is URL safe, and plain base64 would not have been', () => {
    /*
    A cursor rides a query string, so a + or a / in it is a value the wire can
    change under the client. The second expectation is the discrimination
    evidence: it measures that this fixture really does exercise the
    replacement, so removing the +/ substitution from toBase64Url turns the
    first expectation red rather than leaving it vacuous.
    */
    const positions = Array.from({ length: 64 }, (_, index) => ({
      completed_at: `2026-08-07T10:11:12.${String(index).padStart(6, '0')}Z`,
      id: `1111111${String(index % 10)}-1111-4111-8111-111111111111`,
    }))
    const encoded = positions.map((position) => encodeCompletedCursor(position))
    expect(encoded.every((cursor) => encodeURIComponent(cursor) === cursor)).toBe(
      true,
    )
    const plain = positions.map((position) =>
      btoa(JSON.stringify({ v: 1, k: 'completed', p: position })),
    )
    expect(plain.some((value) => /[+/=]/.test(value))).toBe(true)
  })
})

describe('the cursor as a query parameter', () => {
  const position = { completed_at: '2026-08-07T10:11:12.123456Z', id: UUID }

  test('an absent cursor is the first page', () => {
    expect(doneQuery.parse({ tz: 'UTC' })).toEqual({ tz: 'UTC' })
  })

  test('a cursor parses into the position it names', () => {
    const parsed = doneQuery.parse({
      tz: 'UTC',
      cursor: encodeCompletedCursor(position),
    })
    expect(parsed.cursor).toEqual(position)
  })

  test('a malformed cursor fails, naming the field', () => {
    // One refusal for every way a cursor can be wrong, so a client reads one
    // sentence rather than several.
    const result = doneQuery.safeParse({ tz: 'UTC', cursor: 'garbage' })
    expect(result.success).toBe(false)
    expect(fieldsOf(result)).toEqual(['cursor'])
  })

  test("search refuses Done's cursor, naming the field", () => {
    const result = searchQuery.safeParse({
      tz: 'UTC',
      q: 'needle',
      cursor: encodeCompletedCursor(position),
    })
    expect(result.success).toBe(false)
    expect(fieldsOf(result)).toEqual(['cursor'])
  })

  test('the folder page takes the completed cursor beside its section', () => {
    const parsed = folderTasksQuery.parse({
      tz: 'UTC',
      section: 'completed',
      cursor: encodeCompletedCursor(position),
    })
    expect(parsed).toEqual({ tz: 'UTC', section: 'completed', cursor: position })
  })

  test("a cursor's kind names an order, so Done's cursor is the folder page's", () => {
    /*
    Asserted because the shape review recommends freezing it, and a
    recommendation nothing measures is a sentence that can be wrong on its
    first day. A cursor is portable between exactly the two endpoints that
    share one order: 6 Q7's third section is "Q6 predicate, order, and
    pagination, folder_id = F", so the position (completed_at, id) means the
    same thing to both, and one cursor kind serves them for that reason rather
    than by accident.

    The second half is the bound on that portability, and it is what keeps the
    claim from reading as "any cursor works anywhere": search keys a different
    order, so its cursor names no position here. Deliberately not claimed as
    red-proof of the kind stamp, which it is not: completedCursor requires a
    completed_at that a search payload does not carry, so the payload schema
    refuses this one on its own and dropping the kind comparison would leave
    the case green. The kind's own discrimination is proven above, in "the kind
    is what separates them", against a forged envelope built for that purpose.
    */
    const issuedByDone = doneQuery.parse({
      tz: 'UTC',
      cursor: encodeCompletedCursor(position),
    }).cursor
    const presentedToFolder = folderTasksQuery.parse({
      tz: 'UTC',
      section: 'completed',
      cursor: encodeCompletedCursor(position),
    }).cursor
    expect(presentedToFolder).toEqual(issuedByDone)

    expect(
      folderTasksQuery.safeParse({
        tz: 'UTC',
        section: 'completed',
        cursor: encodeSearchCursor({
          status: 'completed',
          updated_at: position.completed_at,
          id: UUID,
        }),
      }).success,
      "search keys a different order, so its cursor names no position here",
    ).toBe(false)
  })
})

describe('the 1000-row cap (6 preamble as ruled 2026-08-07, 10.3, AC-129)', () => {
  test('everything fits under the cap and nothing is flagged', () => {
    const taken = takeCapped([cards(3), cards(4)])
    expect(taken.sections.map((section) => section.length)).toEqual([3, 4])
    expect(taken.truncated).toBe(false)
  })

  test('exactly the cap is complete, not truncated', () => {
    // A ceiling reached is not a row dropped. Red-proven against a >= test.
    const taken = takeCapped([cards(LIST_ROW_CAP)])
    expect(taken.sections[0]?.length).toBe(LIST_ROW_CAP)
    expect(taken.truncated).toBe(false)
  })

  test('the cap is per response, so a later section gets what is left', () => {
    /*
    AC-129's own arrangement: All enumerates planned, then tasks_inbox, then
    tasks_groups, so five dated rows survive and the Tasks half takes the
    remaining 995. Red-proven against capping each section at 1000
    independently, which answers 1006 rows under one flag, and against
    filling in any other order, which answers the same total with a different
    page.
    */
    const taken = takeCapped([cards(5), cards(LIST_ROW_CAP + 1), cards(4)])
    expect(taken.sections.map((section) => section.length)).toEqual([
      5,
      LIST_ROW_CAP - 5,
      0,
    ])
    expect(taken.truncated).toBe(true)
  })

  test('a section that exhausts the cap leaves the rest empty', () => {
    const taken = takeCapped([cards(LIST_ROW_CAP + 1), cards(4)])
    expect(taken.sections.map((section) => section.length)).toEqual([
      LIST_ROW_CAP,
      0,
    ])
    expect(taken.truncated).toBe(true)
  })

  test('the kept rows are a prefix of each section', () => {
    const rows = ['a', 'b', 'c']
    expect(takeCapped([rows]).sections[0]).toEqual(rows)
  })
})

describe('the nine bodies of 7.10', () => {
  test('My Day carries Q1 twice and Q1R once', () => {
    const body = {
      carried: [card()],
      today: [card()],
      recap: [card({ status: 'completed' })],
      truncated: false,
    }
    expect(getMyDayResponse.parse(body)).toEqual(body)
  })

  test('a body missing its flag is refused', () => {
    expect(
      getMyDayResponse.safeParse({ carried: [], today: [], recap: [] }).success,
    ).toBe(false)
  })

  test('a row that is not a TaskCard is refused', () => {
    // The guard the RFC 0001 P4 row asks for by name: this package writes a
    // second producer of the frozen shape, and every row of every body is
    // parsed through the one schema.
    const { pulled: _pulled, ...withoutPulled } = card()
    expect(
      getPlannedResponse.safeParse({ rows: [withoutPulled], truncated: false })
        .success,
    ).toBe(false)
  })

  test('a capped body refuses more rows than the cap allows', () => {
    expect(
      getPlannedResponse.safeParse({
        rows: cards(LIST_ROW_CAP + 1),
        truncated: true,
      }).success,
    ).toBe(false)
    expect(
      getPlannedResponse.safeParse({ rows: cards(LIST_ROW_CAP), truncated: true })
        .success,
    ).toBe(true)
  })

  test('and it counts across sections rather than within one', () => {
    /*
    The per-response reading, which is the ruled one: three sections of 400
    are 1200 rows under a single flag, and a per-array cap has no way to
    report it. Red-proven against a .max(1000) on each array, which accepts
    this body.
    */
    expect(
      getMyDayResponse.safeParse({
        carried: cards(400),
        today: cards(400),
        recap: cards(400),
        truncated: true,
      }).success,
    ).toBe(false)
  })

  test('Tasks counts its grouped rows too', () => {
    expect(
      getTasksViewResponse.safeParse({
        inbox: cards(600),
        groups: [{ folder: card().folder, rows: cards(401) }],
        truncated: true,
      }).success,
    ).toBe(false)
  })

  test("a group's folder is the TaskCard stub", () => {
    const body = {
      inbox: [],
      groups: [{ folder: { id: UUID, name: 'Work', is_default: false }, rows: [card()] }],
      truncated: false,
    }
    expect(getTasksViewResponse.parse(body)).toEqual(body)
    expect(
      getTasksViewResponse.safeParse({
        inbox: [],
        groups: [{ folder: { id: UUID, name: 'Work' }, rows: [card()] }],
        truncated: false,
      }).success,
      'is_default is one of the stub\'s three fields (7.0, 7.10 as ruled 2026-08-07)',
    ).toBe(false)
  })

  test('the calendar carries real rows and a virtual array', () => {
    const body = {
      real: [card({ due_date: '2026-07-04' })],
      virtual: [
        {
          task_id: UUID,
          title: 'weekly review',
          date: '2026-07-11',
          due_time: '09:00:00',
          folder_id: OTHER_UUID,
        },
      ],
    }
    expect(getPlannedCalendarResponse.parse(body)).toEqual(body)
  })

  test('an empty virtual array is the P4 answer, and the key is required', () => {
    // 7.10 enumerates the key, so it exists from this package on; what draws
    // in it is 8.5's projection, which P6 delivers and AC-082 pins.
    expect(
      getPlannedCalendarResponse.parse({ real: [], virtual: [] }).virtual,
    ).toEqual([])
    expect(getPlannedCalendarResponse.safeParse({ real: [] }).success).toBe(false)
  })

  test('a ghost is not a card and carries no status', () => {
    expect(
      getPlannedCalendarResponse.safeParse({
        real: [],
        virtual: [{ task_id: UUID, title: 'x', date: '2026-07-11' }],
      }).success,
    ).toBe(false)
  })

  test('the calendar has no truncated flag, being bounded by its range', () => {
    const parsed = getPlannedCalendarResponse.parse({
      real: [],
      virtual: [],
      truncated: false,
    })
    expect(Object.keys(parsed).sort()).toEqual(['real', 'virtual'])
  })

  test('All stacks Q3 over Q2 in one page', () => {
    const body = {
      planned: [card({ due_date: '2026-07-04' })],
      tasks_inbox: [card()],
      tasks_groups: [
        { folder: { id: UUID, name: 'Work', is_default: false }, rows: [card()] },
      ],
      truncated: false,
    }
    expect(getAllResponse.parse(body)).toEqual(body)
  })

  test('Important is one list with a flag', () => {
    const body = { rows: [card({ important: true })], truncated: false }
    expect(getImportantResponse.parse(body)).toEqual(body)
  })

  test('Done answers days and a cursor', () => {
    const body = {
      days: [
        {
          date: '2026-08-07',
          rows: [card({ status: 'completed' })],
        },
      ],
      next_cursor: encodeCompletedCursor({
        completed_at: '2026-08-07T10:11:12.123456Z',
        id: UUID,
      }),
    }
    expect(getDoneResponse.parse(body)).toEqual(body)
  })

  test("a day's date is a civil date, never an instant", () => {
    // Which day a completion belongs to is a question only tz answers, and
    // the answer is a date (6 Q6). Red-proven against z.iso.datetime().
    expect(
      getDoneResponse.safeParse({
        days: [{ date: '2026-08-07T00:00:00Z', rows: [card()] }],
        next_cursor: null,
      }).success,
    ).toBe(false)
  })

  test('the last page carries a null cursor, and never an empty string', () => {
    expect(
      getDoneResponse.parse({ days: [], next_cursor: null }).next_cursor,
    ).toBeNull()
    expect(
      getDoneResponse.safeParse({ days: [], next_cursor: '' }).success,
    ).toBe(false)
  })

  test('the folder open section is scheduled, unscheduled and a flag', () => {
    const body = {
      scheduled: [card({ due_date: '2026-07-04' })],
      unscheduled: [card()],
      truncated: false,
    }
    expect(getFolderTasksOpenResponse.parse(body)).toEqual(body)
  })

  test('the folder completed section is Done entire', () => {
    // 6 Q7's third section is Q6's predicate, order and pagination narrowed
    // to one folder, so it answers one shape rather than a second one that
    // could drift from it.
    expect(getFolderTasksCompletedResponse).toBe(getDoneResponse)
  })

  test('search answers cards and a cursor, with no row variant', () => {
    const body = {
      rows: [card({ status: 'abandoned' })],
      next_cursor: null,
    }
    expect(getSearchResponse.parse(body)).toEqual(body)
  })
})
