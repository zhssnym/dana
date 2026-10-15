// An ordinary nested Page shows its Facets only when there is more than Main.
// Uses the Page shell's existing spacing and tab treatment, not a new editor.
import type { GetPageFacetsResponse } from '../../../shared/page-facets.js'
import { Plus } from '../../lib/icons.js'
import { cn } from '../../components/ui/utils.js'

type Facet = GetPageFacetsResponse['facets'][number]

export function PageFacetStrip({
  facets, activeId, onSelect, onAdd, editable,
}: {
  readonly facets: readonly Facet[]
  readonly activeId: string | null
  readonly onSelect: (facet: Facet) => void
  readonly onAdd: () => void
  readonly editable: boolean
}): React.JSX.Element | null {
  if (facets.length < 2) return null
  return (
    <div className="flex min-w-0 items-center gap-1 border-b border-border">
      <div role="tablist" aria-label="Page Facets"
        className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
        {facets.map((facet) => (
          <button key={facet.id} type="button" role="tab"
            aria-selected={activeId === facet.id}
            onClick={() => onSelect(facet)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-sm transition-colors',
              activeId === facet.id
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {facet.name}
          </button>
        ))}
      </div>
      {editable ? (
        <button type="button" onClick={onAdd} aria-label="Add Facet"
          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
