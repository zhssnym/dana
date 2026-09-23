# What belongs in this folder

**One rule, and it is a test you can run in your head.**

> If an agent could answer this by reading the code or running something, in
> under a minute, it does not belong here.
>
> If an agent could not answer it at all, or would burn an afternoon
> rediscovering it, it belongs here and nowhere else.

## Why the rule is the rule

**A document that describes behaviour is a second copy of the code, and it is
the copy nobody runs.** When they disagree the code wins, always, but the reader
does not know that until they have lost the time. The drift is not a maintenance
failure to be fixed by more diligence; it is what prose about behaviour does, and
the only reliable defence is not to write it.

## What to keep

Every kind has one thing in common: **the code cannot tell you.**

- **Contracts.** What Dana must do, in `spec/`. Its README says what goes in it
  and what does not.
- **Hazards.** Where a tool, library or machine does something other than what a
  model assumes: `troubleshooting.md`, and spec 11.15 for library recall. The
  code shows the workaround, never the assumption it defends against.
- **Registries with no other home.** Numbers that must not collide and that
  nothing else allocates, such as the acceptance criterion allocator in
  `spec/12-acceptance-criteria/README.md`.
- **Direction.** What Dana is building and why, in `milestones/`.
- **Reasons.** Why a rule is the way it is, in one or two sentences beside the
  rule, when it would otherwise look arbitrary.

## What to delete

- **Descriptions of behaviour.** What an endpoint returns, what a screen shows,
  what a function does. Grep it. Run it. Read it.
- **Restatements.** If a shape is in `app/src/shared/`, the zod schema is the
  contract. If a constraint is in a migration, the migration is the truth.
- **Narrative.** How something came to be. Git and the pull request hold it.
- **Anything nobody honours.** A process no branch has followed in a month is
  not a process.

## Writing something new here

Three questions, in order. A no to any of them means do not write it.

1. **Could I find this out by running or grepping something?** If yes, do not
   write it.
2. **Is it true right now, and would I notice if it stopped being true?** If
   nothing would tell you, it will rot. Make something assert it, or leave it out.
3. **Would deleting it cost somebody real time?** If not, do not write it.

**No scratch files.** Notes, audits, plans and open questions go in the pull
request description or a GitHub issue, never in a new file here.

## What is here

| | |
| - | - |
| `spec/` | The contract, by numbered section. Section 12 holds the acceptance criteria and their number allocator |
| `troubleshooting.md` | Silent failures, flaky test classes, and machine-specific notes |
| `milestones/` | What Dana is building and why, one brief file per milestone. A wishlist, never a progress tracker or a second copy of the spec |

`app/tests/guards/guard-agent-instructions.test.ts` checks that every backticked
repository path in `troubleshooting.md` (and in the root `AGENTS.md`) exists.
Nothing else here is read by a test.
