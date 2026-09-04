import { describe, expect, it } from "vitest"

import { navPages } from "../routes.js"
import { PLACES } from "./place-pages.js"

const sharedPlaceKeys = [
  "today",
  "scheduled",
  "assignments",
  "important",
  "all",
  "done",
  "abandoned",
  "anytime",
] as const

describe("native page descriptions", () => {
  it("keeps page names, paths, icons, and descriptions aligned", () => {
    for (const key of sharedPlaceKeys) {
      const navPage = navPages.find((page) => page.key === key)

      expect(navPage).toBeDefined()
      expect(PLACES[key]).toMatchObject({
        name: navPage?.name,
        path: navPage?.path,
        question: navPage?.question,
        icon: navPage?.icon,
      })
    }
  })

  it("gives every native page a friendly sentence by default", () => {
    for (const page of navPages) {
      expect(page.question).toMatch(/\.$/)
    }
  })
})
