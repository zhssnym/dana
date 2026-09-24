/*
The line that says the workspace is a sample, drawn in Today's top bar (and
only there) while the sample is present and nobody on this device has said
"Keep it": "Sample workspace · Remove · Keep it".

It sits in the bar rather than above the title so the title stands where it
stands on every screen. Remove is the same act as Settings > Data: one press,
then the undo bar. Keep it is a local dismissal; the Settings row is the way
back.
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
        <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={acts.busy} onClick={acts.remove}>
          {SAMPLE_COPY.stripRemove}
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={acts.keep}>
          {SAMPLE_COPY.keep}
        </Button>
      </aside>
    </WindowBarActions>
  )
}
