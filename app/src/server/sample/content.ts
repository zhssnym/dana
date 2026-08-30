/*
The sample workspace's words (RFC 0005 change control item 60). One person's
life, the way it would look after a few weeks of ordinary use: three shelves,
a handful of folders under each, and enough tasks between them to reach
every view and every feature a new account is likely to wonder about.

Every string the sample writes is in this file and nowhere else, so the
tone can be read in one sitting and edited in one place. Plain, warm and
concrete; no jokes, no placeholder text, no reference to the product, and no
person named beyond a first name. Dates are days relative to the day the
account was made, in the person's own zone, so the workspace always reads as
this week rather than as the week it was written.

The comments are the person's own notes to themselves. 9.13 records why a
starter carries no comment: a fabricated colleague is a lie about the one
subject a collaboration tool cannot afford to lie about. A note a person
left in their own folder is not that, and a conversation with nothing in it
teaches nobody what the conversation is for.
*/

/** Days from today, or the next given weekday, or the next given day of
 * the month. Resolved by the writer against today in the person's zone. */
export type SampleDue =
  | number
  | { readonly weekday: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU' }
  | { readonly monthday: number }

export interface SampleStep {
  readonly title: string
  readonly done?: boolean
}

export interface SampleComment {
  readonly body: string
  /** Replies under this one, a thread of the person's own. */
  readonly replies?: readonly string[]
}

export interface SampleTask {
  readonly title: string
  readonly notes?: string
  readonly important?: boolean
  readonly due?: SampleDue
  /** HH:MM, needs a due date. */
  readonly time?: string
  /** 4.11's rule; the due date is its anchor. */
  readonly repeat?: string
  /** A reminder at this HH:MM on the due day, or this many minutes before
   * the due time. */
  readonly reminder?: { readonly at: string } | { readonly before: number }
  readonly steps?: readonly SampleStep[]
  /** The section block, by its text, this task sits under. */
  readonly section?: string
  /** Completed this many days ago. */
  readonly doneDaysAgo?: number
  readonly trashed?: boolean
  /** Pulled into Today. */
  readonly today?: boolean
  readonly thread?: readonly SampleComment[]
}

export interface SampleBlock {
  readonly kind: 'section' | 'paragraph'
  readonly text: string
}

export interface SampleFolder {
  readonly name: string
  /** The shelf it sits on, by name. */
  readonly shelf?: string
  readonly icon?: string
  readonly color?: string
  readonly description?: string
  readonly blocks?: readonly SampleBlock[]
  readonly tasks: readonly SampleTask[]
  readonly conversation?: readonly SampleComment[]
  readonly trashed?: boolean
}

export interface SampleShelf {
  readonly name: string
  readonly icon?: string
  readonly color?: string
  readonly description?: string
}

export interface SampleView {
  readonly name: string
  readonly definition: Record<string, unknown>
  readonly pinned: boolean
}

export interface SampleWorkspace {
  readonly shelves: readonly SampleShelf[]
  readonly folders: readonly SampleFolder[]
  /** Unfiled tasks, which land on Desk. */
  readonly desk: readonly SampleTask[]
  readonly views: readonly SampleView[]
}

export const SAMPLE_WORKSPACE: SampleWorkspace = {
  shelves: [
    {
      name: 'Life',
      icon: 'house',
      color: '#D97757',
      description: 'Home, family, and the things that keep the week running.',
    },
    {
      name: 'Work',
      icon: 'laptop',
      color: '#4A7BD0',
      description: 'The studio, the clients, and the launch.',
    },
    {
      name: 'Studies',
      icon: 'book-open',
      color: '#5B9E6A',
      description: 'The design course and the reading that goes with it.',
    },
  ],

  folders: [
    {
      name: 'Apartment move',
      shelf: 'Life',
      icon: 'key',
      color: '#D97757',
      description: 'Keys go back in two weeks.',
      blocks: [
        { kind: 'section', text: 'Before the van comes' },
        {
          kind: 'paragraph',
          text:
            'The lease ends in two weeks. Everything that is not furniture goes in boxes first, and the furniture goes on the day. Sara has offered her car for the small runs.',
        },
        { kind: 'section', text: 'After the move' },
      ],
      conversation: [
        { body: 'Sara can do the small runs on Saturday morning.' },
        { body: 'Boxes from the supermarket are free after 8pm. Ask at the back.' },
        {
          body: 'Van is booked for Thursday, so everything has to be packed by Wednesday night.',
        },
      ],
      tasks: [
        {
          title: 'Book the van',
          important: true,
          due: 4,
          time: '09:00',
          reminder: { at: '08:00' },
          section: 'Before the van comes',
          steps: [
            { title: 'Compare three quotes', done: true },
            { title: 'Check it fits under the car park height' },
            { title: 'Confirm the booking' },
          ],
          thread: [
            {
              body: 'The place on Hill Road quoted less than the one Sara used, but only for a weekday.',
              replies: ['Went with Hill Road. Thursday at nine, deposit paid.'],
            },
          ],
        },
        {
          title: 'Pack the kitchen',
          due: 3,
          section: 'Before the van comes',
          notes: 'Leave one mug and one plate out for the last morning.',
          steps: [
            { title: 'Plates and bowls' },
            { title: 'Glasses, wrapped twice' },
            { title: 'The good knives, in a tea towel' },
          ],
        },
        {
          title: 'Cancel the internet',
          due: 1,
          section: 'Before the van comes',
          today: true,
        },
        {
          title: 'Find boxes',
          section: 'Before the van comes',
          doneDaysAgo: 5,
        },
        {
          title: 'Change the address at the bank',
          due: -2,
          section: 'After the move',
        },
        {
          title: 'Return the keys',
          important: true,
          due: 14,
          time: '17:00',
          section: 'After the move',
        },
        {
          title: 'Take a photo of every room',
          section: 'After the move',
          notes: 'For the deposit, in case there is a disagreement later.',
        },
        { title: 'Ask the landlord about the garage', trashed: true },
      ],
    },

    {
      name: 'Home',
      shelf: 'Life',
      icon: 'house',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The small repeating things. Nothing here needs thinking about, it just needs doing.',
        },
      ],
      tasks: [
        { title: 'Water the plants', due: { weekday: 'SA' }, repeat: 'FREQ=WEEKLY;BYDAY=SA' },
        {
          title: 'Take the bins out',
          due: { weekday: 'TU' },
          repeat: 'FREQ=WEEKLY;BYDAY=TU',
          reminder: { at: '19:00' },
        },
        {
          title: 'Pay the rent',
          important: true,
          due: { monthday: 1 },
          repeat: 'FREQ=MONTHLY;BYMONTHDAY=1',
        },
        {
          title: 'Call Mum',
          due: { weekday: 'SU' },
          time: '18:30',
          repeat: 'FREQ=WEEKLY;BYDAY=SU',
        },
        {
          title: 'Book the dentist',
          due: 8,
          time: '12:30',
          notes: 'Ask about the chipped tooth on the left.',
        },
        { title: 'Fix the bathroom tap', doneDaysAgo: 2 },
      ],
    },

    {
      name: 'Website launch',
      shelf: 'Work',
      icon: 'rocket',
      color: '#4A7BD0',
      description: 'Live on the last Friday of next month.',
      blocks: [
        { kind: 'section', text: 'Copy' },
        {
          kind: 'paragraph',
          text:
            'The site goes live on the last Friday of next month. Nadia owns the design and Tom the build; the words are ours, and the words are what is holding things up.',
        },
        { kind: 'section', text: 'Launch day' },
      ],
      conversation: [
        { body: 'Nadia sent the new palette. Warmer than the last one, and the grey is gone.' },
        { body: 'Tom says the build is a week ahead, so the copy is the thing holding us.' },
        {
          body: 'Agreed: launch on the Friday, not the Monday. Nobody reads an announcement on a Monday.',
        },
      ],
      tasks: [
        {
          title: 'Write the home page copy',
          important: true,
          due: 5,
          section: 'Copy',
          steps: [
            { title: 'First draft', done: true },
            { title: 'Read it aloud once' },
            { title: 'Send it to Nadia' },
          ],
          thread: [
            {
              body: 'The draft is too long. Half of it says what the product is not.',
              replies: ['Second pass cut it to three paragraphs. Better.'],
            },
          ],
        },
        { title: 'Choose the three case studies', due: 7, section: 'Copy' },
        { title: 'Collect the photos from the studio', section: 'Copy', doneDaysAgo: 1 },
        {
          title: 'Check every link on the staging site',
          due: 26,
          section: 'Launch day',
          steps: [
            { title: 'Home and the four top-level pages' },
            { title: 'The case studies' },
            { title: 'The footer' },
          ],
        },
        {
          title: 'Point the domain at the new host',
          important: true,
          due: 27,
          time: '07:00',
          reminder: { before: 60 },
          section: 'Launch day',
          notes: 'Early, so there is a whole day to notice if something is wrong.',
        },
        { title: 'Tell the newsletter list', due: 28, time: '10:00', section: 'Launch day' },
        { title: 'Ask Tom about the contact form', due: 2, today: true },
        { title: 'Check in with Nadia', due: { weekday: 'WE' }, repeat: 'FREQ=WEEKLY;BYDAY=WE' },
      ],
    },

    {
      name: 'Weekly admin',
      shelf: 'Work',
      icon: 'coins',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Fridays, with a coffee. Invoices go out before the timesheet, because the timesheet is the boring one.',
        },
      ],
      tasks: [
        { title: 'Send the timesheet', due: { weekday: 'FR' }, repeat: 'FREQ=WEEKLY;BYDAY=FR' },
        { title: 'Invoice Sara for the illustrations', important: true, due: 2 },
        { title: 'Chase the unpaid invoice from March', due: -5 },
        { title: 'File the receipts', due: { monthday: 28 }, repeat: 'FREQ=MONTHLY;BYMONTHDAY=28' },
        {
          title: 'Renew the software licence',
          due: 21,
          notes: 'The renewal email had a discount code in it.',
        },
      ],
    },

    {
      name: 'Design course',
      shelf: 'Studies',
      icon: 'lightbulb',
      color: '#5B9E6A',
      blocks: [
        { kind: 'section', text: 'This week' },
        {
          kind: 'paragraph',
          text:
            'Eight weeks, one chapter and one exercise each. The exercises take longer than the reading, so do them first.',
        },
        { kind: 'section', text: 'Later' },
      ],
      tasks: [
        {
          title: 'Chapter 5 of Norman',
          due: 3,
          section: 'This week',
          today: true,
          steps: [
            { title: 'Read it' },
            { title: 'Notes in the margin' },
            { title: 'Answer the two questions at the end' },
          ],
        },
        {
          title: 'Sketch ten door handles',
          due: 4,
          section: 'This week',
          notes: 'Bad ones count. The point is the range.',
        },
        { title: 'Watch the lecture on affordances', due: -1, section: 'This week' },
        { title: 'Chapter 4 of Norman', section: 'This week', doneDaysAgo: 3 },
        { title: 'Write up the exercise from week three', due: 10, section: 'Later' },
        { title: 'Book a seat for the final crit', important: true, due: 30, section: 'Later' },
      ],
    },

    {
      name: 'Reading list',
      shelf: 'Studies',
      icon: 'book-open',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Books people have recommended, in no particular order. Cross them off rather than deleting them; the list is half the pleasure.',
        },
      ],
      tasks: [
        { title: 'Thinking in Systems' },
        { title: 'The Timeless Way of Building' },
        { title: 'A Pattern Language', notes: 'Sara lent me her copy. Give it back.' },
        { title: 'Ways of Seeing', doneDaysAgo: 6 },
      ],
    },

    {
      name: 'Summer trip',
      shelf: 'Life',
      icon: 'tent',
      trashed: true,
      tasks: [{ title: 'Book the ferry' }, { title: 'Find a place near the beach' }],
    },
  ],

  desk: [
    { title: 'Reply to Sara about the trip', due: 0, time: '18:00', today: true },
    {
      title: 'Renew the passport',
      important: true,
      notes: 'It runs out in four months, and some countries want six.',
    },
    { title: 'Return the library books', due: 6 },
    { title: 'Find a birthday present for Leo', due: 12 },
  ],

  views: [
    {
      name: 'Important, by folder',
      pinned: true,
      definition: {
        page: 'all',
        due: 'any',
        from: null,
        to: null,
        assignees: [],
        creators: [],
        important: true,
        repeating: false,
        showAbandoned: true,
        groupBy: 'folder',
        sort: 'due',
      },
    },
    {
      name: 'Overdue',
      pinned: false,
      definition: {
        page: 'scheduled',
        due: 'overdue',
        from: null,
        to: null,
        assignees: [],
        creators: [],
        important: false,
        repeating: false,
        showAbandoned: false,
        groupBy: 'none',
        sort: 'due',
      },
    },
  ],
}
