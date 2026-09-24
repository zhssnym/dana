/*
The shape a stored picture is drawn at, from 4.16's `width` and `height`.

They describe the stored object, a 3000x1500 upload being stored and reported as
2048x1024; 7.16 hands them to a block read as `file_width`/`file_height` and
7.14 to a comment's file as `width`/`height`. Null means unknown and every
file stored before those columns existed reports null indefinitely, so the
fallback is not a stopgap.
*/

/**
 * The shape a stored picture is drawn at when the wire does not say what its
 * shape is.
 *
 * Sixteen by nine is what every one of these surfaces already drew, and the
 * point of writing it once is that it must go on being what they draw. 4.16's
 * pair is nullable and no backfill has been run, so a picture uploaded before
 * migration 0009 reports null for ever; a reader that treated null as anything
 * but "unknown" would change what those pages look like today.
 */
const FALLBACK_RATIO = 16 / 9

/**
 * Width over height where 4.16 measured the picture, and undefined where it
 * did not (issue #108).
 *
 * **One function for every surface that draws a stored picture**, a page
 * block's `file_width`/`file_height` and a comment file's `width`/`height`
 * being the same pair under two names. A rule spelled per surface is a rule
 * that drifts per surface, which is the reason `tokens.css` is one file.
 *
 * Zero and negative are read as unmeasured along with null. The columns are
 * declared positive and nothing should send a zero, but a zero height divides
 * into `Infinity` and a zero width into a ratio of nothing, and CSS accepts
 * both and draws an unbounded or collapsed box. A number that cannot be a
 * picture's is not a shape, and "no shape" already has an answer per surface.
 */
export function measuredRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): number | undefined {
  if (width === null || width === undefined || width <= 0) return undefined
  if (height === null || height === undefined || height <= 0) return undefined
  return width / height
}

/**
 * The same reading for a surface whose answer to "no shape" is already 16 by
 * 9, which is the page block and only the page block.
 *
 * **The split between this and `measuredRatio` is the whole care of issue
 * #108 and is not a stylistic one.** Null means unknown and a surface must go
 * on drawing an unknown picture exactly as it draws it today, which is a
 * different thing on the two surfaces. A page block has always reserved 16 by 9
 * for an unmeasured picture. A comment's
 * picture has never had a reservation at all: it takes its own proportion
 * once the bytes arrive, so imposing 16 by 9 on the unmeasured ones would
 * reshape every attachment posted before migration 0009, which is the
 * regression this pair exists to make impossible to write by accident.
 */
export function reservedRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): number {
  return measuredRatio(width, height) ?? FALLBACK_RATIO
}
