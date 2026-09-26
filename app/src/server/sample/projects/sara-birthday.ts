/* Sara's 30th on Utö, planned with Lucía. Sara is not a
   member: the whole page is a secret from her. */
import type { SampleFolder } from '../content.js'

const NAME = "Sara's 30th"
const SCHEDULE = 'Weekend schedule'

const TOP: SampleFolder = {
  name: NAME,
  icon: 'gift',
  color: '#C4577A',
  cover: 'colour-red',
  description: 'Two nights on Utö with her closest people. She knows nothing.',
  members: ['lucia'],
  purpose: [
    {
      kind: 'paragraph',
      text: 'Sara turns 30 in two and a half weeks. She has said twice that she wants nothing big, so it will be small: a cabin on Utö, the people she actually misses, and no speeches.',
    },
    {
      kind: 'paragraph',
      text: [
        { text: 'Done means ', bold: false },
        { text: 'Sara is on the ferry on Friday afternoon without having guessed, and we are all home on Sunday with nothing left to pay.', bold: true },
      ],
    },
    { kind: 'heading3', text: 'Constraints' },
    { kind: 'bullet', text: 'Nothing about this in the flat, on the shared calendar or in the group chat Sara is in.' },
    { kind: 'bullet', text: 'About 1,850 SEK each for the seven of us paying. Sara pays for nothing.' },
    { kind: 'bullet', text: 'Back in town by Sunday 18:00. She starts a new project at work on Monday.' },
  ],
  doc: [
    { kind: 'section', text: 'Book the weekend' },
    {
      kind: 'paragraph',
      text: 'The cabin sleeps eight and has a wood sauna by the water. Ferry from Årsta brygga, about 50 minutes.',
    },
    { task: 'Book the cabin on Utö' },
    { task: "Ask Sara's sister to keep the weekend free" },
    { task: 'Confirm the sauna is included' },
    { task: 'Book ferry tickets Årsta brygga to Utö' },

    { kind: 'section', text: 'Money and the gift' },
    {
      kind: 'paragraph',
      text: [
        'Costs are split seven ways; the numbers are in the Budget tab. Lucía is collecting the Swish payments so they do not show up on my account where Sara might see them.',
      ],
    },
    { task: 'Collect Swish payments from everyone' },
    { task: 'Make the photo book' },
    { task: 'Order the cake from Tössebageriet' },

    { kind: 'section', text: 'The weekend itself' },
    {
      kind: 'paragraph',
      text: [
        'Hour by hour in ',
        { text: SCHEDULE, page: SCHEDULE },
        '. The hard part is Friday: getting her to the ferry. See ',
        { text: 'Get Sara to Årsta brygga', task: 'Get Sara to Årsta brygga' },
        '.',
      ],
    },
    { task: 'Plan Saturday dinner and shop' },
    { task: 'Pack decorations, candles and games' },
    { task: 'Get Sara to Årsta brygga' },
    { page: SCHEDULE },
  ],
  results: [
    { kind: 'heading3', text: 'Settled so far' },
    { kind: 'bullet', text: 'Cabin booked for Friday and Saturday night, 6,400 SEK, sauna included.' },
    { kind: 'bullet', text: "Seven people confirmed, including her sister, who is coming from Göteborg." },
    { kind: 'bullet', text: 'Cover story agreed: a work dinner of mine that Sara "has to" come to. See Discussion.' },
  ],
  tab: {
    name: 'Budget',
    blocks: [
      { kind: 'paragraph', text: 'Split seven ways. Sara pays nothing.' },
      { kind: 'bullet', text: 'Cabin, two nights: 6,400 SEK' },
      { kind: 'bullet', text: 'Ferry, 8 people return at 95 SEK each way: 1,520 SEK' },
      { kind: 'bullet', text: 'Food and drink for the weekend: 3,440 SEK' },
      { kind: 'bullet', text: 'Princess cake for ten, Tössebageriet: 750 SEK' },
      { kind: 'bullet', text: 'Photo book, 40 pages, hardcover: 540 SEK' },
      { kind: 'bullet', text: 'Candles, balloons, a banner: 300 SEK' },
      { kind: 'divider' },
      {
        kind: 'paragraph',
        text: [{ text: 'Total 12,950 SEK, or 1,850 SEK each.', bold: true }],
      },
      { kind: 'heading3', text: 'Paid so far' },
      { kind: 'checklist', text: 'Maya', checked: true },
      { kind: 'checklist', text: 'Lucía', checked: true },
      { kind: 'checklist', text: 'Her sister', checked: true },
      { kind: 'checklist', text: 'Her cousin', checked: true },
      { kind: 'checklist', text: 'The two from her climbing group', checked: false },
      { kind: 'checklist', text: 'Her friend from university', checked: false },
    ],
  },
  tasks: [
    {
      title: 'Book the cabin on Utö',
      notes: 'Friday to Sunday, check-in 16:00, key in the box by the door. 6,400 SEK paid in full.',
      doneDaysAgo: 22,
    },
    {
      title: "Ask Sara's sister to keep the weekend free",
      notes: 'She will tell Sara she is visiting the following weekend instead.',
      doneDaysAgo: 26,
    },
    {
      title: 'Confirm the sauna is included',
      notes: 'Included. Firewood is in the shed; bring matches.',
      doneDaysAgo: 11,
    },
    {
      title: 'Book ferry tickets Årsta brygga to Utö',
      notes: 'Waxholmsbolaget, Friday 17:10 out, Sunday 15:30 back. Eight people.',
      important: true,
      due: 5,
    },
    {
      title: 'Collect Swish payments from everyone',
      notes: '1,850 SEK each. Tick them off in the Budget tab.',
      assignee: 'lucia',
      start: -6,
      due: 7,
      steps: [
        { title: 'Send the amount and Swish number to everyone', done: true },
        { title: 'Remind the climbing group', done: true },
        { title: 'Chase the last payments' },
      ],
    },
    {
      title: 'Make the photo book',
      notes: 'One page per year since we met at 19. Order it a week before so it arrives in time.',
      start: -8,
      due: 9,
      steps: [
        { title: 'Ask everyone for three photos each', done: true },
        { title: 'Scan the old prints from her mum', done: true },
        { title: 'Lay out the 40 pages' },
        { title: 'Order from Önskefoto' },
      ],
    },
    {
      title: 'Order the cake from Tössebageriet',
      notes: 'Princess cake for ten, "Sara 30" on top. Pick up Friday before 14:00.',
      due: 12,
    },
    {
      title: 'Plan Saturday dinner and shop',
      notes: 'Cook together at the cabin. The Utö shop is small, so shop in town on Friday.',
      due: 16,
    },
    {
      title: 'Pack decorations, candles and games',
      notes: 'Keep the bag at Lucía\'s, not in our flat.',
      due: 16,
    },
    {
      title: 'Get Sara to Årsta brygga',
      notes: 'Leave the flat at 16:15 for the "work dinner". Lucía waits at the pier with the others.',
      start: 17,
      due: 17,
      time: '16:15',
      reminder: { before: 60 },
    },
  ],
  threads: [
    {
      title: 'The cover story for Friday',
      by: 'me',
      posts: [
        {
          by: 'me',
          daysAgo: 9,
          text: 'We need a reason for Sara to be at Årsta brygga at 17:00 on a Friday with a bag. Ideas?',
          replies: [
            {
              by: 'lucia',
              daysAgo: 9,
              hoursAgo: 2,
              text: 'A hike on Saturday morning? She would pack for that without asking.',
            },
            {
              by: 'me',
              daysAgo: 8,
              text: 'She would ask why we are leaving on Friday. What about a work dinner of mine on the island, partners welcome, and I stay over?',
            },
            {
              by: 'lucia',
              daysAgo: 7,
              text: [
                'That works, and she likes being asked to things like that. ',
                { mention: 'me' },
                ' just tell her to bring swimwear because there is a sauna.',
              ],
              likes: ['me'],
            },
          ],
        },
      ],
      resolved: {
        by: 'me',
        daysAgo: 6,
        decision: 'A work dinner on Utö with an overnight stay. I ask Sara this week and tell her to bring swimwear.',
      },
    },
    {
      title: 'Saturday dinner: cook or order in?',
      by: 'lucia',
      posts: [
        {
          by: 'lucia',
          daysAgo: 3,
          text: 'The only restaurant on Utö is fully booked. Cooking together might be nicer anyway. Tacos are easy for eight.',
          replies: [
            {
              by: 'me',
              daysAgo: 2,
              text: 'She had tacos every Friday in our first flat. I like that. Can we do her mum\'s cardamom buns for Sunday too?',
              likes: ['lucia'],
            },
            {
              by: 'lucia',
              daysAgo: 1,
              text: 'Yes. I will write the shopping list this weekend and we split it Friday morning.',
            },
          ],
        },
      ],
    },
  ],
}

