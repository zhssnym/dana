/*
The starter workflows of 9.13 (ADD-1), as data.

**These are ordinary workflow files.** Each one is exactly what a person would
get by exporting a folder of their own, and each is imported through
POST /workflows/import like any other, so nothing here is a seed and nothing
is special-cased in the server. They are format 4 files, one ordered page, so
each task sits under the Section it belongs to; the format 1 split into
`blocks` and `tasks` could not say that, and imported every task above the
first paragraph. Nothing but `tsc` checks them, so run one after an edit.

**What a starter may hold is what 7.16's schema admits**: a folder name, task
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
  'delete the whole page from its menu when you are done with it.'

export interface Starter {
  /** Stable across renames of the folder inside; used as a React key. */
  readonly id: 'trip' | 'team' | 'learning'
  /** The card's label. Not the folder name, which the file below carries. */
  readonly label: string
  /** One line on the card, saying what the example is for. */
  readonly summary: string
  readonly file: ImportWorkflowBody
}

/* A heading and a task, in the page's own words. */
const section = (text: string) => ({ kind: 'section' as const, text, level: 1 })
const paragraph = (text: string) => ({ kind: 'paragraph' as const, text })
const task = (title: string) => ({ kind: 'task' as const, title })

export const STARTERS: readonly [Starter, Starter, Starter] = [
  {
    id: 'trip',
    label: 'Plan a trip',
    summary: 'One page holding the brief, the bookings, and everything still to decide.',
    file: {
      dana: 'workflow',
      version: 4,
      name: 'Plan a trip',
      folders: [
        {
          name: 'Plan a trip',
          page: {
            blocks: [
              paragraph(DELETABLE),
              section('Before you book'),
              paragraph(
                'Dates, budget, and who is coming. Settle these first, because every ' +
                  'booking below depends on them and changing one afterwards costs money.',
              ),
              task('Pick the dates, and check they work for everyone coming'),
              task('Set a budget, and a number you will not go past'),
              task('Check passport expiry and whether you need a visa'),
              section('Bookings'),
              task('Book the flights'),
              task('Book somewhere to stay for the first two nights'),
              task('Book the first evening meal, so arriving needs no decisions'),
              section('Before you leave'),
              task('Make a rough day by day list, and leave one day empty'),
              task('Download offline maps and tickets'),
              task('Tell someone at home where you will be'),
              section('How the views work'),
              paragraph(
                'Give any task a due date and it appears on Upcoming. Give it ' +
                  "today's date and it appears on Today as well. Nothing is filed twice: " +
                  'the pages are questions asked of the same tasks, not pages to sort into.',
              ),
              task('Give this task a due date, then open Upcoming to find it'),
            ],
          },
        },
      ],
    },
  },
  {
    id: 'team',
    label: 'Run a small team',
    summary: 'A shared page, work that belongs to somebody, and a weekly rhythm.',
    file: {
      dana: 'workflow',
      version: 4,
      name: 'Run a small team',
      folders: [
        {
          name: 'Run a small team',
          page: {
            blocks: [
              paragraph(DELETABLE),
              section('Share this page to see what it is for'),
              paragraph(
                'Press Share and invite someone by email. Sharing a page ' +
                  'shares every task in it, which is the only unit Dana shares: once they ' +
                  'accept, tasks here can be assigned to them and the page gets a ' +
                  'conversation the two of you share.',
              ),
              task('Invite one person to this page'),
              task('Assign a task to someone else, then open Assigned to see it'),
              section('What the team is for'),
              task('Write down what this team is for, in one sentence'),
              task('List the three things that actually matter this quarter'),
              task('Mark the one task that is genuinely urgent as important, then add Important with the + beside Focus'),
              section('The weekly rhythm'),
              paragraph(
                'A small team does not need a process. It needs the same three questions ' +
                  'every week: what moved, what is stuck, and what is next. The tasks below ' +
                  'set that up once so nobody has to remember it.',
              ),
              task('Book a weekly check-in, and keep it short'),
              task('Agree how a decision gets made when the two of you disagree'),
              task('Write down who covers what when somebody is away'),
            ],
          },
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
      version: 4,
      name: 'Learn something new',
      folders: [
        {
          name: 'Learn something new',
          page: {
            blocks: [
              paragraph(DELETABLE),
              section('Write a goal you can finish'),
              paragraph(
                'Get better at Spanish cannot be finished, so it will sit here forever. ' +
                  'Hold a ten minute conversation in Spanish can be finished, which means ' +
                  'one day you get to tick it.',
              ),
              task('Write the goal so that it can actually be finished'),
              task('Find one course, book, or teacher, and then stop looking'),
              section('Practice'),
              task('Block two hours a week and give those tasks due dates'),
              task('Do the first hour today, badly, before you feel ready'),
              task('Practise out loud or on paper, not only in your head'),
              task('Review after a week and cut whatever did not help'),
              section('Make the shape once, then reuse it'),
              paragraph(
                'This page is a shape: a goal, a source, practice, and review. When it ' +
                  'has worked for you once, choose Export work in the work menu, ' +
                  'and import that file for the next thing you learn. The shape comes ' +
                  'across; the old dates, people and finished work stay behind.',
              ),
              task('Export this page, ready for the next thing'),
            ],
          },
        },
      ],
    },
  },
]
