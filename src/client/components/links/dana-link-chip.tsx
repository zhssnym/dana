// A Dana Link chip showing the target's live name. A target the viewer cannot open
// looks exactly like a missing one: "Unavailable".
import { createReactInlineContentSpec } from '@blocknote/react'

import { DanaLinkChip } from './dana-link-display.js'

export const danaLinkInlineSpec = createReactInlineContentSpec(
  {
    type: 'danaLink',
    propSchema: { href: { default: '' }, label: { default: '' } },
    content: 'none',
  } as const,
  {
    render: ({ inlineContent }) => <DanaLinkChip href={inlineContent.props.href} stored={inlineContent.props.label} />,
    toExternalHTML: ({ inlineContent }) => <a href={inlineContent.props.href}>{inlineContent.props.label}</a>,
  },
)
