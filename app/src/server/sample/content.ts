/*
The sample workspace's words (7.20). One person's month in Dana: a product
designer who is also moving flat and learning Spanish. Four pages with
sub-pages under them, tasks spread over the last four weeks and the next two,
and conversations with the three people she works and lives alongside.

Every string the sample writes is in this file and nowhere else, so the tone
can be read in one sitting and edited in one place. Plain, warm and concrete;
no jokes, no placeholder text, no reference to the product. Dates are days
relative to the day the account was made, in the person's own zone, so the
workspace always reads as this month rather than as the month it was written.

The other people are sample people (SAMPLE_PEOPLE): users rows with no sign-in
identity at all (no google_sub, no email), so nobody can ever sign in as them.
They are shared by every sample and never removed; what the sample removes is
their memberships, posts and assignments, with the sample's pages.
*/

/** Days from today, or the next given weekday, or the next given day of
 * the month. Resolved by the writer against today in the person's zone. */
export type SampleDue =
  | number
  | { readonly weekday: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU' }
  | { readonly monthday: number }

/** Another person in the sample, by key, or `me` for the account holder. */
export type SamplePersonKey = 'sara' | 'nadia' | 'lucia'
export type SampleAuthor = SamplePersonKey | 'me'

export interface SamplePerson {
  readonly key: SamplePersonKey
  /** Fixed, so every account's sample shares the same three rows. */
  readonly id: string
  readonly name: string
}

export const SAMPLE_PEOPLE: readonly SamplePerson[] = [
  { key: 'nadia', id: '5a3b1e00-0000-4000-8000-00000000d001', name: 'Nadia Rahman' },
  { key: 'sara', id: '5a3b1e00-0000-4000-8000-00000000d002', name: 'Sara Lindqvist' },
  { key: 'lucia', id: '5a3b1e00-0000-4000-8000-00000000d003', name: 'Lucía Ortega' },
]

/** One run of inline text: plain, or bold/italic, a web link, a Dana link
 * to a sample page or task (by name), or an @mention. */
export type SampleRun =
  | string
  | {
      readonly text: string
      readonly bold?: boolean
      readonly italic?: boolean
      readonly href?: string
      readonly page?: string
      readonly task?: string
    }
  | { readonly mention: SampleAuthor }

export type SampleText = string | readonly SampleRun[]

export interface SampleBlock {
  readonly kind:
    | 'section'
    | 'heading2'
    | 'heading3'
    | 'paragraph'
    | 'bullet'
    | 'numbered'
    | 'checklist'
    | 'toggle'
    | 'quote'
    | 'callout'
    | 'code'
    | 'divider'
  readonly text?: SampleText
  /** A heading2/heading3 that folds. */
  readonly toggleable?: boolean
  readonly checked?: boolean
  readonly children?: readonly SampleBlock[]
}

/** One item of a page's Work document: a block, a task (by title, from the
 * page's own tasks) or a sub-page's block (by name). A task or sub-page the
 * document does not name is placed after everything it does. */
export type SampleItem = SampleBlock | { readonly task: string } | { readonly page: string }

export interface SampleStep {
  readonly title: string
  readonly done?: boolean
}

export interface SamplePost {
  readonly by: SampleAuthor
  /** When, as days (and hours) before now. */
  readonly daysAgo: number
  readonly hoursAgo?: number
  readonly text: SampleText
  readonly likes?: readonly SampleAuthor[]
  readonly replies?: readonly SamplePost[]
}

export interface SampleThread {
  readonly title: string
  readonly by: SampleAuthor
  readonly posts: readonly SamplePost[]
  /** Closed with a decision. */
  readonly resolved?: { readonly by: SampleAuthor; readonly daysAgo: number; readonly decision: string }
}

export interface SampleTask {
  readonly title: string
  readonly notes?: string
  readonly important?: boolean
  readonly due?: SampleDue
  /** HH:MM, needs a due date. */
  readonly time?: string
  /** Started this many days from today (negative: already in progress). */
  readonly start?: number
  /** 4.11's rule; the due date is its anchor. */
  readonly repeat?: string
  /** Earlier occurrences of a repeating task, completed this many days ago. */
  readonly history?: readonly number[]
  /** A reminder at this HH:MM on the due day, or this many minutes before
   * the due time. */
  readonly reminder?: { readonly at: string } | { readonly before: number }
  readonly steps?: readonly SampleStep[]
  readonly assignee?: SamplePersonKey
  /** Completed this many days ago. */
  readonly doneDaysAgo?: number
  readonly abandoned?: boolean
  /** Pulled into Today. */
  readonly today?: boolean
  readonly thread?: readonly SamplePost[]
}

export interface SampleFolder {
  readonly name: string
  /** The page it is a sub-page of, by name; none for a top-level page. Every
   * parent is listed before its children. */
  readonly parent?: string
  readonly icon?: string
  readonly color?: string
  readonly cover?: string
  readonly description?: string
  /** The Work tab. */
  readonly doc?: readonly SampleItem[]
  readonly purpose?: readonly SampleBlock[]
  readonly results?: readonly SampleBlock[]
  /** A custom tab and its page. */
  readonly tab?: { readonly name: string; readonly blocks: readonly SampleBlock[] }
  readonly tasks?: readonly SampleTask[]
  readonly threads?: readonly SampleThread[]
  /** Other people with access; sub-pages inherit them. */
  readonly members?: readonly SamplePersonKey[]
}

export interface SampleView {
  readonly name: string
  readonly definition: Record<string, unknown>
  readonly pinned: boolean
}

export interface SampleWorkspace {
  readonly folders: readonly SampleFolder[]
  /** Unfiled tasks, which land on Desk. */
  readonly desk: readonly SampleTask[]
  readonly views: readonly SampleView[]
  /** The sidebar's Focus lists. */
  readonly focusLists: readonly string[]
}

const WEEKLY = (day: string) => `FREQ=WEEKLY;BYDAY=${day}`

export const SAMPLE_WORKSPACE: SampleWorkspace = {
  focusLists: ['today', 'scheduled', 'assignments', 'important'],

  folders: [
    /* ---------------------------------------------------------- Work */
    {
      name: 'Work',
      icon: 'laptop',
      color: '#4A7BD0',
      cover: 'colour-blue',
      description: 'Product design at the studio.',
      members: ['nadia'],
      doc: [
        {
          kind: 'callout',
          text: [
            'This quarter: ship the ',
            { text: 'checkout redesign', page: 'Checkout redesign' },
            ' and keep Fridays for writing things down.',
          ],
        },
        { kind: 'section', text: 'Projects' },
        { page: 'Checkout redesign' },
        { page: '1:1s with Nadia' },
        { kind: 'section', text: 'This week' },
        { task: 'Review the onboarding copy' },
        { task: 'Send the timesheet' },
        { task: 'Update my portfolio case study' },
        { task: 'Answer the recruiter' },
      ],
      purpose: [
        { kind: 'paragraph', text: 'Everything I owe the studio, in one place, so the evenings stay mine.' },
      ],
      tasks: [
        {
          title: 'Review the onboarding copy',
          due: 0,
          today: true,
          assignee: 'nadia',
          notes: 'Nadia wants a yes or no by the end of the day. Mark anything that sounds like marketing.',
        },
        {
          title: 'Send the timesheet',
          due: { weekday: 'FR' },
          repeat: WEEKLY('FR'),
          history: [7, 14],
        },
        { title: 'Update my portfolio case study', due: 12, start: -3 },
        { title: 'Answer the recruiter', abandoned: true },
      ],
    },
    {
      name: 'Checkout redesign',
      parent: 'Work',
      icon: 'shopping-cart',
      color: '#4A7BD0',
      cover: 'colour-green',
      description: 'Fewer steps from basket to paid.',
      doc: [
        {
          kind: 'paragraph',
          text: [
            'The old checkout loses a third of people at the address step. The goal is ',
            { text: 'one screen for address and payment', bold: true },
            ', live before the winter sale.',
          ],
        },
        {
          kind: 'quote',
          text: '“I just wanted to pay and it asked me to make an account.” Interview 4',
        },
        { kind: 'section', text: 'Design' },
        { task: 'Wireframe the one-page checkout' },
        { task: 'Prototype the address autocomplete' },
        { task: 'Usability test with five people' },
        { page: 'Research notes' },
        { kind: 'section', text: 'Handover' },
        { task: 'Write the spec for the payment errors' },
        { task: 'Walk engineering through the prototype' },
        {
          kind: 'heading3',
          text: 'Open questions',
          toggleable: true,
          children: [
            { kind: 'bullet', text: 'Where does the promo code live on mobile?' },
            { kind: 'bullet', text: 'Do we show the delivery date before payment?' },
          ],
        },
        { kind: 'divider' },
        {
          kind: 'paragraph',
          text: [
            'Designs are in ',
            { text: 'Figma, checkout v3', href: 'https://www.figma.com' },
            '. Ask ',
            { mention: 'nadia' },
            ' before changing the shared components.',
          ],
        },
      ],
      purpose: [
        { kind: 'heading2', text: 'Why' },
        {
          kind: 'paragraph',
          text: 'Checkout is where the studio’s biggest client loses the most money. A calmer page is worth more than any new feature this quarter.',
        },
        { kind: 'heading2', text: 'Done means' },
        { kind: 'bullet', text: 'Address and payment on one screen' },
        { kind: 'bullet', text: 'Drop-off at the address step under 15%' },
        { kind: 'bullet', text: 'Engineering has everything before the sale freeze' },
      ],
      results: [
        { kind: 'heading2', text: 'Usability test, round one' },
        { kind: 'numbered', text: 'Four of five finished without help.' },
        { kind: 'numbered', text: 'Everyone missed the promo code link.' },
        { kind: 'numbered', text: 'Autocomplete saved about 20 seconds each.' },
        { kind: 'callout', text: 'Round two tests the promo code in the order summary.' },
      ],
      tab: {
        name: 'Spec',
        blocks: [
          { kind: 'heading2', text: 'Payment errors' },
          { kind: 'paragraph', text: 'Say what happened, then what to do next. Never blame the card.' },
          { kind: 'code', text: 'card_declined → "Your bank declined this card. Try another card or call your bank."' },
          { kind: 'checklist', text: 'Declined', checked: true },
          { kind: 'checklist', text: 'Expired', checked: true },
          { kind: 'checklist', text: 'Needs 3-D Secure' },
        ],
      },
      tasks: [
        {
          title: 'Wireframe the one-page checkout',
          doneDaysAgo: 18,
          steps: [
            { title: 'Mobile', done: true },
            { title: 'Desktop', done: true },
          ],
        },
        {
          title: 'Prototype the address autocomplete',
          important: true,
          start: -4,
          due: 1,
          time: '15:00',
          reminder: { before: 60 },
          steps: [
            { title: 'Happy path', done: true },
            { title: 'No results', done: true },
            { title: 'Typing a postcode first' },
          ],
          notes: 'Use the real postcode list, not made-up addresses. People notice.',
          thread: [
            {
              by: 'nadia',
              daysAgo: 2,
              text: 'Can the list show the street before the town? That is how people scan it.',
              replies: [
                { by: 'me', daysAgo: 2, hoursAgo: -1, text: 'Yes, swapped. Much easier to read.', likes: ['nadia'] },
              ],
            },
          ],
        },
        { title: 'Usability test with five people', doneDaysAgo: 9, assignee: 'nadia' },
        {
          title: 'Write the spec for the payment errors',
          due: 6,
          steps: [
            { title: 'List every error the provider sends', done: true },
            { title: 'Write the copy' },
            { title: 'Review with Nadia' },
          ],
        },
        { title: 'Walk engineering through the prototype', due: 9, time: '11:00', assignee: 'nadia' },
      ],
      threads: [
        {
          title: 'Promo code: field or link?',
          by: 'nadia',
          posts: [
            {
              by: 'nadia',
              daysAgo: 3,
              text: 'Everyone in the test missed the promo link. Do we show the field by default?',
            },
            {
              by: 'me',
              daysAgo: 3,
              hoursAgo: -2,
              text: 'A visible field sends people off hunting for codes, and some never come back. I would keep the link but move it into the order summary.',
              likes: ['nadia'],
            },
            {
              by: 'nadia',
              daysAgo: 1,
              text: ['Fair. ', { mention: 'me' }, ' can you mock the summary version for Thursday?'],
            },
            { by: 'me', daysAgo: 1, hoursAgo: -1, text: 'On it.' },
            { by: 'me', daysAgo: 1, hoursAgo: -1.05, text: 'I will put it in round two of the test as well.' },
          ],
        },
        {
          title: 'Keep guest checkout as the default?',
          by: 'me',
          posts: [
            {
              by: 'me',
              daysAgo: 16,
              text: 'Accounts help repeat buyers, but interview 4 says it all. Proposal: guest by default, offer an account after paying.',
            },
            {
              by: 'nadia',
              daysAgo: 15,
              text: 'Agree. The client asked for accounts first, but the numbers will convince them.',
              likes: ['me'],
            },
          ],
          resolved: {
            by: 'nadia',
            daysAgo: 14,
            decision: 'Guest checkout is the default. We offer an account on the confirmation page.',
          },
        },
      ],
    },
    {
      name: 'Research notes',
      parent: 'Checkout redesign',
      icon: 'clipboard',
      doc: [
        { kind: 'section', text: 'Interviews' },
        {
          kind: 'toggle',
          text: 'Interview 2: shops on her phone at lunch',
          children: [
            { kind: 'bullet', text: 'Gives up if the keyboard covers the button' },
            { kind: 'bullet', text: 'Trusts the card logos more than the padlock' },
          ],
        },
        {
          kind: 'toggle',
          text: 'Interview 4: buys gifts on a laptop',
          children: [
            { kind: 'bullet', text: 'Hates making an account for a one-off present' },
            { kind: 'bullet', text: 'Wants the delivery date before paying' },
          ],
        },
        { kind: 'section', text: 'Patterns' },
        { kind: 'numbered', text: 'Surprise costs are the first reason to leave.' },
        { kind: 'numbered', text: 'People read the total, not the line items.' },
      ],
    },
    {
      name: '1:1s with Nadia',
      parent: 'Work',
      icon: 'coffee',
      doc: [
        { kind: 'paragraph', text: 'Tuesdays at ten. Notes stay short; decisions go in bold.' },
        {
          kind: 'heading2',
          text: 'Last Tuesday',
          toggleable: true,
          children: [
            { kind: 'bullet', text: [{ text: 'Checkout ships before the sale.', bold: true }] },
            { kind: 'bullet', text: 'I want more research time next quarter.' },
          ],
        },
        { task: 'Prepare the 1:1 agenda' },
      ],
      tasks: [
        {
          title: 'Prepare the 1:1 agenda',
          due: { weekday: 'TU' },
          time: '09:30',
          repeat: WEEKLY('TU'),
          history: [7],
        },
      ],
    },

    /* ------------------------------------------------------ New flat */
    {
      name: 'New flat',
      icon: 'key',
      color: '#D97757',
      cover: 'colour-yellow',
      description: 'Moving in two weeks. Keys to the old place back the day after.',
      members: ['sara'],
      doc: [
        {
          kind: 'paragraph',
          text: [
            'The van is booked. ',
            { mention: 'sara' },
            ' has the car for the small runs, and the ',
            { text: 'packing list', page: 'Packing' },
            ' holds the rest.',
          ],
        },
        { kind: 'section', text: 'Before the move' },
        { task: 'Book the van' },
        { task: 'Give notice to the landlord' },
        { task: 'Cancel the old internet' },
        { task: 'Pack the kitchen' },
        { task: 'Take the meter readings' },
        { kind: 'section', text: 'After' },
        { task: 'Change my address at the bank' },
        { task: 'Return the old keys' },
        { page: 'Packing' },
        { page: 'Furniture' },
      ],
      purpose: [
        { kind: 'paragraph', text: 'A calm move: nothing lost, the deposit back in full, the desk set up by Monday.' },
      ],
      tasks: [
        {
          title: 'Book the van',
          doneDaysAgo: 12,
          important: true,
          steps: [
            { title: 'Compare three quotes', done: true },
            { title: 'Confirm the booking', done: true },
          ],
        },
        { title: 'Give notice to the landlord', doneDaysAgo: 26 },
        { title: 'Cancel the old internet', due: -2, important: true },
        {
          title: 'Pack the kitchen',
          start: -2,
          due: 5,
          steps: [
            { title: 'Plates and bowls', done: true },
            { title: 'Glasses, wrapped twice' },
            { title: 'The good knives, in a tea towel' },
          ],
          notes: 'Leave one mug and one plate out for the last morning.',
        },
        { title: 'Take the meter readings', due: 7, assignee: 'sara' },
        { title: 'Change my address at the bank', due: 10 },
        { title: 'Return the old keys', due: 13, time: '17:00', reminder: { at: '09:00' }, important: true },
      ],
      threads: [
        {
          title: 'Moving day plan',
          by: 'sara',
          posts: [
            { by: 'sara', daysAgo: 4, text: 'I can do two car runs on Saturday morning. What goes in the car and not the van?' },
            {
              by: 'me',
              daysAgo: 4,
              hoursAgo: -3,
              text: 'Plants, the monitor and the box of glasses. Everything else is fine in the van.',
            },
            {
              by: 'sara',
              daysAgo: 2,
              text: 'Perfect. I will bring blankets for the monitor.',
              likes: ['me'],
              replies: [{ by: 'me', daysAgo: 2, hoursAgo: -1, text: 'You are the best. Coffee is on me.' }],
            },
            { by: 'sara', daysAgo: 0, hoursAgo: 3, text: [{ mention: 'me' }, ' what time should I be there, eight or nine?'] },
          ],
        },
        {
          title: 'Which internet for the new place?',
          by: 'me',
          posts: [
            { by: 'me', daysAgo: 20, text: 'Fibre reaches the new building. Two offers, same speed; one has no contract.' },
            { by: 'sara', daysAgo: 19, text: 'No contract. You will want to switch the moment they raise the price.' },
          ],
          resolved: { by: 'me', daysAgo: 18, decision: 'The no-contract fibre plan, installed the day after the move.' },
        },
      ],
    },
    {
      name: 'Packing',
      parent: 'New flat',
      icon: 'package',
      doc: [
        { kind: 'paragraph', text: 'One room at a time. Label each box with the room it goes to, not what is in it.' },
        { kind: 'checklist', text: 'Books', checked: true },
        { kind: 'checklist', text: 'Winter clothes', checked: true },
        { kind: 'checklist', text: 'Kitchen' },
        { kind: 'checklist', text: 'Bathroom, last' },
        { task: 'Buy tape and markers' },
      ],
      tasks: [{ title: 'Buy tape and markers', doneDaysAgo: 8 }],
    },
    {
      name: 'Furniture',
      parent: 'New flat',
      icon: 'truck',
      doc: [
        { kind: 'paragraph', text: 'What moves, what gets sold, and what the new place still needs.' },
        { page: 'Living room' },
        { task: 'Sell the old wardrobe' },
      ],
      tasks: [{ title: 'Sell the old wardrobe', doneDaysAgo: 3 }],
    },
    {
      name: 'Living room',
      parent: 'Furniture',
      icon: 'lamp-desk',
      doc: [
        { kind: 'heading2', text: 'Measurements' },
        { kind: 'bullet', text: 'Window wall: 3.4 m' },
        { kind: 'bullet', text: 'Alcove: 1.1 m, fits the bookcase' },
        { kind: 'heading2', text: 'Wish list' },
        { kind: 'bullet', text: 'A rug that is not grey' },
        { kind: 'bullet', text: 'A reading lamp by the window' },
        { task: 'Order the reading lamp' },
      ],
      tasks: [{ title: 'Order the reading lamp', due: 8 }],
    },

    /* ------------------------------------------------------- Spanish */
    {
      name: 'Spanish',
      icon: 'globe',
      color: '#5B9E6A',
      cover: 'colour-red',
      description: 'Conversational by the summer trip.',
      members: ['lucia'],
      doc: [
        { kind: 'quote', text: 'Poco a poco se va lejos.' },
        { kind: 'section', text: 'Routine' },
        { task: 'Twenty minutes of Duolingo' },
        { task: 'Lesson with Lucía' },
        { task: 'Homework: the past tense' },
        { page: 'Lessons' },
        { page: 'Vocabulary' },
      ],
      results: [
        {
          kind: 'paragraph',
          text: 'Four weeks of practice nearly every day. First conversation without switching to English last Thursday.',
        },
      ],
      tasks: [
        {
          title: 'Twenty minutes of Duolingo',
          due: 0,
          time: '21:00',
          repeat: 'FREQ=DAILY',
          history: [1, 2],
        },
        {
          title: 'Lesson with Lucía',
          due: { weekday: 'TH' },
          time: '18:00',
          repeat: WEEKLY('TH'),
          history: [7],
        },
        {
          title: 'Homework: the past tense',
          due: 2,
          assignee: 'lucia',
          steps: [
            { title: 'Exercise 4', done: true },
            { title: 'Exercise 5' },
            { title: 'Five sentences about the move' },
          ],
          thread: [
            {
              by: 'lucia',
              daysAgo: 1,
              text: 'For the sentences, use the pretérito for the move itself and the imperfecto for how the old flat was.',
            },
          ],
        },
      ],
      threads: [
        {
          title: 'Phrases for the trip',
          by: 'lucia',
          posts: [
            { by: 'lucia', daysAgo: 6, text: 'Before the trip, let us practise ordering food and asking for directions.' },
            {
              by: 'me',
              daysAgo: 6,
              hoursAgo: -4,
              text: '¡Vale! Can we also do the train station? I always panic there.',
              likes: ['lucia'],
            },
            { by: 'lucia', daysAgo: 5, text: 'Claro. Thursday is the station, next week the restaurant.' },
          ],
        },
      ],
    },
    {
      name: 'Lessons',
      parent: 'Spanish',
      icon: 'book-open',
      doc: [
        {
          kind: 'toggle',
          text: 'Week 4: pretérito or imperfecto',
          children: [
            { kind: 'bullet', text: 'Pretérito for finished actions. Ayer comí paella.' },
            { kind: 'bullet', text: 'Imperfecto for background and habits. Cuando era niña, vivía en Leeds.' },
          ],
        },
        {
          kind: 'toggle',
          text: 'Week 3: ser or estar',
          children: [{ kind: 'bullet', text: 'Estar for where and how, ser for what and who.' }],
        },
      ],
    },
    {
      name: 'Vocabulary',
      parent: 'Spanish',
      icon: 'quote',
      doc: [
        { kind: 'heading2', text: 'The move' },
        { kind: 'bullet', text: [{ text: 'la mudanza', bold: true }, ', the move'] },
        { kind: 'bullet', text: [{ text: 'el piso', bold: true }, ', the flat'] },
        { kind: 'bullet', text: [{ text: 'la caja', bold: true }, ', the box'] },
        { kind: 'heading2', text: 'Work' },
        { kind: 'bullet', text: [{ text: 'la reunión', bold: true }, ', the meeting'] },
      ],
    },

    /* ------------------------------------------------------ Personal */
    {
      name: 'Personal',
      icon: 'heart',
      color: '#B36AA8',
      description: 'The small things that keep the week running.',
      doc: [
        { kind: 'section', text: 'Every week' },
        { task: 'Water the plants' },
        { task: 'Call Mum' },
        { kind: 'section', text: 'Soon' },
        { task: 'Book the dentist' },
        { task: 'Renew the passport' },
        { task: 'Birthday present for Leo' },
      ],
      tasks: [
        { title: 'Water the plants', due: { weekday: 'SA' }, repeat: WEEKLY('SA'), history: [7] },
        { title: 'Call Mum', due: { weekday: 'SU' }, time: '18:30', repeat: WEEKLY('SU') },
        { title: 'Book the dentist', due: 3, time: '12:30', notes: 'Ask about the chipped tooth on the left.' },
        {
          title: 'Renew the passport',
          important: true,
          due: 11,
          notes: 'It runs out in four months, and some countries want six.',
        },
        { title: 'Birthday present for Leo', due: 14 },
      ],
    },
  ],

  desk: [
    { title: 'Reply to Sara about Saturday', due: 0, time: '18:00', today: true },
    { title: 'Return the library books', due: 4 },
    { title: 'Pick up the dry cleaning', doneDaysAgo: 1 },
  ],

  views: [],
}
