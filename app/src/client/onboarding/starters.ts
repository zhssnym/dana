/*
The starter workflows of 9.13 (ADD-1), as data.

**These are ordinary workflow files.** Each one is exactly what a person would
get by exporting a folder of their own, and each is imported through
POST /workflows/import like any other, so nothing here is a seed and nothing
is special-cased in the server. `starters.test.ts` parses all three with
7.16's own schema, which is what stops a malformed starter reaching a person's
first press.

**What a starter may hold is what that schema admits**: a folder name, task
titles, and page blocks. So no starter carries a comment or a reminder, and
9.13 records why that is right rather than merely structural. A fabricated
comment would attribute words to a person who never said them. A reminder
would mail somebody about a plan they did not make, most likely long after
they forgot the example was there.

**Every starter opens with the same paragraph**, which 9.13 fixes as normative:
the offer's own copy is gone the moment it is answered, so the page is where a
person is told they can delete this. It is `DELETABLE` below, written once.

**The teaching is in the tasks, not in a tour.** Each folder carries a few
tasks that ask the person to do a thing and then look at the place it went, so
Today, Scheduled, Assignments and Important are learned by arriving at them
with something already in them. A starter that explained the sidebar instead
would teach a person to click rather than why to come back, which is the
distinction 9.13 draws.

The three were chosen to demonstrate different halves of the product: a trip
is one person and a folder page, a team is sharing and assignment, and
learning is the workflow export the landing advertises.
*/
import type { ImportWorkflowBody } from '../../shared/workflows.js'

/** 9.13's normative first paragraph, on every starter folder's page. */
const DELETABLE =
  'This is an example, and it is yours now. Change anything you like, or ' +
  'delete the whole folder from its menu when you are done with it.'

export interface Starter {
  /** Stable across renames of the folder inside; used as a React key. */
  readonly id: 'trip' | 'team' | 'learning'
  /** The card's label. Not the folder name, which the file below carries. */
  readonly label: string
  /** One line on the card, saying what the example is for. */
  readonly summary: string
  readonly file: ImportWorkflowBody
}

export const STARTERS: readonly [Starter, Starter, Starter] = [
  {
    id: 'trip',
    label: 'Plan a trip',
    summary: 'One folder holding the brief, the bookings, and everything still to decide.',
    file: {
      dana: 'workflow',
      version: 1,
      name: 'Plan a trip',
      folders: [
        {
          name: 'Plan a trip',
          blocks: [
            { kind: 'paragraph', text: DELETABLE },
            { kind: 'section', text: 'Before you book' },
            {
              kind: 'paragraph',
              text:
                'Dates, budget, and who is coming. Settle these first, because every ' +
                'booking below depends on them and changing one afterwards costs money.',
            },
            { kind: 'section', text: 'How the views work' },
            {
              kind: 'paragraph',
              text:
                'Give any task below a due date and it appears on Scheduled. Give it ' +
                "today's date and it appears on Today as well. Nothing is filed twice: " +
                'the pages are questions asked of the same tasks, not folders to sort into.',
            },
          ],
          tasks: [
            { title: 'Pick the dates, and check they work for everyone coming' },
            { title: 'Set a budget, and a number you will not go past' },
            { title: 'Check passport expiry and whether you need a visa' },
            { title: 'Book the flights' },
            { title: 'Book somewhere to stay for the first two nights' },
            { title: 'Give this task a due date, then open Scheduled to find it' },
            { title: 'Make a rough day by day list, and leave one day empty' },
            { title: 'Book the first evening meal, so arriving needs no decisions' },
            { title: 'Download offline maps and tickets' },
            { title: 'Tell someone at home where you will be' },
          ],
        },
      ],
    },
  },
  {
    id: 'team',
    label: 'Run a small team',
    summary: 'A shared folder, work that belongs to somebody, and a weekly rhythm.',
    file: {
      dana: 'workflow',
      version: 1,
      name: 'Run a small team',
      folders: [
        {
          name: 'Run a small team',
          blocks: [
            { kind: 'paragraph', text: DELETABLE },
            { kind: 'section', text: 'Share this folder to see what it is for' },
            {
              kind: 'paragraph',
              text:
                'Open the folder menu and invite someone by email. Sharing a folder ' +
                'shares every task in it, which is the only unit Dana shares: once they ' +
                'accept, tasks here can be assigned to them and the folder gets a ' +
                'conversation the two of you share.',
            },
            { kind: 'section', text: 'The weekly rhythm' },
            {
              kind: 'paragraph',
              text:
                'A small team does not need a process. It needs the same three questions ' +
                'every week: what moved, what is stuck, and what is next. The tasks below ' +
                'set that up once so nobody has to remember it.',
            },
          ],
          tasks: [
            { title: 'Invite one person to this folder' },
            { title: 'Write down what this team is for, in one sentence' },
            { title: 'List the three things that actually matter this quarter' },
            { title: 'Assign a task to someone else, then open Assignments to see it' },
            { title: 'Star the one task that is genuinely urgent, then open Important' },
            { title: 'Book a weekly check in, and keep it short' },
            { title: 'Agree how a decision gets made when the two of you disagree' },
            { title: 'Write down who covers what when somebody is away' },
          ],
        },
      ],
    },
  },
  {
    id: 'learning',
    label: 'Learn something new',
    summary: 'A shape you can export and reuse for the next thing you take up.',
    file: {
      dana: 'workflow',
      version: 1,
      name: 'Learn something new',
      folders: [
        {
          name: 'Learn something new',
          blocks: [
            { kind: 'paragraph', text: DELETABLE },
            { kind: 'section', text: 'Make the shape once, then reuse it' },
            {
              kind: 'paragraph',
              text:
                'This folder is a shape: a goal, a source, practice, and review. When it ' +
                'has worked for you once, export it from the folder menu as a workflow ' +
                'file and import it again for the next thing you learn. The shape comes ' +
                'across; the old dates, people and finished work stay behind.',
            },
            { kind: 'section', text: 'Write a goal you can finish' },
            {
              kind: 'paragraph',
              text:
                'Get better at Spanish cannot be finished, so it will sit here forever. ' +
                'Hold a ten minute conversation in Spanish can be finished, which means ' +
                'one day you get to tick it.',
            },
          ],
          tasks: [
            { title: 'Write the goal so that it can actually be finished' },
            { title: 'Find one course, book, or teacher, and then stop looking' },
            { title: 'Block two hours a week and give those tasks due dates' },
            { title: 'Do the first hour today, badly, before you feel ready' },
            { title: 'Practise out loud or on paper, not only in your head' },
            { title: 'Review after a week and cut whatever did not help' },
            { title: 'Export this folder as a workflow, ready for the next thing' },
          ],
        },
      ],
    },
  },
]
