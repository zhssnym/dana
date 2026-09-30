import { TaskCard } from '../../task-card.js'
import { useTaskEditing } from '../../task-editing.js'
import { TaskWriter } from '../../../tasks/task-writer.js'

/** The Task's existing body, mounted only while its Freeform row is open. */
export default function FreeformTaskDetails({ taskId }: { readonly taskId: string }): React.JSX.Element {
  const editing = useTaskEditing(taskId)
  if (editing.query.isError) return <p role="alert" className="text-sm text-muted-foreground">Could not load this task. Try again.</p>
  if (editing.concept === null) return <p role="status" className="text-sm text-muted-foreground">Loading task…</p>
  return <TaskWriter patch={editing.write}>
    {editing.confirm}
    <TaskCard task={editing.concept} patch={editing.write} />
  </TaskWriter>
}
