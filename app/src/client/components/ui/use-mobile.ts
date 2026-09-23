/*
The viewport predicate `sidebar.tsx` uses to decide whether it renders as a
fixed column or as a sheet over the page. It is the designer's
`src/hooks/use-mobile.ts` unchanged.

It sits beside the primitives rather than in a hooks directory for the reason
`utils.ts` gives about itself: one consumer does not justify a new top-level
directory.

**This is not a mobile layout**; Dana ships desktop-first. The hook comes
built into the sidebar primitive, and at a narrow width it presents the same
sidebar as an overlay. No section fixes the breakpoint.

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
