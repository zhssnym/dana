// Find a task on a right-click without changing selection or writing in its editor.
export interface TaskContextTarget {
  readonly id: string
  readonly title: string
}

export function taskContextTarget(target: EventTarget | null): TaskContextTarget | null {
  if (!(target instanceof Element)) return null
  const text = target.closest('input, textarea, [contenteditable]')
  if (text !== null && (text.matches('input, textarea') || text.getAttribute('contenteditable') !== 'false')) return null
  const row = target.closest<HTMLElement>('[data-task-id], [data-canvas-task-id]')
  if (row === null || row.hasAttribute('data-canvas-task-filtered') || row.hasAttribute('data-canvas-task-loading')) return null
  const id = row.dataset.taskId ?? row.dataset.canvasTaskId
  if (!id) return null
  return { id, title: row.dataset.taskTitle ?? 'Task' }
}
