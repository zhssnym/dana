/*
The sample workspace (7.20): written into a
brand-new account inside 7.1's provisioning transaction, so the first page a
person sees is already full, and taken out again in one act.

**Every object the sample makes is registered in sample_objects by its own
id**, and that register is the whole of the removal's knowledge. It is a
register rather than a column on the owning rows because the rows are
section 4's, and because a task the person completes, moves, renames
or trashes keeps its id, so the register still finds it however it has been
handled since. What it deliberately does not carry are the objects that ride
another's fate: steps, page blocks, comments, reminders, Today pulls and
events all cascade with their task or folder by 4's own named constraints,
so recording them would be recording the cascade twice.

**Two rules.**

A task moved out of the sample is the person's. Removal takes a registered
task whose folder is still a sample folder or Desk (the sample put four
there itself); a task the person has moved into a folder they made
themselves has been adopted, and it stays, its register row dropped. The
same for a folder the person has shared: a sample folder with another
member is left where it is, reported back so the strip can say so, and its
register row dropped, because the moment it had a second member it stopped
being a sample and became a thing two people hold. A sample page the person
wrote into (a task, a block, a comment or a thread of theirs) is not
destroyed but moved to Trash, whole from the top of its sample tree, and
named back: removal is not a delete that reaches their own work, and with
nothing of the old sample left in view the undo's fresh copy duplicates
nothing.

Removal goes through `domain/trash.ts`'s `destroyFolders` and `destroyTasks`,
the one collection the purge and the permanent delete already share, so a
file the person attached to a sample conversation is collected and its bytes
removed after the commit exactly as 7.15 orders it. Nothing here writes a
DELETE against a task or folder table of its own.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { allowedIn } from '../../shared/block-kinds.js'
import { documentTransaction } from '../../shared/page-document.js'
import type { DocumentOperation } from '../../shared/page-document.js'
import type { SampleCounts, SampleStatus } from '../../shared/sample.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from '../domain/events.js'
import { recordAccessTransition } from '../domain/folder-access.js'
import { initialKeys, keyBetween } from '../domain/fractional-index.js'
import { applyDocument, documentMetadata } from '../domain/page-document.js'
import { positionedItems } from '../domain/page-order.js'
import { trashFolderSubtree } from '../domain/folders.js'
import {
  appendHomeBlock,
  lastChildPosition,
  lockPageTree,
  removeHomeBlock,
} from '../domain/page-tree.js'
import { upsertReminder } from '../domain/tasks.js'
import { appendChecklist } from '../domain/task-document.js'
import { destroyFolders, destroyTasks } from '../domain/trash.js'
import { today } from '../time/today.js'
import { SAMPLE_PEOPLE, SAMPLE_WORKSPACE } from './content.js'
import type {
  SampleAuthor,
  SampleBlock,
  SampleDue,
  SampleFolder,
  SamplePersonKey,
  SamplePost,
  SampleRun,
  SampleTask,
  SampleText,
  SampleThread,
} from './content.js'

/* ------------------------------------------------------------------ *
 * Dates, relative to today in the person's zone
 * ------------------------------------------------------------------ */

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

function parseDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shiftDays(date: string, days: number): string {
  const d = parseDay(date)
  d.setUTCDate(d.getUTCDate() + days)
  return formatDay(d)
}

/** Resolves a content date against today: a count of days, the next given
 * weekday (today counts), or the next given day of the month (today counts). */
export function resolveDue(anchor: string, due: SampleDue): string {
  if (typeof due === 'number') return shiftDays(anchor, due)
  const base = parseDay(anchor)
  if ('weekday' in due) {
    const want = WEEKDAYS.indexOf(due.weekday)
    const ahead = (want - base.getUTCDay() + 7) % 7
    return shiftDays(anchor, ahead)
  }
  if (base.getUTCDate() <= due.monthday) {
    base.setUTCDate(due.monthday)
    return formatDay(base)
  }
  base.setUTCMonth(base.getUTCMonth() + 1, due.monthday)
  return formatDay(base)
}

/* ------------------------------------------------------------------ *
 * Creation
 * ------------------------------------------------------------------ */

type SampleKind = 'shelf' | 'folder' | 'task' | 'view'

/*
The sample's own clock. The whole sample is one transaction, where `now()` is
one instant, so every row would share a `created_at` and every list that
orders by `created_at, id` would fall through to a random uuid. Each row takes
its own millisecond instead, in the order `content.ts` lists it, all within
the minute before now so nothing is created in the future.
*/
type SampleClock = () => SQL
function sampleClock(): SampleClock {
  let tick = 0
  return () => {
    tick += 1
    return sql`now() - interval '60 seconds' + ${tick}::int * interval '1 millisecond'`
  }
}

/** A moment `days` (and `hours`) before now, for posts and completions. */
function ago(days: number, hours = 0): SQL {
  const minutes = Math.round(days * 24 * 60 + hours * 60)
  return sql`now() - make_interval(mins => ${minutes}::int)`
}

async function register(
  tx: Executor,
  userId: string,
  kind: SampleKind,
  id: string,
): Promise<void> {
  await tx.execute(
    sql`INSERT INTO sample_objects (user_id, kind, id)
        VALUES (${userId}::uuid, ${kind}, ${id}::uuid)`,
  )
}

/** The sample people's ids, which removal does not count as someone else
 * holding a page. */
export const SAMPLE_PERSON_IDS: readonly string[] = SAMPLE_PEOPLE.map((person) => person.id)

/* The three sample people: users rows with no google_sub and no email, which
   is to say no way to sign in. Shared by every sample; written once. */
