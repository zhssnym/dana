/*
A path under /app that 9.1's route table does not name.

It renders inside the chrome rather than replacing it, which is the same rule
the 404 of an inaccessible folder follows: the shell survives, so the person
can navigate away from a page they cannot see. The treatment is the shared
empty-state vocabulary, so a wrong URL and an empty list read as the same kind
of quiet answer; the sentence stays one text run.
*/

import { Compass } from 'lucide-react'

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '../components/ui/empty.js'

export function NotFoundPage(): React.JSX.Element {
  return (
    <Empty className="min-h-72">
      <EmptyMedia className="text-[var(--color-graphite-400)]">
        <Compass className="size-9" strokeWidth={1.6} aria-hidden="true" />
      </EmptyMedia>
      <EmptyHeader>
        <h1 className="text-base leading-6 font-semibold text-foreground">Not found</h1>
        <EmptyDescription className="max-w-[54ch] text-sm leading-5 text-muted-foreground">
          That page does not exist. Everything Dana has is in the sidebar.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
