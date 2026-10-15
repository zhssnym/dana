import { z } from 'zod'

export const pageFacet = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  position: z.string(),
  content_page_id: z.uuid(),
})

export const getPageFacetsResponse = z.object({
  page_id: z.uuid(),
  containing_facet_id: z.uuid().nullable(),
  facets: z.array(pageFacet),
})
export type GetPageFacetsResponse = z.infer<typeof getPageFacetsResponse>