async function ensureSamplePeople(tx: Executor): Promise<void> {
  for (const person of SAMPLE_PEOPLE) {
    await tx.execute(
      sql`INSERT INTO users (id, display_name, timezone)
          VALUES (${person.id}::uuid, ${person.name}, 'UTC')
          ON CONFLICT (id) DO NOTHING`,
    )
  }
}

/** Everything the writer resolves by name while it writes. */
interface SampleContext {
  readonly tx: Executor
  readonly clock: SampleClock
  readonly userId: string
  readonly userName: string
  readonly anchor: string
  readonly folders: Map<string, string>
  readonly tasks: Map<string, string>
}

function personId(ctx: SampleContext, who: SampleAuthor): string {
  if (who === 'me') return ctx.userId
  return SAMPLE_PEOPLE.find((person) => person.key === who)?.id ?? ctx.userId
}

function personName(ctx: SampleContext, who: SampleAuthor): string {
  if (who === 'me') return ctx.userName
  return SAMPLE_PEOPLE.find((person) => person.key === who)?.name ?? ''
}

interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  href?: string
  mention?: { user_id: string }
}

/** A content text as its plain projection and its rich runs (null when it
 * is plain text with nothing on it). */
function richText(
  ctx: SampleContext,
  value: SampleText | undefined,
): { text: string; rich: { version: 1; runs: Run[] } | null } {
  if (value === undefined) return { text: '', rich: null }
  if (typeof value === 'string') return { text: value, rich: null }
  const runs: Run[] = value.map((run: SampleRun): Run => {
    if (typeof run === 'string') return { text: run }
    if ('mention' in run) {
      return {
        text: `@${personName(ctx, run.mention)}`,
        mention: { user_id: personId(ctx, run.mention) },
      }
    }
    const target =
      run.page !== undefined
        ? `/app/folders/${ctx.folders.get(run.page) ?? ''}`
        : run.task !== undefined
          ? `/app/tasks/${ctx.tasks.get(run.task) ?? ''}`
          : run.href
    return {
      text: run.text,
      ...(run.bold === true ? { bold: true } : {}),
      ...(run.italic === true ? { italic: true } : {}),
      ...(target === undefined ? {} : { href: target }),
    }
  })
  return { text: runs.map((run) => run.text).join(''), rich: { version: 1, runs } }
}

