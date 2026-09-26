/* Moving out: Maya leaves the flat she shares with Sara on
   Hornsgatan for a one-room flat of her own in Midsommarkransen. The shared
   lease ends in three weeks, so everything here runs to that date. */
import type { SampleFolder } from '../content.js'

const MOVING: SampleFolder = {
  name: 'Moving out',
  icon: 'house',
  color: '#C8893A',
  cover: 'colour-yellow',
  description: 'Out of Hornsgatan and into Midsommarkransen before the lease ends.',
  members: ['sara'],
  purpose: [
    {
      kind: 'paragraph',
      text: 'Sara and I have shared the flat on Hornsgatan for five years. Our lease ends in three weeks, she is moving in with her boyfriend, and I want a place that is only mine for the first time.',
    },
    { kind: 'heading2', text: 'Done means' },
    { kind: 'bullet', text: 'I sleep in the new flat and every box is unpacked.' },
    { kind: 'bullet', text: 'Hornsgatan is cleaned, inspected and handed back.' },
    { kind: 'bullet', text: 'The 18 000 SEK deposit is back and split with Sara.' },
    {
      kind: 'callout',
      text: [
        { text: 'Hard limits: ', bold: true },
        'the keys go back on the last day of the month, and the move costs no more than 15 000 SEK, deposit not included.',
      ],
    },
  ],
  doc: [
    { kind: 'section', text: 'Find the flat' },
    { page: 'Flat viewings' },
    { task: 'Confirm the end date with the landlord' },
    { task: 'Sign the lease in Midsommarkransen' },
    { task: 'Pay the deposit' },
    { kind: 'section', text: 'Before the move' },
    {
      kind: 'paragraph',
      text: [
        'Broadband takes about ten days to switch on, so ',
        { text: 'order it', task: 'Order broadband for the new flat' },
        ' before anything else.',
      ],
    },
    { task: 'Order broadband for the new flat' },
    { task: 'Report the move to Skatteverket' },
    { task: 'Split the shared things with Sara' },
    { task: 'Pack the books and the kitchen' },
    { task: 'Move the electricity contract' },
    { task: 'Take out home insurance from the move date' },
    { task: 'Sell the old sofa on Blocket' },
    { kind: 'section', text: 'Move day' },
    { page: 'Move day' },
    { task: 'Pick up the keys' },
    { kind: 'section', text: 'Hand back Hornsgatan' },
    { task: 'Get quotes for the move-out cleaning' },
    { task: 'Hand back the keys at the inspection' },
    {
      kind: 'paragraph',
      text: 'The inspector checks the oven, the fridge behind the seal and the bathroom drain. Those three are where deposits get lost.',
    },
  ],
  results: [
    { kind: 'heading2', text: 'The flat' },
    {
      kind: 'paragraph',
      text: 'One room and a kitchen, 34 m², fourth floor on Tellusborgsvägen. 8 300 SEK a month, eight minutes from Midsommarkransen station on the red line.',
    },
    { kind: 'bullet', text: 'I applied for eleven flats, viewed three and got one.' },
    { kind: 'bullet', text: 'Signed twelve days ago, first-hand contract, no end date.' },
  ],
  tab: {
    name: 'Budget',
    blocks: [
      {
        kind: 'paragraph',
        text: 'The limit is 15 000 SEK, the deposit not included. Figures are what I paid or the quote I have.',
      },
      { kind: 'heading2', text: 'Paid' },
      { kind: 'bullet', text: 'Deposit for the new flat: 24 900 SEK (three months’ rent, comes back when I leave)' },
      { kind: 'bullet', text: '30 moving boxes and tape from Biltema: 690 SEK' },
      { kind: 'bullet', text: 'Van from Hertz Liljeholmen, one day: 1 450 SEK' },
      { kind: 'heading2', text: 'Coming' },
      { kind: 'bullet', text: 'Move-out cleaning, my half: about 2 400 SEK' },
      { kind: 'bullet', text: 'Bed and mattress from IKEA Kungens Kurva: 6 500 SEK' },
      { kind: 'bullet', text: 'Curtains, lamps and a shower rail: 1 800 SEK' },
      { kind: 'bullet', text: 'Pizza for the four people carrying: 600 SEK' },
      { kind: 'divider' },
      { kind: 'paragraph', text: [{ text: 'Total so far: 13 440 SEK of 15 000.', bold: true }] },
    ],
  },
  tasks: [
    {
      title: 'Confirm the end date with the landlord',
      doneDaysAgo: 26,
      notes: 'Stena confirmed by email: the lease ends on the last day of the month, keys back by 12:00.',
    },
    {
      title: 'Sign the lease in Midsommarkransen',
      doneDaysAgo: 12,
      notes: 'Signed at the Familjebostäder office on Swedenborgsgatan. The contract is in the blue folder.',
    },
    { title: 'Pay the deposit', doneDaysAgo: 11, notes: '24 900 SEK to Familjebostäder, reference on the contract.' },
    {
      title: 'Order broadband for the new flat',
      important: true,
      due: -1,
      notes: 'Bahnhof, 250 Mbit, 399 SEK a month. The building has fibre; they need the flat number, 1402.',
    },
    {
      title: 'Report the move to Skatteverket',
      due: 0,
      today: true,
      notes: 'Flyttanmälan on skatteverket.se with BankID. Moving date is the Saturday of the move.',
    },
    {
      title: 'Split the shared things with Sara',
      start: -6,
      due: 5,
      notes: 'Go room by room with the list we made in the thread. Tape a note on anything that is staying.',
    },
    {
      title: 'Pack the books and the kitchen',
      start: -4,
      due: 14,
      steps: [
        { title: 'Books, five boxes', done: true },
        { title: 'Kitchen cupboards, keep one plate and one pan out', done: true },
        { title: 'Wardrobe' },
        { title: 'Bathroom, last' },
      ],
    },
    {
      title: 'Move the electricity contract',
      due: 4,
      notes: 'Tell Ellevio the new address from the move date. Take the meter reading at Hornsgatan on the day.',
    },
    { title: 'Take out home insurance from the move date', due: 7, notes: 'Compare Folksam and If. Around 120 SEK a month.' },
    {
      title: 'Sell the old sofa on Blocket',
      abandoned: true,
      notes: 'Sara is keeping it after all.',
    },
    { title: 'Pick up the keys', start: 14, due: 14, time: '16:00', reminder: { before: 60 }, notes: 'Familjebostäder office, bring ID.' },
    {
      title: 'Get quotes for the move-out cleaning',
      assignee: 'sara',
      due: 3,
      notes: 'Two or three firms with a guarantee: if the inspection fails they come back for free.',
    },
    {
      title: 'Hand back the keys at the inspection',
      start: 21,
      due: 21,
      time: '10:00',
      notes: 'All four keys and the laundry tag. Sara is there too; both names are on the lease.',
    },
  ],
  threads: [
    {
      title: 'Who keeps what',
      by: 'me',
      posts: [
        {
          by: 'me',
          daysAgo: 9,
          text: 'Let’s settle the shared things before we pack. My guess: you take the sofa and the TV, I take the bookshelf and the rug, and we sell the rest?',
          replies: [
            {
              by: 'sara',
              daysAgo: 8,
              text: 'I want to keep the sofa, it fits the new place. You should have the good pan, you are the one who cooks. The dining table can go on Blocket.',
            },
            {
              by: 'me',
              daysAgo: 7,
              text: 'The table won’t fit in 34 m² anyway. I’ll take the two chairs.',
            },
            {
              by: 'sara',
              daysAgo: 6,
              text: 'Deal. I’ll list the table this weekend.',
              likes: ['me'],
            },
          ],
        },
      ],
      resolved: {
        by: 'me',
        daysAgo: 6,
        decision: 'Sara keeps the sofa and the TV. I take the bookshelf, the rug, the two chairs and the good pan. The dining table is sold.',
      },
    },
    {
      title: 'Cleaning Hornsgatan: hire someone or do it ourselves?',
      by: 'sara',
      posts: [
        {
          by: 'sara',
          daysAgo: 2,
          text: [
            { mention: 'me' },
            ' I asked around. A firm with a guarantee is about 4 800 SEK for the flat. Doing it ourselves is a whole Sunday and the oven.',
          ],
          replies: [
            {
              by: 'me',
              daysAgo: 1,
              text: 'I’d rather pay. The move is the day before and I won’t have a Sunday left in me.',
              likes: ['sara'],
            },
            {
              by: 'sara',
              daysAgo: 0,
              hoursAgo: 3,
              text: 'Same. I’ll get two more quotes by Friday and we pick one.',
            },
          ],
        },
      ],
    },
  ],
}

