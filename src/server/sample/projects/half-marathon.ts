/* Maya's race: the Stockholm half marathon, trained for over twelve weeks. */
import type { SampleFolder } from '../content.js'

const RACE = 'Half marathon'
const RACE_WEEK = 'Race week'

export const HALF_MARATHON: readonly SampleFolder[] = [
  {
    name: RACE,
    icon: 'footprints',
    color: '#D97757',
    cover: 'colour-red',
    description: 'Twelve weeks of training, then 21.1 km through the city.',
    members: ['lucia'],
    purpose: [
      {
        kind: 'paragraph',
        text: 'I have run 10 km a dozen times and always stopped there. I want to know I can go twice as far, and to train for it properly instead of hoping.',
      },
      {
        kind: 'paragraph',
        text: [{ text: 'Done means', bold: true }, ' crossing the finish line in under 1:55, with the left knee still happy the day after.'],
      },
      {
        kind: 'bullet',
        text: 'Four runs a week at most. Work comes first on Tuesdays and Thursdays.',
      },
      {
        kind: 'bullet',
        text: 'If the knee hurts for more than two runs in a row, I stop and see the physio before anything else.',
      },
    ],
    doc: [
      { kind: 'section', text: 'Base: weeks 1–4' },
      { task: 'Register for the race' },
      { task: 'Get a gait analysis' },
      { task: 'Buy new running shoes' },
      { kind: 'section', text: 'Build: weeks 5–10' },
      {
        kind: 'paragraph',
        text: [
          'One long run a week, one faster session, two easy ones. The ',
          { text: 'long run', task: 'Long run' },
          ' grows by 1–2 km each Sunday until it reaches 18 km.',
        ],
      },
      { task: 'Long run' },
      { task: 'Run a 10 km time trial' },
      { task: 'Strengthen the left knee' },
      { task: 'Test gels on a long run' },
      { task: 'Run 18 km with Lucía' },
      { kind: 'section', text: 'Taper: weeks 11–12' },
      {
        kind: 'paragraph',
        text: 'Less distance, same rhythm. Nothing new in the last ten days: no new shoes, no new food, no new route.',
      },
      { task: 'Book a sports massage' },
      { task: 'Run the race' },
      { page: RACE_WEEK },
    ],
    tab: {
      name: 'Training plan',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Paces are per kilometre. Easy means I can talk in full sentences.',
        },
        { kind: 'heading3', text: 'Weeks 1–4: base' },
        { kind: 'bullet', text: 'Three easy runs of 5–6 km at 6:30' },
        { kind: 'bullet', text: 'Long run from 8 to 11 km' },
        { kind: 'bullet', text: 'Weekly total: 18–26 km' },
        { kind: 'heading3', text: 'Weeks 5–10: build' },
        { kind: 'bullet', text: 'Tuesday: 6 × 400 m hill repeats in Tantolunden, jog down to recover' },
        { kind: 'bullet', text: 'Thursday: 30 minutes of knee exercises, no running' },
        { kind: 'bullet', text: 'Saturday: 6 km easy' },
        { kind: 'bullet', text: 'Sunday: long run at 6:10, from 12 up to 18 km' },
        { kind: 'bullet', text: 'Weekly total: 28–40 km' },
        { kind: 'heading3', text: 'Weeks 11–12: taper' },
        { kind: 'bullet', text: 'Long runs drop to 14 km, then 10 km' },
        { kind: 'bullet', text: 'Two short runs with 3 km at race pace, 5:25' },
        { kind: 'bullet', text: 'Race-week total: about 15 km before the race' },
      ],
    },
    results: [
      {
        kind: 'paragraph',
        text: 'Nine weeks in. Not the race yet, but enough to see whether the plan works.',
      },
      { kind: 'bullet', text: '10 km time trial: 52:40, down from 56:15 in the spring.' },
      { kind: 'bullet', text: 'Longest run so far: 16 km at 6:08, and I could have kept going.' },
      { kind: 'bullet', text: 'Weekly distance went from 18 km to 38 km without missing a week.' },
      {
        kind: 'bullet',
        text: 'The knee ached after week 6. Clamshells and single-leg squats three times a week fixed it within ten days.',
      },
      {
        kind: 'paragraph',
        text: 'What I would keep: the Sunday long run as a fixed appointment. Running it with Lucía is the only reason I never skipped one.',
      },
    ],
    tasks: [
      {
        title: 'Register for the race',
        doneDaysAgo: 28,
        notes: 'Paid 895 SEK. Start group D, based on a guessed finish of 1:55.',
      },
      {
        title: 'Get a gait analysis',
        doneDaysAgo: 26,
        notes: 'At the running shop on Götgatan. I land on my heels and roll in a little on the left side.',
      },
      {
        title: 'Buy new running shoes',
        doneDaysAgo: 24,
        notes: 'Asics Novablast 4, 1,699 SEK. The old pair had 900 km on them.',
      },
      {
        title: 'Long run',
        due: 0,
        time: '08:00',
        today: true,
        repeat: 'FREQ=WEEKLY',
        history: [7, 14, 21, 28],
        reminder: { before: 60 },
        notes: '16 km easy at 6:10. Mälarstrand to Långholmen and back round Årstaviken. Water at the fountain by Hornstull.',
      },
      {
        title: 'Run a 10 km time trial',
        doneDaysAgo: 10,
        notes: '52:40 on the flat loop around Djurgårdsbrunnsviken. Race pace for the half is about 5:25.',
      },
      {
        title: 'Strengthen the left knee',
        start: -12,
        due: 9,
        important: true,
        notes: 'The physio said the knee is fine; the hip is weak. Three times a week until the race.',
        steps: [
          { title: 'Clamshells, 3 × 15 each side', done: true },
          { title: 'Single-leg squats, 3 × 10', done: true },
          { title: 'Follow-up with the physio', done: false },
        ],
      },
      {
        title: 'Test gels on a long run',
        start: -7,
        due: 7,
        notes: 'One gel at 8 km and one at 14 km. Whatever works goes in the race bag; nothing else does.',
        steps: [
          { title: 'Maurten Gel 100', done: true },
          { title: 'SiS Go Isotonic', done: false },
        ],
      },
      {
        title: 'Run 18 km with Lucía',
        due: 6,
        time: '09:00',
        assignee: 'lucia',
        notes: 'The longest run before the race. Lucía picks the route and keeps me at 6:10.',
        thread: [
          {
            by: 'lucia',
            daysAgo: 2,
            text: 'Route idea: from Slussen along Söder Mälarstrand, over Västerbron, round Kungsholmen and back. Almost exactly 18.',
          },
          {
            by: 'me',
            daysAgo: 1,
            hoursAgo: 5,
            text: 'Perfect, and flat. Meet at the Slussen bus stop at 9?',
            likes: ['lucia'],
          },
        ],
      },
      {
        title: 'Book a sports massage',
        due: 12,
        notes: 'Legs only, 60 minutes, 790 SEK. No later than five days before the race.',
      },
      {
        title: 'Run the race',
        start: 19,
        due: 19,
        time: '11:30',
        important: true,
        notes: 'Start at 5:35 for the first 5 km, settle at 5:25, and only push after 15 km.',
      },
    ],
    threads: [
      {
        title: 'What pace to start at',
        by: 'me',
        posts: [
          {
            by: 'me',
            daysAgo: 9,
            text: 'The time trial says 5:25 is realistic for the half. My instinct is to go out at 5:15 and bank time. Bad idea?',
            replies: [
              {
                by: 'lucia',
                daysAgo: 8,
                text: 'Bad idea. Everyone goes out too fast in the crowd. Start slower than race pace and you will pass people at 15 km instead of the other way round.',
                likes: ['me'],
              },
              {
                by: 'me',
                daysAgo: 7,
                text: 'Fine. I will try the negative split on Sunday: first half at 6:15, second at 6:00.',
              },
              {
                by: 'me',
                daysAgo: 6,
                hoursAgo: 3,
                text: 'It worked. The last 5 km were the best part of the run for once.',
              },
            ],
          },
        ],
        resolved: {
          by: 'me',
          daysAgo: 6,
          decision: 'Start at 5:35 for 5 km, hold 5:25, push only after 15 km.',
        },
      },
      {
        title: 'Coming to watch?',
        by: 'me',
        posts: [
          {
            by: 'me',
            daysAgo: 3,
            text: [
              { mention: 'lucia' },
              ' are you running it with me or watching? If watching, the hard part is Norr Mälarstrand around 16 km.',
            ],
            replies: [
              {
                by: 'lucia',
                daysAgo: 2,
                hoursAgo: 20,
                text: 'Watching, my registration came too late. I will be at 16 km with a banana and a loud voice.',
                likes: ['me'],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: RACE_WEEK,
    parent: RACE,
    icon: 'flag',
    color: '#D97757',
    description: 'The last few days, so race morning is only running.',
    purpose: [
      {
        kind: 'paragraph',
        text: 'Everything that can be decided before race morning is decided here, so on the day I only have to run.',
      },
    ],
    doc: [
      { kind: 'section', text: 'Before the day' },
      { task: 'Pick up the race bib' },
      { task: 'Pack the race bag' },
      { kind: 'section', text: 'Race morning' },
      { kind: 'numbered', text: 'Breakfast at 8:00: porridge, banana, one coffee.' },
      { kind: 'numbered', text: 'Leave home at 10:15. Tunnelbana to Karlaplan, walk from there.' },
      { kind: 'numbered', text: 'Bag drop closes 30 minutes before the start.' },
      { kind: 'numbered', text: 'Ten minutes of easy jogging, then into start group D.' },
    ],
    tasks: [
      {
        title: 'Pick up the race bib',
        start: 18,
        due: 18,
        notes: 'Race office at Östermalms IP, open until 19:00 the day before. Bring ID and the confirmation email.',
      },
      {
        title: 'Pack the race bag',
        start: 18,
        due: 18,
        notes: 'Lay everything out the night before. Only things already tested on a long run.',
      },
    ],
  },
]
