/*
9.1's floating add button: "bottom right on every page except Done; opens the
task form with the entry-point defaults of 9.3."

The treatment is the designer's, from the button at the foot of his
`app-shell.tsx`. Two things about it are section 9's rather than his, and both
are the same ruling of 2026-08-13 read from its two sides: his design wins on
structure, section 9 wins on labels.

**The name is "Add task".** 9.1's control table assigns it, and its own
paragraph says why: Q5's empty state calls this "the + button", which is a
glyph rather than a name, and "Add task" is what separates it from the
"Add a task" quick-add sitting beneath it on the same page. His control reads
"New task" and answers to "Create a new task", so the visible word and the
accessible name are both his and both replaced by the one string. The tooltip
is gone with them: a tooltip repeating the name it hangs off tells a screen
reader the same thing twice and tells a pointer nothing.

**It is absent on Done and present everywhere else, which is one page fewer
than his.** His shell also hides it on People and on Settings. 9.1 spells the
exception as "every page except Done" and AC-096 names that page alone
(no test since the 2026-09-20 cut), so
the section decides it; the two extra hides are the kind of divergence 11.13
routes to the owner rather than to an implementer.

Where it sits resolves against the content column rather than the viewport,
because `SidebarInset` is the positioned ancestor: a button placed against the
viewport would sit over the sidebar on a narrow window.
*/
import { Plus } from 'lucide-react'

import { Button } from '../components/ui/button.js'
import { openTaskForm } from './overlays.js'
import type { TaskFormDefaults } from './overlays.js'

/** 9.1's control table. A fixed string. */
const ADD_TASK = 'Add task'

export function FloatingAddButton({
  defaults,
}: {
  readonly defaults: TaskFormDefaults
}): React.JSX.Element {
  return (
    <Button
      className="absolute right-6 bottom-6 h-[var(--control-height)] gap-2 rounded-lg bg-[var(--color-graphite-900)] px-4 text-sm text-white shadow-[var(--elevation-1)] hover:bg-[var(--color-graphite-800)]"
      onClick={() => {
        openTaskForm(defaults)
      }}
    >
      {/* `aria-hidden`, so the name stays the two words 9.1's table assigns
          and a glyph swap is never a rename. */}
      <Plus className="size-5" strokeWidth={1.75} aria-hidden="true" />
      {ADD_TASK}
    </Button>
  )
}
