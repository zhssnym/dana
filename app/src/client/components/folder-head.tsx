/*
The folder's header: at most two rows.

Row one is the mark, the name and, at the far right, the folder's only two
controls: "Share" and one "…". Row two is one muted line: the description (or
the offer to write one) and the progress fact, "3 of 7 done".

**Everything is edited in place.** The name is a heading that becomes a field on
a click; the description is a line that becomes a field on a click; the mark
opens the icon picker. A viewer below Can edit gets the same two rows with
nothing pressable (issue #228, AC-011): a heading, a line, a glyph.

**The cover is not offered here.** Its one home is the "…" menu (the Quiet
spec's control map), which opens `FolderCoverDialog` below: images only, no
gradients. A folder already wearing a gradient still draws it.
*/
import { useState } from 'react'

import type { LucideIcon } from '../lib/icons.js'
import {
  coverPhotoPicker,
  coverTiersFor,
  coverUploader,
  savePageIdentity,
  usePageIdentity,
} from '../lib/page-identity.js'
import { PLACE_DESCRIPTION_MAX } from '../../shared/place-descriptions.js'
import { FolderCoverPicker } from './folder-cover.js'
import { IconPicker } from './page/IconPicker.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.js'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js'
import { cn } from './ui/utils.js'

const FIELD =
  'min-w-0 rounded-sm bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function FolderHeader({
  name,
  icon: Icon,
  color,
  iconKey,
  colorKey,
  editable,
  renaming,
  onRenamingChange,
  onRename,
  onPickIdentity,
  storageName,
  progress,
  actions,
}: {
  readonly name: string
  readonly icon: LucideIcon
  readonly color: string
  readonly iconKey: string | null
  readonly colorKey: string | null
  /** Can edit and above (issue #228). */
  readonly editable: boolean
  readonly renaming: boolean
  readonly onRenamingChange: (next: boolean) => void
  readonly onRename: (next: string) => void
  readonly onPickIdentity: (next: { icon?: string; color?: string }) => void
  /** `lib/page-identity.ts`'s key for this folder's description. */
  readonly storageName: string
  /** "3 of 7 done", or null when the folder has no finite work. */
  readonly progress: string | null
  readonly actions: React.ReactNode
}): React.JSX.Element {
  const [markOpen, setMarkOpen] = useState(false)
  const glyph = (
    <Icon className="size-7" style={{ color }} strokeWidth={1.5} aria-hidden="true" />
  )
  return (
    <header className="space-y-1 pt-2">
      <div className="flex min-w-0 items-center gap-2">
        {editable ? (
          <Popover open={markOpen} onOpenChange={setMarkOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`Icon and colour for ${name}`}
                  className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              {glyph}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <IconPicker icon={iconKey} color={colorKey} onPick={onPickIdentity} />
            </PopoverContent>
          </Popover>
        ) : (
          <span className="-ml-1 flex size-9 shrink-0 items-center justify-center">{glyph}</span>
        )}
        {editable && renaming ? (
          <input
            key={name}
            defaultValue={name}
            aria-label="Folder name"
            maxLength={100}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => {
              const next = event.target.value.trim()
              onRenamingChange(false)
              if (next !== '' && next !== name) onRename(next)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                event.currentTarget.value = name
                event.currentTarget.blur()
              }
            }}
            className={cn(FIELD, 'flex-1 text-2xl font-bold text-foreground')}
          />
        ) : (
          /* A heading, always, and the click is the rename (AC-226, AC-217). */
          <h1
            onClick={editable ? () => onRenamingChange(true) : undefined}
            className={cn(
              'min-w-0 flex-1 truncate text-2xl font-bold text-foreground',
              editable ? 'cursor-text' : '',
            )}
          >
            {name}
          </h1>
        )}
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      <div className="flex min-w-0 items-baseline gap-2 pl-9 text-sm text-muted-foreground max-md:pl-0">
        <FolderDescription storageName={storageName} editable={editable} />
        {progress === null ? null : (
          <span className="shrink-0 tabular-nums">
            <span aria-hidden="true" className="mr-2">·</span>
            {progress}
          </span>
        )}
      </div>
    </header>
  )
}

/**
 * The description as one line: read, or click to write. Saved through
 * `lib/page-identity.ts`'s folder half, the same PATCH the old field used.
 */
function FolderDescription({
  storageName,
  editable,
}: {
  readonly storageName: string
  readonly editable: boolean
}): React.JSX.Element | null {
  const identity = usePageIdentity(storageName)
  const [editing, setEditing] = useState(false)
  const value = identity.description ?? ''

  if (editable && editing) {
    return (
      <input
        defaultValue={value}
        aria-label="Folder description"
        placeholder="Add a description"
        maxLength={PLACE_DESCRIPTION_MAX}
        autoFocus
        onBlur={(event) => {
          const text = event.target.value.trim()
          setEditing(false)
          if (text !== value) savePageIdentity(storageName, { description: text === '' ? undefined : text })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = value
            event.currentTarget.blur()
          }
        }}
        className={cn(FIELD, 'flex-1 text-sm text-foreground placeholder:text-muted-foreground')}
      />
    )
  }
  if (!editable) {
    return value === '' ? null : <span className="min-w-0 truncate" title={value}>{value}</span>
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={value === '' ? undefined : value}
      className={cn(FIELD, 'truncate text-left hover:text-foreground', value === '' ? 'opacity-70' : '')}
    >
      {value === '' ? 'Add a description' : value}
    </button>
  )
}

/**
 * The cover's one home, opened from the folder's "…": images only. The
 * gallery tier (gradients and marks) is not offered; a folder already wearing
 * one keeps it until it is changed or removed here.
 */
export function FolderCoverDialog({
  storageName,
  open,
  onOpenChange,
}: {
  readonly storageName: string
  readonly open: boolean
  readonly onOpenChange: (next: boolean) => void
}): React.JSX.Element {
  const identity = usePageIdentity(storageName)
  const upload = coverUploader(storageName)
  const pickPhoto = coverPhotoPicker(storageName)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Cover</DialogTitle>
        </DialogHeader>
        <FolderCoverPicker
          value={identity.cover}
          folderName={storageName}
          tiers={coverTiersFor(storageName).filter((tier) => tier !== 'gallery')}
          {...(upload === undefined
            ? {}
            : { onUpload: (file: File) => { upload(file); onOpenChange(false) } })}
          {...(pickPhoto === undefined
            ? {}
            : { onPickPhoto: (id: string) => { pickPhoto(id); onOpenChange(false) } })}
          onPick={(key) => {
            savePageIdentity(storageName, { cover: key, coverPos: 50 })
            onOpenChange(false)
          }}
          onRemove={() => {
            savePageIdentity(storageName, { cover: undefined })
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
