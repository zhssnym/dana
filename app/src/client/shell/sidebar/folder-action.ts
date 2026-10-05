/* The queries a Library row uses to ask a page or collection page to run an act. */
import { paths } from '../../routes.js'

/*
The acts a Library row runs by asking the page: `?folder-action=` opens a new
page's name field, an owner's delete question and the page's History, which
all live on the page. `folderGates` decides which a viewer gets, the same call
the page makes.
*/
export type FolderAction = 'rename' | 'leave' | 'delete' | 'history'

/** The query the folder page reads to run an act the Library asked for. */
export const FOLDER_ACTION_PARAM = 'folder-action'

/** The query the collection page reads to open an act from the Library. */
export const SHELF_ACTION_PARAM = 'shelf-action'

export function folderActionPath(id: string, action: FolderAction): string {
  return `${paths.folder(id)}?${FOLDER_ACTION_PARAM}=${action}`
}
