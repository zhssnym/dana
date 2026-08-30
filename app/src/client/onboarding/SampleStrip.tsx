/*
The strip that says the workspace is a sample (RFC 0005 change control item
60), drawn above Desk and Today while the sample is present and nobody on
this device has said "Keep it". Two controls and a sentence: clearly there,
never in the way. Remove is one confirm and then the undo bar; Keep it is a
local dismissal, and the Settings row is the way back.
*/
import { X } from '../lib/icons.js'

import { Button } from '../components/ui/button.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'

import { SAMPLE_COPY, useSampleActs } from './sample.js'

export function SampleStrip(): React.JSX.Element | null {
  const acts = useSampleActs()
  if (acts.present !== true || acts.kept) return null

  return (
    <>
      <aside
        aria-label="Sample workspace"
        data-testid="sample-strip"
        className="mx-auto mt-4 flex w-full max-w-[var(--shell-content-max)] items-center gap-3 rounded-[14px] border border-border bg-muted/50 px-4 py-2.5 text-sm"
      >
        <p className="min-w-0 flex-1 text-foreground">{SAMPLE_COPY.strip}</p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={acts.busy}
          onClick={acts.askRemove}
        >
          {SAMPLE_COPY.remove}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={acts.keep}
          aria-label={SAMPLE_COPY.keep}
        >
          {SAMPLE_COPY.keep}
          <X className="ml-1 size-3.5" aria-hidden="true" />
        </Button>
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