async function writeTask(ctx: SampleContext, folderId: string, task: SampleTask): Promise<string> {
  const { tx, clock, userId, anchor } = ctx
  const dueDate = task.due === undefined ? null : resolveDue(anchor, task.due)
  const startDate = task.start === undefined ? null : resolveDue(anchor, task.start)
  const completed = task.doneDaysAgo !== undefined
  const status = completed ? 'completed' : task.abandoned === true ? 'abandoned' : 'pending'
  const assignee = task.assignee === undefined ? userId : personId(ctx, task.assignee)
  const seriesId = task.repeat === undefined ? null : randomUUID()

  /* A repeating task's earlier occurrences, each completed on its day: the
     completion history a month of use leaves behind. */
  for (const daysAgo of task.history ?? []) {
    const made = await rowsOf(
      tx,
      sql`INSERT INTO tasks
            (folder_id, title, status, due_date, due_time, series_id, assignee_id,
             created_by, completed_at, completed_by, created_at)
          VALUES (${folderId}::uuid, ${task.title}, 'completed',
                  ${shiftDays(anchor, -daysAgo)}::date, ${task.time ?? null}::time,
                  ${seriesId}::uuid, ${userId}::uuid, ${userId}::uuid,
                  ${ago(daysAgo, -1)}, ${userId}::uuid, ${clock()})
          RETURNING id`,
    )
    await register(tx, userId, 'task', String(made[0]?.id))
  }

  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO tasks
          (folder_id, title, notes, important, status, due_date, due_time, start_date,
           recurrence_rule, series_id, assignee_id, created_by,
           completed_at, completed_by, created_at)
        VALUES (${folderId}::uuid, ${task.title}, ${task.notes ?? null},
                ${task.important ?? false}, ${status},
                ${dueDate}::date, ${task.time ?? null}::time, ${startDate}::date,
                ${task.repeat ?? null}, ${seriesId}::uuid,
                ${assignee}::uuid, ${userId}::uuid,
                ${completed ? ago(task.doneDaysAgo ?? 0, -2) : sql`NULL`},
                ${completed ? sql`${userId}::uuid` : sql`NULL`}, ${clock()})
        RETURNING id`,
  )
  const taskId = String(inserted[0]?.id)
  await register(tx, userId, 'task', taskId)
  ctx.tasks.set(task.title, taskId)

  // A sample task's steps are its checklist, after its notes (0060).
  await appendChecklist(tx, taskId, task.steps ?? [])
  if (task.today === true && status === 'pending') {
    await tx.execute(
      sql`INSERT INTO my_day_entries (task_id, user_id, added_on)
          VALUES (${taskId}::uuid, ${userId}::uuid, ${anchor}::date)`,
    )
  }
  if (task.reminder !== undefined && dueDate !== null) {
    await upsertReminder(
      tx,
      taskId,
      'at' in task.reminder
        ? { offsetMinutes: null, timeOfDay: task.reminder.at }
        : { offsetMinutes: task.reminder.before, timeOfDay: null },
      userId,
    )
  }
  return taskId
}

/** A post's stored shape: its plain body and, when it carries runs, the
 * one-paragraph post content. */
function postColumns(ctx: SampleContext, value: SampleText): { body: string; content: string | null } {
  const { text, rich } = richText(ctx, value)
  const content =
    rich === null
      ? null
      : JSON.stringify({ version: 1, blocks: [{ kind: 'paragraph', rich_content: rich }] })
  return { body: text, content }
}

/** Writes one post, its likes and its replies into a Discussion. */
async function writePost(
  ctx: SampleContext,
  folderId: string,
  discussionId: string,
  post: SamplePost,
  parentId: string | null = null,
): Promise<void> {
  const { tx } = ctx
  const { body, content } = postColumns(ctx, post.text)
  const made = await rowsOf(
    tx,
    sql`INSERT INTO comments
          (folder_id, discussion_id, parent_id, author_id, body, content, created_at)
        VALUES (${folderId}::uuid, ${discussionId}::uuid,
                ${parentId}::uuid, ${personId(ctx, post.by)}::uuid, ${body},
                ${content}::jsonb, ${ago(post.daysAgo, post.hoursAgo ?? 0)})
        RETURNING id`,
  )
  const commentId = String(made[0]?.id)
  for (const who of post.likes ?? []) {
    await tx.execute(
      sql`INSERT INTO comment_likes (comment_id, user_id, created_at)
          VALUES (${commentId}::uuid, ${personId(ctx, who)}::uuid,
                  ${ago(post.daysAgo, (post.hoursAgo ?? 0) - 1)})`,
    )
  }
  for (const reply of post.replies ?? []) {
    await writePost(ctx, folderId, discussionId, reply, commentId)
  }
}

/** Hours before now, the one clock posts are compared on. */
function hoursAgo(post: { daysAgo: number; hoursAgo?: number }): number {
  return post.daysAgo * 24 + (post.hoursAgo ?? 0)
}

/** A Discussion and its posts; `taskId` links it to the task it is about
 * (M5: a sample task's conversation is its Discussion, as a real one is). */
async function writeThread(
  ctx: SampleContext,
  folderId: string,
  thread: SampleThread,
  taskId: string | null = null,
): Promise<void> {
  const { tx } = ctx
  const all = thread.posts.flatMap((post) => [post, ...(post.replies ?? [])])
  const first = Math.max(...all.map(hoursAgo))
  const last = Math.min(...all.map(hoursAgo))
  const made = await rowsOf(
    tx,
    sql`INSERT INTO discussions (folder_id, task_id, title, created_by, last_activity_at, created_at, updated_at)
        VALUES (${folderId}::uuid, ${taskId}::uuid, ${thread.title}, ${personId(ctx, thread.by)}::uuid,
                ${ago(0, last)}, ${ago(0, first)}, ${ago(0, last)})
        RETURNING id`,
  )
  const discussionId = String(made[0]?.id)
  for (const post of thread.posts) await writePost(ctx, folderId, discussionId, post)
  if (thread.resolved !== undefined) {
    const { by, daysAgo, decision } = thread.resolved
    const outcome = await rowsOf(
      tx,
      sql`INSERT INTO discussion_outcomes (discussion_id, statement, actor_id, created_at)
          VALUES (${discussionId}::uuid, ${decision}, ${personId(ctx, by)}::uuid, ${ago(daysAgo)})
          RETURNING id`,
    )
    await tx.execute(
      sql`UPDATE discussions
             SET state = 'resolved', resolved_at = ${ago(daysAgo)},
                 resolved_by = ${personId(ctx, by)}::uuid,
                 current_outcome_id = ${String(outcome[0]?.id)}::uuid,
                 last_activity_at = ${ago(daysAgo)}, updated_at = ${ago(daysAgo)}
           WHERE id = ${discussionId}::uuid`,
    )
  }
}

/** A Doc page's document (Purpose, Results or a custom tab): flat blocks, in
 * order. */
async function writeDocDocument(
  ctx: SampleContext,
  pageId: string,
  blocks: readonly SampleBlock[],
): Promise<void> {
  const keys = initialKeys(blocks.length)
  for (const [index, block] of blocks.entries()) {
    // The Doc kind rule, since this insert does not go through the applier.
    if (!allowedIn(block.kind, 'doc')) throw new Error(`The sample puts a ${block.kind} block on a Doc page.`)
    const { text, rich } = richText(ctx, block.text)
    await ctx.tx.execute(
      sql`INSERT INTO page_blocks (folder_id, kind, position, page_position, text, rich_content, checked)
          VALUES (${pageId}::uuid, ${block.kind}, ${index}, ${keys[index] ?? null},
                  ${block.kind === 'divider' ? null : text},
                  ${rich === null ? null : JSON.stringify(rich)}::jsonb,
                  ${block.kind === 'checklist' ? (block.checked ?? false) : null})`,
    )
  }
}

type OutlineItem = {
  kind: 'block' | 'task'
  id: string
  section_block_id: string | null
  list_parent_block_id: string | null
}

/** The Work document, through the page's own applier, so the sample is held
 * to every rule a person's edit is: nesting, sections, rich text. */
async function writeMainDocument(
  ctx: SampleContext,
  folder: SampleFolder,
  folderId: string,
): Promise<void> {
  const { tx } = ctx
  const operations: DocumentOperation[] = []
  const outline: OutlineItem[] = []
  const placed = new Set<string>()
  let section: string | null = null

  const pageBlocks = await rowsOf(
    tx,
    sql`SELECT id, ref_folder_id FROM page_blocks
         WHERE folder_id = ${folderId}::uuid AND kind = 'page'`,
  )
  const pageBlockOf = new Map(pageBlocks.map((row) => [String(row.ref_folder_id), String(row.id)]))
  const ownTasks = new Map(
    (folder.tasks ?? []).map((task) => [task.title, ctx.tasks.get(task.title) ?? '']),
  )

  const putBlock = (block: SampleBlock, parent: string | null): void => {
    const id = randomUUID()
    const { text, rich } = richText(ctx, block.text)
    operations.push({
      op: 'put_block',
      id,
      block_kind: block.kind,
      text: block.kind === 'divider' ? null : text,
      rich_content: rich,
      file_id: null,
      ref_folder_id: null,
      width_pct: null,
      checked: block.kind === 'checklist' ? (block.checked ?? false) : null,
      ...(block.toggleable === true ? { toggleable: true } : {}),
    })
    if (block.kind === 'section') section = id
    outline.push({
      kind: 'block',
      id,
      section_block_id: block.kind === 'section' ? null : section,
      list_parent_block_id: parent,
    })
    for (const child of block.children ?? []) putBlock(child, id)
  }

  for (const item of folder.doc ?? []) {
    if ('task' in item) {
      const id = ownTasks.get(item.task)
      if (id === undefined || id === '') continue
      /* A repeating task's history stands just above its live occurrence,
         oldest first: done work reads as progress above what is next. */
      if ((folder.tasks ?? []).some((task) => task.title === item.task && (task.history ?? []).length > 0)) {
        const earlier = await rowsOf(
          tx,
          sql`SELECT id FROM tasks
               WHERE folder_id = ${folderId}::uuid AND title = ${item.task}
                 AND status = 'completed' AND id <> ${id}::uuid
               ORDER BY due_date ASC, id ASC`,
        )
        for (const row of earlier) {
          placed.add(String(row.id))
          outline.push({ kind: 'task', id: String(row.id), section_block_id: section, list_parent_block_id: null })
        }
      }
      placed.add(id)
      outline.push({ kind: 'task', id, section_block_id: section, list_parent_block_id: null })
    } else if ('page' in item) {
      const id = pageBlockOf.get(ctx.folders.get(item.page) ?? '')
      if (id === undefined) continue
      placed.add(id)
      outline.push({ kind: 'block', id, section_block_id: section, list_parent_block_id: null })
    } else {
      putBlock(item, null)
    }
  }
  // Whatever the document did not name goes last.
  for (const item of await positionedItems(tx, folderId)) {
    if (placed.has(item.id)) continue
    outline.push({ kind: item.kind, id: item.id, section_block_id: section, list_parent_block_id: null })
  }
  if (operations.length === 0) return

  const metadata = await documentMetadata(tx, folderId)
  const body = documentTransaction.parse({
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: metadata.revision,
    operations: [...operations, { op: 'set_outline', items: outline }],
  })
  await applyDocument(tx, ctx.userId, folderId, body)
}

async function writeFolderRow(
  ctx: SampleContext,
  folder: SampleFolder,
  parentId: string | null,
  people: readonly SamplePersonKey[],
): Promise<string> {
  const { tx, clock, userId } = ctx
  const childPosition = parentId === null ? null : await lastChildPosition(tx, parentId)
  /* Step 7: a top-level sample page is a Work project whose tab sits at
     `a1`, leaving `a0` for its Purpose tab; a sub-page joins the parent's
     project, a Doc when it holds pages or no tasks. */
  const newId = randomUUID()
  const holdsPages = folder.purpose !== undefined || folder.results !== undefined || folder.tab !== undefined
  const kind = parentId === null ? 'work' : holdsPages || (folder.tasks ?? []).length === 0 ? 'doc' : 'work'
  const project = parentId === null
    ? sql`${newId}::uuid`
    : sql`(SELECT p.project_id FROM folders p WHERE p.id = ${parentId}::uuid)`
  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO folders (id, owner_id, name, icon, color, description, cover_preset,
                             parent_folder_id, child_position, created_at,
                             project_id, kind, tab_position)
        VALUES (${newId}::uuid, ${userId}::uuid, ${folder.name}, ${folder.icon ?? null},
                ${folder.color ?? null}, ${folder.description ?? null},
                ${folder.cover ?? null},
                ${parentId}::uuid, ${childPosition}, ${clock()},
                ${project}, ${kind}, ${parentId === null ? 'a1' : null})
        RETURNING id`,
  )
  const folderId = String(inserted[0]?.id)
  await register(tx, userId, 'folder', folderId)
  /* The sample workspace is the new account's own: owner plus Full control,
     with the baseline transition beside it (issue #228). The sample people
     are ordinary members who can edit. */
  await tx.execute(
    sql`INSERT INTO folder_members (folder_id, user_id, access)
        VALUES (${folderId}::uuid, ${userId}::uuid, 'full_control')`,
  )
  await recordAccessTransition(tx, {
    folderId,
    memberId: userId,
    previousAccess: null,
    newAccess: 'full_control',
    actorId: userId,
    transition: 'created_owner',
  })
  for (const key of people) {
    await tx.execute(
      sql`INSERT INTO folder_members (folder_id, user_id, access)
          VALUES (${folderId}::uuid, ${personId(ctx, key)}::uuid, 'can_edit')`,
    )
  }
  await recordEvent(tx, {
    actorId: userId,
    verb: 'created',
    subjectKind: 'folder',
    subjectId: folderId,
    subjectName: folder.name,
    folderId,
    detail: 'part of the sample workspace',
  })
  if (parentId !== null) await appendHomeBlock(tx, parentId, folderId)
  return folderId
}

