/**
 * Width over height, or undefined when unmeasured. Zero and negative count as
 * unmeasured, because CSS would draw an unbounded or collapsed box.
 */
export function measuredRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): number | undefined {
  if (width === null || width === undefined || width <= 0) return undefined
  if (height === null || height === undefined || height <= 0) return undefined
  return width / height
}
