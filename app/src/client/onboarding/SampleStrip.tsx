/*
The strip that says the workspace is a sample, drawn above Desk and Today while the sample is present and nobody on
this device has said "Keep it". One muted line, a sentence and two text
buttons: clearly there, never in the way. Remove is one confirm and then the undo bar; Keep it is a
local dismissal, and the Settings row is the way back.
*/
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'

import { SAMPLE_COPY, useSampleActs } from './sample.js'

const LINK =
  'underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline disabled:opacity-50'

export function SampleStrip(): React.JSX.Element | null {
  const acts = useSampleActs()
  if (acts.present !== true || acts.kept) return null

  /* One quiet line: the sentence and two text buttons, no box. */
  return (
    <>
      <aside
        aria-label="Sample workspace"
        data-testid="sample-strip"
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground"
      >
        <p className="min-w-0">{SAMPLE_COPY.strip}</p>
        <button type="button" className={LINK} disabled={acts.busy} onClick={acts.askRemove}>
          {SAMPLE_COPY.remove}
        </button>
        <button type="button" className={LINK} onClick={acts.keep}>
          {SAMPLE_COPY.keep}
        </button>
      </aside>
      {acts.confirming ? (
        <ConfirmDialog
          message={SAMPLE_COPY.confirm}
          onContinue={acts.remove}
          onCancel={acts.cancelRemove}
        />
      ) : null}
    </>
  )
}
