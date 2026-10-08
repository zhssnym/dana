import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { DirectConversationSummary, DirectMessage, DirectMessagePage } from '../../shared/direct-messages.js'
import { rowsOf } from '../database.js'

const PAGE_SIZE = 50

export async function listDirectConversations(db: Db, viewerId: string): Promise<DirectConversationSummary[]> {
  const rows = await rowsOf(db, sql`
    SELECT c.id, peer.id AS member_id, peer.display_name AS member_name,
      peer.avatar_url AS member_image, latest.id AS latest_id,
      latest.body AS latest_body, latest.created_at AS latest_at,
      latest.author_id AS latest_author_id,
      (SELECT count(*)::int FROM direct_messages unread
       WHERE unread.conversation_id = c.id AND unread.author_id <> ${viewerId}::uuid
         AND unread.read_at IS NULL) AS unread
    FROM direct_conversations c
    JOIN users peer ON peer.id = CASE WHEN c.user_a_id = ${viewerId}::uuid
      THEN c.user_b_id ELSE c.user_a_id END AND peer.deleted_at IS NULL
    JOIN LATERAL (
      SELECT id, body, created_at, author_id FROM direct_messages
      WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) latest ON true
    WHERE c.user_a_id = ${viewerId}::uuid OR c.user_b_id = ${viewerId}::uuid
    ORDER BY latest.created_at DESC, latest.id DESC`)
  return rows.map((row) => ({
    id: String(row.id),
    member_id: String(row.member_id),
    member_name: row.member_name === null ? 'Someone' : String(row.member_name),
    member_image: row.member_image === null ? null : String(row.member_image),
    latest_id: String(row.latest_id),
    latest_body: String(row.latest_body),
    latest_at: row.latest_at instanceof Date ? row.latest_at.toISOString() : new Date(String(row.latest_at)).toISOString(),
    latest_author_id: String(row.latest_author_id),
    unread: Number(row.unread),
  }))
}

export async function markDirectMessagesRead(
  db: Db, viewerId: string, conversationId: string, throughId: string,
): Promise<number | null> {
  const target = await rowsOf(db, sql`
    SELECT m.created_at, m.id FROM direct_messages m
    JOIN direct_conversations c ON c.id = m.conversation_id
    WHERE c.id = ${conversationId}::uuid AND m.id = ${throughId}::uuid
      AND (c.user_a_id = ${viewerId}::uuid OR c.user_b_id = ${viewerId}::uuid)`)
  if (target.length === 0) return null
  const rows = await rowsOf(db, sql`
    UPDATE direct_messages SET read_at = now()
    WHERE conversation_id = ${conversationId}::uuid AND author_id <> ${viewerId}::uuid
      AND read_at IS NULL
      AND (created_at, id) <= (${target[0]?.created_at}::timestamptz, ${throughId}::uuid)
    RETURNING id`)
  return rows.length
}

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
