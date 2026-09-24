/*
A person, as a disc. One of them, for the whole product.

Every surface that draws a person uses this one component, so one person
looks the same everywhere.

**Two sizes, both already in the system**:
the product's avatar for a comment's author or a section heading, and the
row's 16px face for a chip or a reply. Callers widen it to 20 or 32 with a
class; the drawing is a 32-unit grid so every one of those stays crisp.

**What is drawn (2026-09-24, Hassan: "a default profile pic instead of the
Google one")**: the person's own uploaded picture (7.15) if they have one,
otherwise their default face from `default-avatar.tsx`. The account picture
7.2 stored from Google's `picture` claim is still stored and still on the wire
(nothing about the data changes) but is no longer drawn, and the initials disc
is gone. `isOwnPicture` is the one place that tells the two apart: an upload
is served from our own origin, the Google picture never is.

**The disc is decorative and stays so.** The name beside it is what a reader
is told; the disc carries no role and no label, because an avatar that
announced its person a second time would double every roster row. AC-244
names it as paint for exactly that reason, on AC-173's precedent.
*/
import { DefaultAvatar } from './default-avatar.js'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.js'
import { cn } from './ui/utils.js'

/**
 * Whether a stored picture is the person's own upload (7.15's same-origin
 * `/api/v1/files/:id`, or the data URL shown while one is saving) rather than
 * the account picture copied from Google at first sign-in.
 */
export function isOwnPicture(image: string | null | undefined): image is string {
  if (image === null || image === undefined) return false
  return image.startsWith('/api/v1/files/') || image.startsWith('data:image/')
}

export interface PersonFaceProps {
  /** The person's display name, which is what the default face is a function of. */
  readonly name: string
  /**
   * Kept for the call sites' contract; the initials disc is retired, so it is
   * no longer drawn.
   */
  readonly initials?: string
  /**
   * The person's stored picture: 7.15's upload, or the account picture 7.2
   * stored from Google. Only an upload is drawn (`isOwnPicture`).
   */
  readonly image?: string | null
  /** The row's 16px face, for a chip or a reply. Default is the product's. */
  readonly dense?: boolean
  readonly className?: string
}

export function PersonFace({
  name,
  image = null,
  dense = false,
  className,
}: PersonFaceProps): React.JSX.Element {
  const own = isOwnPicture(image)
  return (
    <Avatar
      size="sm"
      className={cn(
        dense ? 'size-4 data-[size=sm]:size-4' : 'size-6 data-[size=sm]:size-6',
        className,
      )}
    >
      {own ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback className="overflow-hidden bg-transparent">
        <DefaultAvatar name={name} />
      </AvatarFallback>
    </Avatar>
  )
}

/*
The same disc under the name every lifted surface calls it.

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
the person's stored picture, drawn only when it is their own upload, and
their default face otherwise.
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
