/*
The strip that says the workspace is a sample, drawn above Today (and only
there) while the sample is present and nobody on this device has said "Keep
it". One muted line: "Sample workspace · Remove · Keep it".

Remove is the same act as Settings > Data (one confirm, then the undo bar),
offered here too because this is the moment a person wants it. Keep it is a
local dismissal; the Settings row is the way back.
*/
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { Button } from '../components/ui/button.js'
import { SAMPLE_COPY, useSampleActs } from './sample.js'

export function SampleStrip(): React.JSX.Element | null {
  const acts = useSampleActs()
  if (acts.present !== true || acts.kept) return null

  return (
    <aside
      aria-label="Sample workspace"
      data-testid="sample-strip"
      className="flex min-h-[var(--row-height)] items-center gap-[var(--space-inline)] text-sm text-muted-foreground"
    >
      <span className="min-w-0 truncate">{SAMPLE_COPY.strip}</span>
      <span className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={acts.busy} onClick={acts.askRemove}>
          {SAMPLE_COPY.stripRemove}
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={acts.keep}>
          {SAMPLE_COPY.keep}
        </Button>
      </span>
      {acts.confirming ? (
        <ConfirmDialog
          message={SAMPLE_COPY.confirm}
          confirmLabel={SAMPLE_COPY.stripRemove}
          onContinue={acts.remove}
          onCancel={acts.cancelRemove}
        />
      ) : null}
    </aside>
  )
}
