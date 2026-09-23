/*
The overflow menu for a Dana object, drawn from the contract.

`lib/object-acts.ts` says what the acts are, in what order, with what words
and what glyph. This draws them and nothing else, so the folder menu in the
Library and the folder menu on that folder's own window bar are now the same
menu, differing only in what each surface hands over.

**A surface may still add items of its own, through `extra`.** Two do: the
Library row's "Add task" and "New folder group", and the folder page's
"Transfer ownership". That escape hatch is deliberate and narrow, taking a
*rendered* node rather than a spec, so an act that belongs to the object
cannot be smuggled in this way and quietly diverge again. Anything belonging
to every surface goes in the contract. AC-246 enumerates the four items that
may come through it and fails a fifth.

**The trigger's name is 9.1's fixed string and never an interpolation.** A name in
9.1's table is a fixed string, and what tells four instances apart is 9.1's region rule, this
one being reached inside the row or the bar that names its object. So `name`
here is not drawn into the label; it is the tooltip's, and the surface's own
region is what separates one menu from the next.
*/
import type { ReactElement, ReactNode } from 'react'

import { actsFor } from '../lib/object-acts.js'
import type { ActHandlers, ObjectKind } from '../lib/object-acts.js'
import { MoreHorizontal } from '../lib/icons.js'

import { Button } from './ui/button.js'
import { MORE_ACTIONS } from './ui/copy.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js'

export function ObjectMenu({
  kind,
  name,
  handlers,
  trigger,
  extra,
  align = 'end',
  width = 'w-52',
}: {
  readonly kind: ObjectKind
  /** The object's name, for the trigger's tooltip. Never its accessible name. */
  readonly name: string
  readonly handlers: ActHandlers
  /**
   * The button that opens it, supplied by the surface: a Library row's ghost
   * button and a window bar's strip button are different chrome for one menu.
   */
  readonly trigger?: ReactElement<Record<string, unknown>>
  /** Rendered above the contract's acts: what this surface can do that the
      object cannot do everywhere. */
  readonly extra?: ReactNode
  readonly align?: 'start' | 'end'
  readonly width?: string
}): React.JSX.Element | null {
  const acts = actsFor(kind, handlers)
  if (acts.length === 0 && extra === undefined) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger ?? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={MORE_ACTIONS}
              title={name}
            />
          )
        }
      >
        <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={width}>
        {extra}
        {acts.map(({ spec, handler, startsGroup }) => (
          <div key={spec.key} className="contents">
            {startsGroup ? <DropdownMenuSeparator /> : null}
            {typeof handler === 'function' ? (
              <DropdownMenuItem
                variant={spec.destructive === true ? 'destructive' : undefined}
                onClick={handler}
              >
                <spec.icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {spec.label}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <spec.icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {spec.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  {handler.choose}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
