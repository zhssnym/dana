/*
The brand link the public pages wear: the mark, the word, and a way home.

Lifted out of `LandingPage.tsx` at S16, unchanged, because the legal pages of
DES-032 carry the same control and the prototype draws it the same way in
both files (`landing-screen.tsx` and `public-legal-screen.tsx` each have their
own copy of it). Two copies here would be two answers to what Dana's public
header is, and the second one would be the one that goes stale.

It is not `components/`: this is the public family's header rather than a
primitive anything else composes, and the component library has one owner
that is not this role.
*/

export function DanaIdentity(): React.JSX.Element {
  return (
    <a
      href="/"
      className="inline-flex items-center gap-3 rounded-md text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      aria-label="Dana home"
    >
      <img src="/dana-mark.svg" alt="" className="size-8" />
      <span>Dana</span>
    </a>
  )
}
