/* Pocket: a tiny budgeting app Maya is building with Nadia. The flagship
   project, in full swing. */
import type { SampleFolder } from '../content.js'
import { WEEKLY } from './helpers.js'

const POCKET = 'Pocket app'

export const BUDGET_APP: readonly SampleFolder[] = [
  {
    name: POCKET,
    icon: 'wallet',
    color: '#5B9E6A',
    cover: 'colour-green',
    description: 'An iPhone app for knowing what is left this month. With Nadia.',
    members: ['nadia'],
    purpose: [
      { kind: 'heading2', text: 'Why' },
      {
        kind: 'paragraph',
        text: 'Every budgeting app I have tried wants my bank login and then shows me forty charts. I want one number: what is left this month. Nadia wants the same, so we are building it.',
      },
      { kind: 'heading2', text: 'Done means' },
      { kind: 'bullet', text: 'Pocket is on the App Store, free, in Swedish and English' },
      { kind: 'bullet', text: 'Adding a purchase takes under five seconds' },
      { kind: 'bullet', text: 'Ten beta testers used it for two weeks and eight kept using it' },
      { kind: 'heading2', text: 'Constraints' },
      {
        kind: 'paragraph',
        text: 'Evenings and Sundays only. Everything stays on the phone: no accounts, no server, no bank login. We spend under 2 000 SEK in total.',
      },
      { kind: 'paragraph', text: 'The beta starts on the 1st, so v0.1 is finished before then.' },
    ],
    doc: [
      { kind: 'section', text: 'Prototype' },
      { task: 'Interview five friends about how they budget' },
      { task: 'Sketch the three screens' },
      { task: 'Pick the stack with Nadia' },
      { kind: 'section', text: 'Build v0.1' },
      {
        kind: 'paragraph',
        text: 'Three screens: the envelopes, the add sheet, the month. Nothing else goes in until the beta says so.',
      },
      { task: 'Design the add-purchase sheet' },
      { task: 'Build the envelope list' },
      { task: 'Fix rounding when a purchase is split' },
      { task: 'Import bank CSVs from SEB and Handelsbanken' },
      { task: 'Design the month summary' },
      { task: 'Write the empty states' },
      { kind: 'section', text: 'Beta' },
      { task: 'Write the beta welcome note' },
      { task: 'Invite ten testers on TestFlight' },
      { task: 'Put the feedback form together' },
      { task: 'Sunday call with Nadia' },
      { kind: 'section', text: 'Launch' },
      { page: 'Launch checklist' },
      { task: 'Make the App Store screenshots' },
      { task: 'Submit Pocket to the App Store' },
      {
        kind: 'heading3',
        text: 'Not in v1',
        toggleable: true,
        children: [
          { kind: 'bullet', text: 'Bank sync. Needs a PSD2 partner and a server.' },
          { kind: 'bullet', text: 'Shared envelopes with a partner' },
          { kind: 'bullet', text: 'Android, until someone asks twice' },
        ],
      },
      { kind: 'divider' },
      {
        kind: 'paragraph',
        text: [
          'Designs are in ',
          { text: 'Figma, Pocket v0.1', href: 'https://www.figma.com' },
          ', code is in Nadia’s ',
          { text: 'pocket repo', href: 'https://github.com' },
          '.',
        ],
      },
    ],
    results: [
      { kind: 'heading2', text: 'What the interviews showed' },
      { kind: 'numbered', text: 'All five check their balance in the bank app, then guess.' },
      { kind: 'numbered', text: 'Four have tried a budgeting app and quit within a month.' },
      { kind: 'numbered', text: 'Nobody wanted charts. Everybody wanted “how much can I spend on food until payday”.' },
      { kind: 'heading2', text: 'Three weeks of using v0.1 myself' },
      { kind: 'bullet', text: '71 purchases logged, 6 seconds each on average' },
      { kind: 'bullet', text: 'I skipped logging on 4 days, all of them weekends' },
      { kind: 'bullet', text: 'Food ran out on the 19th; the envelope moved to 3 800 SEK' },
      {
        kind: 'callout',
        text: 'So far: the add sheet works. The month screen is what decides whether people come back, so it gets the next two weeks.',
      },
    ],
    tab: {
      name: 'Costs',
      blocks: [
        { kind: 'paragraph', text: 'What Pocket costs to make and run. We split everything half and half.' },
        { kind: 'heading2', text: 'Paid' },
        { kind: 'bullet', text: 'Apple Developer Program: 1 190 SEK a year' },
        { kind: 'bullet', text: 'pocketapp.se for the privacy page: 149 SEK a year' },
        { kind: 'heading2', text: 'Free for now' },
        { kind: 'bullet', text: 'Expo, free plan: 30 builds a month is plenty' },
        { kind: 'bullet', text: 'TestFlight, up to 10 000 testers' },
        { kind: 'bullet', text: 'Tally for the feedback form' },
        { kind: 'divider' },
        { kind: 'paragraph', text: [{ text: 'Total so far: 1 339 SEK', bold: true }, ', 670 SEK each.'] },
      ],
    },
    tasks: [
      {
        title: 'Interview five friends about how they budget',
        doneDaysAgo: 27,
        notes: 'Twenty minutes each. Ask what they did last time money ran out, not what they wish they did.',
        steps: [
          { title: 'Sara', done: true },
          { title: 'Lucía', done: true },
          { title: 'Johan from work', done: true },
          { title: 'My brother', done: true },
          { title: 'Nadia’s flatmate', done: true },
        ],
      },
      { title: 'Sketch the three screens', doneDaysAgo: 23, notes: 'Paper first. Envelopes, add, month.' },
      {
        title: 'Pick the stack with Nadia',
        doneDaysAgo: 20,
        notes: 'Decided in the discussion: Expo and SQLite, everything on the phone.',
      },
      {
        title: 'Design the add-purchase sheet',
        doneDaysAgo: 15,
        notes: 'Amount first, keyboard already open, envelope as one tap. Date defaults to today.',
      },
      {
        title: 'Build the envelope list',
        assignee: 'nadia',
        doneDaysAgo: 11,
      },
      {
        title: 'Fix rounding when a purchase is split',
        doneDaysAgo: 6,
        notes: '99 SEK split three ways showed 33.33 and lost the öre. Store amounts in öre as whole numbers.',
      },
      {
        title: 'Import bank CSVs from SEB and Handelsbanken',
        assignee: 'nadia',
        start: -4,
        due: 5,
        notes: 'Import only, never a bank login. Match on date and amount so a purchase is not counted twice.',
        steps: [
          { title: 'SEB export', done: true },
          { title: 'Handelsbanken export' },
          { title: 'Skip duplicates already logged by hand' },
        ],
        thread: [
          {
            by: 'nadia',
            daysAgo: 3,
            text: 'Handelsbanken’s file uses a comma for decimals and a semicolon between columns. SEB does neither. Two parsers it is.',
          },
          {
            by: 'me',
            daysAgo: 2,
            hoursAgo: 5,
            text: 'Fine by me. Can the import screen say which bank it thinks the file is from, so people can catch a wrong guess?',
            likes: ['nadia'],
          },
        ],
      },
      {
        title: 'Design the month summary',
        important: true,
        start: -2,
        due: 3,
        notes: 'One number at the top: left to spend until payday on the 25th. Envelopes under it, no charts.',
        steps: [
          { title: 'Three layouts in Figma', done: true },
          { title: 'Test them on Sara and Nadia' },
          { title: 'Pick one and hand it over' },
        ],
      },
      {
        title: 'Write the empty states',
        due: 0,
        today: true,
        notes: 'First launch, an empty envelope, a month with nothing logged. One sentence each and a button that says what it does.',
      },
      {
        title: 'Write the beta welcome note',
        due: 7,
        notes: 'What Pocket is, what we want to learn, how to send feedback. Half a page.',
      },
      {
        title: 'Invite ten testers on TestFlight',
        due: 9,
        waitsOn: ['Write the beta welcome note'],
        steps: [
          { title: 'Five from the interviews' },
          { title: 'Five who have never budgeted' },
        ],
      },
      { title: 'Put the feedback form together', due: 12, notes: 'Five questions at most. Ask what they did, not what they liked.' },
      {
        title: 'Sunday call with Nadia',
        due: { weekday: 'SU' },
        time: '19:00',
        repeat: WEEKLY('SU'),
        history: [7, 14, 21, 28],
        notes: 'Thirty minutes. What shipped, what is stuck, what is next.',
      },
      { title: 'Make the App Store screenshots', due: 16, notes: 'Real numbers from my own month, not lorem ipsum.' },
      {
        title: 'Submit Pocket to the App Store',
        important: true,
        due: 21,
      },
      {
        title: 'Add bank sync through Tink',
        abandoned: true,
        notes: 'Needs a server, a contract and a privacy review. Not for v1; CSV import covers it.',
      },
    ],
    threads: [
      {
        title: 'Local only, or a server?',
        by: 'nadia',
        posts: [
          {
            by: 'nadia',
            daysAgo: 24,
            text: 'Before I write a line: do we keep everything on the phone, or do we want sync between devices from day one? A server means accounts, passwords and a monthly bill.',
            replies: [
              {
                by: 'me',
                daysAgo: 23,
                text: 'On the phone. Every interview said “I don’t want another login”. Sync can come later if people ask for it.',
                likes: ['nadia'],
              },
              {
                by: 'nadia',
                daysAgo: 21,
                text: 'Then Expo with SQLite. iCloud backup of the database file covers a lost phone.',
              },
              {
                by: 'me',
                daysAgo: 20,
                text: 'Agreed. Writing it down.',
              },
            ],
          },
        ],
        resolved: {
          by: 'me',
          daysAgo: 20,
          decision: 'Everything stays on the phone: Expo and SQLite, backed up by iCloud. No accounts and no server in v1.',
        },
      },
      {
        title: 'Who should be in the beta?',
        by: 'me',
        posts: [
          {
            by: 'me',
            daysAgo: 4,
            text: [
              'I have seven names so far: the five I interviewed, plus Lucía and Johan. ',
              { mention: 'nadia' },
              ', can you find three people who have never budgeted at all? They will tell us more than we want to hear.',
            ],
            replies: [
              {
                by: 'nadia',
                daysAgo: 3,
                text: 'My cousin and two people from my climbing gym said yes. One of them has never opened her bank app, which is perfect.',
                likes: ['me'],
              },
              {
                by: 'me',
                daysAgo: 1,
                text: 'That makes ten. I will send the invites once the welcome note is done.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Launch checklist',
    parent: POCKET,
    icon: 'rocket',
    color: '#5B9E6A',
    description: 'Everything Apple asks for before Pocket can go live.',
    doc: [
      {
        kind: 'paragraph',
        text: 'Apple’s review takes one to three days and rejects for small things. Get these right before submitting.',
      },
      { task: 'Pay for the Apple Developer account' },
      { task: 'Write the privacy policy' },
      { task: 'Write the App Store description in Swedish and English' },
      { kind: 'heading3', text: 'Before pressing submit' },
      { kind: 'checklist', text: 'App icon at 1024 × 1024, no transparency', checked: true },
      { kind: 'checklist', text: 'Privacy label says “Data not collected”' },
      { kind: 'checklist', text: 'Screenshots for 6.7″ and 6.1″ iPhones' },
      { kind: 'checklist', text: 'Support link goes to pocketapp.se' },
      { kind: 'checklist', text: 'Build tested on an iPhone SE, the smallest screen' },
    ],
    tasks: [
      { title: 'Pay for the Apple Developer account', doneDaysAgo: 9, notes: '1 190 SEK. Nadia swished me half.' },
      {
        title: 'Write the privacy policy',
        due: 14,
        notes: 'Short, because there is little to say: nothing leaves the phone.',
      },
      { title: 'Write the App Store description in Swedish and English', due: 18 },
    ],
  },
]
