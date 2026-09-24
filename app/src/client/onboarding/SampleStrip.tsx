/*
The strip that says the workspace is a sample, drawn above Today (and only
there) while the sample is present and nobody on this device has said "Keep
it". One muted line: the sentence, where to remove it, and "Keep it".

Removing has one home, Settings > Data (the redesign's one-home rule), so the
strip points there rather than carrying a second Remove with its own confirm.
Keep it is a local dismissal, and the Settings row is the way back.
*/
import { Link } from 'react-router'

import { paths } from '../routes.js'
import { SAMPLE_COPY, useSampleActs } from './sample.js'

const LINK =
  'underline underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground'

export function SampleStrip(): React.JSX.Element | null {
  const acts = useSampleActs()
  if (acts.present !== true || acts.kept) return null

  return (
    <aside
      aria-label="Sample workspace"
      data-testid="sample-strip"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground"
    >
      <p className="min-w-0">
        {SAMPLE_COPY.strip} You can remove it in{' '}
        <Link to={paths.settings} className={LINK}>
          Settings
        </Link>
        .
      </p>
      <button
        type="button"
        className="underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
        onClick={acts.keep}
      >
        {SAMPLE_COPY.keep}
      </button>
    </aside>
  )
}
