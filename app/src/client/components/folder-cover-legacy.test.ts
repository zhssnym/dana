import { describe, expect, it } from "vitest"

import { coverRepositions, resolveCover } from "./folder-cover.js"

describe("legacy cover keys", () => {
  it("does not resolve or offer repositioning for retired photo keys", () => {
    expect(resolveCover("photo:42", "Inbox")).toBeNull()
    expect(coverRepositions("photo:42")).toBe(false)
  })
})
