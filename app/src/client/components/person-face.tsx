/*
A person, as a disc. One of them, for the whole product.

The designer's `components/person-face.tsx`, ported at S17a. His header names
the fault and predicts its own end: there were two copies of this, `Face` in
`task-card.tsx` and `CommentFace` in `comments.tsx`, and the second said in a
comment why it was a copy and added "if a third file ever needs it, it moves
somewhere neutral."

**In this client there were seven.** `task-row.tsx`, `FolderPage.tsx`,
`FolderSharingPanel.tsx`, `InviteGate.tsx`, `PeoplePage.tsx`, `SettingsPage.tsx`
and `shell/app-sidebar.tsx` each built a person out of the same primitive, every
one of them neutral, every one deciding its own size. Nobody was wrong: the
primitive is the shared thing and a disc around it looked like nothing worth
sharing. What made it worth sharing is the tint, which only means something if
it is the same everywhere.

**Two sizes, both already in the system** (the designer's F2a, review M2):
the product's avatar for a comment's author or a section heading, and the
row's 16px face for a chip or a reply. Nothing introduces a size of its own,
and that rule is why there are two and not five.

**The tint is a function of the name and lives in `parts/person-tint.ts`**,
with the wash it is paired with. It is computed here rather than passed in,
which is the one place this file departs from the component layer's usual
"take props and callbacks": a pure function of a prop is not a fetch, and a
tint every call site had to remember to pass is a tint that would go on being
forgotten, which is the state this replaces.

**The disc is decorative and stays so.** The name beside it is what a reader
is told; the disc carries no role and no label, because an avatar that
announced its person a second time would double every roster row. AC-244
asserts it as paint for exactly that reason, on AC-173's precedent.
*/
import { personFacePaint } from '../parts/person-tint.js'

import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.js'
import { cn } from './ui/utils.js'

export interface PersonFaceProps {
  /** The person's display name, which is what the tint is a function of. */
  readonly name: string
  /** Precomputed by `parts/presenters.ts`, the one place initials are decided. */
  readonly initials: string
  /** 7.15's avatar, when the person has uploaded one. */
  readonly image?: string | null
  /** The row's 16px face, for a chip or a reply. Default is the product's. */
  readonly dense?: boolean
  readonly className?: string
}

export function PersonFace({
  name,
  initials,
  image = null,
  dense = false,
  className,
}: PersonFaceProps): React.JSX.Element {
  const paint = personFacePaint(name)
  return (
    <Avatar
      size="sm"
      className={cn(
        dense ? 'size-4 data-[size=sm]:size-4' : 'size-6 data-[size=sm]:size-6',
        className,
      )}
    >
      {image === null ? null : <AvatarImage src={image} alt="" />}
      <AvatarFallback
        className={cn(dense ? 'text-[0.5rem]' : 'text-[0.625rem]', 'font-semibold')}
        style={{ color: paint.ink, background: paint.ground }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
