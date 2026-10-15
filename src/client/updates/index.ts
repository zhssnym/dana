import rawFeed from './feed.json'

export type UpdateKind = 'feature' | 'improvement' | 'fix'

export interface ProductUpdate {
  readonly id: string
  readonly publishedAt: string
  readonly historical: boolean
  readonly kind: UpdateKind
  readonly title: string
  readonly summary: string
  readonly pr: number
  readonly commit: string
}

// The built app and /updates/feed.json are generated from the same source.
export const productUpdates: readonly ProductUpdate[] = rawFeed.entries.map((item) => ({
  ...item,
  kind: item.kind as UpdateKind,
}))
export const latestProductUpdate = productUpdates.find((item) => !item.historical) ?? null
export const updateById = new Map(productUpdates.map((item) => [item.id, item]))

export function formatUpdateDay(day: string): string {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(day + 'T12:00:00Z'))
}
