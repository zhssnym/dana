import { lazy, Suspense, useState } from 'react'

import type { ProfileArea, ProfileContent, ProfileStanding } from '../../shared/member-profile.js'
import type { RichContent } from '../../shared/rich-content.js'
import { mutateApi } from '../api/http.js'
import { Button } from '../components/ui/button.js'
import { FileText, Image as ImageIcon, Pencil } from '../lib/icons.js'

const ProfileContentEditor = lazy(() => import('./ProfileContentEditor.js'))

function RichRuns({ content }: { readonly content: RichContent }): React.JSX.Element {
  return <>{content.runs.map((run, i) => {
    let node: React.ReactNode = run.text
    if (run.href) {
      const external = /^(https?:|mailto:)/i.test(run.href)
      node = <a className="underline underline-offset-2 hover:text-foreground" href={run.href}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{node}</a>
    }
    if (run.italic) node = <em>{node}</em>
    if (run.bold) node = <strong className="font-medium">{node}</strong>
    return <span key={i}>{node}</span>
  })}</>
}

export function ProfileContentArea({
  folderId, userId, area, standing, names, canUploadFile, canUploadImage, onSaved,
}: {
  readonly folderId: string
  readonly userId: string
  readonly area: ProfileArea
  readonly standing: ProfileStanding
  readonly names: Readonly<Record<string, string>>
  readonly canUploadFile: boolean
  readonly canUploadImage: boolean
  readonly onSaved: () => Promise<unknown>
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const title = area === 'project' ? 'Project content' : 'Shared by teammate'
  const blocks = standing.content.blocks
  const canEdit = standing.may_edit

  return <section aria-label={title} className="space-y-[var(--space-inline)]">
    <div className="flex min-h-[var(--row-height)] items-center gap-2">
      <h3 className="min-w-0 flex-1 text-sm font-section text-foreground">{title}</h3>
      {canEdit && !editing && blocks.length > 0 ? (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" strokeWidth={1.75} /> Edit
        </Button>
      ) : null}
    </div>
    {editing ? <Suspense fallback={<p className="text-sm text-muted-foreground">Loading editor…</p>}>
      <ProfileContentEditor key={standing.revision} folderId={folderId} initial={standing.content} names={names}
        canUploadFile={canUploadFile} canUploadImage={canUploadImage}
        onCancel={() => setEditing(false)}
        onSave={async (content: ProfileContent) => {
          await mutateApi(null, {
            method: 'PUT',
            path: `/folders/${folderId}/members/${userId}/profile-content/${area}`,
            body: { content, base_revision: standing.revision },
          })
          await onSaved()
          setEditing(false)
          setError('')
        }} />
    </Suspense> : blocks.length === 0 ? (
      canEdit ? (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" strokeWidth={1.75} />
          {area === 'project' ? 'Add project content' : 'Share something'}
        </Button>
      ) : <p className="text-sm text-muted-foreground">Nothing shared yet.</p>
    ) : (
      <div className="space-y-2 text-sm leading-relaxed text-foreground">
        {blocks.map((block, index) => {
          if (block.kind === 'paragraph') return <p key={index} className="whitespace-pre-wrap break-words"><RichRuns content={block.content}/></p>
          if (block.kind === 'bullet' || block.kind === 'numbered')
            return <div key={index} className="flex min-w-0 gap-2 pl-1">
              <span className="shrink-0 text-muted-foreground" aria-hidden="true">{block.kind === 'bullet' ? '•' : `${index+1}.`}</span>
              <span className="min-w-0 break-words"><RichRuns content={block.content}/></span>
            </div>
          const name = names[block.file_id]
          if (!name) return <p key={index} className="text-xs text-muted-foreground">Attachment unavailable</p>
          const href = `/api/v1/files/${block.file_id}`
          if (block.kind === 'image') return <a key={index} href={href} target="_blank" rel="noreferrer"
            className="block w-fit max-w-full rounded-md border border-border/60 p-1 hover:border-border">
            <img src={href} alt={name} loading="lazy" className="max-h-64 max-w-full rounded-sm object-contain"/>
            <span className="mt-1 flex items-center gap-1.5 px-1 text-xs text-muted-foreground"><ImageIcon aria-hidden="true" className="size-3.5"/> {name}</span>
          </a>
          return <a key={index} href={href} className="flex w-fit max-w-full items-center gap-2 rounded-md border border-border/70 px-2.5 py-2 text-sm hover:bg-muted/60"
            download>
            <FileText aria-hidden="true" className="size-[var(--icon-size-compact)] shrink-0 text-muted-foreground"/>
            <span className="min-w-0 truncate">{name}</span>
          </a>
        })}
      </div>
    )}
    {standing.updated_by && !editing ? <p className="text-xs text-muted-foreground">
      Updated by {standing.updated_by.display_name ?? 'Someone'}
    </p> : null}
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </section>
}