/**
 * One more page of a sample project: a tab of the root (`tabPosition`) or a
 * child Doc page of a sub-page (`parentId`, with its home block). It has
 * `source`'s people, as a tab or a sub-page does.
 */
async function writeSamplePage(
  ctx: SampleContext,
  source: string,
  page: { name: string; kind: 'doc' | 'discussion'; tabPosition: string | null; parentId: string | null },
): Promise<string> {
  const { tx, clock, userId } = ctx
  const id = randomUUID()
  const childPosition = page.parentId === null ? null : await lastChildPosition(tx, page.parentId)
  await tx.execute(
    sql`INSERT INTO folders (id, owner_id, name, created_at, parent_folder_id, child_position,
                             project_id, kind, tab_position)
        SELECT ${id}::uuid, ${userId}::uuid, ${page.name}, ${clock()},
               ${page.parentId}::uuid, ${childPosition}, s.project_id, ${page.kind}, ${page.tabPosition}
          FROM folders s WHERE s.id = ${source}::uuid`,
  )
  await tx.execute(
    sql`INSERT INTO folder_members (folder_id, user_id, access, created_at)
        SELECT ${id}::uuid, m.user_id, m.access, m.created_at FROM folder_members m
         WHERE m.folder_id = ${source}::uuid`,
  )
  await recordAccessTransition(tx, {
    folderId: id,
    memberId: userId,
    previousAccess: null,
    newAccess: 'full_control',
    actorId: userId,
    transition: 'created_owner',
  })
  if (page.parentId !== null) {
    await register(tx, userId, 'folder', id)
    await appendHomeBlock(tx, page.parentId, id)
  }
  return id
}

