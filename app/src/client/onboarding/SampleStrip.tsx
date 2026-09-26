/*
The line that says the workspace is a sample, drawn in Today's top bar (and
only there) while the sample is present and nobody on this device has said
"Keep it": "This is a sample · Keep it".

It sits in the bar rather than above the title so the title stands where it
stands on every screen. Removing the sample is not offered here: it lives in
Settings > Data alone, behind a confirmation (M4). Keep it is a local
dismissal.
*/
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
