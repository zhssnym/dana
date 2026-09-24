import { useId, useMemo, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

import { layoutDiagram } from './diagram.js'

/** 4.17's ceiling on a writing block's text, which is where the source lives. */
const MAX_SOURCE = 4000
const EXAMPLE = 'Idea -> Draft\nDraft -> Review: send\nReview -> Ship'

/**
 * The drawing. Every label is a React text child, never markup, so a label such
 * as `<img onerror=…>` is drawn as those characters; there is no innerHTML and
 * nothing to sanitize (#222).
 */
export function DiagramPicture({ source }: { readonly source: string }): React.JSX.Element {
  const result = useMemo(() => layoutDiagram(source), [source])
  const marker = `dana-diagram-arrow-${useId().replace(/:/g, '')}`
  if (!result.ok) return <p className="py-2 text-sm text-muted-foreground">{result.message}</p>
  const { layout } = result
  return (
    <div className="overflow-x-auto py-2">
      <svg
        role="img"
        aria-label={`Diagram: ${layout.nodes.map((n) => n.label).join(', ')}`}
        width={layout.width}
        height={layout.height}
        viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`}
        className="max-w-none text-foreground"
        data-dana-diagram=""
      >
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>
        {layout.edges.map((edge, index) => (
          <g key={`e${index}`}>
            <path d={edge.path} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} markerEnd={`url(#${marker})`} />
            {edge.label ? (
              <text x={edge.labelAt[0]} y={edge.labelAt[1]} dominantBaseline="central" textAnchor={edge.labelAnchor} className="fill-muted-foreground text-xs" style={{ paintOrder: 'stroke', stroke: 'var(--background)', strokeWidth: 4 }}>{edge.label}</text>
            ) : null}
          </g>
        ))}
        {layout.nodes.map((node) => (
          <g key={node.id}>
            <rect x={node.x} y={node.y} width={node.w} height={node.h} className="fill-card stroke-border" style={{ rx: 'var(--radius-lg)' }} strokeWidth={1} />
            <text x={node.x + node.w / 2} y={node.y + node.h / 2} dominantBaseline="central" textAnchor="middle" className="fill-foreground text-sm">{node.label}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function DiagramBlock({ source, editable, onSource }: {
  readonly source: string
  readonly editable: boolean
  readonly onSource: (source: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(source === '')
  const inputId = useId()
  return (
    <div className="w-full min-w-0 rounded-md border border-border px-3 py-2" contentEditable={false} data-canvas-diagram="">
      <DiagramPicture source={source} />
      {editable ? (
        editing ? (
          <div className="flex flex-col gap-1 pb-1">
            <label htmlFor={inputId} className="text-xs text-muted-foreground">
              Diagram text: one arrow per line, like “Idea -&gt; Draft” or “Draft -&gt; Review: send”
            </label>
            <textarea
              id={inputId}
              value={source}
              maxLength={MAX_SOURCE}
              rows={Math.min(12, Math.max(3, source.split('\n').length + 1))}
              placeholder={EXAMPLE}
              spellCheck={false}
              autoFocus={source === ''}
              className="w-full resize-y rounded-md border border-input bg-background px-2 py-1 font-mono text-sm text-foreground"
              onChange={(event) => onSource(event.target.value)}
              // The editor must not read typing inside the source as document gestures.
              onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') setEditing(false) }}
              onPaste={(event) => event.stopPropagation()}
            />
            <button type="button" className="self-end rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => setEditing(false)}>Done</button>
          </div>
        ) : (
          <button type="button" className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => setEditing(true)}>Edit diagram</button>
        )
      ) : null}
    </div>
  )
}

export const createCanvasDiagramSpec = createReactBlockSpec(
  { type: 'diagram', propSchema: { source: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <DiagramBlock
        source={block.props.source}
        editable={editor.isEditable}
        onSource={(source) => editor.updateBlock(block, { props: { source } })}
      />
    ),
    /* Copy, export to HTML and paste out of Dana carry the source, which is the
       diagram; a reader elsewhere gets text they can paste back. */
    toExternalHTML: ({ block }) => <pre data-dana-diagram="">{block.props.source}</pre>,
  },
)
