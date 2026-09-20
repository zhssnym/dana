import { describe, expect, it } from "vitest"

import { navPages } from "../routes.js"
import { PLACES, scheduleLanding } from "./place-pages.js"

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

/*
What a drop writes, which is not what a capture writes.

Q3C since issue #216: "Dragging moves a Due-only task's Due Date, a Start-only
task's Start Date, and a Start+Due range whole." Every drop on every board
wrote `due_date` until 2026-09-20, and the same change that made Start-only
rows appear on a date-grouped board made carrying one to another column turn
it into a Start+Due task in silence. Nothing in this client's tests could see
it, every card factory in the tree having hardcoded `start_date: null`.
*/
describe("scheduleLanding: which end of the Schedule a drop moves", () => {
  const day = { due_date: "2026-08-27" }

  it("moves a due-only task's due date, which is what it always did", () => {
    expect(scheduleLanding({ start_date: null, due_date: "2026-08-20" }, day)).toEqual(day)
  })

  it("moves a start-only task's start date instead", () => {
    expect(scheduleLanding({ start_date: "2026-08-20", due_date: null }, day)).toEqual({
      start_date: "2026-08-27",
    })
  })

  it("refuses a start-and-due pair rather than moving one end of it", () => {
    expect(
      scheduleLanding({ start_date: "2026-08-20", due_date: "2026-08-30" }, day),
    ).toBeNull()
  })

  it("passes a column that writes no date through untouched", () => {
    const folder = { folder_id: "f-1" }
    expect(
      scheduleLanding({ start_date: "2026-08-20", due_date: "2026-08-30" }, folder),
    ).toEqual(folder)
  })
})
