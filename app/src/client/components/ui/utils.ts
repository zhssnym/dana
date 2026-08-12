/*
`cn`, the class-string composer every one of the shadcn primitives beside this
file calls. It is the designer's `src/lib/utils.ts` unchanged in behaviour.

**Why it sits here rather than at `lib/utils`.** shadcn's own convention puts
this at `@/lib/utils`, which is where his prototype keeps it and where a
future copy-in from that distribution will expect it. It is here instead
because this role owns `app/src/client/components/**` and the single token
file, and nothing else: creating `app/src/client/lib/` would be a new
top-level directory in another role's tree, which protocol section 6 makes a
request to the Steward rather than an edit. The cost is one path to fix on
each future copy-in, which is the same edit the alias rewrite already makes to
every such file, so it adds no step that was not already there.

The two packages are not interchangeable and both are needed. `clsx` resolves
conditionals and arrays into a class string; `tailwind-merge` then drops the
Tailwind classes an earlier argument set and a later one overrides, which is
what lets a caller pass `className` and actually win against a variant's own
padding rather than depending on stylesheet order.
*/
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
