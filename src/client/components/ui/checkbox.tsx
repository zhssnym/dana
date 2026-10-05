import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "./utils.js"

// The one checkbox drawing, used by the form control, task rows, board cards and subtasks.
const BOX =
  "flex size-[var(--checkbox-size)] shrink-0 items-center justify-center rounded-xs border transition-[background-color,border-color] duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none"
// The edge is quiet grey, not the hairline: the hairline measured 1.2:1 and WCAG 1.4.11
// asks 3:1.
const UNCHECKED = "border-quiet-foreground bg-background"
const CHECKED = "border-primary bg-primary"

/** The tick: a 20-unit stroke that retracts over --duration-base. */
function Tick({ checked }: { checked: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-3" aria-hidden="true">
      <path
        d="M4 10.5 L8.2 14.5 L16 5.8"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 20,
          strokeDashoffset: checked ? 0 : 20,
          transition: "stroke-dashoffset var(--duration-base) var(--ease-enter)",
        }}
      />
    </svg>
  )
}

/** The box alone, for a control that is itself the button or the label. */
function CheckMark({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cn(BOX, checked ? CHECKED : UNCHECKED, className)}>
      <Tick checked={checked} />
    </span>
  )
}

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-checked:border-primary data-checked:bg-primary",
        BOX,
        UNCHECKED,
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        keepMounted
        className="grid place-content-center"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            <Tick checked={state.checked} />
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox, CheckMark }
