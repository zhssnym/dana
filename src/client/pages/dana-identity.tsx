/* The brand link the public pages share: the mark, the word and a way home. The mark follows the theme. */
import { DanaMark } from '../components/dana-mark.js'

export function DanaIdentity(): React.JSX.Element {
  return (
    <a
      href="/"
      className="inline-flex items-center gap-3 rounded-md text-sm font-semibold text-foreground outline-none"
      aria-label="Dana home"
    >
      <DanaMark className="size-7" />
      <span>Dana</span>
    </a>
  )
}
