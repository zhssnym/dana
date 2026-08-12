/*
**This file was `Button.tsx` until package P8R session R2, and it is on its
way out.** RFC 0002 replaces this client's markup with the designer's, and his
`button.tsx` now sits beside this file as the shadcn primitive every one of
his other nineteen primitives imports. Two files cannot both be `button.tsx`
here: this filesystem is case-insensitive, so his name and the old one are the
same path, and copying his in would have overwritten this one silently.

The rename went this way round rather than the other because his is the file
with a future. His siblings import `./button.js` by that exact name, every
later copy-in from that distribution will do the same, and this one is
retired by R3 to R10 as the pages that call it are replaced.

Nothing outside `components/` changed for it. Every consumer reaches these two
exports through `index.ts`, which still names them `Button` and `IconButton`,
and the only direct importer was `TaskRow.tsx` beside it. The barrel does not
export his `Button`, because the two names would collide there; his is
consumed by path, `components/ui/button.js`, which is how shadcn components
are consumed and how his own prototype consumes them.

What follows is this component's own reasoning, unchanged.

The button, in the two shapes this client has: one with words on it and one
with a glyph on it.

Both are `<button type="button">` and neither is a `div` with a click handler,
which is the whole reason the component exists. A button is reachable by tab,
activates on space and enter, announces its name, and shows the focus ring the
brief's accessibility floor requires; each of those is something a page would
otherwise have to remember, and section 9 addresses every control it names by
role, so a control that is not a button is not the control the specification
described.

`type="button"` is not decoration either. The default is `submit`, and a
button inside a form that ever grows around one of these rows would submit it.

`IconButton` exists separately because an icon-only control owes two things a
labelled one does not: a name for a screen reader, which is required rather
than optional in its props, and a target of at least 44 pixels, which the
`icon-control` utility carries. Its glyph is `aria-hidden`, so the name is the
only thing announced and a glyph swap is never a rename.

**`glyph` was widened from `string` to `ReactNode` at P8D**, deliberately
widened rather than changed: this role's handoff rule is that a component prop
is an interface two other roles build on, and `task-form/StepsEditor.tsx`
passes three text glyphs today. A string is a `ReactNode`, so every existing
call site is untouched and a Lucide element is now also admissible. The
`icon-control` utility sizes an `svg` child to the design's control icon size,
so a caller passes the element and never a size.

Every class below is a token utility from `styles/tokens.css`. No component
in this directory spells a colour, a size or a radius; that is 11.4's rule and
this file is the one most tempted to break it.
*/
import type { ReactNode } from 'react'

type Tone = 'default' | 'primary' | 'danger' | 'quiet'

const TONE_CLASS: Record<Tone, string> = {
  default: 'button-default',
  primary: 'button-primary',
  danger: 'button-danger',
  quiet: 'button-quiet',
}

interface ButtonProps {
  readonly children: ReactNode
  readonly onClick: () => void
  readonly tone?: Tone
  /** Where the visible words are not the name a screen reader should hear. */
  readonly label?: string
  readonly title?: string
  readonly disabled?: boolean
}

export function Button({
  children,
  onClick,
  tone = 'default',
  label,
  title,
  disabled = false,
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={`button-base ${TONE_CLASS[tone]}`}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

interface IconButtonProps {
  /** Required: an icon-only control that announces nothing is invisible. */
  readonly label: string
  /** A Lucide element or a text glyph; either way `aria-hidden` below. */
  readonly glyph: ReactNode
  readonly onClick: () => void
  /**
   * The tooltip, where it differs from the name. Q4's outward star is the one
   * control in this client where the two are deliberately different: the name
   * stays the control's own state and the tooltip points at another page.
   */
  readonly title?: string
  readonly pressed?: boolean
  readonly expanded?: boolean
  readonly hasPopup?: 'menu'
}

export function IconButton({
  label,
  glyph,
  onClick,
  title,
  pressed,
  expanded,
  hasPopup,
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="icon-control"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      title={title ?? label}
      onClick={onClick}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  )
}
