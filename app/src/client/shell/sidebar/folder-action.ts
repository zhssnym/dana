import { paths } from '../../routes.js'

/* Acts a Library row asks the page to run, because their surface lives there. */
export type FolderAction = 'rename' | 'leave' | 'delete' | 'history'

export const FOLDER_ACTION_PARAM = 'folder-action'

export const SHELF_ACTION_PARAM = 'shelf-action'

export function folderActionPath(id: string, action: FolderAction): string {
  return `${paths.folder(id)}?${FOLDER_ACTION_PARAM}=${action}`
}
