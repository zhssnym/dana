import { isValidElement } from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "./utils.js"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* THE action of a surface: solid accent. One per view. */
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        /* Kept as a name for existing call sites; it is the same action. */
        commit: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        /* Secondary actions beside THE action: text with a hairline. */
        outline:
          "border border-input text-foreground hover:bg-accent active:bg-press aria-expanded:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-input/70 aria-expanded:bg-input/70",
        /* Everything else: text, a background on hover. */
        ghost:
          "text-foreground hover:bg-accent active:bg-press aria-expanded:bg-accent",
        destructive:
          "text-destructive hover:bg-destructive/10 active:bg-destructive/15",
        link: "h-auto! px-0! text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 px-2",
        xs: "h-5 gap-1 px-1.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-6 gap-1 px-1.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-8 px-3",
        icon: "size-7",
        "icon-xs": "size-5 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-8",
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
  // A Button rendered as a non-<button> tells Base UI so itself.
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
