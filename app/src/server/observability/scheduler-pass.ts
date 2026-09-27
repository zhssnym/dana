/*
When the reminder scheduler last finished a pass, so health can report tick
liveness separately from process liveness (spec 11.12). The scheduler writes
it and the health route reads it; it lives here rather than in the route so
the scheduler does not import a router.
*/
let lastPassAt: number | null = null

// Called by the reminder scheduler after each completed pass.
export function recordSchedulerPass(): void {
  lastPassAt = Date.now()
}

export function secondsSinceLastPass(): number | null {
  if (lastPassAt === null) return null
  return Math.round((Date.now() - lastPassAt) / 1000)
}
