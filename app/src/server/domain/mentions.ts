/*
@mentions (Wave 2, unit W-D; migration 0041).

A person mention is a rich-text run carrying `mention: { user_id }`
(`shared/rich-content.ts`). This module is the one place that turns those runs
into notices, and every document applier calls it **once, after its writes,
inside its own transaction**, so a mention and its notice commit or vanish
together.

The rules, in the order the code applies them:

1. **The id must be a person who exists**, or the save is refused through the
   caller's own refusal (its 422). Existence is the only thing checked, and it
   answers the same for a member and a non-member, so the refusal says nothing
   about who is on the page.
2. **Only the page's members are told.** A non-member mentioned in writing
   they cannot read gets no row and no notification -- a notice would name a
   page they cannot open. A private facet and a Shelf tell nobody: there is no
   one else who can read them.
3. **Once per (source, person).** `mention_notices` is inserted ON CONFLICT DO
   NOTHING RETURNING, and only the rows that came back are new; a re-save of
   the same paragraph returns nothing and notifies nobody. A mention removed
   and added back is not news either, which is the quiet answer.
4. **One `mentioned` event per save**, fanned to the people newly told, the
   actor never among them (`recordEvent`'s own rule, restated in the filter so
   the actor never gets a ledger row either).
*/
import { sql } from 'drizzle-orm'

import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'

export interface MentionSource {
  /** The Folder whose members may be told (a Task's, a facet's, the page's). */
  pageFolderId: string
  actorId: string
  /** The blocks this save wrote. Ignored when `commentId` is given. */
  blockIds?: Iterable<string>
  /** A post's comment (phase 2): its `content` is read instead of blocks. */
  commentId?: string
  /** The caller's refusal, so an unknown person leaves by the caller's own
   * door (its 422) and nothing here knows about HTTP. Default: `MentionRefusal`. */
  refuse?: (message: string) => Error
}

