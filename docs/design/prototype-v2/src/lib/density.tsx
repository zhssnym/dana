/*
Row density, the preference approved as DES-113.

Two lines is the default, and the reason is in that entry: the two failure
modes are not symmetric. Seeing fewer tasks is visible and self-correcting —
you scroll, you notice, you come here and change it. A truncated title is
invisible, because you do not know what you did not read. The safer default is
the one whose downside announces itself.

Stored in the browser rather than on the account, which is the front-end-only
half Imran approved. It therefore does not follow a person from laptop to
phone; syncing it is a later and separate want (Lane 2) and nothing here has to
change when that arrives, because the hook is already the only thing components
talk to.

The rule that keeps this affordable, from DES-113 and worth repeating where a
developer will actually see it: **the two densities may differ in height and in
where the details sit, and in nothing else.** The moment one grows a behaviour
the other lacks, this stops being a layout switch and becomes two rows to
maintain.
*/

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type RowDensity = "two" | "one"

const STORAGE_KEY = "dana.rowDensity"

interface DensityValue {
  density: RowDensity
  setDensity: (next: RowDensity) => void
}

const DensityContext = createContext<DensityValue>({
  density: "two",
  setDensity: () => {},
})

function readStored(): RowDensity {
  if (typeof window === "undefined") return "two"
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "one" ? "one" : "two"
  } catch {
    /* Private browsing and storage-blocked contexts both throw here. A
       display preference is not worth failing a page load over, so the
       default stands and the choice simply does not persist. */
    return "two"
  }
}

export function RowDensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<RowDensity>(readStored)

  const setDensity = useCallback((next: RowDensity) => {
    setDensityState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* See readStored: the preference still applies for this session. */
    }
  }, [])

  const value = useMemo(() => ({ density, setDensity }), [density, setDensity])

  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  )
}

export function useRowDensity() {
  return useContext(DensityContext)
}
