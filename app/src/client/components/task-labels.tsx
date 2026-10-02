import { useState } from 'react'

import type { LabelDefinition, LabelRef } from '../../shared/labels.js'
import { useArchiveLabel, useCreateLabel, useLabels, usePatchLabel, useSetTaskLabel } from '../api/labels.js'
import { IDENTITY_COLORS } from '../parts/identity-colors.js'
import { Check } from '../lib/icons.js'
import { LabelChip, LabelDot, byName } from './label-chip.js'
import { PROPERTY_LABEL, PROPERTY_ROW } from './task-pickers.js'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js'

type Scope = 'personal' | 'folder'
type Mode = 'pick' | 'manage'

export function TaskLabels({ taskId, folderId, worn, canManageFolder, canApplyFolder }: {
  readonly taskId: string
  readonly folderId: string | null
  readonly sharedName: 'Work' | 'Page'
  readonly worn: readonly LabelRef[]
  readonly canManageFolder: boolean
  readonly canApplyFolder: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('pick')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<LabelDefinition | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(IDENTITY_COLORS[0]![1])
  const labels = useLabels(folderId, 'all')
  const assign = useSetTaskLabel()
  const create = useCreateLabel()
  const patch = usePatchLabel()
  const archive = useArchiveLabel()
  const selected = new Set(worn.map((label) => label.id))
  const query = search.trim().toLocaleLowerCase()
  const matching = byName((labels.data?.rows ?? []).filter((label) =>
    label.name.toLocaleLowerCase().includes(query)))
  const mayManage = (scope: Scope): boolean => scope === 'personal' || canManageFolder
  const mayApply = (scope: Scope): boolean => scope === 'personal' || canApplyFolder
  const busy = assign.isPending || create.isPending || patch.isPending || archive.isPending
  const createScope: Scope = folderId !== null && canManageFolder ? 'folder' : 'personal'
  const choices = matching.filter((label) => !label.archived && (mayApply(label.scope) || selected.has(label.id)))
  const exact = choices.some((label) => label.name.toLocaleLowerCase() === query)

  function resetEditor(): void {
    setEditing(null)
    setCreating(false)
    setName('')
  }

  function beginEdit(label: LabelDefinition): void {
    setEditing(label)
    setCreating(false)
    setName(label.name)
    setColor(label.color)
  }

  function beginCreate(): void {
    setEditing(null)
    setCreating(true)
    setName(search.trim())
    setColor(IDENTITY_COLORS[0]![1])
  }

  function save(): void {
    const clean = name.trim()
    if (!clean || busy) return
    if (editing !== null) {
      patch.mutate({ label: editing, fields: { name: clean, color } }, {
        onSuccess: () => resetEditor(),
      })
      return
    }
    if (!creating) return
    create.mutate({ folderId: createScope === 'folder' ? folderId : null, name: clean, color }, {
      onSuccess: (label) => {
        resetEditor()
        setSearch('')
        setMode('pick')
        assign.mutate({ taskId, labelId: label.id, on: true })
      },
    })
  }

  const editor = editing !== null || creating
  return <Popover open={open} onOpenChange={(next) => {
    setOpen(next)
    if (!next) {
      resetEditor()
      setMode('pick')
      setSearch('')
    }
  }}>
    <PopoverTrigger render={<button type="button" className={PROPERTY_ROW}
      aria-label={`Labels: ${worn.length === 0 ? 'Add labels' : worn.map((label) => label.name).join(', ')}`}
      onClick={(event) => event.stopPropagation()} />}>
      <span className={PROPERTY_LABEL}>Labels</span>
      {worn.length === 0 ? <span className="text-muted-foreground">Add labels</span> :
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {byName(worn).map((label) => <LabelChip key={label.id} label={label} className={label.archived ? 'opacity-50' : ''} />)}
        </span>}
    </PopoverTrigger>
    <PopoverContent align="start" className="max-h-[var(--available-height)] w-72 overflow-y-auto p-1" aria-label="Task labels">
      {editor ? <div className="space-y-2 p-2">
        <div className="text-xs text-muted-foreground">{editing === null ? 'New label' : 'Edit label'}</div>
        <input autoFocus aria-label="Label name" maxLength={40} value={name} onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') save() }}
          className="h-8 w-full rounded-sm border border-input bg-background px-2 outline-none focus:border-ring" />
        <div role="group" aria-label="Label color" className="flex flex-wrap gap-1">
          {IDENTITY_COLORS.map(([word, hex]) => <button key={word} type="button" aria-label={`${word} label color`} aria-pressed={color === hex} onClick={() => setColor(hex)} className="flex size-7 items-center justify-center rounded-sm hover:bg-accent aria-pressed:bg-selected"><LabelDot color={hex} className="size-4" /></button>)}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-sm px-2 py-1 text-sm hover:bg-accent" onClick={resetEditor}>Back</button>
          <button type="button" disabled={!name.trim() || busy} className="rounded-sm bg-accent px-2 py-1 text-sm disabled:opacity-50" onClick={save}>Save label</button>
          {editing === null ? null : <button type="button" disabled={busy} className="ml-auto rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent" onClick={() => archive.mutate({ label: editing, archived: !editing.archived }, { onSuccess: resetEditor })}>{editing.archived ? 'Restore' : 'Archive'}</button>}
        </div>
      </div> : <>
        <input autoFocus aria-label="Search labels" placeholder="Search labels" value={search} onChange={(event) => setSearch(event.target.value)} className="m-1 h-8 w-[calc(100%-0.5rem)] rounded-sm border border-input bg-background px-2 outline-none focus:border-ring" />
        {labels.isError ? <p role="alert" className="px-2 py-1 text-xs">Could not load labels.</p> : null}
        {mode === 'pick' ? <>
          <div role="group" aria-label="Labels" className="py-1">
            {choices.map((label) => <button key={label.id} type="button" disabled={busy || !mayApply(label.scope)}
              aria-pressed={selected.has(label.id)}
              aria-label={`${selected.has(label.id) ? 'Remove' : 'Assign'} label ${label.name}`}
              onClick={() => assign.mutate({ taskId, labelId: label.id, on: !selected.has(label.id) })}
              className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-accent disabled:opacity-50">
              <LabelChip label={label} className="min-w-0 max-w-[13rem]" />
              <Check className={selected.has(label.id) ? 'ml-auto size-4 shrink-0 opacity-100' : 'ml-auto size-4 shrink-0 opacity-0'} aria-hidden="true" />
            </button>)}
            {choices.length === 0 && query !== '' ? <p className="px-2 py-2 text-xs text-muted-foreground">No matching labels</p> : null}
          </div>
          <div className="border-t border-border pt-1">
            {!exact ? <button type="button" className="min-h-8 w-full rounded-sm px-2 text-left text-sm text-muted-foreground hover:bg-accent" onClick={beginCreate}>
              {search.trim() ? `Create “${search.trim()}”` : 'Create label'}
            </button> : null}
            <button type="button" className="min-h-8 w-full rounded-sm px-2 text-left text-sm text-muted-foreground hover:bg-accent" onClick={() => setMode('manage')}>Manage labels</button>
          </div>
        </> : <>
          <div className="flex min-h-8 items-center border-b border-border px-2">
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setMode('pick')}>Back</button>
            <span className="ml-2 text-xs text-muted-foreground">Manage labels</span>
          </div>
          <div role="group" aria-label="Manage labels" className="py-1">
            {matching.map((label) => <div key={label.id} className="flex min-h-8 items-center gap-2 rounded-sm px-2 hover:bg-accent">
              <LabelChip label={label} className={label.archived ? 'min-w-0 max-w-[11rem] opacity-50' : 'min-w-0 max-w-[11rem]'} />
              {label.archived ? <span className="text-[11px] text-muted-foreground">Archived</span> : null}
              {mayManage(label.scope) ? <button type="button" className="ml-auto rounded-sm px-1.5 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => beginEdit(label)} aria-label={`Edit label ${label.name}`}>Edit</button> : null}
            </div>)}
          </div>
        </>}
      </>}
    </PopoverContent>
  </Popover>
}