const VIEWINGS: SampleFolder = {
  name: 'Flat viewings',
  parent: 'Moving out',
  icon: 'key',
  color: '#C8893A',
  description: 'The three flats I saw, and why I chose Tellusborgsvägen.',
  purpose: [
    {
      kind: 'paragraph',
      text: 'Find a one-room flat under 9 000 SEK a month, within 30 minutes of work at Medborgarplatsen, with a first-hand contract.',
    },
  ],
  doc: [
    { kind: 'section', text: 'What I looked at' },
    { task: 'View the flat on Ringvägen' },
    { task: 'View the flat in Aspudden' },
    { task: 'View the flat on Tellusborgsvägen' },
    { kind: 'heading3', text: 'Why Tellusborgsvägen' },
    { kind: 'bullet', text: 'Morning light in the kitchen, and a window over the bed that opens onto trees.' },
    { kind: 'bullet', text: 'Eight minutes to the red line, seventeen to work.' },
    { kind: 'bullet', text: 'The laundry room is booked online, not with a padlock.' },
  ],
  tasks: [
    {
      title: 'View the flat on Ringvägen',
      doneDaysAgo: 20,
      notes: '9 400 SEK. Faces the road, loud with the window open. No.',
    },
    {
      title: 'View the flat in Aspudden',
      doneDaysAgo: 17,
      notes: '8 100 SEK. Lovely, but the kitchen is a cupboard and it is ground floor.',
    },
    {
      title: 'View the flat on Tellusborgsvägen',
      doneDaysAgo: 15,
      notes: '8 300 SEK, fourth floor with a lift. Said yes the same evening.',
    },
  ],
}

