/*
In-session proof of the 7.6, 7.7 and 7.8 surfaces, the P1 and P2 idiom: the
boot file mounts routers by Platform's hand only, so AC-025 to AC-044 stay
red until that wiring touch, and this file is how the router proves itself
before it. A bare express application assembles the same pieces the requested
wiring names (auth router ahead, folders router for the setup the harness
does through 7.4, tasks router behind them), and the acceptance harness's own
stub, HTTP client and helpers drive it unchanged, so what passes here is the
same vocabulary the criteria speak.

Deliberately compressed: one probe per behavior, because the authoritative
versions are AC-025 to AC-044 and this file must never become a second
acceptance suite. Anything proven here is proven again, by the tester's
sentences, the moment Platform mounts the router.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import { taskDetail as taskDetailSchema } from '../../shared/tasks.js'
import type { AuthTestApp, EmailRecorder } from '../../../tests/support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  defaultFolderOf,
  expectStatus,
  seedUser,
} from '../../../tests/support/folders-harness.js'
import type { Actor } from '../../../tests/support/folders-harness.js'
import {
  addStep,
  createTask,
  createTaskOk,
  deleteStep,
  deleteTask,
  dropFromMyDay,
  getTask,
  myDayRows,
  patchStep,
  patchTask,
  patchTaskOk,
  pullIntoMyDay,
  pullWithoutTz,
  readTask,
  reminderRow,
  requireTaskRow,
  seedOffsetReminder,
  seedRecurrence,
  transition,
  transitionOk,
} from '../../../tests/support/tasks-harness.js'
import {
  putReminder,
  setReminderState,
} from '../../../tests/support/reminders-harness.js'
import { shiftDate, todayIn } from '../../../tests/support/views-harness.js'
import { createTestDb, rows } from '../../../tests/support/helpers.js'
import { startOidcStub } from '../../../tests/support/oidc-stub.js'
import { TestBrowser } from '../../../tests/support/http-client.js'
import { createAuthRouter } from '../auth/index.js'
import type { AuthConfig } from '../auth/index.js'
import { attachNotifier, createNotifier } from '../notify/index.js'
import type { OutboundMessage } from '../notify/index.js'
import { createFoldersRouter } from './folders.js'
import { createTasksRouter } from './tasks.js'

let app: AuthTestApp
let server: Server
const delivered: OutboundMessage[] = []
const cast = new Cast(['owner', 'helper', 'stranger'], 'p3proof')

const recorder: EmailRecorder = {
  sent: () => delivered.map((m) => ({ template: m.template, to: m.to, raw: m })),
  shareGrants: () =>
    delivered
      .filter((m) => m.template === 'share_grant')
      .map((m) => ({ template: m.template, to: m.to, raw: m })),
  clear: () => {
    delivered.length = 0
  },
}

beforeAll(async () => {
  const dbClient: DbClient = await createTestDb()
  const stub = await startOidcStub()

  server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${String(port)}`
  const auth: AuthConfig = {
    issuerUrl: stub.issuerUrl,
    clientId: stub.clientId,
    clientSecret: stub.clientSecret,
    appOrigin: origin,
    allowInsecureRequests: true,
  }

  const application = express()
  application.use(express.json())
  attachNotifier(
    application,
    createNotifier({
      sink: {
        send(message: OutboundMessage): void {
          delivered.push(message)
        },
      },
      logger: { info: () => undefined },
    }),
  )
  application.use('/api/v1', createAuthRouter({ dbClient, auth }))
  application.use('/api/v1', createFoldersRouter({ dbClient }))
  application.use('/api/v1', createTasksRouter({ dbClient }))
  server.on('request', application)

  app = {
    origin,
    dbClient,
    db: dbClient.db,
    stub,
    emails: recorder,
    browser: () => new TestBrowser(origin),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      await stub.close()
      await dbClient.close()
    },
  }
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Stage {
  owner: Actor
  helper: Actor
  stranger: Actor
  /** Two members, so INV-5 forces nothing and an unassigned task is legal. */
  sharedId: string
  /** One member, where the forcing and the unassign guard both bind. */
  soloId: string
  strangerFolderId: string
  outsiderId: string
}
let staged: Stage | undefined

