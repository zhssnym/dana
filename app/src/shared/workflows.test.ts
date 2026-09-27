import { describe, expect, it } from 'vitest'
import type { TaskDetail } from './tasks.js'
import { folderToWorkflowFile, importWorkflowBody } from './workflows.js'

/*
Since 0060 a task's steps are the checklist items of its body, which admits
4000 characters an item and 500 blocks. "Save as workflow" writes every item,
so the importer must read what the writer writes, or a saved folder is a file
that can never come back.
*/
describe('a saved workflow imports again', () => {
  it('keeps 51 steps and a 301-character step', () => {
    const steps = Array.from({ length: 51 }, (_, index) => ({
      id: `s${String(index)}`,
      title: index === 0 ? 'x'.repeat(301) : `Step ${String(index)}`,
      done: false,
      position: index,
    }))
    const task = {
      id: 't1',
      title: 'Long checklist',
      notes: null,
      important: false,
      recurrence_rule: null,
      reminder: null,
      steps,
      labels: { folder: [], personal: [] },
    } as unknown as TaskDetail
    const file = folderToWorkflowFile('Folder', [task])
    const parsed = importWorkflowBody.safeParse(JSON.parse(JSON.stringify(file.file)))
    expect(parsed.success, parsed.success ? '' : parsed.error.message).toBe(true)
    const text = JSON.stringify(parsed.data)
    expect(text).toContain('x'.repeat(301))
    expect(text).toContain('Step 50')
  })
})
