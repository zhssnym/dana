import { z } from 'zod'

export const pageFacet = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  position: z.string(),
  content_page_id: z.uuid().nullable(),
})

export const getPageFacetsResponse = z.object({
  page_id: z.uuid(),
  containing_facet_id: z.uuid().nullable(),
  facets: z.array(pageFacet),
})
export type GetPageFacetsResponse = z.infer<typeof getPageFacetsResponse>

const facetName = z.string().trim().min(1).max(120)

export const createPageFacetBody = z.object({
  name: facetName,
  after_facet_id: z.uuid().nullable().optional(),
})

export const renamePageFacetBody = z.object({ name: facetName })

export const reorderPageFacetsBody = z.object({
  order: z.array(z.uuid()).min(1).max(200),
})
