<!--
The title becomes the commit on main, because merges here are squashed. So write
it as a Conventional Commit: it is what the version bump and the changelog are
derived from.

  feat: assignee avatar in the task row
  fix: task list 500s on an empty folder
  refactor: one router preamble, not thirteen
  feat!: folders are now shelves          <- the ! means breaking
-->

## What and why

<!-- A few sentences. -->

Closes #

## Files touched outside my own area

<!--
The most important box, because nothing else in this workflow catches it. If
this pull request changes anything outside the folder you own, name each file
and say why in one line. The reviewer should never have to discover a backend
change by reading the whole diff.

"None" is a perfectly good answer, and the usual one.
-->

None.

## Tests

<!--
Name the commands. "Tested" is a word an agent writes after watching the code
compile; a named command is a claim that can be checked. Say what you could not
run and why, because an unstated gap is worse than a known one.
-->

```
Ran:
Did not run:
```

## Screenshots

<!-- Frontend changes only. Before and after. Delete this section otherwise. -->

## Left out

<!-- Anything deliberately not done, and why. Delete if nothing. -->
