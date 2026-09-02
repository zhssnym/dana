/**
 * New folders start with useful page copy instead of an empty line. The
 * description is ordinary folder data, so it can be rewritten or cleared.
 */
export function defaultFolderDescription(name: string): string {
  return `Tasks, notes, and plans for ${name}.`
}
