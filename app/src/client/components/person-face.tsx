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
names it as paint for exactly that reason, on AC-173's precedent. Neither
criterion has a test file since the 2026-09-20 cut.
*/
import { personFacePaint } from '../parts/person-tint.js'

import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.js'
import { cn } from './ui/utils.js'

export interface PersonFaceProps {
  /** The person's display name, which is what the tint is a function of. */
  readonly name: string
  /** Precomputed by `parts/presenters.ts`, the one place initials are decided. */
  readonly initials: string
  /**
   * The person's own picture: 7.15's upload, or the account picture 7.2
   * stored from Google at first sign-in. Null where they have neither.
   *
   * **It is the default and the initials are the fallback**, which the
   * polish round of 2026-08-30 made true of the call sites as well as of
   * this component: it had taken an image since the disc was shared and most
   * callers passed nothing, so one person wore a photograph on a card and a
   * coloured disc on the row beneath it. Every call site passes one now.
   */
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
      {/*
      `referrerPolicy="no-referrer"` because the src is one of two things and
      the second is cross-origin: 7.15's own `/api/v1/files/:id`, or the
      account picture 7.2 stored from Google's `picture` claim, which lives
      on Google's user-content CDN (10.8 admits that host and no other, at
      the polish round of 2026-08-30). A face is drawn on nearly every screen
      in the product, so without this every list, every roster and every
      conversation would tell Google which page of Dana the reader is
      standing on, once per person on it. Nothing of ours depends on the
      header: the serving route authenticates by session cookie, which an
      image request carries same-origin regardless of this.
      */}
      {image === null ? null : (
        <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />
      )}
      <AvatarFallback
        className={cn(dense ? 'text-[0.5rem]' : 'text-[0.625rem]', 'font-semibold')}
        style={{ color: paint.ink, background: paint.ground }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

/*
The same disc under the name every lifted surface calls it, added at S23.

`components/task-row.tsx`, `components/task-card.tsx` and
`components/task-board.tsx` all render `<Face person={...} />`, taking a
person as one object because that is the shape `ConceptTask` carries one in.
This client's own call sites pass the three fields flat, which is the better
shape for a component whose tint is a function of one of them, and the lift
discipline forbids rewriting a lifted body to suit either.

So this is an adapter and not a second component: it destructures and calls
the one above. The alternative was widening `PersonFace` to accept both
shapes, which is a component with two contracts and a branch that would
outlive the reason for it.

`image` is optional here and nullable there, and the two mean the same thing:
the person's own picture, 7.15's upload or the account picture 7.2 stored
from Google, and the tinted disc where they have neither.
*/
export interface Person {
  readonly initials: string
  readonly name: string
  readonly image?: string
}

export function Face({
  person,
  dense = false,
  className,
}: {
  readonly person: Person
  readonly dense?: boolean
  readonly className?: string
}): React.JSX.Element {
  return (
    <PersonFace
      name={person.name}
      initials={person.initials}
      image={person.image ?? null}
      dense={dense}
      className={className}
    />
  )
}