const SCHEDULE_PAGE: SampleFolder = {
  name: SCHEDULE,
  parent: NAME,
  icon: 'map-pin',
  color: '#C4577A',
  description: 'Friday to Sunday, hour by hour.',
  doc: [
    { kind: 'heading2', text: 'Friday' },
    { kind: 'bullet', text: '14:00 Lucía picks up the cake and takes it with the others.' },
    { kind: 'bullet', text: '16:15 Sara and I leave the flat for the "work dinner".' },
    { kind: 'bullet', text: '17:10 Ferry from Årsta brygga. Everyone else is already on board.' },
    { kind: 'bullet', text: '18:00 Arrive, light the sauna, pizza from the harbour kiosk.' },
    { kind: 'heading2', text: 'Saturday' },
    { kind: 'bullet', text: 'Slow breakfast, then the walk to the mine pits and the windmill.' },
    { kind: 'bullet', text: '15:00 Cake and the photo book.' },
    { kind: 'bullet', text: '19:00 Tacos, then sauna and a swim if the water allows.' },
    { kind: 'heading2', text: 'Sunday' },
    { kind: 'bullet', text: 'Clean the cabin by 13:00. Cardamom buns on the pier.' },
    { kind: 'bullet', text: '15:30 Ferry back, home before 17:00.' },
  ],
}

export const SARA_BIRTHDAY: readonly SampleFolder[] = [TOP, SCHEDULE_PAGE]
