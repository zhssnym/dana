import { createReactBlockSpec } from '@blocknote/react'

/**
 * One neutral authored callout. It carries rich inline content only: no
 * severity/type taxonomy and no operational meaning.
 */
export const createCanvasCallout = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {},
    content: 'inline',
  },
  {
    render: ({ contentRef }) => (
      <div className="dana-callout">
        <div ref={contentRef} className="min-w-0 flex-1" />
      </div>
    ),
    toExternalHTML: ({ contentRef }) => (
      <aside data-dana-callout="true">
        <div ref={contentRef} />
      </aside>
    ),
    parse: (element) =>
      element.matches('[data-dana-callout="true"]') ? {} : undefined,
  },
)
