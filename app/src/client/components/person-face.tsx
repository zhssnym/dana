// A person as a disc, the same everywhere: their own upload if any, else their
// default face. Decorative: the name beside it is what a reader is told (AC-244).
import { DefaultAvatar } from './default-avatar.js'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.js'
import { cn } from './ui/utils.js'

/**
 * An own upload is same-origin (`/api/v1/files/:id`, or a data URL while saving);
 * the Google account picture never is.
 */
export function isOwnPicture(image: string | null | undefined): image is string {
  if (image === null || image === undefined) return false
  return image.startsWith('/api/v1/files/') || image.startsWith('data:image/')
}

export interface PersonFaceProps {
  /**
   * The default face is keyed by id. Pass it wherever the surface has one, or the
   * person gets a second, name-keyed face.
   */
  readonly id?: string | null | undefined
  /** Used as the face's key only where no id is held. */
  readonly name: string
  /** Kept for callers; the initials disc is retired. */
  readonly initials?: string
  /** Only an own upload is drawn (`isOwnPicture`). */
  readonly image?: string | null
  /** The row's 16px face, for a chip or a reply. */
  readonly dense?: boolean
  readonly className?: string
}

export function PersonFace({
  id,
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
        <DefaultAvatar id={id} name={name} />
      </AvatarFallback>
    </Avatar>
  )
}

// Adapter for callers that pass a person object (task rows, cards, the board).
export interface Person {
  readonly id?: string | undefined
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
      id={person.id}
      name={person.name}
      initials={person.initials}
      image={person.image ?? null}
      dense={dense}
      className={className}
    />
  )
}
