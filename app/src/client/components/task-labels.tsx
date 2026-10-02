import { useState } from 'react'

import type { LabelDefinition, LabelRef } from '../../shared/labels.js'
import { useArchiveLabel, useCreateLabel, useLabels, usePatchLabel, useSetTaskLabel } from '../api/labels.js'
import { IDENTITY_COLORS } from '../parts/identity-colors.js'
import { Check } from '../lib/icons.js'
import { LabelChip, LabelDot } from './label-chip.js'
import { PROPERTY_LABEL, PROPERTY_ROW } from './task-pickers.js'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js'

type Scope = 'personal' | 'folder'

export function TaskLabels({ taskId, folderId, sharedName, worn, canManageFolder, canApplyFolder }: {
  readonly taskId: string
  readonly folderId: string | null
  readonly sharedName: 'Work' | 'Page'
  readonly worn: readonly LabelRef[]
  readonly canManageFolder: boolean
  readonly canApplyFolder: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<LabelDefinition | null>(null)
  const [creating, setCreating] = useState<Scope | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(IDENTITY_COLORS[0]![1])
  const labels = useLabels(folderId, 'all')
  const assign = useSetTaskLabel()
  const create = useCreateLabel()
  const patch = usePatchLabel()
  const archive = useArchiveLabel()
  const selected = new Set(worn.map((label) => label.id))
  const matching = (labels.data?.rows ?? []).filter((label) =>
    label.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const mayManage = (scope: Scope): boolean => scope === 'personal' || canManageFolder
  const mayApply = (scope: Scope): boolean => scope === 'personal' || canApplyFolder
  const busy = assign.isPending || create.isPending || patch.isPending || archive.isPending

  function beginEdit(label: LabelDefinition): void {
    setEditing(label)
    setCreating(null)
    setName(label.name)
    setColor(label.color)
  }
  function beginCreate(scope: Scope): void {
    setEditing(null)
    setCreating(scope)
    setName(search.trim())
    setColor(IDENTITY_COLORS[0]![1])
  }
  function save(): void {
    const clean = name.trim()
    if (!clean || busy) return
    if (editing !== null) {
      patch.mutate({ label: editing, fields: { name: clean, color } }, {
        onSuccess: () => setEditing(null),
      })
    } else if (creating !== null) {
      create.mutate({ folderId: creating === 'personal' ? null : folderId, name: clean, color }, {
        onSuccess: (label) => {
          setCreating(null)
          setSearch('')
          assign.mutate({ taskId, labelId: label.id, on: true })
        },
      })
    }
  }
  function choices(scope: Scope, title: string): React.JSX.Element | null {
    const rows = matching.filter((label) => label.scope === scope && (!label.archived || showArchived))
    if (rows.length === 0 && !mayManage(scope)) return null
    return <section aria-label={`${title} labels`} className="border-t border-border pt-1">
      <div className="px-2 py-1 text-xs text-muted-foreground">{title}</div>
      {rows.map((label) => <div key={label.id} className="flex items-center gap-1">
        <button type="button" disabled={busy || !mayApply(scope) || (label.archived && !selected.has(label.id))}
          aria-pressed={selected.has(label.id)}
          aria-label={`${selected.has(label.id) ? 'Remove' : 'Assign'} ${title} label ${label.name}`}
          onClick={() => assign.mutate({ taskId, labelId: label.id, on: !selected.has(label.id) })}
          className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left hover:bg-accent disabled:opacity-50">
          <LabelChip label={label} className="min-w-0 flex-1" />
          {selected.has(label.id) ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
          {label.archived ? <span className="text-xs text-muted-foreground">Archived</span> : null}
        </button>
        {mayManage(scope) ? <button type="button" className="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent" onClick={() => beginEdit(label)} aria-label={`Edit ${title} label ${label.name}`}>Edit</button> : null}
      </div>)}
      {mayManage(scope) ? <button type="button" className="min-h-8 w-full rounded-sm px-2 text-left text-xs text-muted-foreground hover:bg-accent" onClick={() => beginCreate(scope)}>Create {title.toLowerCase()} label</button> : null}
    </section>
  }

  return <Popover open={open} onOpenChange={(next) => {
    setOpen(next)
    if (!next) { setEditing(null); setCreating(null); setSearch('') }
  }}>
    <PopoverTrigger render={<button type="button" className={PROPERTY_ROW}
      aria-label={`Labels: ${worn.length === 0 ? 'Add labels' : worn.map((label) => label.name).join(', ')}`}
      onClick={(event) => event.stopPropagation()} />}>
      <span className={PROPERTY_LABEL}>Labels</span>
      {worn.length === 0 ? <span className="text-muted-foreground">Add labels</span> :
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
          {worn.map((label) => <LabelChip key={label.id} label={label} className={label.archived ? 'opacity-50' : ''} />)}
        </span>}
    </PopoverTrigger>
    <PopoverContent align="start" className="max-h-[var(--available-height)] w-72 overflow-y-auto p-1" aria-label="Task labels">
      {editing !== null || creating !== null ? <div className="space-y-2 p-2">
        <div className="text-xs text-muted-foreground">{editing === null ? `New ${creating === 'personal' ? 'Personal' : sharedName} label` : `Edit ${editing.scope === 'personal' ? 'Personal' : sharedName} label`}</div>
        <input autoFocus aria-label="Label name" maxLength={40} value={name} onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') save() }}
          className="h-8 w-full rounded-sm border border-input bg-background px-2 outline-none focus:border-ring" />
        <div role="group" aria-label="Label color" className="flex flex-wrap gap-1">
          {IDENTITY_COLORS.map(([word, hex]) => <button key={word} type="button" aria-label={`${word} label color`} aria-pressed={color === hex} onClick={() => setColor(hex)} className="flex size-7 items-center justify-center rounded-sm hover:bg-accent aria-pressed:bg-selected"><LabelDot color={hex} className="size-4" /></button>)}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-sm px-2 py-1 text-sm hover:bg-accent" onClick={() => { setEditing(null); setCreating(null) }}>Back</button>
          <button type="button" disabled={!name.trim() || busy} className="rounded-sm bg-accent px-2 py-1 text-sm disabled:opacity-50" onClick={save}>Save label</button>
          {editing === null ? null : <button type="button" disabled={busy} className="ml-auto rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent" onClick={() => archive.mutate({ label: editing, archived: !editing.archived }, { onSuccess: () => setEditing(null) })}>{editing.archived ? 'Restore' : 'Archive'}</button>}
        </div>
      </div> : <>
        <input aria-label="Search labels" placeholder="Search labels" value={search} onChange={(event) => setSearch(event.target.value)} className="m-1 h-8 w-[calc(100%-0.5rem)] rounded-sm border border-input bg-background px-2 outline-none focus:border-ring" />
        {labels.isError ? <p role="alert" className="px-2 py-1 text-xs">Could not load labels.</p> : null}
        {choices('personal', 'Personal')}
        {folderId === null ? null : choices('folder', sharedName)}
        {(labels.data?.rows ?? []).some((label) => label.archived) ? <button type="button" className="min-h-8 w-full rounded-sm px-2 text-left text-xs text-muted-foreground hover:bg-accent" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide archived' : 'Show archived'}</button> : null}
      </>}
    </PopoverContent>
  </Popover>
}
