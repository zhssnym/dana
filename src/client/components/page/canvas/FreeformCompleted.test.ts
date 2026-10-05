import { describe, expect, it } from 'vitest'

import type { TaskCard } from '../../../../shared/tasks.js'
import type { CanvasBlock } from './schema.js'
import { completedGroups } from './FreeformCompleted.js'

const section = (id: string, children: CanvasBlock[]): CanvasBlock => ({
  id, type: 'heading', props: { level: 1, isToggleable: true }, children,
} as CanvasBlock)
const task = (id: string): CanvasBlock => ({
  id, type: 'danaTask', props: { taskId: id }, content: undefined, children: [],
} as CanvasBlock)
const completed = (id: string): TaskCard => ({ id, title: id, status: 'completed' } as TaskCard)

describe('Freeform completed disclosures', () => {
  it('keeps finished Tasks with their exact H1, H2, H3 or loose parent', () => {
    const blocks = [task('loose'), section('h1', [
      task('one'), section('h2', [task('two'), section('h3', [task('three')])]),
    ])]
    const cards = new Map(['loose', 'one', 'two', 'three'].map((id) => [id, completed(id)]))
    const groups = completedGroups(blocks, cards)
    expect([...groups].map(([parent, rows]) => [parent, rows.map((row) => row.id)])).toEqual([
      [null, ['loose']], ['h1', ['one']], ['h2', ['two']], ['h3', ['three']],
    ])
    cards.delete('two')
    expect(completedGroups(blocks, cards).has('h2')).toBe(false)
    expect(completedGroups(blocks, new Map()).size).toBe(0)
  })
})
