import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { DirectMessage, DirectMessagePage } from '../../shared/direct-messages.js'
import { rowsOf } from '../database.js'

const PAGE_SIZE = 50

function toMessage(row: Record<string, unknown>): DirectMessage {
  const created = row.created_at
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    author_id: String(row.author_id),
    body: String(row.body),
    created_at: created instanceof Date ? created.toISOString() : new Date(String(created)).toISOString(),
  }
}

export async function openDirectConversation(
  db: Db,
  viewerId: string,
  folderId: string,
  memberId: string,
): Promise<string | null> {
  if (viewerId === memberId) return null
  const [userA, userB] = viewerId < memberId ? [viewerId, memberId] : [memberId, viewerId]
  const rows = await rowsOf(db, sql`
    INSERT INTO direct_conversations (user_a_id, user_b_id)
    SELECT ${userA}::uuid, ${userB}::uuid FROM folders f
    JOIN folder_members me ON me.folder_id = f.project_id AND me.user_id = ${viewerId}::uuid
    JOIN folder_members other ON other.folder_id = f.project_id AND other.user_id = ${memberId}::uuid
    JOIN users u ON u.id = other.user_id AND u.deleted_at IS NULL
    WHERE f.id = ${folderId}::uuid AND f.deleted_at IS NULL
    ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET user_a_id = EXCLUDED.user_a_id
    RETURNING id`)
  return rows[0] === undefined ? null : String(rows[0].id)
}

export async function directMessagePage(
  db: Db,
  viewerId: string,
  conversationId: string,
  before?: string,
): Promise<DirectMessagePage | null> {
  const visible = await rowsOf(db, sql`
    SELECT 1 AS present FROM direct_conversations
    WHERE id = ${conversationId}::uuid AND
      (user_a_id = ${viewerId}::uuid OR user_b_id = ${viewerId}::uuid)`)
  if (visible.length === 0) return null
  const cursor = before === undefined ? null : (await rowsOf(db, sql`
    SELECT created_at FROM direct_messages
    WHERE id = ${before}::uuid AND conversation_id = ${conversationId}::uuid`))[0]
  if (before !== undefined && cursor === undefined) return null
  const rows = await rowsOf(db, sql`
    SELECT id, conversation_id, author_id, body, created_at
    FROM direct_messages
    WHERE conversation_id = ${conversationId}::uuid
      ${cursor === null ? sql`` : sql`AND (created_at, id) < (${cursor?.created_at}::timestamptz, ${before}::uuid)`}
    ORDER BY created_at DESC, id DESC
    LIMIT ${PAGE_SIZE + 1}`)
  return {
    messages: rows.slice(0, PAGE_SIZE).map(toMessage).reverse(),
    has_more: rows.length > PAGE_SIZE,
  }
}

export async function sendDirectMessage(
  db: Db,
  viewerId: string,
  conversationId: string,
  body: string,
): Promise<DirectMessage | null> {
  const rows = await rowsOf(db, sql`
    INSERT INTO direct_messages (conversation_id, author_id, body)
    SELECT id, ${viewerId}::uuid, ${body}
    FROM direct_conversations
    WHERE id = ${conversationId}::uuid AND
      (user_a_id = ${viewerId}::uuid OR user_b_id = ${viewerId}::uuid)
    RETURNING id, conversation_id, author_id, body, created_at`)
  return rows[0] === undefined ? null : toMessage(rows[0])
}