/** Purpose, Results and a custom tab: Doc tabs of a project (Purpose before
 * Work, the others after), or child Doc pages of a sub-page. */
async function writeDocPages(ctx: SampleContext, folder: SampleFolder, folderId: string): Promise<void> {
  const isRoot = folder.parent === undefined
  const place = (tabPosition: string) =>
    isRoot ? { tabPosition, parentId: null } : { tabPosition: null, parentId: folderId }
  if (folder.purpose !== undefined) {
    const id = await writeSamplePage(ctx, folderId, { name: 'Purpose', kind: 'doc', ...place('a0') })
    await writeDocDocument(ctx, id, folder.purpose)
  }
  if (folder.results !== undefined) {
    const id = await writeSamplePage(ctx, folderId, { name: 'Results', kind: 'doc', ...place('a2') })
    await writeDocDocument(ctx, id, folder.results)
  }
  if (folder.tab !== undefined) {
    const id = await writeSamplePage(ctx, folderId, { name: folder.tab.name, kind: 'doc', ...place('a3') })
    await writeDocDocument(ctx, id, folder.tab.blocks)
  }
}

/**
 * Writes the whole sample for one account on the caller's executor. The
 * caller owns the transaction: provisioning runs it inside 7.1's own, so a
 * fault anywhere takes the account down with it rather than leaving half a
 * workspace, and POST /sample runs it inside one of its own.
 */
