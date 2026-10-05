/* Sourdough: the finished project. Every task is done, the
   Results are written, and the one thread closed with a decision. */
import type { SampleFolder } from '../content.js'

const PROJECT = 'Sourdough'

export const SOURDOUGH: readonly SampleFolder[] = [
  {
    name: PROJECT,
    icon: 'flame',
    color: '#D97757',
    cover: 'colour-yellow',
    description: 'Flour, water, salt and a jar of something alive. Done.',
    members: ['sara'],
    purpose: [
      {
        kind: 'paragraph',
        text: 'I have baked sourdough for two years by following recipes, and I could not explain a single step. I wanted to understand what the starter is, why it rises, and why my loaves are good one week and flat the next.',
      },
      {
        kind: 'paragraph',
        text: [
          { text: 'Done means', bold: true },
          ': I can explain what each step does, I can bake three good loaves in a row without a recipe open, and I have written it down so I keep it.',
        ],
      },
      {
        kind: 'bullet',
        text: 'One month, weekends only. Nothing bought except flour, a thermometer and pH strips.',
      },
      { kind: 'bullet', text: 'Change one thing per bake, or I learn nothing from it.' },
    ],
    doc: [
      { kind: 'section', text: 'Get a starter going' },
      {
        kind: 'paragraph',
        text: 'Start from nothing rather than a gifted starter, so I see the whole first week.',
      },
      { task: 'Make a starter from rye and water' },
      { task: 'Read the Tartine chapter on the levain' },
      { kind: 'section', text: 'Understand what it is doing' },
      {
        kind: 'paragraph',
        text: [
          'Two kinds of life share the jar: wild yeast, which makes the gas, and lactic acid bacteria, which make the sour and keep everything else out. ',
          { text: 'The Perfect Loaf', href: 'https://www.theperfectloaf.com/' },
          ' was the clearest source.',
        ],
      },
      { task: 'Measure the rise at 24 °C and at 18 °C' },
      { task: 'Test the starter with pH strips' },
      { kind: 'section', text: 'Bake until it is boring' },
      { task: 'Bake loaf 1 by the book' },
      { task: 'Bake three loaves, changing only the bulk time' },
      { task: 'Try a cold retard overnight in the fridge' },
      { kind: 'section', text: 'Write it down' },
      { task: 'Write up what I learned' },
      {
        kind: 'paragraph',
        text: [
          'Last step, because of the move: ',
          { text: 'put the starter to sleep', task: 'Put the starter in the fridge before the move' },
          '.',
        ],
      },
      { task: 'Put the starter in the fridge before the move' },
    ],
    tasks: [
      {
        title: 'Make a starter from rye and water',
        doneDaysAgo: 28,
        notes: 'Whole rye from Saltå Kvarn, 50 g flour and 50 g water at 26 °C. A rubber band on the jar marks where it starts.',
        steps: [
          { title: 'Mix 50 g rye and 50 g water in a clean jar', done: true },
          { title: 'Feed at 20:00 every day for a week', done: true },
          { title: 'Mark the level after each feed', done: true },
        ],
      },
      {
        title: 'Read the Tartine chapter on the levain',
        doneDaysAgo: 26,
        notes: 'Borrowed from Stadsbiblioteket. The part on young versus old levain is the one that mattered.',
      },
      {
        title: 'Measure the rise at 24 °C and at 18 °C',
        doneDaysAgo: 22,
        notes: 'On the counter by the oven it doubled in 5 hours. On the windowsill at 18 °C it took 11 and smelled sharper.',
      },
      {
        title: 'Test the starter with pH strips',
        doneDaysAgo: 18,
        notes: 'Strips from the pharmacy, 89 SEK. Fresh feed pH 6, at peak about 4, the next morning under 4.',
      },
      {
        title: 'Bake loaf 1 by the book',
        doneDaysAgo: 20,
        notes: '75% hydration, 2% salt, 20% levain. Flat and dense. The starter was only eight days old.',
      },
      {
        title: 'Bake three loaves, changing only the bulk time',
        doneDaysAgo: 11,
        notes: 'Bulk at 24 °C for 3, 4½ and 6 hours. 4½ was the one: open crumb, still holds its shape.',
        steps: [
          { title: 'Loaf A: 3 h bulk', done: true },
          { title: 'Loaf B: 4½ h bulk', done: true },
          { title: 'Loaf C: 6 h bulk', done: true },
          { title: 'Cut all three side by side and photograph them', done: true },
        ],
      },
      {
        title: 'Try a cold retard overnight in the fridge',
        doneDaysAgo: 7,
        notes: 'Shaped at 21:00, baked straight from the fridge at 8:00. Better ear, more sour, and baking fits a workday.',
      },
      {
        title: 'Write up what I learned',
        doneDaysAgo: 3,
        notes: 'Into Results, in my own words, without looking anything up first.',
      },
      {
        title: 'Put the starter in the fridge before the move',
        doneDaysAgo: 1,
        notes: 'Fed 1:5:5 and straight into the fridge. It keeps for two weeks like that.',
      },
    ],
    results: [
      { kind: 'heading2', text: 'What I learned' },
      {
        kind: 'bullet',
        text: 'A starter is a small ecosystem. Lactic acid bacteria outnumber the yeast about a hundred to one. The bacteria make acid, the acid keeps other microbes out, and the yeast tolerates it.',
      },
      {
        kind: 'bullet',
        text: 'The big bubbles in the first three days were not the starter. They came from bacteria that die off once the jar turns acidic, which is why it went quiet on day 4. I would have thrown it out if I had not read that first.',
      },
      {
        kind: 'bullet',
        text: 'Rise is the yeast making gas; the gluten holds it. When the starter falls, the yeast has run out of food, not died.',
      },
      {
        kind: 'bullet',
        text: 'Temperature is the main control. Warm gives a faster, milder dough. Cold gives a slower, sharper one, because the bacteria make more acetic acid there.',
      },
      {
        kind: 'bullet',
        text: 'Bulk fermentation decides the loaf. Judge it by the dough (about 50% bigger, domed, jiggly), not by the clock.',
      },
      { kind: 'heading2', text: 'What I would do differently' },
      {
        kind: 'bullet',
        text: 'Wait two weeks before the first bake. Loaf 1 failed because the starter was too young, and I blamed the recipe.',
      },
      {
        kind: 'bullet',
        text: 'Buy the thermometer on day one. Half my old failures were a cold kitchen in winter.',
      },
      {
        kind: 'bullet',
        text: 'Keep the bake log from the start. I rebuilt the first two loaves from photos.',
      },
      { kind: 'heading2', text: 'Where it leaves me' },
      {
        kind: 'paragraph',
        text: 'The last three loaves were good, and I knew why before I cut them. The starter is asleep in the fridge until the new flat, and Sara has a jar of it too.',
      },
    ],
    tab: {
      name: 'Bake log',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Every loaf, with the one thing I changed. 500 g flour (80% vete, 20% rye), 2% salt unless noted.',
        },
        {
          kind: 'numbered',
          text: [
            { text: 'Loaf 1', bold: true },
            ' (day 8). 75% water, 4 h bulk at 24 °C. Flat, tight crumb. Starter too young.',
          ],
        },
        {
          kind: 'numbered',
          text: [
            { text: 'Loaf 2', bold: true },
            ' (day 14). Same, starter now two weeks. Rose, but pale and gummy in the middle.',
          ],
        },
        {
          kind: 'numbered',
          text: [
            { text: 'Loaf 3', bold: true },
            ' (day 17). 3 h bulk. Tight and heavy. Underproofed.',
          ],
        },
        {
          kind: 'numbered',
          text: [
            { text: 'Loaf 4', bold: true },
            ' (day 17). 4½ h bulk. Open crumb, good ear. The keeper.',
          ],
        },
        {
          kind: 'numbered',
          text: [
            { text: 'Loaf 5', bold: true },
            ' (day 17). 6 h bulk. Spread flat, sour, big holes under the crust. Overproofed.',
          ],
        },
        {
          kind: 'numbered',
          text: [
            { text: 'Loaf 6', bold: true },
            ' (day 21). 4½ h bulk, then 11 h in the fridge at 5 °C. Best so far, and more sour.',
          ],
        },
        {
          kind: 'numbered',
          text: [
            { text: 'Loaves 7 and 8', bold: true },
            ' (days 24 and 26). Same as 6, no recipe open. Both good.',
          ],
        },
        { kind: 'divider' },
        {
          kind: 'callout',
          text: 'Oven: 250 °C with the Dutch oven inside for 45 minutes, 20 minutes lid on, 22 minutes lid off at 230 °C.',
        },
      ],
    },
    threads: [
      {
        title: 'The starter during the move',
        by: 'me',
        posts: [
          {
            by: 'me',
            daysAgo: 6,
            text: [
              { mention: 'sara' },
              ' the fridge goes when we hand the keys back, and I will not have a kitchen for a few days. I am thinking of putting the starter to sleep in the fridge and waking it up at the new place. Do you want a jar of it?',
            ],
            replies: [
              {
                by: 'sara',
                daysAgo: 5,
                hoursAgo: 3,
                text: 'Yes please. I have eaten half your experiments, I should learn to make one. Will it survive a week of me forgetting it?',
                likes: ['me'],
              },
              {
                by: 'me',
                daysAgo: 5,
                text: 'Fed thick at 1:5:5 it keeps two weeks in the fridge. Take it out the evening before you bake, feed it, and it is ready by morning.',
              },
              {
                by: 'sara',
                daysAgo: 2,
                text: 'Bought a jar at Åhléns. Label it for me so I do not mistake it for yoghurt.',
                likes: ['me'],
              },
            ],
          },
        ],
        resolved: {
          by: 'me',
          daysAgo: 1,
          decision: 'The starter goes into the fridge fed 1:5:5 before the move. Sara takes a labelled jar of her own.',
        },
      },
    ],
  },
]
