/*
The EXPLAIN record this role's definition of done asks for, as the tool that
produces it rather than as a paragraph claiming it was produced.

RFC 0001's P4 row says why it cannot be a test: "at the row counts a test
database holds, a planner sequentially scans whatever indexes exist, so that
record is a committed artifact produced against seeded volume or with seqscan
disabled, never a test assertion, and a green suite is evidence for it in
neither direction". So this seeds volume, runs every statement the eight
queries of section 6 actually issue, and writes EXPLAIN.md beside itself.

Run it with:

    npx tsx src/server/views/explain.ts

The statements are not restated here. A spy Executor is handed to the same
view functions the router calls, and it EXPLAINs whatever SQL reaches it
before passing it through, so the recorded plan is provably the plan of the
statement the code runs rather than of a transcription that could drift from
it. That is the whole reason this file is thirty lines of seeding and no SQL
of its own.

Two passes are recorded for every statement. The first is the planner's own
choice at the seeded volume. The second is the same statement with
enable_seqscan off, which is the RFC's other option and answers a different
question: not what the planner does at this size, but which index it would
reach for when it has to choose one. Both are useful, and neither is
evidence about production, where the row counts and the statistics are not
these.

One wart, named rather than hidden: tsconfig.build.json excludes only tests
and the dev-login module, so this development tool is compiled into dist
along with the runtime. It imports nothing the server does not already load
and runs nothing on import, so the cost is a few unreachable kilobytes. The
tidy fix is one more entry in that file's exclude list, which belongs to the
Platform engineer; it is recorded here for the Steward rather than taken.
*/
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

import { createDbClient } from '../../../db/client.js'
import type { Db } from '../../../db/client.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'

import { plannedCalendarView } from './calendar.js'
import { completedPage } from './done.js'
import { folderOpenView } from './folder.js'
import { allView, importantView, plannedView, tasksView } from './lists.js'
import { myDayView } from './my-day.js'
import { searchView } from './search.js'

const TASKS_PER_FOLDER = 4_000
const VISIBLE_FOLDERS = 5
const HIDDEN_FOLDERS = 5

interface Recorded {
  label: string
  statement: string
  plan: string[]
  forced: string[]
}

const dialect = new PgDialect()

/*
Costs off and no ANALYZE: what this record is for is which relation each
statement reaches and by which index, and a committed artifact that changed
on every run because a timing moved by a microsecond would be a file nobody
reads twice.
*/
async function explain(db: Db, statement: SQL): Promise<string[]> {
  const plan = await rowsOf(db, sql`EXPLAIN (COSTS OFF) ${statement}`)
  return plan.map((row) => String(row['QUERY PLAN']))
}

/** The spy: every statement a view function issues is explained twice and
 * then run, so the record is of the statement rather than of a copy. */
function recording(db: Db, label: string, into: Recorded[]): Executor {
  let index = 0
  return {
    async execute(statement: SQL): Promise<unknown> {
      index += 1
      const plan = await explain(db, statement)
      await db.execute(sql`SET enable_seqscan = off`)
      const forced = await explain(db, statement)
      await db.execute(sql`SET enable_seqscan = on`)
      into.push({
        label: index === 1 ? label : `${label} (statement ${String(index)})`,
        statement: dialect.sqlToQuery(statement).sql,
        plan,
        forced,
      })
      return db.execute(statement)
    },
  }
}

