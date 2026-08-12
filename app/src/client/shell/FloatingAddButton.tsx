/*
9.1's floating add button: "bottom right on every page except Done; opens the
task form with the entry-point defaults of 9.3."

Named "Add task" by the 9.1 control table, which chose that string to separate
it from the quick-add row beneath it on the same page. Exact, for the reason
that table's own paragraph gives.

Where it sits on the screen is the Component engineer's, whose file owns every
raw spacing value (11.4); what is here is that it exists, that it is on every
page but Done (AC-096), and which defaults it carries. `shell-fab` is that
placement, and it resolves against the content column rather than the viewport
because `AppLayout` positions the column: a button placed against the viewport
would sit over the sidebar on a narrow window.
*/
import { Plus } from 'lucide-react'

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
      className="button-base shell-fab"
      onClick={() => {
        openTaskForm(defaults)
      }}
    >
      {/* `aria-hidden`, so the name stays the two words 9.1's table assigns and
          a glyph swap is never a rename. */}
      <Plus aria-hidden="true" />
      Add task
    </button>
  )
}
