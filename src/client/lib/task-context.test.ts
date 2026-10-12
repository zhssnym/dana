// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { taskContextTarget } from './task-context.js'

describe('task right-click target', () => {
  it('finds list, board and calendar tasks through a child element', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div data-task-id="one" data-task-title="First"><span>Row</span></div>'
    expect(taskContextTarget(root.querySelector('span'))).toEqual({ id: 'one', title: 'First' })
    root.innerHTML = '<button data-task-id="two" data-task-title="Second"><span>Calendar</span></button>'
    expect(taskContextTarget(root.querySelector('span'))).toEqual({ id: 'two', title: 'Second' })
  })

  it('finds a noneditable task inside an editable Freeform canvas', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div contenteditable="true"><div contenteditable="false" data-canvas-task-id="three" data-task-title="Third"><span>Task</span></div></div>'
    expect(taskContextTarget(root.querySelector('span'))).toEqual({ id: 'three', title: 'Third' })
  })

  it('does not intercept writing, filtered blocks, loading blocks or other content', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div data-task-id="one"><input /></div><div contenteditable="true" data-canvas-task-id="two">Writing</div><div data-canvas-task-id="three" data-canvas-task-filtered>Filtered</div><div data-canvas-task-id="four" data-canvas-task-loading>Loading</div><p>Other</p>'
    expect(taskContextTarget(root.querySelector('input'))).toBeNull()
    expect(taskContextTarget(root.querySelector('[contenteditable]'))).toBeNull()
    expect(taskContextTarget(root.querySelector('[data-canvas-task-filtered]'))).toBeNull()
    expect(taskContextTarget(root.querySelector('[data-canvas-task-loading]'))).toBeNull()
    expect(taskContextTarget(root.querySelector('p'))).toBeNull()
  })
})
