import type { useRenameFolder } from '../../api/mutations.js'
import { PageCover } from '../../components/page-cover.js'
import { FolderHeader } from '../../components/folder-head.js'
import { markIcon } from '../../components/page/icon-manifest.js'
import { PageSection } from '../../components/page/PageSection.js'
import type { FolderGates } from '../../lib/folder-authority.js'
import { IDENTITY_COLOR_FALLBACK } from '../../parts/identity-colors.js'
import type { GetFolderResponse } from '../../../shared/folders.js'

export function FolderHead({
  hasCover,
  isDefault,
  coverKey,
  detail,
  gates,
  renaming,
  setRenaming,
  patch,
  headId,
  actions,
}: {
  readonly hasCover: boolean
  readonly isDefault: boolean
  readonly coverKey: string
  readonly detail: GetFolderResponse | undefined
  readonly gates: FolderGates | null
  readonly renaming: boolean
  readonly setRenaming: (next: boolean) => void
  readonly patch: ReturnType<typeof useRenameFolder>
  readonly headId: string
  readonly actions: React.ReactNode
}): React.JSX.Element {
  return (
    <>
      {hasCover && !isDefault ? (
        <div className="-mt-4 md:-mt-6">
          {/* Below Can edit, the band is read only. */}
          <PageCover storageName={coverKey} readOnly={gates?.identity !== true} />
        </div>
      ) : null}
      <PageSection name="Page header">
        <FolderHeader
          name={detail?.name ?? ''}
          icon={markIcon(detail?.icon ?? null)}
          color={detail?.color ?? IDENTITY_COLOR_FALLBACK}
          iconKey={detail?.icon ?? null}
          colorKey={detail?.color ?? null}
          editable={gates?.identity === true}
          renaming={renaming}
          onRenamingChange={setRenaming}
          onRename={(name) => {
            patch.mutate({ id: headId, body: { name } })
          }}
          onPickIdentity={(next) => {
            patch.mutate({ id: headId, body: next })
          }}
          onRemoveIcon={() => {
            patch.mutate({ id: headId, body: { icon: null } })
          }}
          actions={actions}
          /* The Desk is not a project, so it has no cover. */
          coverKey={isDefault ? undefined : coverKey}
        />
      </PageSection>
    </>
  )
}