export async function createSampleWorkspace(
  tx: Executor,
  userId: string,
  zone: string,
): Promise<SampleCounts> {
  const me = await rowsOf(tx, sql`SELECT display_name FROM users WHERE id = ${userId}::uuid`)
  const ctx: SampleContext = {
    tx,
    clock: sampleClock(),
    userId,
    userName: String(me[0]?.display_name ?? 'me'),
    anchor: today(zone),
    folders: new Map(),
    tasks: new Map(),
  }
  await ensureSamplePeople(tx)

  // The page tree first, parents before children, so every name resolves.
  const people = new Map<string, readonly SamplePersonKey[]>()
  /* A project's own sub-pages sit in its Pages tab, right after Work, as
     "Add a page inside" and migration 0061 place them. */
  const pagesTabs = new Map<string, string>()
  const pagesTabOf = async (rootId: string): Promise<string> => {
    const known = pagesTabs.get(rootId)
    if (known !== undefined) return known
    const id = await writeSamplePage(ctx, rootId, {
      name: 'Pages',
      kind: 'doc',
      tabPosition: keyBetween('a1', 'a2'),
      parentId: null,
    })
    pagesTabs.set(rootId, id)
    return id
  }
  for (const folder of SAMPLE_WORKSPACE.folders) {
    const parent = SAMPLE_WORKSPACE.folders.find((each) => each.name === folder.parent)
    const parentRow = folder.parent === undefined ? null : (ctx.folders.get(folder.parent) ?? null)
    const parentId =
      parentRow !== null && parent !== undefined && parent.parent === undefined ? await pagesTabOf(parentRow) : parentRow
    const inherited = folder.parent === undefined ? [] : (people.get(folder.parent) ?? [])
    const members = [...new Set([...inherited, ...(folder.members ?? [])])]
    people.set(folder.name, members)
    ctx.folders.set(folder.name, await writeFolderRow(ctx, folder, parentId, members))
  }
  // Then every task, so a Dana link to one resolves wherever it is written.
  for (const folder of SAMPLE_WORKSPACE.folders) {
    for (const task of folder.tasks ?? []) {
      await writeTask(ctx, ctx.folders.get(folder.name) ?? '', task)
    }
  }
  const desk = await rowsOf(
    tx,
    sql`SELECT id FROM folders WHERE owner_id = ${userId}::uuid AND is_default`,
  )
  const deskId = String(desk[0]?.id)
  for (const task of SAMPLE_WORKSPACE.desk) await writeTask(ctx, deskId, task)
  for (const folder of SAMPLE_WORKSPACE.folders) {
    for (const task of folder.tasks ?? []) {
      for (const blocker of task.waitsOn ?? []) {
        /* By title: a title that names no sample task says so here, rather
           than failing every sign-up on a ''::uuid cast. */
        const dependent = ctx.tasks.get(task.title)
        const blocking = ctx.tasks.get(blocker)
        if (dependent === undefined || blocking === undefined) {
          throw new Error(`Sample waitsOn: "${task.title}" waits on "${blocker}", which is not a sample task`)
        }
        await tx.execute(
          sql`INSERT INTO task_dependencies (dependent_task_id, blocking_task_id, created_by)
              VALUES (${dependent}::uuid, ${blocking}::uuid, ${userId}::uuid)`,
        )
      }
    }
  }

  // Then the writing and the conversations.
  for (const folder of SAMPLE_WORKSPACE.folders) {
    const folderId = ctx.folders.get(folder.name) ?? ''
    await writeMainDocument(ctx, folder, folderId)
    await writeDocPages(ctx, folder, folderId)
    for (const task of folder.tasks ?? []) {
      const posts = task.thread ?? []
      const opener = [...posts].sort((a, b) => hoursAgo(b) - hoursAgo(a))[0]
      if (opener === undefined) continue
      await writeThread(
        ctx,
        folderId,
        { title: task.title, by: opener.by, posts },
        ctx.tasks.get(task.title) ?? null,
      )
    }
    for (const thread of folder.threads ?? []) await writeThread(ctx, folderId, thread)
  }
  // Step 7: a project with threads anywhere has its Discussion tab, last.
  for (const folder of SAMPLE_WORKSPACE.folders) {
    if (folder.parent !== undefined) continue
    const rootId = ctx.folders.get(folder.name) ?? ''
    const talks = await rowsOf(
      tx,
      sql`SELECT 1 FROM discussions d JOIN folders f ON f.id = d.folder_id
           WHERE f.project_id = ${rootId}::uuid LIMIT 1`,
    )
    if (talks.length > 0) {
      await writeSamplePage(ctx, rootId, { name: 'Discussion', kind: 'discussion', tabPosition: 'a4', parentId: null })
    }
  }

  await tx.execute(
    sql`UPDATE user_settings
           SET focus_lists = ${JSON.stringify(SAMPLE_WORKSPACE.focusLists)}::jsonb
         WHERE user_id = ${userId}::uuid`,
  )

  for (const view of SAMPLE_WORKSPACE.views) {
    const made = await rowsOf(
      tx,
      sql`INSERT INTO user_views (user_id, name, definition, pinned)
          VALUES (${userId}::uuid, ${view.name},
                  ${JSON.stringify(view.definition)}::jsonb, ${view.pinned})
          RETURNING id`,
    )
    await register(tx, userId, 'view', String(made[0]?.id))
  }

  return countLive(tx, userId)
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** The registered objects that still exist, by kind. A register row whose
 * object the person destroyed themselves counts for nothing. */
async function countLive(db: Executor, userId: string): Promise<SampleCounts> {
  const rows = await rowsOf(
    db,
    sql`SELECT
          (SELECT count(*)::int FROM sample_objects s JOIN shelves o ON o.id = s.id
            WHERE s.user_id = ${userId}::uuid AND s.kind = 'shelf') AS shelves,
          (SELECT count(*)::int FROM sample_objects s JOIN folders o ON o.id = s.id
            WHERE s.user_id = ${userId}::uuid AND s.kind = 'folder') AS folders,
          (SELECT count(*)::int FROM sample_objects s JOIN tasks o ON o.id = s.id
            WHERE s.user_id = ${userId}::uuid AND s.kind = 'task') AS tasks,
          (SELECT count(*)::int FROM sample_objects s JOIN user_views o ON o.id = s.id
            WHERE s.user_id = ${userId}::uuid AND s.kind = 'view') AS views`,
  )
  const row = rows[0]
  return {
    shelves: Number(row?.shelves ?? 0),
    folders: Number(row?.folders ?? 0),
    tasks: Number(row?.tasks ?? 0),
    views: Number(row?.views ?? 0),
  }
}

export async function sampleStatus(db: Executor, userId: string): Promise<SampleStatus> {
  const counts = await countLive(db, userId)
  const present = counts.shelves + counts.folders + counts.tasks + counts.views > 0
  return { present, counts }
}

/* ------------------------------------------------------------------ *
 * Removal
 * ------------------------------------------------------------------ */

export interface SampleRemoval {
  /** The files rows the cascades dropped; the caller removes the bytes
   * after its commit (7.15's order). */
  fileIds: string[]
  /** Sample folders left standing because someone else is a member. */
  keptFolders: string[]
  /** Sample pages the person wrote into, moved to Trash with their writing. */
  trashedFolders: string[]
}

function idList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
}