async function seed(db: Db): Promise<{ viewer: string; folder: string }> {
  const people: string[] = []
  for (const slug of ['viewer', 'colleague', 'stranger']) {
    const inserted = await rowsOf(
      db,
      sql`INSERT INTO users (google_sub, email, display_name, timezone)
          VALUES (${`explain-${slug}`}, ${`${slug}@explain.test`}, ${slug},
                  'UTC')
          RETURNING id`,
    )
    people.push(String(inserted[0]?.id))
  }
  const [viewer, colleague, stranger] = people as [string, string, string]

  const folders: string[] = []
  const own = async (
    owner: string,
    name: string,
    isDefault: boolean,
    members: string[],
  ): Promise<string> => {
    const inserted = await rowsOf(
      db,
      sql`INSERT INTO folders (owner_id, name, is_default)
          VALUES (${owner}::uuid, ${name}, ${isDefault}) RETURNING id`,
    )
    const id = String(inserted[0]?.id)
    for (const member of members) {
      // Explicit since issue #228: this diagnostic builds a synthetic corpus
      // to read query plans over, and the preset it writes is the one
      // migration 0023 initializes a real folder to -- Full control for the
      // owner, Can edit for everybody else -- so the plans it measures are
      // the plans production has.
      await db.execute(
        sql`INSERT INTO folder_members (folder_id, user_id, access)
            VALUES (${id}::uuid, ${member}::uuid,
                    ${member === owner ? 'full_control' : 'can_edit'})`,
      )
    }
    return id
  }

  folders.push(await own(viewer, 'Desk', true, [viewer]))
  for (let i = 0; i < VISIBLE_FOLDERS; i += 1) {
    folders.push(
      await own(viewer, `visible ${String(i)}`, false, [viewer, colleague]),
    )
  }
  const hidden: string[] = []
  hidden.push(await own(stranger, 'Desk', true, [stranger]))
  for (let i = 0; i < HIDDEN_FOLDERS; i += 1) {
    hidden.push(await own(stranger, `hidden ${String(i)}`, false, [stranger]))
  }

  /*
  Every folder gets the same mix: a third completed, a sixth abandoned, half
  dated, a scattering of stars, and titles carrying a needle that matches one
  row in forty so search has something selective to find. The hidden half is
  the same size as the visible one, so a query that forgot ACCESSIBLE(V)
  would show up in the plan as twice the rows rather than as nothing.

  One row in ten carries a 4.11 rule, which lands on the dated rows because
  i % 10 = 0 is even and 4.11's CHECK admits no rule without a date, and each
  gets its own series_id because INV-7 allows one pending row per series.
  Q3C's projection fetch would otherwise plan against an empty predicate and
  the record would say nothing about the statement P6 added.
  */
  const fill = async (folderId: string, owner: string): Promise<void> => {
    await db.execute(sql`
      INSERT INTO tasks (folder_id, title, notes, status, important, due_date,
                         due_time, recurrence_rule, series_id, assignee_id,
                         created_by, completed_at,
                         completed_by, created_at, updated_at)
      SELECT ${folderId}::uuid,
             CASE WHEN i % 40 = 0 THEN 'quarterly needle ' || i::text
                  ELSE 'task ' || i::text END,
             CASE WHEN i % 7 = 0 THEN 'notes ' || i::text ELSE NULL END,
             CASE WHEN i % 3 = 0 THEN 'completed'
                  WHEN i % 6 = 1 THEN 'abandoned' ELSE 'pending' END,
             (i % 11 = 0),
             CASE WHEN i % 2 = 0
                  THEN CURRENT_DATE + ((i % 120) - 60) ELSE NULL END,
             CASE WHEN i % 4 = 0 THEN time '09:30' ELSE NULL END,
             CASE WHEN i % 10 = 0 THEN 'FREQ=WEEKLY;BYDAY=MO' ELSE NULL END,
             CASE WHEN i % 10 = 0 THEN gen_random_uuid() ELSE NULL END,
             ${owner}::uuid, ${owner}::uuid,
             CASE WHEN i % 3 = 0
                  THEN now() - (i * interval '7 minute') ELSE NULL END,
             CASE WHEN i % 3 = 0 THEN ${owner}::uuid ELSE NULL END,
             now() - (i * interval '3 minute'),
             now() - (i * interval '2 minute')
        FROM generate_series(1, ${TASKS_PER_FOLDER}) AS i
    `)
  }
  for (const folderId of folders) await fill(folderId, viewer)
  for (const folderId of hidden) await fill(folderId, stranger)

  // A My Day population for Q1's entry arm, and steps so the card's counts
  // have rows to count.
  await db.execute(sql`
    INSERT INTO my_day_entries (task_id, user_id, added_on)
    SELECT t.id, ${viewer}::uuid, CURRENT_DATE
      FROM tasks t
      JOIN folder_members m ON m.folder_id = t.folder_id
     WHERE m.user_id = ${viewer}::uuid AND t.status = 'pending'
     LIMIT 300
  `)
  await db.execute(sql`
    INSERT INTO steps (task_id, title, position)
    SELECT t.id, 'step', 1
      FROM tasks t
      JOIN folder_members m ON m.folder_id = t.folder_id
     WHERE m.user_id = ${viewer}::uuid
     LIMIT 2000
  `)

  await db.execute(sql`ANALYZE`)
  return { viewer, folder: folders[1] as string }
}

