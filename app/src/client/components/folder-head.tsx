/*
The folder's header: at most two rows.

Row one is the mark, the name and, at the far right, the folder's only two
controls: "Share" and one "…". Row two, only when there is finite work, is the
progress fact, "3 of 7 done".

**No description line** (round 2): a page's Purpose tab is where its "why" is
written. A description already stored stays in the data and is simply not
drawn; nothing migrates it.

**Everything is edited in place.** The name is a heading that becomes a field on
a click; the mark opens the icon picker. A viewer below Can edit gets the same
rows with nothing pressable (issue #228, AC-011): a heading and a glyph.

**"Add cover" appears above the title on hover** (round 3, Notion's place for
it), and only while the page has none; once there is a cover the band's own
picker changes or removes it. `FolderCoverDialog` below is kept for the
sidebar's `?folder-action=cover` link.
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
import { FolderCoverPicker } from './folder-cover.js'
import { AddCoverAction } from './page-cover.js'
import { T_FAST } from './task-row.js'
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
  progress,
  actions,
  coverKey,
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
  /** "3 of 7 done", or null when the folder has no finite work. */
  readonly progress: string | null
  readonly actions: React.ReactNode
  /** The page's cover storage name; with it, an editor gets "Add cover". */
  readonly coverKey?: string
}): React.JSX.Element {
  const [markOpen, setMarkOpen] = useState(false)
  const glyph = (
    <Icon className="size-7" style={{ color }} strokeWidth={1.5} aria-hidden="true" />
  )
  return (
    <header className="group/head space-y-1 pt-2">
      {editable && coverKey !== undefined ? (
        <div
          className={cn(
            'opacity-0 transition-opacity group-hover/head:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100',
            T_FAST,
          )}
        >
          <AddCoverAction storageName={coverKey} />
        </div>
      ) : null}
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
            className={cn(FIELD, 'flex-1 text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-bold text-foreground')}
          />
        ) : (
          /* A heading, always, and the click is the rename (AC-226, AC-217). */
          <h1
            onClick={editable ? () => onRenamingChange(true) : undefined}
            className={cn(
              'min-w-0 flex-1 truncate text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-bold text-foreground',
              editable ? 'cursor-text' : '',
            )}
          >
            {name}
          </h1>
        )}
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      {progress === null ? null : (
        <p className="pl-9 text-sm text-muted-foreground tabular-nums max-md:pl-0">{progress}</p>
      )}
    </header>
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
