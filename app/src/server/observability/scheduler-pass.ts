// When the reminder scheduler last finished a pass, for the health route (spec 11.12).
// Lives here so the scheduler does not import a router.
let lastPassAt: number | null = null

export function recordSchedulerPass(): void {
  lastPassAt = Date.now()
}

export function secondsSinceLastPass(): number | null {
  if (lastPassAt === null) return null
  return Math.round((Date.now() - lastPassAt) / 1000)
}
