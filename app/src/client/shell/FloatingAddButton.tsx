/*
The floating "Add task", on a phone only.

On a laptop every list ends in its own "New task" row and `N` makes one, so a
floating button is a second home for the same act. A phone has no keyboard
shortcut and a long list puts the row out of reach, so there, and only there,
the button stays. The shell decides which pages carry it (`floatingDefaults`).
*/
import { Plus } from '../lib/icons.js'
import { Button } from '../components/ui/button.js'
import { useSidebar } from '../components/ui/sidebar.js'
import { openTaskForm } from './overlays.js'
import type { TaskFormDefaults } from './overlays.js'

export function FloatingAddButton({
  defaults,
}: {
  readonly defaults: TaskFormDefaults
}): React.JSX.Element | null {
  const { isMobile } = useSidebar()
  if (!isMobile) return null
  return (
    <Button
      className="absolute right-4 bottom-4 h-10 gap-2 rounded-lg bg-foreground px-4 text-sm text-background shadow-md hover:bg-foreground/90"
      onClick={() => {
        openTaskForm(defaults)
      }}
    >
      <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      Add task
    </Button>
  )
}