export async function removeSampleWorkspace(
  db: Db,
  userId: string,
): Promise<SampleRemoval> {
  return inTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${userId}::uuid FOR UPDATE`)

    // What the person wrote after the sample did: a task the sample did not
    // write, a block written or edited since (the sample's own carry the
    // register's moment, one transaction's now()), a comment or a thread of
    // theirs posted since.
    // A project's writing is in any of its pages: the root and its tabs (a
    // Discussion tab's threads, a Doc tab's blocks). A sub-page is its own
    // registered row and is judged on its own.
    const ownWriting = (folder: SQL, since: SQL): SQL => {
      const pages = sql`(SELECT pf.id FROM folders pf
                          WHERE pf.id = ${folder}
                             OR (pf.project_id = ${folder} AND pf.id <> pf.project_id
                                 AND pf.tab_position IS NOT NULL))`
      return sql`(
      EXISTS (SELECT 1 FROM tasks t
               WHERE t.folder_id IN ${pages}
                 AND t.id NOT IN (SELECT o.id FROM sample_objects o
                                   WHERE o.user_id = ${userId}::uuid AND o.kind = 'task'))
      OR EXISTS (SELECT 1 FROM page_blocks b
                  WHERE b.updated_at > ${since}
                    AND (b.folder_id IN ${pages}
                         OR b.task_id IN (SELECT t.id FROM tasks t WHERE t.folder_id IN ${pages})))
      OR EXISTS (SELECT 1 FROM comments c
                  WHERE c.folder_id IN ${pages} AND c.author_id = ${userId}::uuid
                    AND c.created_at > ${since})
      OR EXISTS (SELECT 1 FROM discussions d
                  WHERE d.folder_id IN ${pages} AND d.created_by = ${userId}::uuid
                    AND d.created_at > ${since}))`
    }

    const folders = await rowsOf(
      tx,
      /* A sub-page under a tab (a project's Pages tab) hangs from its
         project for this walk: tabs are not registered. */
      sql`SELECT f.id, f.name,
                 (SELECT CASE WHEN pp.tab_position IS NOT NULL THEN pp.project_id ELSE pp.id END
                    FROM folders pp WHERE pp.id = f.parent_folder_id) AS parent_folder_id,
                 f.deleted_at IS NOT NULL AS trashed,
                 (SELECT count(*)::int FROM folder_members m
                   WHERE m.folder_id = f.id AND m.user_id <> ${userId}::uuid
                     AND m.user_id NOT IN (${idList(SAMPLE_PERSON_IDS)})) AS others,
                 ${ownWriting(sql`f.id`, sql`s.created_at`)} AS own_work
          FROM sample_objects s
          JOIN folders f ON f.id = s.id AND f.owner_id = ${userId}::uuid
          WHERE s.user_id = ${userId}::uuid AND s.kind = 'folder'`,
    )
    // A sample page someone else holds stays where it is. A sample page the
    // person wrote into goes to Trash, whole, from the top of its sample
    // tree, so their writing comes back in its place on a restore, nothing
    // of the sample stays in view, and the undo's fresh sample has no
    // survivor beside it to duplicate.
    const byId = new Map(folders.map((row) => [String(row.id), row]))
    const shared = (id: string): boolean => Number(byId.get(id)?.others ?? 0) > 0
    const rootOf = (id: string): string => {
      let at = id
      for (;;) {
        const parent = byId.get(at)?.parent_folder_id
        if (parent === null || parent === undefined) return at
        const up = String(parent)
        if (!byId.has(up) || shared(up)) return at
        at = up
      }
    }
    const trashRoots = [
      ...new Set(
        folders
          .filter((row) => !shared(String(row.id)) && row.own_work === true && row.trashed !== true)
          .map((row) => rootOf(String(row.id))),
      ),
    ]
    // A page the person already put in Trash with their writing in it stays there.
    const inTrashedTree = (id: string): boolean =>
      trashRoots.includes(rootOf(id)) ||
      (byId.get(id)?.trashed === true && byId.get(id)?.own_work === true)
    const keptRows = folders.filter((row) => shared(String(row.id)))
    const doomedFolders = folders
      .map((row) => String(row.id))
      .filter((id) => !shared(id) && !inTrashedTree(id))
    const keptFolders = keptRows.map((row) => String(row.name))
    const trashedFolders = trashRoots.map((id) => String(byId.get(id)?.name ?? ''))

    if (trashRoots.length > 0) {
      await lockPageTree(tx)
      // A shared page under one going to Trash stays live, at the top level.
      const detach = keptRows
        .filter((row) => row.parent_folder_id !== null && inTrashedTree(String(row.parent_folder_id)))
        .map((row) => String(row.id))
      if (detach.length > 0) {
        await tx.execute(
          sql`UPDATE folders SET parent_folder_id = NULL, child_position = NULL
              WHERE id IN (${idList(detach)})`,
        )
      }
      for (const id of trashRoots) {
        await removeHomeBlock(tx, id)
        await trashFolderSubtree(tx, userId, id)
      }
    }

    // A doomed project's tabs go with it. They are not registered (only the
    // root and sub-pages are), and a page left out of the doomed list is
    // released into a project of its own rather than deleted.
    if (doomedFolders.length > 0) {
      const tabs = await rowsOf(
        tx,
        sql`SELECT id FROM folders
             WHERE project_id IN (${idList(doomedFolders)}) AND id <> project_id
               AND tab_position IS NOT NULL AND owner_id = ${userId}::uuid
               AND NOT EXISTS (SELECT 1 FROM folder_members m
                                WHERE m.folder_id = folders.id AND m.user_id <> ${userId}::uuid
                                  AND m.user_id NOT IN (${idList(SAMPLE_PERSON_IDS)}))`,
      )
      for (const row of tabs) {
        if (!doomedFolders.includes(String(row.id))) doomedFolders.push(String(row.id))
      }
    }

    // The tasks still where the sample put them: in a doomed sample folder
    // or on Desk. A task in any other folder has been adopted.
    const doomedTasks: SQL = sql`
      SELECT t.id FROM sample_objects s
      JOIN tasks t ON t.id = s.id
      JOIN folders f ON f.id = t.folder_id
      WHERE s.user_id = ${userId}::uuid AND s.kind = 'task'
        AND ((f.is_default AND f.owner_id = ${userId}::uuid
              AND NOT EXISTS (SELECT 1 FROM discussions d
                               WHERE d.task_id = t.id
                                 AND ((d.created_by = ${userId}::uuid AND d.created_at > s.created_at)
                                      OR EXISTS (SELECT 1 FROM comments c
                                                  WHERE c.discussion_id = d.id
                                                    AND c.author_id = ${userId}::uuid
                                                    AND c.created_at > s.created_at)))
              AND NOT EXISTS (SELECT 1 FROM page_blocks b
                               WHERE b.task_id = t.id AND b.updated_at > s.created_at))
             ${doomedFolders.length === 0 ? sql`` : sql`OR f.id IN (${idList(doomedFolders)})`})`

    const tasks = await destroyTasks(tx, doomedTasks)
    const fileIds = [...tasks.fileIds]
    if (doomedFolders.length > 0) {
      const destroyed = await destroyFolders(
        tx,
        sql`SELECT id FROM folders WHERE id IN (${idList(doomedFolders)}) FOR UPDATE`,
      )
      fileIds.push(...destroyed.fileIds)
    }

    // Shelves (accounts provisioned before the sample became a page tree
    // still have registered ones), and the memberships that spelled them on any folder the person
    // put on one themselves (4.18 holds the two in step).
    const shelves = await rowsOf(
      tx,
      sql`DELETE FROM shelves
          WHERE user_id = ${userId}::uuid
            AND id IN (SELECT id FROM sample_objects
                        WHERE user_id = ${userId}::uuid AND kind = 'shelf')
          RETURNING id, name`,
    )
    if (shelves.length > 0) {
      await tx.execute(
        sql`UPDATE folder_members SET shelf_name = NULL
            WHERE user_id = ${userId}::uuid
              AND shelf_name IN (${sql.join(
                shelves.map((row) => sql`${String(row.name)}`),
                sql`, `,
              )})`,
      )
      await tx.execute(
        sql`DELETE FROM events
            WHERE subject_kind = 'shelf'
              AND subject_id IN (${idList(shelves.map((row) => String(row.id)))})`,
      )
    }

    const views = await rowsOf(
      tx,
      sql`DELETE FROM user_views
          WHERE user_id = ${userId}::uuid
            AND id IN (SELECT id FROM sample_objects
                        WHERE user_id = ${userId}::uuid AND kind = 'view')
          RETURNING id`,
    )

    // The settings bundle's references to what is gone: the sidebar's
    // order, the pin list and the per-page arrangements are keyed by id.
    const gone = [
      ...doomedFolders,
      ...shelves.map((row) => String(row.id)),
      ...views.map((row) => String(row.id)),
    ]
    if (gone.length > 0) {
      const goneJson = JSON.stringify(gone)
      await tx.execute(
        sql`UPDATE user_settings SET
              sidebar_order = COALESCE(
                (SELECT jsonb_agg(e) FROM jsonb_array_elements(sidebar_order) e
                  WHERE NOT (${goneJson}::jsonb ? (e #>> '{}'))), '[]'::jsonb),
              pinned_views = CASE WHEN pinned_views IS NULL THEN NULL ELSE COALESCE(
                (SELECT jsonb_agg(e) FROM jsonb_array_elements(pinned_views) e
                  WHERE NOT (${goneJson}::jsonb ? (e #>> '{}'))), '[]'::jsonb) END,
              arrangements = COALESCE(
                (SELECT jsonb_object_agg(k, v) FROM jsonb_each(arrangements) AS kv(k, v)
                  WHERE NOT (${goneJson}::jsonb ? k)), '{}'::jsonb)
            WHERE user_id = ${userId}::uuid`,
      )
    }

    // The register is spent whatever it named: adopted tasks and kept
    // folders are the person's from here.
    await tx.execute(sql`DELETE FROM sample_objects WHERE user_id = ${userId}::uuid`)

    return { fileIds, keptFolders, trashedFolders }
  })
}

export type RestoreSampleResult =
  | { kind: 'restored'; status: SampleStatus }
  | { kind: 'shelf_name_taken' }

/**
 * POST /sample: the workspace again for an account that no longer has one.
 * Idempotent while it is present, which is what lets the undo bar and a
 * double press both land on one workspace.
 *
 * The person's zone is read here rather than handed in, under the same lock
 * that serialises the restore, and the refusal below is classified here
 * rather than in the route (issue #38): `routes/sample.ts` held both, and it
 * was the only route file in the directory issuing SQL of its own or reading
 * a driver's error code. A route parses, calls, and maps a result to a
 * status; this is the result for it to map.
 */
export async function restoreSampleWorkspace(
  db: Db,
  userId: string,
): Promise<RestoreSampleResult> {
  try {
    const status = await inTransaction(db, async (tx) => {
      const locked = await rowsOf(
        tx,
        sql`SELECT timezone FROM users WHERE id = ${userId}::uuid FOR UPDATE`,
      )
      const current = await sampleStatus(tx, userId)
      if (current.present) return current
      await tx.execute(sql`DELETE FROM sample_objects WHERE user_id = ${userId}::uuid`)
      const counts = await createSampleWorkspace(
        tx,
        userId,
        String(locked[0]?.timezone ?? 'UTC'),
      )
      return { present: true, counts }
    })
    return { kind: 'restored', status }
  } catch (error) {
    // 4.18's (user_id, name) unique: the person has a shelf of their own by
    // one of the sample's names, and the sample will not rename theirs to
    // make room for its own.
    const message = String((error as { message?: string })?.message ?? error)
    if (/23505|unique/i.test(message)) return { kind: 'shelf_name_taken' }
    throw error
  }
}