/*
A My Day entry's date, read through to_char rather than through the driver:
node-postgres parses a date column into a JS Date while PGlite hands back a
string, so only the cast reads the same on both backends. The domain module
serializes every floating date the same way and for the same reason.
*/
async function addedOn(
  taskId: string,
  userId: string,
): Promise<string | undefined> {
  const found = await rows(
    app.db,
    sql`SELECT to_char(added_on, 'YYYY-MM-DD') AS d FROM my_day_entries
        WHERE task_id = ${taskId} AND user_id = ${userId}`,
  )
  const row = found[0]
  return row === undefined ? undefined : String(row.d)
}

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, helper, stranger] = await cast.of(app)
    if (owner === undefined || helper === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, helper.id)
    const sharedId = await createFolder(owner, 'proof shared')
    await addMemberOk(owner, sharedId, helper.id)
    const soloId = await createFolder(owner, 'proof solo')
    const strangerFolderId = await createFolder(stranger, 'proof elsewhere')
    const outsiderId = await seedUser(app.db, 'proof-outsider')
    cast.trackUser(outsiderId)
    staged = {
      owner,
      helper,
      stranger,
      sharedId,
      soloId,
      strangerFolderId,
      outsiderId,
    }
  }
  return staged
}

describe('the tasks router, driven through the harness idiom', () => {
  test('POST /tasks: the 7.6 defaults, the shared TaskDetail, and the folder guard', async () => {
    const { owner, sharedId, strangerFolderId } = await stage()
    const inboxId = await defaultFolderOf(app.db, owner.id)

    const body = await createTaskOk(
      owner,
      { title: 'proof title only' },
      'a title-only create answers 201 with the TaskDetail (spec 7.6)',
    )
    const parsed = taskDetailSchema.safeParse(body)
    expect(
      parsed.success,
      `the 201 body is the shared TaskDetail schema, the contract as code (7.0); ${JSON.stringify(parsed.error?.issues ?? [])}`,
    ).toBe(true)
    expect((body.folder as { id: string }).id, 'default folder is the Inbox').toBe(
      inboxId,
    )
    expect((body.assignee as { id: string }).id, 'assignee defaults to V').toBe(
      owner.id,
    )
    expect(body.status, '4.5 defaults the status').toBe('pending')

    // 7.6's create body carries steps as titles, capped at 50 by 10.3.
    const withSteps = await createTaskOk(
      owner,
      {
        title: 'proof with steps',
        folder_id: sharedId,
        notes: 'noted',
        important: true,
        due_date: '2026-09-09',
        due_time: '08:15',
        steps: ['first', 'second'],
      },
      'a full create is accepted (spec 7.6)',
    )
    expect(withSteps.steps_total, 'both steps landed').toBe(2)
    expect(withSteps.due_time, '4.11 minute precision on the wire').toBe('08:15')
    expect(
      (withSteps.steps as { title: string; position: number }[]).map(
        (step) => step.title,
      ),
      '4.6 orders steps by position then id',
    ).toEqual(['first', 'second'])

    const trespass = await createTask(owner, {
      title: 'proof trespass',
      folder_id: strangerFolderId,
    })
    expectStatus(
      trespass,
      404,
      'an inaccessible folder reads as nonexistent (spec 7.6, 10.2)',
    )
  })

  test('POST /tasks: the single-member forcing, and the 422 a multi-member folder answers', async () => {
    const { owner, helper, soloId, sharedId, outsiderId } = await stage()

    const forced = await createTaskOk(
      owner,
      { title: 'proof forced', folder_id: soloId, assignee_id: null },
      'an explicit null in a single-member folder is repaired, not refused (spec 7.6, INV-5)',
    )
    expect((forced.assignee as { id: string }).id).toBe(owner.id)

    const unassigned = await createTaskOk(
      owner,
      { title: 'proof unassigned', folder_id: sharedId, assignee_id: null },
      'a folder with two members may hold an unassigned task (INV-5 says nothing there)',
    )
    expect(unassigned.assignee, 'the null stands where INV-5 does not bind').toBeNull()

    const assigned = await createTaskOk(
      owner,
      { title: 'proof assigned', folder_id: sharedId, assignee_id: helper.id },
      'a member is a legal assignee (spec 7.6)',
    )
    expect((assigned.assignee as { id: string }).id).toBe(helper.id)

    const refused = await createTask(owner, {
      title: 'proof outsider',
      folder_id: sharedId,
      assignee_id: outsiderId,
    })
    expectStatus(
      refused,
      422,
      'a non-member assignee is the composite FK surfaced as 422 (spec 7.6, 10.2)',
    )
    expect(refused.body.toLowerCase()).toContain('assignee')
  })

  test('PATCH /tasks/:id: partial writes, the status refusal, and the assignment guards', async () => {
    const { owner, helper, soloId, sharedId, outsiderId } = await stage()
    const task = await createTaskOk(
      owner,
      {
        title: 'proof patch',
        folder_id: sharedId,
        notes: 'original',
        assignee_id: helper.id,
      },
      'the task under PATCH is creatable (spec 7.6)',
    )

    const before = await requireTaskRow(app.db, task.id)
    await patchTaskOk(
      owner,
      task.id,
      { title: 'proof retitled' },
      'a one-field body is the normal case (spec 7.6)',
    )
    const after = await requireTaskRow(app.db, task.id)
    expect(after.title).toBe('proof retitled')
    expect(after.notes, 'an absent field is not a null field (8.3)').toBe(
      before.notes,
    )
    expect(
      String(after.assignee_id),
      'nor is an absent assignee an unassignment',
    ).toBe(helper.id)
    expect(
      String(after.updated_at),
      '4.5 touches updated_at on every mutation',
    ).not.toBe(String(before.updated_at))

    const withStatus = await patchTask(owner, task.id, {
      important: true,
      status: 'completed',
    })
    expectStatus(
      withStatus,
      409,
      'status is refused by presence, and the refusal decides the whole request (spec 7.6, 8.3)',
    )
    expect(
      (await requireTaskRow(app.db, task.id)).important,
      'a refused PATCH applies none of its fields',
    ).toBe(before.important)

    const outsider = await patchTask(owner, task.id, { assignee_id: outsiderId })
    expectStatus(outsider, 422, 'a non-member assignee answers 422 (spec 7.6)')

    const soloTask = await createTaskOk(
      owner,
      { title: 'proof solo patch', folder_id: soloId },
      'a task in the single-member folder is creatable',
    )
    expectStatus(
      await patchTask(owner, soloTask.id, { assignee_id: null }),
      409,
      'the unassign guard of INV-5 answers 409, not 422 (spec 7.6)',
    )
    const shared = await patchTaskOk(
      owner,
      task.id,
      { assignee_id: null },
      'the identical body in a two-member folder is accepted (INV-5)',
    )
    expect(shared.assignee).toBeNull()
  })

  test('PATCH /tasks/:id: the move rewrites the assignee for both of 7.6\'s reasons', async () => {
    const { owner, helper, sharedId, soloId, strangerFolderId } = await stage()

    const toSolo = await createTaskOk(
      owner,
      { title: 'proof move forced', folder_id: sharedId, assignee_id: helper.id },
      'the task to move is creatable',
    )
    const forced = await patchTaskOk(
      owner,
      toSolo.id,
      { folder_id: soloId },
      'a move into a folder the caller belongs to is accepted (spec 7.6, 5.4)',
    )
    expect(
      (forced.assignee as { id: string }).id,
      'a single-member target takes the task with its one member (INV-5)',
    ).toBe(owner.id)

    // A second folder with two members, so the drop is attributable to the
    // assignee's absence rather than to the forcing.
    const otherShared = await createFolder(owner, 'proof other shared')
    await addMemberOk(owner, otherShared, helper.id)
    const target = await createFolder(owner, 'proof target')
    const third = await seedUser(app.db, 'proof-third')
    cast.trackUser(third)
    await app.db.execute(
      sql`INSERT INTO folder_members (folder_id, user_id)
          VALUES (${target}::uuid, ${third}::uuid)`,
    )
    const moving = await createTaskOk(
      owner,
      { title: 'proof move drop', folder_id: otherShared, assignee_id: helper.id },
      'the task to move is creatable',
    )
    const dropped = await patchTaskOk(
      owner,
      moving.id,
      { folder_id: target },
      'the move is accepted',
    )
    expect(
      dropped.assignee,
      'an assignee who is not a member of the target is dropped (spec 7.6)',
    ).toBeNull()

    expectStatus(
      await patchTask(owner, moving.id, { folder_id: strangerFolderId }),
      404,
      'a target the caller is not in reads as nonexistent (spec 7.6, 10.2)',
    )
  })

  test('PATCH /tasks/:id: the 8.4 clear-date cascade, in the PATCH transaction', async () => {
    const { owner, sharedId, outsiderId } = await stage()
    const build = async (label: string): Promise<string> => {
      const created = await createTaskOk(
        owner,
        {
          title: `proof cascade ${label}`,
          folder_id: sharedId,
          due_date: '2026-08-24',
          due_time: '17:00',
        },
        'the dated and timed half of the fixture is creatable',
      )
      await seedRecurrence(app.db, created.id)
      await seedOffsetReminder(app.db, created.id, owner.id, 30)
      return created.id
    }

    const taskId = await build('cleared')
    const cleared = await patchTaskOk(
      owner,
      taskId,
      { due_date: null },
      'clearing the date is a legal PATCH (spec 7.6, 8.4)',
    )
    expect(cleared.due_date, 'the date').toBeNull()
    expect(cleared.due_time, 'INV-6: the time cannot outlive it').toBeNull()
    expect(cleared.recurrence_rule, '8.4 ends the series').toBeNull()
    expect(cleared.reminder, '8.4 deletes the reminder row').toBeNull()
    expect(
      (await requireTaskRow(app.db, taskId)).series_id,
      '8.4 keeps series_id for history',
    ).not.toBeNull()

    const refusedId = await build('refused')
    expectStatus(
      await patchTask(owner, refusedId, {
        due_date: null,
        assignee_id: outsiderId,
      }),
      422,
      'the assignee guard refuses the request (spec 7.6)',
    )
    const row = await requireTaskRow(app.db, refusedId)
    expect(
      row.due_date,
      'a refusal cascades nothing: 8.4 runs in the PATCH transaction',
    ).not.toBeNull()
    expect(
      await reminderRow(app.db, refusedId),
      'and the reminder row still stands',
    ).toBeDefined()

    const undated = await createTaskOk(
      owner,
      { title: 'proof undated', folder_id: sharedId },
      'an undated task is creatable',
    )
    expectStatus(
      await patchTask(owner, undated.id, { due_time: '08:00' }),
      422,
      'INV-6 is revalidated against the row, never left to the 4.5 CHECK (spec 7.11)',
    )
  })

  /*
  The four probes below are the P7 half of this file, and they are chosen the
  way the header says: one per behavior, and only where no criterion speaks.
  AC-146 to AC-149, AC-151 and AC-152 are the authoritative versions of the
  reminder endpoint, the create arm and two of the recompute triggers, and
  none of them is repeated here. What is left over is the 8.4 mode cascade,
  whose criterion AC-164 arrives after this session; the reminder arm of the
  PATCH body, which has no criterion at all and which src/shared/tasks.ts
  names as the write path a dropped field fails silently on; created_by on the
  conflict arm of the upsert, which is this session's decision and which no
  response reports; and the rewrite that must not recompute, whose absence is
  invisible in every single-write assertion and costs a duplicate email.
  */

  test('PATCH /tasks/:id: 8.4\'s mode cascade, both arms, and the move that cascades nothing', async () => {
    const { owner, sharedId } = await stage()
    const due = shiftDate(todayIn('UTC'), 30)
    const build = async (label: string, dueTime?: string): Promise<string> => {
      const created = await createTaskOk(
        owner,
        {
          title: `proof mode cascade ${label}`,
          folder_id: sharedId,
          due_date: due,
          ...(dueTime === undefined ? {} : { due_time: dueTime }),
        },
        'the fixture task is creatable',
      )
      expectStatus(
        await putReminder(
          owner,
          created.id,
          dueTime === undefined
            ? { time_of_day: '09:00' }
            : { offset_minutes: 30 },
        ),
        200,
        'and takes the one mode 4.8 admits for it (spec 7.9)',
      )
      return created.id
    }

    const cleared = await build('cleared', '17:00')
    const afterClear = await patchTaskOk(
      owner,
      cleared,
      { due_time: null },
      'clearing due_time alone is a legal PATCH (spec 7.6 as ruled 2026-08-10)',
    )
    expect(
      afterClear.reminder,
      '8.4: an offset reminder is measured from the due_time, so it cannot outlive it',
    ).toBeNull()
    expect(
      afterClear.due_date,
      'and the date stays where it is: this is the clear-date cascade one size down, not the cascade itself',
    ).not.toBeNull()

    const dateOnly = await build('date only')
    const afterSet = await patchTaskOk(
      owner,
      dateOnly,
      { due_time: '08:00' },
      'and setting one on a date-only task is legal too (spec 7.6 as ruled 2026-08-10)',
    )
    expect(
      afterSet.reminder,
      "8.4's mirror arm: the surviving row would compute, 8.6's date-only arm never reading the task's due_time, and 4.8 calls the pair illegal anyway",
    ).toBeNull()

    const moved = await build('moved', '17:00')
    const before = await reminderRow(app.db, moved)
    const afterMove = await patchTaskOk(
      owner,
      moved,
      { due_time: '09:00' },
      'a due_time moving between two non-null values (spec 7.6)',
    )
    expect(
      afterMove.reminder,
      "8.4's closing paragraph and AC-164's third clause: this move crosses no line, invalidates no mode and deletes nothing",
    ).toEqual({ offset_minutes: 30, time_of_day: null })
    expect(
      String((await reminderRow(app.db, moved))?.fire_at),
      'it is 8.6\'s ordinary recompute instead, so only the instant moved',
    ).not.toBe(String(before?.fire_at))
  })

  test('PATCH /tasks/:id: the reminder arm writes the 4.8 row behind the guards 7.9 names', async () => {
    const { owner, sharedId } = await stage()
    const due = shiftDate(todayIn('UTC'), 30)
    const timed = await createTaskOk(
      owner,
      {
        title: 'proof patch reminder',
        folder_id: sharedId,
        due_date: due,
        due_time: '17:00',
      },
      'the fixture task is creatable',
    )

    const patched = await patchTaskOk(
      owner,
      timed.id,
      { reminder: { offset_minutes: 45 } },
      'the third of the three bodies that write the one 4.8 row (spec 7.6)',
    )
    expect(
      patched.reminder,
      'a route that parses the field and does not act on it answers its ordinary 200 with the reminder dropped, which is indistinguishable on the wire from a body that never carried one',
    ).toEqual({ offset_minutes: 45, time_of_day: null })

    expectStatus(
      await patchTask(owner, timed.id, { reminder: { time_of_day: '09:00' } }),
      422,
      "4.8's mode rule reads the task's due_time here exactly as it does on 7.9's PUT, the body being silent about that column",
    )
    expect(
      (await reminderRow(app.db, timed.id))?.offset_minutes,
      'and the refusal returns before the first write, so the row it would have replaced is untouched',
    ).toBe(45)

    const undated = await createTaskOk(
      owner,
      { title: 'proof patch reminder undated', folder_id: sharedId },
      'an undated task is creatable',
    )
    expectStatus(
      await patchTask(owner, undated.id, { reminder: { time_of_day: '09:00' } }),
      422,
      "INV-6 and 7.9's second refusal, against the row rather than the body: with no date there is no legal mode at all",
    )
  })

  test('PUT /tasks/:id/reminder: the upsert rewrites created_by to the caller', async () => {
    const { owner, helper, sharedId } = await stage()
    const created = await createTaskOk(
      owner,
      {
        title: 'proof reminder created_by',
        folder_id: sharedId,
        due_date: shiftDate(todayIn('UTC'), 30),
        due_time: '17:00',
      },
      'the fixture task is creatable',
    )

    expectStatus(
      await putReminder(owner, created.id, { offset_minutes: 30 }),
      200,
      'the first PUT creates the row (spec 7.9)',
    )
    expect(
      String((await reminderRow(app.db, created.id))?.created_by),
      'the insert names its writer',
    ).toBe(owner.id)

    expectStatus(
      await putReminder(helper, created.id, { offset_minutes: 60 }),
      200,
      'and another member of the folder writes over it (spec 7.9)',
    )
    const row = await reminderRow(app.db, created.id)
    expect(
      String(row?.created_by),
      "this session's decision, recorded because nothing observable turns on it: 7.0 makes PUT idempotent, so the stored row is a function of the request and the task rather than of history, and DELETE-then-PUT would otherwise differ from PUT-over-the-row in this column alone",
    ).toBe(helper.id)
    expect(
      Number(row?.offset_minutes),
      'the rest of the row is the second caller\'s request whole',
    ).toBe(60)
  })

  test('the 8.6 recompute fires on a change and not on a rewrite', async () => {
    const { owner, sharedId } = await stage()
    const created = await createTaskOk(
      owner,
      {
        title: 'proof recompute on change',
        folder_id: sharedId,
        due_date: shiftDate(todayIn('UTC'), 30),
        due_time: '17:00',
      },
      'a task thirty days out, so every instant here is in the future',
    )
    expectStatus(
      await putReminder(owner, created.id, { offset_minutes: 30 }),
      200,
      'with a reminder on it (spec 7.9)',
    )
    await setReminderState(app.db, created.id, 'sent')
    const delivered = await reminderRow(app.db, created.id)

    await patchTaskOk(
      owner,
      created.id,
      { due_time: '17:00:00' },
      'a PATCH rewriting due_time with the minute it already held, which 4.11 lets a client spell either way (spec 7.6)',
    )
    expect(
      await reminderRow(app.db, created.id),
      '8.6 recomputes when one of its five values changes, and this body changed none of them. The four task-scoped triggers revive a terminal row by design, so a recompute fired by a no-op write sends one person the same email twice about a deadline that did not move',
    ).toEqual(delivered)

    await patchTaskOk(
      owner,
      created.id,
      { due_time: '09:00' },
      'and a PATCH that does move it (spec 7.6)',
    )
    const after = await reminderRow(app.db, created.id)
    expect(
      after?.state,
      'the control: a due_time that really moves is one of 8.6\'s five, and a new occasion deserves a delivery of its own',
    ).toBe('scheduled')
    expect(
      after?.fired_at,
      "and fired_at is cleared with it, so 4.8's note that the column is set when state leaves scheduled stays true of every row (8.6 as ruled 2026-08-10)",
    ).toBeNull()
  })

  test('the 5.1 transitions: the guarded update, its no-ops, and its conflicts', async () => {
    const { owner, helper, sharedId } = await stage()
    const make = async (label: string): Promise<string> => {
      const created = await createTaskOk(
        owner,
        { title: `proof transition ${label}`, folder_id: sharedId },
        'the task under transition is creatable',
      )
      return created.id
    }

    const completedId = await make('complete')
    const completed = await transitionOk(
      helper,
      completedId,
      'complete',
      'any member of the folder may complete a pending task (spec 5.1, 5.4)',
    )
    expect(
      completed.task.completed_by,
      '5.1 records the actor, who is not the creator here',
    ).toBe(helper.id)
    const firstRow = await requireTaskRow(app.db, completedId)

    const repeat = await transitionOk(
      owner,
      completedId,
      'complete',
      'a same-state repeat is a 200 no-op (spec 5.1, 7.0)',
    )
    expect(repeat.task.status).toBe('completed')
    const afterRepeat = await requireTaskRow(app.db, completedId)
    expect(
      String(afterRepeat.completed_by),
      'the repeat caller takes no credit (spec 5.1)',
    ).toBe(String(firstRow.completed_by))
    expect(
      String(afterRepeat.updated_at),
      'a no-op returns 200 without side effects',
    ).toBe(String(firstRow.updated_at))

    const abandonOnCompleted = await transition(owner, completedId, 'abandon')
    expectStatus(abandonOnCompleted, 409, 'completed to abandoned is never legal (5.1)')
    expect(
      abandonOnCompleted.body.toLowerCase(),
      '5.1 gives this refusal its copy',
    ).toContain('un-complete first')

    const uncompleted = await transitionOk(
      owner,
      completedId,
      'uncomplete',
      'completed to pending is the plain branch (spec 5.1)',
    )
    expect(uncompleted.task.status).toBe('pending')
    expect(uncompleted.task.completed_at, 'INV-8 clears both columns').toBeNull()
    expect(uncompleted.task.completed_by).toBeNull()

    const abandonedId = await make('abandon')
    await transitionOk(owner, abandonedId, 'abandon', 'pending to abandoned (5.1)')
    const completeOnAbandoned = await transition(owner, abandonedId, 'complete')
    expectStatus(completeOnAbandoned, 409, 'abandoned to completed is never legal (5.1)')
    expect(
      completeOnAbandoned.body.toLowerCase(),
      '5.1 gives this refusal its copy',
    ).toContain('restore the task first')

    const restored = await transitionOk(
      owner,
      abandonedId,
      'restore',
      'abandoned to pending is the plain branch (spec 5.1)',
    )
    expect(restored.task.status).toBe('pending')
    expect(
      restored.generated_task,
      'no rule means no successor: 8.5 generation is P6\'s',
    ).toBeNull()
  })

  test('DELETE /tasks/:id: 204, the 5.1 cascades, and 404 for everything after', async () => {
    const { owner, helper, stranger, sharedId } = await stage()
    const created = await createTaskOk(
      owner,
      {
        title: 'proof delete',
        folder_id: sharedId,
        due_date: '2026-10-12',
        due_time: '09:00',
      },
      'the task to delete is creatable',
    )
    await addStep(owner, created.id, { title: 'a step' })
    expectStatus(await pullIntoMyDay(owner, created.id, 'UTC'), 200, 'the pull succeeds')
    expectStatus(await pullIntoMyDay(helper, created.id, 'UTC'), 200, 'and the other member\'s')
    await seedOffsetReminder(app.db, created.id, owner.id, 60)

    expectStatus(
      await deleteTask(stranger, created.id),
      404,
      'an inaccessible task is indistinguishable from a nonexistent one (10.2)',
    )

    expectStatus(await deleteTask(owner, created.id), 204, 'any member deletes (7.6)')
    // RFC 0005: the delete marks (7.13) and the parts wait for restore; the
    // 4.6, 4.7 and 4.8 cascades fire at the 11.7 purge, which AC-042 owns.
    expect(
      (await myDayRows(app.db, created.id)).length,
      'both members\' pulls wait in Trash with the row (7.13)',
    ).toBe(2)
    expect(
      await reminderRow(app.db, created.id),
      'so does the reminder',
    ).toBeDefined()
    expectStatus(
      await deleteTask(owner, created.id),
      404,
      'the second delete answers 404 (8.3, the mid-P3 ruling)',
    )
    expectStatus(await getTask(owner, created.id), 404, 'and so does the read')
  })

  test('7.7 steps: the live cap, the subset PATCH, and the membership guard', async () => {
    const { owner, stranger, sharedId } = await stage()
    const created = await createTaskOk(
      owner,
      {
        title: 'proof steps',
        folder_id: sharedId,
        steps: Array.from({ length: 50 }, (_unused, i) => `step ${String(i + 1)}`),
      },
      'a create carrying exactly 50 steps is inside the cap (spec 7.6, 10.3)',
    )
    expectStatus(
      await addStep(owner, created.id, { title: 'the 51st' }),
      422,
      'the cap is 50 (spec 7.7, 4.6, 10.3)',
    )

    const detail = await readTask(owner, created.id)
    const first = (detail.steps as { id: string }[])[0]
    expect(first).toBeDefined()
    const firstId = (first as { id: string }).id
    expectStatus(await deleteStep(owner, firstId), 204, 'a step deletes (7.7)')
    expectStatus(
      await addStep(owner, created.id, { title: 'room again' }),
      201,
      'the cap counts rows, not creations (4.6)',
    )

    const second = (await readTask(owner, created.id)).steps as { id: string }[]
    const targetId = (second[0] as { id: string }).id
    const patched = await patchStep(owner, targetId, { done: true })
    expectStatus(patched, 200, 'a subset PATCH is legal (spec 7.7)')
    const counted = await readTask(owner, created.id)
    expect(counted.steps_done, 'the card counts what is done (7.0)').toBe(1)
    expect(
      counted.status,
      '4.6: steps have no coupling with task status in either direction',
    ).toBe('pending')

    expectStatus(
      await addStep(stranger, created.id, { title: 'trespass' }),
      404,
      '7.7 requires membership of the parent task\'s folder',
    )
    expectStatus(
      await patchStep(stranger, targetId, { done: false }),
      404,
      'and so does the step PATCH',
    )
  })

  test('7.8 My Day: idempotent both ways, per viewer, and 404 out of reach', async () => {
    const { owner, helper, sharedId, stranger } = await stage()
    const created = await createTaskOk(
      owner,
      { title: 'proof my day', folder_id: sharedId },
      'the task to pull is creatable',
    )

    expectStatus(await pullIntoMyDay(owner, created.id, 'UTC'), 200, 'the pull answers 200 (7.8)')
    expect(await addedOn(created.id, owner.id), 'the entry exists').toBeDefined()
    // A row as it would read after a pull made last week, which is what
    // 7.8's "keeping the original added_on" protects.
    await app.db.execute(sql`
      UPDATE my_day_entries SET added_on = ${'2026-07-01'}::date
       WHERE task_id = ${created.id}::uuid AND user_id = ${owner.id}::uuid
    `)
    expectStatus(await pullIntoMyDay(owner, created.id, 'UTC'), 200, 'the repeat is a no-op')
    expect(
      await addedOn(created.id, owner.id),
      'an upsert would have moved it to today (spec 7.8, 8.2)',
    ).toBe('2026-07-01')

    expectStatus(await pullIntoMyDay(helper, created.id, 'UTC'), 200, 'the other member pulls')
    expect(
      (await myDayRows(app.db, created.id)).length,
      'INV-12 is keyed on (task, user)',
    ).toBe(2)
    expect((await readTask(owner, created.id)).pulled, 'pulled is the viewer\'s').toBe(
      true,
    )

    expectStatus(await dropFromMyDay(owner, created.id), 200, 'the drop answers 200')
    expectStatus(
      await dropFromMyDay(owner, created.id),
      200,
      'and again with nothing to remove (spec 7.8, idempotent)',
    )
    expect(
      await addedOn(created.id, helper.id),
      'the other member\'s entry is untouched',
    ).toBeDefined()
    expect((await readTask(owner, created.id)).pulled, 'the flag follows').toBe(false)

    const outOfReach = await createTaskOk(
      stranger,
      { title: 'proof unreachable' },
      'the stranger\'s own task is creatable',
    )
    expectStatus(
      await pullIntoMyDay(owner, outOfReach.id, 'UTC'),
      404,
      '7.8 answers 404 when the task is not accessible (10.2)',
    )
    expect(
      await myDayRows(app.db, outOfReach.id),
      'and wrote nothing',
    ).toEqual([])
  })

  test('added_on is today in the request\'s tz, not the account\'s zone (7.8)', async () => {
    /*
    Rewritten for the owner's ruling of 2026-08-08, and it used to assert the
    defect. The old version set the account zone and checked added_on against
    it, which is what the endpoint did when it had no tz to read: 4.7 calls
    added_on the adder's local date, and the account's zone was the only zone
    in reach. But 8.1 reserves users.timezone for reminder fire instants, and
    Q1 compares this row against today(V) from the request's tz, so the two
    civil dates were computed from different inputs and disagreed for a large
    part of every UTC day. That is the non-determinism four sessions carried.

    The two zones are chosen so the case cannot pass by luck at any instant.
    Kiritimati is UTC+14 and Midway is UTC-11, twenty-five hours apart, so
    their civil dates always differ; a version of this test using zones that
    merely usually differ would be green for most of the day under the old
    implementation, which is precisely how the defect survived.

    The second assertion is the discrimination evidence rather than a
    restatement of the first: it names the account's date and requires
    added_on not to be it, so the pre-ruling statement turns this red.
    */
    const { owner, sharedId } = await stage()
    const created = await createTaskOk(
      owner,
      { title: 'proof zone', folder_id: sharedId },
      'the task to pull is creatable',
    )
    await app.db.execute(
      sql`UPDATE users SET timezone = ${'Pacific/Kiritimati'}
          WHERE id = ${owner.id}::uuid`,
    )
    expectStatus(
      await pullIntoMyDay(owner, created.id, 'Pacific/Midway'),
      200,
      'the pull succeeds',
    )
    // to_char rather than the raw column: node-postgres parses a date into a
    // JS Date and PGlite hands back a string, so only the cast reads the same
    // on both backends.
    const dates = await rows(
      app.db,
      sql`SELECT to_char((now() AT TIME ZONE 'Pacific/Midway')::date,
                         'YYYY-MM-DD') AS requested,
                 to_char((now() AT TIME ZONE 'Pacific/Kiritimati')::date,
                         'YYYY-MM-DD') AS account`,
    )
    const requested = String(dates[0]?.requested)
    const account = String(dates[0]?.account)
    expect(
      await addedOn(created.id, owner.id),
      'added_on is today(V) from the tz the request carried (spec 7.8 as ruled 2026-08-08, 8.1)',
    ).toBe(requested)
    expect(
      account,
      'and the two zones really do disagree, or the assertion above discriminates nothing',
    ).not.toBe(requested)
    await app.db.execute(
      sql`UPDATE users SET timezone = ${'UTC'} WHERE id = ${owner.id}::uuid`,
    )
  })

  test('the pull refuses an absent or invalid tz, naming the field (7.8)', async () => {
    /*
    The other half of the ruling. An absent tz is not a request to default:
    the only plausible default is UTC, which would silently stamp the wrong
    civil date for most of the world, which is the defect this change exists
    to remove rather than to relocate.
    */
    const { owner, sharedId } = await stage()
    const created = await createTaskOk(
      owner,
      { title: 'proof tz refusal', folder_id: sharedId },
      'the task to pull is creatable',
    )
    const absent = await pullWithoutTz(owner, created.id)
    expectStatus(absent, 422, '7.8 as ruled 2026-08-08: an absent tz is refused')
    expect(
      JSON.stringify(absent.json()),
      'the field is named, which is what tells a client what to fix (7.0)',
    ).toMatch(/tz/)
    expectStatus(
      await pullIntoMyDay(owner, created.id, 'Mars/Olympus'),
      422,
      'and an invalid zone is refused the same way',
    )
    expect(
      await addedOn(created.id, owner.id),
      'a refused pull writes nothing',
    ).toBeUndefined()
  })

  test('the drop takes no tz, evaluating no date (7.8)', async () => {
    // The ruling gives DELETE nothing, and a change that quietly required tz
    // on both would be a widening nobody ruled.
    const { owner, sharedId } = await stage()
    const created = await createTaskOk(
      owner,
      { title: 'proof drop', folder_id: sharedId },
      'the task to drop is creatable',
    )
    expectStatus(
      await pullIntoMyDay(owner, created.id, 'UTC'),
      200,
      'the pull succeeds',
    )
    expectStatus(
      await dropFromMyDay(owner, created.id),
      200,
      'and the drop needs no zone',
    )
  })
})
