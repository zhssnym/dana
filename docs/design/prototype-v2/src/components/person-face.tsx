/*
A person, as a disc. One of them, for the whole product.

There were two: `Face` in `task-card.tsx` and `CommentFace` in `comments.tsx`,
both wrapping shadcn's `Avatar`, both reaching for `personTint`, both deciding
their own sizes. `comments.tsx` said why in a comment — "re-stated rather than
imported: this module is imported *by* task-card, and a shared primitive is
not worth a cycle" — and that reasoning was sound at the time and is the exact
mechanism by which the second copy appeared. It also predicted its own end:
"if a third file ever needs it, it moves somewhere neutral." The filter's
people axes were the third, and the grouped list the fourth.

So it is here, in a module that imports from nothing but the primitive and the
model, and the cycle it was avoiding cannot form.

**Two sizes, both already in the system** (F2a, review M2): `sm`, the
product's avatar, for a comment's author and a section's heading; `dense`, the
row's 16px face, for a chip or a reply. Nothing introduces a size of its own —
that rule is why there are two and not five.

The tint is deterministic and comes from `task-model`, so one person is the
same colour on every surface and no surface owns another's copy. It introduces
no new colour: these are the ten folder swatches the tokens have carried since
v1 (W1 — one palette serves the whole product).
*/

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { personTint } from "@/lib/task-model"
import { cn } from "@/lib/utils"

export type Person = { initials: string; name: string; image?: string }

export function Face({
  person,
  dense = false,
  className,
}: {
  person: Person
  dense?: boolean
  className?: string
}) {
  const tint = personTint(person.name)
  return (
    <Avatar
      size="sm"
      className={cn(
        dense ? "size-4 data-[size=sm]:size-4" : "size-6 data-[size=sm]:size-6",
        className,
      )}
    >
      {person.image ? <AvatarImage src={person.image} alt="" /> : null}
      {/* The swatch at reading strength for the letters and the same hue
          washed back for the ground, so the disc stays quiet in a list while
          still telling one person from another. */}
      <AvatarFallback
        className={cn(dense ? "text-[0.5rem]" : "text-[0.625rem]", "font-semibold")}
        style={{
          color: tint,
          background: `color-mix(in oklab, ${tint} 16%, white)`,
        }}
      >
        {person.initials}
      </AvatarFallback>
    </Avatar>
  )
}
