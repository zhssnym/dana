import { describe, expect, it } from 'vitest'

import type { ProductUpdate } from './index.js'
import { unreadUpdateIds } from './read-state.js'

const update = (id: string, historical = false): ProductUpdate => ({
  id, historical, publishedAt: '2026-10-15', kind: 'feature', title: 'A useful change',
  summary: 'A current improvement for Dana users.', pr: Number(id.slice(3)),
  commit: 'a'.repeat(40),
})

describe('unread announcements', () => {
  it('ignores historical backfill and only counts real unread releases', () => {
    expect(unreadUpdateIds([update('pr-12', true), update('pr-18'), update('pr-19')], ['pr-18']))
      .toEqual(['pr-19'])
  })
  it('never treats an empty release feed as unread', () => {
    expect(unreadUpdateIds([update('pr-1', true)], [])).toEqual([])
  })
})