/** An unknown person in a post; the comment paths turn it into their 422. */
export class MentionRefusal extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The person ids a stored rich-content value (or a post's block tree) names. */
export function mentionedUserIds(value: unknown): string[] {
  const found = new Set<string>()
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (node === null || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    const mention = record.mention
    if (mention !== null && typeof mention === 'object') {
      const id = (mention as Record<string, unknown>).user_id
      if (typeof id === 'string' && UUID.test(id)) found.add(id.toLowerCase())
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== 'mention' && child !== null && typeof child === 'object') visit(child)
    }
  }
  visit(typeof value === 'string' ? safeParse(value) : value)
  return [...found]
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

interface Source {
  blockId: string | null
  commentId: string | null
  users: string[]
}

/**
 * Record and notify this save's new mentions. Returns the people newly told,
 * so a caller that also fans a `commented` event can leave them out of it.
 */
export async function syncMentions(tx: Executor, input: MentionSource): Promise<string[]> {
  const sources: Source[] = []
  let subject: { kind: 'folder' | 'task' | 'comment'; id: string; name: string } | null = null
  let detail = 'mentioned you'

  if (input.commentId !== undefined) {
    const rows = await rowsOf(
      tx,
      sql`SELECT c.id, c.content, c.body,
                 d.title AS discussion_title, f.name AS folder_name
            FROM comments c
            JOIN folders f ON f.id = c.folder_id
            LEFT JOIN discussions d ON d.id = c.discussion_id
           WHERE c.id = ${input.commentId}::uuid`,
    )
    const row = rows[0]
    if (row !== undefined) {
      sources.push({ blockId: null, commentId: String(row.id), users: mentionedUserIds(row.content) })
      const words = String(row.body ?? '')
      subject = { kind: 'comment', id: String(row.id), name: words.length > 120 ? `${words.slice(0, 119)}…` : words }
      // The thread's name, as the `commented` event's detail names it.
      const place = String(row.discussion_title ?? row.folder_name ?? '')
      detail = `mentioned you in "${place}"`.slice(0, 200)
    }
  } else {
    const ids = [...new Set(input.blockIds ?? [])]
    if (ids.length === 0) return []
    const rows = await rowsOf(
      tx,
      sql`SELECT b.id, b.rich_content, b.shelf_id, b.task_id
            FROM page_blocks b
           WHERE b.id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
             AND b.rich_content IS NOT NULL`,
    )
    for (const row of rows) {
      const users = mentionedUserIds(row.rich_content)
      if (users.length === 0) continue
      // Validated below even where nobody is told, so a bad id never lands.
      // A Shelf tells nobody. (A private tab, since step 7, is a project whose
      // only member is its owner, so nobody else could be told anyway.)
      const silent = row.shelf_id !== null
      sources.push({ blockId: String(row.id), commentId: null, users: silent ? [] : users })
      if (silent) sources.push({ blockId: null, commentId: null, users })
      if (subject === null && !silent) {
        if (row.task_id !== null) {
          const task = await rowsOf(tx, sql`SELECT title FROM tasks WHERE id = ${String(row.task_id)}::uuid`)
          subject = { kind: 'task', id: String(row.task_id), name: String(task[0]?.title ?? '') }
        }
      }
    }
    if (subject === null) {
      const folder = await rowsOf(tx, sql`SELECT name FROM folders WHERE id = ${input.pageFolderId}::uuid`)
      subject = { kind: 'folder', id: input.pageFolderId, name: String(folder[0]?.name ?? '') }
    }
  }

  const everyone = [...new Set(sources.flatMap((source) => source.users))]
  if (everyone.length === 0) return []

  // 1. Existence, answered alike for members and strangers.
  const list = sql.join(everyone.map((id) => sql`${id}::uuid`), sql`, `)
  const known = new Set(
    (await rowsOf(tx, sql`SELECT id FROM users WHERE id IN (${list})`)).map((row) => String(row.id)),
  )
  if (everyone.some((id) => !known.has(id))) {
    const message = 'mentions a person who does not exist'
    throw input.refuse === undefined ? new MentionRefusal(message) : input.refuse(message)
  }

  // 2. Members only; never the actor.
  const members = new Set(
    (
      await rowsOf(
        tx,
        sql`SELECT user_id FROM folder_members
             WHERE folder_id = ${input.pageFolderId}::uuid AND user_id IN (${list})`,
      )
    ).map((row) => String(row.user_id)),
  )
  members.delete(input.actorId)

  // 3. Once per (source, person).
  const inserted: { id: string; userId: string }[] = []
  for (const source of sources) {
    if (source.blockId === null && source.commentId === null) continue
    for (const userId of source.users) {
      if (!members.has(userId)) continue
      const rows = await rowsOf(
        tx,
        source.blockId !== null
          ? sql`INSERT INTO mention_notices (user_id, block_id)
                VALUES (${userId}::uuid, ${source.blockId}::uuid)
                ON CONFLICT (block_id, user_id) WHERE block_id IS NOT NULL DO NOTHING
                RETURNING id, user_id`
          : sql`INSERT INTO mention_notices (user_id, comment_id)
                VALUES (${userId}::uuid, ${source.commentId}::uuid)
                ON CONFLICT (comment_id, user_id) WHERE comment_id IS NOT NULL DO NOTHING
                RETURNING id, user_id`,
      )
      for (const row of rows) inserted.push({ id: String(row.id), userId: String(row.user_id) })
    }
  }
  if (inserted.length === 0 || subject === null) return []

  // 4. One event for the save, to the people newly told.
  const told = [...new Set(inserted.map((row) => row.userId))]
  const eventId = await recordEvent(tx, {
    actorId: input.actorId,
    verb: 'mentioned',
    subjectKind: subject.kind,
    subjectId: subject.id,
    subjectName: subject.name,
    folderId: input.pageFolderId,
    detail,
    recipients: told,
  })
  await tx.execute(
    sql`UPDATE mention_notices SET event_id = ${eventId}::uuid
         WHERE id IN (${sql.join(inserted.map((row) => sql`${row.id}::uuid`), sql`, `)})`,
  )
  return told
}
