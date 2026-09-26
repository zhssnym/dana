import { describe, expect, test } from 'vitest'

import { elision, finishedSections, foldedNow, freezeFolds, threadModel, threadStyle, toggleFold } from './thread-model.js'
import type { FoldStore, FrozenFolds, ThreadBlock, ThreadInput, ThreadTask } from './thread-model.js'

const TODAY = '2026-09-26'
const task = (id: string): ThreadBlock => ({ id, type: 'danaTask', props: { taskId: id } })
const note = (id: string): ThreadBlock => ({ id, type: 'paragraph', props: {} })
const section = (id: string, children: ThreadBlock[], level = 1): ThreadBlock => ({ id, type: 'heading', props: { level, isToggleable: true }, children })
const card = (over: Partial<ThreadTask> = {}): ThreadTask => ({ blocked_by_count: 0, start_date: null, assignee: null, ...over })

function input(blocks: ThreadBlock[], open: Record<string, ThreadTask>, over: Partial<ThreadInput> = {}): ThreadInput {
  return { blocks, open: new Map(Object.entries(open)), today: TODAY, viewerId: 'me', shared: false, folded: new Set(), ...over }
}

describe('AC-1430: the next ring is the first task the viewer can do now', () => {
  const blocks = [
    section('s1', [task('blocked'), task('later'), task('theirs'), task('mine')]),
    section('s2', [task('elsewhere')]),
  ]
  const open = {
    blocked: card({ blocked_by_count: 1 }),
    later: card({ start_date: '2026-09-27' }),
    theirs: card({ assignee: { id: 'sara' } }),
    mine: card({ assignee: { id: 'me' } }),
    elsewhere: card(),
  }

  test('skips a blocked task, a future start and another member’s task on a shared page', () => {
    expect(threadModel(input(blocks, open, { shared: true })).next).toBe('mine')
  })

  test('on a solo page another assignee does not matter', () => {
    expect(threadModel(input(blocks, open)).next).toBe('theirs')
  })

  test('a start of today is not waiting', () => {
    expect(threadModel(input(blocks, { ...open, later: card({ start_date: TODAY }) })).next).toBe('later')
  })

  test('skips a folded section', () => {
    expect(threadModel(input(blocks, open, { shared: true, folded: new Set(['s1']) })).next).toBe('elsewhere')
  })

  test('closed tasks never ring, and nothing open means no ring', () => {
    expect(threadModel(input(blocks, { elsewhere: card() })).next).toBe('elsewhere')
    expect(threadModel(input(blocks, {})).next).toBeNull()
  })
})

describe('AC-1431: the line is solid up to the first open task and dashed after it', () => {
  test('within a section, and between sections', () => {
    const blocks = [
      section('s1', [task('d1'), note('n1'), task('d2')]),
      section('s2', [task('d3'), note('n2'), task('o1'), note('n3'), task('o2')]),
      section('s3', [task('d4')]),
    ]
    const { line, anyOpen, hasTasks } = threadModel(input(blocks, { o1: card(), o2: card() }))
    // Section 1 is all done: solid throughout.
    for (const id of ['s1', 'd1', 'n1', 'd2']) expect(line.get(id)).toBeUndefined()
    // The join is solid down to the first section holding an open task.
    expect(line.get('s2')).toBe('frontier')
    expect(line.get('s3')).toBe('dashed')
    // Inside it: solid to the first open task, dashed from there on.
    expect(line.get('d3')).toBeUndefined()
    expect(line.get('n2')).toBeUndefined()
    expect(line.get('o1')).toBe('frontier')
    expect(line.get('n3')).toBe('dashed')
    expect(line.get('o2')).toBe('dashed')
    expect([anyOpen, hasTasks]).toEqual([true, true])
  })

  test('a finished thread is solid everywhere', () => {
    const model = threadModel(input([section('s1', [task('d1')]), task('d2')], {}))
    expect(model.line.size).toBe(0)
    expect(model.anyOpen).toBe(false)
    expect(model.hasTasks).toBe(true)
  })
})

describe('AC-1432: finished sections fold and long done stretches elide', () => {
  test('only a section with tasks and none open is finished', () => {
    const blocks = [
      section('done', [task('d1'), section('inner', [task('d2')], 2)]),
      section('open', [task('o1')]),
      section('notes', [note('n1')]),
      section('empty', []),
    ]
    expect([...finishedSections(blocks, new Map([['o1', card()]]))].sort()).toEqual(['done', 'inner'])
  })

  test('more than three closed tasks before the first open one keep only the last three', () => {
    const list = [note('intro'), task('d1'), note('n1'), task('d2'), task('d3'), task('d4'), task('d5'), task('o1'), task('d6')]
    const { elided, breaks } = elision([section('s', list)], new Map([['o1', card()]]))
    expect([...elided.keys()]).toEqual(['d1', 'n1', 'd2'])
    expect([...breaks]).toEqual(['d3'])
    expect(elided.get('d1')).toBe('d3')
  })

  test('three or fewer closed tasks elide nothing', () => {
    const list = [task('d1'), task('d2'), task('d3'), task('o1')]
    expect(elision(list, new Map([['o1', card()]])).elided.size).toBe(0)
  })

  test('the style hides folded children and elided blocks, and never names storage', () => {
    const css = threadStyle(threadModel(input([section('s', [task('a')])], {})), new Set(['s']), new Set(['x']), new Set(['y']))
    expect(css).toContain('[data-id="s"]>.bn-block>.bn-block-group{display:none}')
    expect(css).toContain('[data-id="x"]{display:none}')
    expect(css).toContain('[data-id="y"]{padding-block-start')
    expect(css).not.toContain('toggle-')
  })
})

describe('AC-1433: auto-fold is never stored, a user close is, and ticks linger', () => {
  const memory = (): FoldStore & { readonly map: Map<string, string> } => {
    const map = new Map<string, string>()
    return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value) }, removeItem: (key) => { map.delete(key) } }
  }

  test('auto-fold writes nothing, and unfolding an auto-folded section writes nothing', () => {
    const store = memory()
    const opened = new Set<string>()
    const finished = new Set(['done'])
    expect([...foldedNow(['done', 'live'], finished, opened, store)]).toEqual(['done'])
    toggleFold(store, opened, 'done', true)
    expect(foldedNow(['done', 'live'], finished, opened, store).size).toBe(0)
    expect(store.map.size).toBe(0)
  })

  test('a user close is stored and wins over the session; reopening removes it', () => {
    const store = memory()
    const opened = new Set<string>()
    toggleFold(store, opened, 'live', false)
    expect([...store.map]).toEqual([['toggle-live', 'false']])
    expect([...foldedNow(['live'], new Set(), new Set(['live']), store)]).toEqual(['live'])
    toggleFold(store, opened, 'live', true)
    expect(store.map.size).toBe(0)
  })

  test('ticking the last open task keeps its section open until the page is opened again', () => {
    const blocks = [section('s', [task('a')])]
    const frozen: { current: FrozenFolds | null } = { current: null }
    expect(freezeFolds(frozen, blocks, new Map([['a', card()]])).finished.size).toBe(0)
    expect(freezeFolds(frozen, blocks, new Map()).finished.size).toBe(0)
    expect([...freezeFolds({ current: null }, blocks, new Map()).finished]).toEqual(['s'])
  })
})
