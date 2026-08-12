/*
9.1's floating add button: "bottom right on every page except Done; opens the
task form with the entry-point defaults of 9.3."

Named "Add task" by the 9.1 control table, which chose that string to separate
it from the quick-add row beneath it on the same page. Exact, for the reason
that table's own paragraph gives.

Where it sits on the screen is the Component engineer's, whose file owns every
raw spacing value (11.4); what is here is that it exists, that it is on every
page but Done (AC-096), and which defaults it carries.
*/
import { openTaskForm } from './overlays.js'
import type { TaskFormDefaults } from './overlays.js'

export function FloatingAddButton({
  defaults,
}: {
  readonly defaults: TaskFormDefaults
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => {
        openTaskForm(defaults)
      }}
    >
      Add task
    </button>
  )
}
