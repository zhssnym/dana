import { z } from 'zod'

/** A project-local facet/tab attached to one whole block (#488). */
export const blockFacetRef = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
})
export type BlockFacetRef = z.infer<typeof blockFacetRef>

/** Project-wide relation read used by the canvas to decorate only blocks it draws. */
export const projectBlockFacetRow = z.object({
  block_id: z.uuid(),
  facets: z.array(blockFacetRef),
})
export type ProjectBlockFacetRow = z.infer<typeof projectBlockFacetRow>

export const getProjectBlockFacetsResponse = z.object({
  project_id: z.uuid(),
  blocks: z.array(projectBlockFacetRow),
})
export type GetProjectBlockFacetsResponse = z.infer<typeof getProjectBlockFacetsResponse>

/** Atomic replacement avoids separate link/unlink requests and duplicate edges. */
export const putBlockFacetsBody = z.object({
  facet_ids: z.array(z.uuid()).max(50).refine(
    (ids) => new Set(ids).size === ids.length,
    { message: 'facet_ids: duplicate facets are not allowed' },
  ),
})
export type PutBlockFacetsBody = z.infer<typeof putBlockFacetsBody>

export const putBlockFacetsResponse = z.object({
  block_id: z.uuid(),
  facets: z.array(blockFacetRef),
})
export type PutBlockFacetsResponse = z.infer<typeof putBlockFacetsResponse>
