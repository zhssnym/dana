import { WindowBarActions } from '../components/window-bar.js'
import { Button } from '../components/ui/button.js'
import { SAMPLE_COPY, useSampleActs } from './sample.js'

export function SampleStrip(): React.JSX.Element | null {
  const acts = useSampleActs()
  if (acts.present !== true || acts.kept) return null

  return (
    <WindowBarActions>
      <aside
        aria-label="Sample workspace"
        data-testid="sample-strip"
        className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
      >
        <span className="min-w-0 truncate pr-1">{SAMPLE_COPY.strip}</span>
        <span aria-hidden="true" className="text-quiet-foreground">·</span>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={acts.keep}>
          {SAMPLE_COPY.keep}
        </Button>
      </aside>
    </WindowBarActions>
  )
}
