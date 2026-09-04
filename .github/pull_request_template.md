<!--
The title becomes the commit on main, because merges here are squashed. So write
it as a Conventional Commit: it is what the version bump and the changelog are
derived from.

  feat: assignee avatar in the task row
  fix: task list 500s on an empty folder
  refactor: one router preamble, not thirteen
  feat!: folders are now shelves          <- the ! means breaking

This pull request should not exist yet unless `npm run gate` printed GATE: green
on the head commit and the reviewer agent has run. Green, not "incomplete": a
record missing one of the seven steps has not answered for the seven. Never a
draft: docs/workflow/how-we-work.md section 8 says why.
-->

## What and why

<!-- A few sentences. -->

Closes #

## Hard stops touched

<!--
docs/workflow/hard-stops.md lists eight. If this change touched one, name it and
say which rule you met: the migration number and its journal `when`, the ruling
comment on the issue, the server code and the criterion that came with the
request field, the CSP source and where you saw it work, the accessOf gate and
its AC-397 row, the criterion and the decision that moved, the tokens.css or
presenters.ts line before and after.

Nothing else in this project catches an undeclared one. "None" is the usual
answer, and the best one.
-->

None.

## Criteria changed, and why

<!--
A criterion changes only when the decision it pins changes. Name each one, say
which decision moved, and link where it was decided. If a criterion looked wrong
and you left it failing, say that here instead.
-->

None.

## Gate record

<!--
Required. Paste the block `npm run gate` printed, unedited. It must end
GATE: green, the sha in it must be the head commit of this branch, and it must
not say the tree was dirty. "GATE: incomplete" is not a gate: it means a step of
the seven did not run, and the record names which.

If a step went red for a reason that is not this change, say which of CLAUDE.md's
four flake classes it was and what you did about it.
-->

```
```

## Reviewer verdict

<!--
One paragraph from the reviewer agent, run by you before this pull request
existed. "It found nothing" is a verdict and a good one.
-->

## Screenshots

<!-- Changes to what a person sees. Before and after. Delete this section otherwise. -->

## Left out

<!-- Anything deliberately not done, and why. Delete if nothing. -->
