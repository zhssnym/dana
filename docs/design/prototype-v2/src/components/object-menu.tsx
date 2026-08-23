/*
The overflow menu for a Dana object, drawn from the contract.

`lib/object-acts` says what the acts are, in what order, with what words and
what glyph. This draws them and nothing else — so the folder menu in the
sidebar and the folder menu on the folder page's own bar are now the same
menu, differing only in what each surface hands over.

**A surface may still add items of its own**, through `extra`, and two do:
the sidebar row's "Add task" and the folder page's "Move to shelf" submenu,
which is a radio group rather than a plain item. That escape hatch is
deliberate and narrow — it takes a *rendered* node rather than a spec, so an
act that belongs to the object cannot be smuggled in this way and quietly
diverge again. Anything that belongs to every surface goes in the contract.
*/

import type { ReactElement, ReactNode } from "react"

import { MoreHorizontal } from "@/lib/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { actsFor, type ActHandlers, type ObjectKind } from "@/lib/object-acts"

export function ObjectMenu({
  kind,
  name,
  handlers,
  trigger,
  extra,
  align = "end",
  width = "w-56",
}: {
  kind: ObjectKind
  /* Named in the trigger's label, because "More actions" beside four folders
     is four controls a screen reader cannot tell apart. */
  name: string
  handlers: ActHandlers
  /* The button that opens it. Supplied by the surface, because a sidebar row's
     ghost button and a window bar's strip button are different chrome for the
     same menu. */
  trigger?: ReactElement
  /* Rendered above the contract's acts: what this surface can do that the
     object cannot do everywhere. */
  extra?: ReactNode
  align?: "start" | "end"
  width?: string
}) {
  const acts = actsFor(kind, handlers)
  if (!acts.length && !extra) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger ?? (
            <button type="button" aria-label={`More actions for ${name}`}>
              <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )
        }
      />
      <DropdownMenuContent align={align} className={width}>
        {extra}
        {acts.map(({ spec, handler, startsGroup }) => (
          <div key={spec.key} className="contents">
            {startsGroup ? <DropdownMenuSeparator /> : null}
            {typeof handler === "function" ? (
              <DropdownMenuItem
                variant={spec.destructive ? "destructive" : undefined}
                onClick={handler}
              >
                <spec.icon className="size-4" />
                {spec.label}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <spec.icon className="size-4" />
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
