/*
The brand link the public pages wear: the mark, the word, and a way home.

Shared with `LandingPage.tsx` because the legal pages of DES-032 carry the same control and the prototype draws it the same way in
both files (`landing-screen.tsx` and `public-legal-screen.tsx` each have their
own copy of it). Two copies here would be two answers to what Dana's public
header is, and the second one would be the one that goes stale.

It is not `components/`: this is the public family's header rather than a
primitive anything else composes, and the component library has one owner
that is not this role.

**The mark is drawn rather than fetched** (AC-265), and follows the
document's theme: the public pages draw on the page's own background in light
and dark alike, so there is no fixed surface to state.
*/
import { DanaMark } from '../components/dana-mark.js'

export function DanaIdentity(): React.JSX.Element {
  return (
    <a
      href="/"
      className="inline-flex items-center gap-3 rounded-md text-sm font-semibold text-foreground outline-none"
      aria-label="Dana home"
    >
      <DanaMark className="size-7" />
      <span>Dana</span>
    </a>
  )
}
