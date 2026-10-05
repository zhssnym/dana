import {
  useCreateTab,
  useDeleteFolder,
  useLeaveFolder,
  useDuplicateFolder,
  useMoveFolder,
  useRenameFolder,
  useRestoreFolder,
  useTransferOwnership,
} from '../../api/mutations.js'
import { useArchiveFolder, useRestoreArchivedFolder } from '../../api/archive.js'

export interface FolderMutations {
  readonly remove: ReturnType<typeof useDeleteFolder>
  readonly restore: ReturnType<typeof useRestoreFolder>
  readonly archive: ReturnType<typeof useArchiveFolder>
  readonly restoreArchived: ReturnType<typeof useRestoreArchivedFolder>
  readonly patch: ReturnType<typeof useRenameFolder>
  readonly leave: ReturnType<typeof useLeaveFolder>
  readonly transfer: ReturnType<typeof useTransferOwnership>
  readonly createTab: ReturnType<typeof useCreateTab>
  readonly moveTab: ReturnType<typeof useMoveFolder>
  readonly duplicate: ReturnType<typeof useDuplicateFolder>
}

export function useFolderMutations(): FolderMutations {
  const remove = useDeleteFolder()
  const restore = useRestoreFolder()
  const archive = useArchiveFolder()
  const restoreArchived = useRestoreArchivedFolder()
  const patch = useRenameFolder()
  const leave = useLeaveFolder()
  const transfer = useTransferOwnership()
  const createTab = useCreateTab()
  const moveTab = useMoveFolder()
  const duplicate = useDuplicateFolder()
  return { remove, restore, archive, restoreArchived, patch, leave, transfer, createTab, moveTab, duplicate }
}
