/*
The viewport predicate `sidebar.tsx` uses to decide whether it renders as a
fixed column or as a sheet over the page. It is the designer's
`src/hooks/use-mobile.ts` unchanged.

It sits beside the primitives rather than in a hooks directory for the reason
`utils.ts` gives about itself: this role owns `app/src/client/components/**`
and nothing adjacent to it, and one consumer does not justify asking the
Steward for a new top-level directory.

**This is not the mobile layout section 13 item 32 defers.** That item accepts
the designer's deferral and ships v1 desktop-first, and it also requires that
a narrow viewport be no worse after this package than before it. This hook
arrives because it is built into the primitive being adopted, and removing it
would mean editing working code to no end; what it does at a narrow width is
present the same sidebar as an overlay, which is better than the P8 client's
behaviour there and worse than nothing designed. The breakpoint is his and no
section fixes one.

`undefined` until the effect runs, then coerced, so the first server-free
render does not claim a width it has not measured.
*/
import * as React from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
