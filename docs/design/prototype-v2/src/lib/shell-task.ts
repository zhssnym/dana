/*
The shell's own task record.

This shape used to live in `components/task-form.tsx` and be called
`TaskFormData`, because the form was the only thing that read all of it. The
form is gone — DES-093 put the whole of a task inside the row that owns it, so
the prototype has no sheet to open any more — but the record it carried is
still the shell's model of a task, so it moved here rather than being deleted
with the component that used to own it.

Fixtures only. Several of these fields have no column behind them in the
shipping product; see DES-055 for attachments, DES-102 for block order, and
DES-122 for `dueTime`, which the design has since ruled a due date should not
carry at all.
*/

export interface ShellTaskDetails {
  id: string
  title: string
  dueDate: string
  important: boolean
  notes: string
  folder: string
  assignee: string
  dueTime: string
  reminder: string
  repeat: string
  repeatDays: string[]
  repeatInterval: string
  repeatMonthlyDay: string
  repeatEnds: string
  invitePending: string
  steps: Array<{ id: number; title: string; done: boolean }>
  createdAt?: string
  createdBy?: string
  completedAt?: string
  completedBy?: string
}