const MOVE_DAY: SampleFolder = {
  name: 'Move day',
  parent: 'Moving out',
  icon: 'truck',
  color: '#C8893A',
  description: 'Saturday: one van, four people, two trips.',
  doc: [
    {
      kind: 'paragraph',
      text: 'Nadia and Lucía carry, Sara drives the second trip. The van goes back to Liljeholmen by 18:00.',
    },
    { task: 'Book the van' },
    { task: 'Buy boxes and tape' },
    { task: 'Move everything to Tellusborgsvägen' },
    { kind: 'heading3', text: 'Load last, unload first' },
    { kind: 'checklist', text: 'Bed and bedding' },
    { kind: 'checklist', text: 'Kettle, two mugs, the good pan' },
    { kind: 'checklist', text: 'Toolbox and the Allen keys for the bookshelf' },
  ],
  tasks: [
    { title: 'Book the van', doneDaysAgo: 3, notes: 'Hertz Liljeholmen, 12 m³, 08:00 to 18:00. 1 450 SEK with 100 km.' },
    { title: 'Buy boxes and tape', doneDaysAgo: 5, notes: '30 boxes from Biltema Kungens Kurva, 690 SEK.' },
    {
      title: 'Move everything to Tellusborgsvägen',
      start: 18,
      due: 18,
      time: '08:00',
      steps: [
        { title: 'Pick up the van at 08:00' },
        { title: 'First trip: furniture and the bed' },
        { title: 'Second trip: boxes' },
        { title: 'Return the van by 18:00' },
      ],
    },
  ],
}

export const MOVING_OUT: readonly SampleFolder[] = [MOVING, VIEWINGS, MOVE_DAY]