/*
The predicates of section 6, each on its own, with enable_seqscan off.

These are the only statements in this file written by hand rather than taken
from the module, and they are here because a whole-statement plan answers a
different question than this one. A view statement joins six relations, so
the planner is free to drive from folder_members and reach tasks by the
folder scope, which is a good plan and says nothing about whether the
query's own predicate can ride the index 4.12 names for it. These probes
strip the joins away and ask exactly that.
*/
function predicateProbes(
  viewer: string,
  folder: string,
): { label: string; where: SQL; expect: string }[] {
  return [
    {
      label: 'Q1: the automatic clause (assignee, status, activation date)',
      where: sql`t.assignee_id = ${viewer}::uuid AND t.status = 'pending'
                 AND coalesce(t.start_date, t.due_date) IS NOT NULL
                 AND coalesce(t.start_date, t.due_date) <= CURRENT_DATE`,
      expect: 'tasks_assignee_status_due_idx',
    },
    {
      label: 'Q2, Q3, Q5 and Q7: the folder scope with the open statuses',
      where: sql`t.folder_id = ${folder}::uuid
                 AND t.status IN ('pending', 'abandoned')`,
      expect: 'tasks_folder_status_due_idx',
    },
    {
      label:
        "Q3: Scheduled membership, which since issue #216 is an OR over two nullable columns",
      where: sql`t.status IN ('pending', 'abandoned')
                 AND (t.start_date IS NOT NULL OR t.due_date IS NOT NULL)`,
      expect: '4.12 names no index for this predicate, as for Q4s star',
    },
    {
      label: 'Q3C: the folder scope with a Schedule overlapping a date range',
      where: sql`t.folder_id = ${folder}::uuid
                 AND coalesce(t.start_date, t.due_date) <= CURRENT_DATE + 30
                 AND coalesce(t.due_date, t.start_date) >= CURRENT_DATE - 30`,
      expect: 'tasks_folder_status_due_idx',
    },
    {
      label:
        "Q3C's projection: the folder scope with pending and a rule, and no date at all",
      where: sql`t.folder_id = ${folder}::uuid AND t.status = 'pending'
                 AND t.recurrence_rule IS NOT NULL`,
      expect: 'tasks_folder_status_due_idx',
    },
    {
      label: 'Q4: the star, which 4.12 names no index for',
      where: sql`t.important = true AND t.status IN ('pending', 'abandoned')`,
      expect: 'no index on tasks.important exists',
    },
    {
      label: 'Q6: the keyset over completed rows',
      where: sql`t.status = 'completed'
                 AND (t.completed_at, t.id)
                     < (now(), '00000000-0000-0000-0000-000000000000'::uuid)`,
      expect: 'tasks_done_pagination_idx',
    },
    {
      label: 'Q8: the trigram match over title and notes',
      where: sql`(t.title ILIKE '%quarterly needle%'
                  OR t.notes ILIKE '%quarterly needle%')`,
      expect: 'tasks_search_trgm_idx',
    },
  ]
}

async function probePredicates(
  db: Db,
  viewer: string,
  folder: string,
): Promise<Recorded[]> {
  const records: Recorded[] = []
  for (const probe of predicateProbes(viewer, folder)) {
    const statement = sql`SELECT t.id FROM tasks t WHERE ${probe.where}`
    const plan = await explain(db, statement)
    await db.execute(sql`SET enable_seqscan = off`)
    const forced = await explain(db, statement)
    await db.execute(sql`SET enable_seqscan = on`)
    records.push({
      label: `${probe.label} (expected: ${probe.expect})`,
      statement: dialect.sqlToQuery(statement).sql,
      plan,
      forced,
    })
  }
  return records
}

function section(records: readonly Recorded[]): string[] {
  const lines: string[] = []
  for (const record of records) {
    lines.push(`### ${record.label}`, '', '```sql', record.statement, '```', '')
    lines.push('Planner choice:', '', '```', ...record.plan, '```', '')
    lines.push('enable_seqscan off:', '', '```', ...record.forced, '```', '')
  }
  return lines
}

