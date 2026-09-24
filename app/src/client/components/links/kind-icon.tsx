import { CheckCircle2, Folder, Layers3, Link2 } from '../../lib/icons.js'

/** A reference kind's glyph; an unknown kind draws as a plain link. */
export function DanaLinkKindIcon({ kind }: { readonly kind: string }): React.JSX.Element {
  const Icon = kind === 'task' ? CheckCircle2 : kind === 'folder' ? Folder : kind === 'shelf' ? Layers3 : Link2
  return <Icon size={12} aria-hidden="true" className="shrink-0" />
}
