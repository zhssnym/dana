import { isValidElement } from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "./utils.js"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    // One shape for every button; only the colour varies. Commit (accent) is for the single
    // action on a screen that matters most.
    variants: {
      variant: {
        default:
          "border border-input text-foreground hover:bg-accent active:bg-press aria-expanded:bg-accent",
        outline:
          "border border-input text-foreground hover:bg-accent active:bg-press aria-expanded:bg-accent",
        secondary:
          "border border-input text-foreground hover:bg-accent active:bg-press aria-expanded:bg-accent",
        ghost:
          "text-foreground hover:bg-accent active:bg-press aria-expanded:bg-accent",
        destructive:
          "border border-input text-destructive hover:bg-destructive/10 active:bg-destructive/15",
        commit: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        link: "h-auto! px-0! text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[var(--control-height)] px-2.5",
        sm: "h-6 gap-1 px-1.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-5 gap-1 px-1.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        icon: "size-[var(--control-height)]",
        "icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-5 [&_svg:not([class*='size-'])]:size-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  // Tell Base UI when the Button renders as something other than a <button>.
  const rendersNativeButton =
    props.render === undefined ||
    (isValidElement(props.render) && props.render.type === "button")
  return (
    <ButtonPrimitive
      data-slot="button"
      nativeButton={rendersNativeButton}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