function render(
  statements: readonly Recorded[],
  probes: readonly Recorded[],
  rowCount: number,
): string {
  return `${[
    '# EXPLAIN record: the eight queries of section 6',
    '',
    'Produced by `npx tsx src/server/views/explain.ts`. Regenerate it rather',
    'than editing it: every plan below is the plan of a statement this package',
    'actually issues, because the tool hands a spy executor to the same view',
    'functions the router calls and explains whatever SQL reaches it.',
    '',
    `Volume: ${String(rowCount)} task rows on PGlite (embedded Postgres 18),`,
    'half of them in folders the viewer is not a member of, with steps, My Day',
    'entries, and a needle matching one title in forty. ANALYZE was run before',
    'the first statement. Costs and timings are off, so this file changes only',
    'when a plan changes.',
    '',
    'Two plans per statement. **Planner choice** is what the planner picked at',
    'this volume. **enable_seqscan off** is the same statement with the',
    'sequential option removed, which is the other option RFC 0001 names and',
    'answers a different question: which index the statement can ride when the',
    'planner has to choose one.',
    '',
    'Neither is evidence about production, whose row counts and statistics are',
    'not these. What this file is evidence of is which relation each statement',
    'reaches and by which path, and that every predicate of section 6 can ride',
    'the index 4.12 names for it. Read the findings first; they are what the',
    'plans below were read for.',
    '',
    '## Findings',
    '',
    '1. **Every 4.12 index that section 6 names is reached by the predicate',
    '   it was created for, and since issue #217 one of them is reached by',
    '   fewer of its columns.** The probes at the end show each index chosen:',
    '   the assignee index for Q1, the folder index for the folder-scoped',
    '   predicates of Q3C, its projection, and Q7, the partial completed index',
    '   for Q6, and the GIN trigram index for Q8. Finding 7 is the part that',
    '   moved.',
    '2. **At page scope the folder is not a constant, and the plan says so.**',
    '   4.12 justifies `tasks_folder_status_due_idx` by "Q2, Q3, Q5, Q7 home',
    '   and view scans within accessible folders", and Q7 is where that reads',
    '   literally: one folder, one leading column, one index probe. Q2, Q3 and',
    '   Q5 have no folder in their predicate at all, only the membership join,',
    '   so the planner reaches tasks by the (status, due_date) part alone and',
    '   picks whichever index carries it, which here is the assignee index',
    '   scanned past its unbound leading column (Postgres 18 skip scan), then',
    '   hash joins `folder_members`. The 4.12 entry is still the right index',
    '   for the row it names; what the plan adds is that on the three page',
    '   queries it is reached without its leading column, so the accessible',
    '   folder set is applied as a join rather than as an index bound.',
    '3. **Q4 has no index of its own, and 4.12 says so by omission**: there is',
    '   none on `tasks.important`. Its probe below shows the star as a filter,',
    '   over a sequential scan by choice and over the same skip-scanned index',
    '   with the sequential option removed. That is adequate for v1, and the',
    '   justification is the scale rather than the plan: the rows this page',
    '   reads are already bounded by the accessible-folder scope and the two',
    '   open statuses, and the response is capped at 1000. An index on',
    '   (important) WHERE important would start to pay only once one account',
    '   held tens of thousands of open starred rows, which is not a v1 shape,',
    '   and it would cost a write on every star. Recorded rather than',
    '   requested: this role never adds an index, and the route to',
    '   the data-model question stays open with this query if the shape',
    '   changes.',
    '4. **Q8 is the one statement whose own plan does not reach its own',
    '   index**, and the reason is the join rather than the predicate. With six',
    '   relations joined the planner drives from `folder_members` and reaches',
    '   tasks by the folder scope; with the predicate alone it takes the',
    '   trigram index, which the last probe shows from both sides. At this',
    '   volume a sequential scan of 48000 rows is genuinely cheaper than',
    '   either. Nothing is owed here at v1; the thing to watch in production is',
    '   this endpoint, which 10.4 already singles out as the one view with a',
    '   rate limit.',
    '5. **The card projection is per row, and it shows.** Every statement',
    '   carries a lateral step count and a correlated invite lookup, one index',
    '   lookup each per row the sort passes through. That is the cost of',
    '   answering the frozen TaskCard from a list rather than one task at a',
    '   time, and it is bounded by the same cap the list is. If it ever needs',
    '   to shrink, the shape is a two-stage query, ids in order first and the',
    '   projection joined onto the page, which is a change inside this',
    '   directory and needs nobody.',
    '6. **Q3C is the one endpoint that issues two statements, and the second',
    '   is deliberately not bounded by the range.** Q3C scopes its ghosts by',
    '   accessible, pending and rule-carrying and by nothing else, so the rows',
    '   8.5 projects from are not the rows the calendar draws: a series whose',
    '   current occurrence precedes the requested range still projects into',
    '   it, which AC-143 pins. The second plan below reaches tasks by the',
    '   status bound alone, the same skip scan finding 2 describes, and',
    '   applies the rule as a filter. 4.12 names no index for a rule-carrying',
    '   predicate and none is asked for: the fetch is already bounded by the',
    '   accessible-folder scope and one status, and a partial index on',
    '   (recurrence_rule) WHERE recurrence_rule IS NOT NULL would pay only',
    '   once one account held tens of thousands of open series. Recorded',
    '   rather than requested, like the star in finding 3, and the route to',
    '   the data-model question stays open with this query.',
    '7. **Issue #217 turned Q1s date from an index bound into a filter, and',
    '   issue #216s Scheduled membership rides no index at all. Neither is',
    '   asked to be fixed here, and this finding is the argument for that',
    '   rather than a note that it was not noticed.** Q1s probe used to read',
    '   `Index Cond: (assignee_id = .. AND status = .. AND due_date IS NOT',
    '   NULL AND due_date <= CURRENT_DATE)`, three columns of',
    '   `tasks_assignee_status_due_idx`. The clause now compares',
    '   `coalesce(start_date, due_date)`, which no index carries, so the plan',
    '   below bounds on the first two columns and rechecks the date as a',
    '   Filter. What the two remaining columns bound to is one persons',
    '   pending tasks, which is the set the third column was narrowing, and',
    '   4.12s standing argument for Q4s star applies here with more force',
    '   than it does there: the rows are already bounded, and the response is',
    '   capped at 1000. Q3s membership is the second half. An OR over two',
    '   nullable columns is no b-tree range, and the probe shows what that',
    '   means: a sequential scan by the planners choice, and with the',
    '   sequential option removed the status bound with the pair as a Filter.',
    '   Finding 2 is why that costs nothing new - Q2, Q3 and Q5 carry no',
    '   folder in their predicate and never rode this index by its leading',
    '   column anyway - and Q3s ORDER BY was never answered from an index',
    '   either, its second key being a CASE. An expression index on',
    '   `coalesce(start_date, due_date)`, or a pair of partial ones under a',
    '   BitmapOr, would restore what Q1 lost and give Q3 something to ride.',
    '   Both are refused for now on the same two grounds every entry in this',
    '   file refuses one: the cost is a write on every task whose dates move,',
    '   and 4.12 is a frozen section, so an index belongs there before it',
    '   belongs in a migration. Revisit with a real account whose Today or',
    '   Scheduled page reads slowly, which is the same sentence 4.12 closes',
    '   with.',
    '',
    '## The statements the router issues',
    '',
    ...section(statements),
    '## The predicates on their own',
    '',
    ...section(probes),
  ].join('\n')}\n`
}

async function main(): Promise<void> {
  const client = await createDbClient({})
  await client.runMigrations()
  const db = client.db
  const { viewer, folder } = await seed(db)
  const counted = await rowsOf(db, sql`SELECT count(*)::int AS n FROM tasks`)
  const rowCount = Number(counted[0]?.n)

  const records: Recorded[] = []
  const run = async (
    label: string,
    call: (executor: Executor) => Promise<unknown>,
  ): Promise<void> => {
    await call(recording(db, label, records))
  }

  await run('Q1 and Q1R: GET /views/my-day', (spy) =>
    myDayView(spy, viewer, 'Europe/London'),
  )
  await run('Q2: GET /views/tasks', (spy) => tasksView(spy, viewer))
  await run('Q3: GET /views/planned', (spy) => plannedView(spy, viewer))
  await run('Q3C: GET /views/planned/calendar', (spy) =>
    plannedCalendarView(
      spy,
      viewer,
      new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
      new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    ),
  )
  await run('Q4: GET /views/important', (spy) => importantView(spy, viewer))
  await run('Q5: GET /views/all', (spy) => allView(spy, viewer))
  await run('Q6: GET /views/done', (spy) =>
    completedPage(spy, viewer, 'Europe/London', undefined),
  )
  await run('Q7: GET /folders/:id/tasks?section=open', (spy) =>
    folderOpenView(spy, viewer, folder),
  )
  await run('Q7 section 3: GET /folders/:id/tasks?section=completed', (spy) =>
    completedPage(spy, viewer, 'Europe/London', undefined, folder),
  )
  await run('Q8: GET /search', (spy) =>
    searchView(spy, viewer, 'quarterly needle', undefined),
  )

  const probes = await probePredicates(db, viewer, folder)
  const target = path.resolve(process.cwd(), 'src', 'server', 'views', 'EXPLAIN.md')
  writeFileSync(target, render(records, probes, rowCount), 'utf8')
  process.stdout.write(`wrote ${target}\n`)
  await client.close()
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`)
    process.exit(1)
  })
}
