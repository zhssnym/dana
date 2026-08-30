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

**The mark is drawn rather than fetched, at S21** (ledger L-141, AC-265). The
`surface` is stated rather than left to follow the document because the
prototype states it, `landing-screen.tsx:54` passing light or dark by which
ground the header is on. This client's public header has only the light one,
so this is that branch.
*/
import { DanaMark } from '../components/dana-mark.js'

export function DanaIdentity(): React.JSX.Element {
  return (
    <a
      href="/"
      className="inline-flex items-center gap-3 rounded-md text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      aria-label="Dana home"
    >
      <DanaMark className="size-8" surface="light" />
      <span>Dana</span>
    </a>
  )
}
