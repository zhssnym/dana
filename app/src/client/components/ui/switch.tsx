import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "./utils.js"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full bg-input p-0.5 outline-none transition-colors duration-[var(--duration-fast)] data-checked:bg-primary disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="size-3.5 rounded-full bg-fixed-white transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] data-checked:translate-x-3.5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
