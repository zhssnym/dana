/*
A Dana Link as the canvas draws it: an inline chip whose label is the
target's *live* name, resolved through `GET /references/:kind/:id` on every
read (#223). The label stored in the document is only the durable text a
save writes (so export and plain-text readers still have words); the chip
never draws it, because a target the viewer cannot open must look exactly like
one that does not exist — "Unavailable", with no name, no kind hint beyond the
link's own shape, and no way in.

Persisted as an ordinary rich-content run `{ text, href: "/app/<kind>s/<id>" }`
by `canvas/adapters.ts`, so nothing on the server changed shape.
*/
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
