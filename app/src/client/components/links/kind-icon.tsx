import { CheckCircle2, FileText, Flag, Folder, Layers3, Link2, MessageCircle } from '../../lib/icons.js'

/** An unknown kind draws as a plain link. */
export function DanaLinkKindIcon({ kind }: { readonly kind: string }): React.JSX.Element {
  const Icon = kind === 'task' ? CheckCircle2
    : kind === 'folder' ? Folder
    : kind === 'shelf' ? Layers3
    : kind === 'facet' ? FileText
    : kind === 'discussion' ? MessageCircle
    : kind === 'outcome' || kind === 'result' ? Flag
    : Link2
  return <Icon size={12} aria-hidden="true" className="shrink-0 self-center" />
}
