/* Maya's Kungsleden trip with Lucía: planning, about six weeks out. */
import type { SampleFolder } from '../content.js'

const kungsleden: SampleFolder = {
  name: 'Kungsleden hike',
  icon: 'mountain',
  color: '#3F8F6B',
  cover: 'colour-grey',
  description: 'Abisko to Nikkaluokta with Lucía, seven days, hut to hut.',
  members: ['lucia'],
  purpose: [
    {
      kind: 'paragraph',
      text: 'I have lived in Sweden for six years and never been north of Uppsala. Lucía and I want to walk the northern Kungsleden, Abisko to Nikkaluokta, before the huts close for the season.',
    },
    {
      kind: 'paragraph',
      text: [
        { text: 'Done means', bold: true },
        ' we step off the bus in Kiruna having walked all 105 km, with no day skipped by boat or helicopter.',
      ],
    },
    { kind: 'heading3', text: 'Constraints' },
    { kind: 'bullet', text: 'Seven walking days and one spare, inside nine days off.' },
    { kind: 'bullet', text: 'Huts every night, so no tent to carry. Pack under 11 kg with water.' },
    { kind: 'bullet', text: 'About 6,000 SEK each, travel included.' },
  ],
  doc: [
    {
      kind: 'callout',
      text: [
        'Night train up, bus back. The stages are in ',
        { text: 'Day by day', page: 'Day by day' },
        '; what goes in the pack is in the Gear list tab.',
      ],
    },
    { kind: 'section', text: 'Decide and book' },
    { task: 'Book the week off at work' },
    { task: 'Pick the route and direction' },
    { task: 'Join STF for the hut discount' },
    { task: 'Book the night train to Abisko' },
    { task: 'Book the last night at Kebnekaise fjällstation' },
    { task: 'Decide whether we climb Kebnekaise' },
    { task: 'Book the bus from Nikkaluokta to Kiruna' },
    { page: 'Day by day' },
    { kind: 'section', text: 'Get the legs and the pack ready' },
    {
      kind: 'paragraph',
      text: 'The boots are new and the longest walk I have done with a pack is 15 km. Both need fixing before the train, not on day two.',
    },
    { task: 'Break in the new boots' },
    { task: 'Put together the gear list' },
    { task: 'Buy the Fjällkartan BD6 map' },
    { task: 'Test the full pack on a two-day walk in Tyresta' },
    { kind: 'section', text: 'The last week' },
    { task: 'Buy food for the first three days' },
    { task: 'Download the offline maps' },
    { task: 'Pack and weigh everything' },
  ],
  tasks: [
    {
      title: 'Book the week off at work',
      notes: 'Nine days, Friday to the Saturday after next. Approved by Johan.',
      doneDaysAgo: 26,
    },
    {
      title: 'Pick the route and direction',
      notes: 'North to south, so the sun is behind us and Kebnekaise comes near the end, when our legs are good.',
      doneDaysAgo: 21,
    },
    {
      title: 'Join STF for the hut discount',
      notes: 'Membership 395 SEK. Saves about 150 SEK a night, so it pays for itself by the third hut.',
      doneDaysAgo: 15,
    },
    {
      title: 'Book the night train to Abisko',
      notes: 'Stockholm C 18:07, Abisko turiststation 11:43 the next day. Two beds in a six-berth couchette, 1,190 SEK each.',
      assignee: 'lucia',
      doneDaysAgo: 8,
    },
    {
      title: 'Break in the new boots',
      notes: 'Hanwag Tatra II, bought in size 42. The left heel rubbed on the first walk.',
      start: -12,
      due: 21,
      steps: [
        { title: 'Walk to work in them twice', done: true },
        { title: 'Day hike in Tyresta, 15 km', done: true },
        { title: 'Two days in a row with the full pack' },
      ],
    },
    {
      title: 'Put together the gear list',
      notes: 'Start from what Lucía took to the Laugavegur last year and cut from there.',
      start: -4,
      due: 10,
    },
    {
      title: 'Book the last night at Kebnekaise fjällstation',
      notes: 'The only place on the route that takes bookings, and it fills up. Two dorm beds, about 750 SEK each.',
      important: true,
      due: 3,
    },
    {
      title: 'Buy the Fjällkartan BD6 map',
      notes: 'Abisko–Kebnekaise–Narvik, 1:100 000. Naturkompaniet on Kungsgatan has it for 229 SEK.',
      due: 7,
    },
    {
      title: 'Decide whether we climb Kebnekaise',
      notes: 'The western route is a long day from the fjällstation, 18 km and about 1,800 m up and down.',
      due: 9,
      thread: [
        {
          by: 'lucia',
          daysAgo: 3,
          text: 'If the weather is clear I really want to try the western route. We would need one extra night at the fjällstation.',
        },
        {
          by: 'me',
          daysAgo: 2,
          text: 'I have one spare day, so it fits. I would rather decide on the morning itself than promise it now.',
          likes: ['lucia'],
        },
      ],
    },
    {
      title: 'Test the full pack on a two-day walk in Tyresta',
      notes: 'Sörmlandsleden from Tyresta by, sleep at the shelter by Årsjön. Everything on the gear list, weighed.',
      due: 12,
    },
    {
      title: 'Book the bus from Nikkaluokta to Kiruna',
      notes: 'Nikkaluokta Express, 16:30 from the end of the road. Then the 18:00 train south.',
      due: 14,
    },
    {
      title: 'Buy food for the first three days',
      notes: 'The huts at Alesjaure and Kebnekaise sell food, so we only carry until there. Oats, couscous, cheese, crispbread, chocolate.',
      due: 18,
    },
    {
      title: 'Download the offline maps',
      notes: 'Lantmäteriet topo for the whole route on both phones. No signal between Alesjaure and Sälka.',
      due: 20,
    },
    {
      title: 'Pack and weigh everything',
      notes: 'Target 11 kg with a litre of water. Anything over comes out.',
      due: 21,
    },
  ],
  tab: {
    name: 'Gear list',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Huts give us a bed, a gas stove and pots, so the list is short. Weights are mine; Lucía carries her own and the first-aid kit.',
      },
      { kind: 'heading3', text: 'Wear and carry' },
      { kind: 'checklist', text: 'Pack: Osprey Talon 33 (1.0 kg)', checked: true },
      { kind: 'checklist', text: 'Boots: Hanwag Tatra II', checked: true },
      { kind: 'checklist', text: 'Rain jacket and rain trousers (0.6 kg)', checked: true },
      { kind: 'checklist', text: 'Wool base layer, top and bottom (0.4 kg)', checked: true },
      { kind: 'checklist', text: 'Fleece mid layer (0.35 kg)' },
      { kind: 'checklist', text: 'Down jacket, borrowing Sara’s (0.4 kg)' },
      { kind: 'checklist', text: 'Hat, gloves, buff' },
      { kind: 'heading3', text: 'Sleep' },
      { kind: 'checklist', text: 'Sleeping-bag liner, silk (0.15 kg). Huts have duvets but no sheets.', checked: true },
      { kind: 'checklist', text: 'Earplugs' },
      { kind: 'heading3', text: 'Walk' },
      { kind: 'checklist', text: 'Fjällkartan BD6 and a compass' },
      { kind: 'checklist', text: 'Head torch. It is dark by 19:00 up there that late in the season.' },
      { kind: 'checklist', text: 'Two 1-litre bottles. Streams are safe to drink from.', checked: true },
      { kind: 'checklist', text: 'Mosquito head net, in case' },
      { kind: 'checklist', text: 'Power bank, 10,000 mAh' },
      { kind: 'heading3', text: 'Not taking' },
      { kind: 'bullet', text: 'Tent, stove, pots. The huts have them.' },
      { kind: 'bullet', text: 'Water filter. Lucía asked STF, and nobody on the route uses one.' },
    ],
  },
  results: [
    {
      kind: 'paragraph',
      text: 'Nothing walked yet. What is settled so far:',
    },
    { kind: 'bullet', text: 'Route: Abisko to Nikkaluokta, north to south, seven days, 105 km.' },
    { kind: 'bullet', text: 'Nights: STF huts every night, the last one at Kebnekaise fjällstation.' },
    {
      kind: 'bullet',
      text: 'Spent so far: 1,585 SEK each (train 1,190, STF membership 395). Huts will add about 3,200.',
    },
    { kind: 'bullet', text: 'Fitness: a 15 km day hike in the new boots; the heel is fine with tape.' },
  ],
  threads: [
    {
      title: 'Huts or a tent?',
      by: 'lucia',
      posts: [
        {
          by: 'lucia',
          daysAgo: 19,
          text: 'A tent means we can stop anywhere, but it is 2 kg more for one of us. Huts cost about 450 SEK a night as members. What do you think?',
          replies: [
            {
              by: 'me',
              daysAgo: 18,
              text: 'Huts. The stages between them are already the length I want to walk, and a dry room after a wet day matters more to me than stopping anywhere.',
              likes: ['lucia'],
            },
            {
              by: 'lucia',
              daysAgo: 17,
              text: 'Agreed. I checked, and they never turn anyone away, even when full. Worst case is a mattress on the floor.',
            },
          ],
        },
      ],
      resolved: {
        by: 'me',
        daysAgo: 17,
        decision: 'Huts every night, no tent. Only Kebnekaise fjällstation needs booking.',
      },
    },
    {
      title: 'Food: carry it all or buy on the way?',
      by: 'me',
      posts: [
        {
          by: 'me',
          daysAgo: 5,
          text: [
            'Alesjaure and Kebnekaise sell food, but at hut prices. ',
            { mention: 'lucia' },
            ' how much did you carry on the Laugavegur, and would you do it the same way?',
          ],
        },
        {
          by: 'lucia',
          daysAgo: 4,
          hoursAgo: 6,
          text: 'Four days of food, and I regretted the weight on day one. Carry to Alesjaure, buy there, carry to Kebnekaise. It costs more but my knees will thank us.',
          likes: ['me'],
        },
        {
          by: 'me',
          daysAgo: 1,
          text: 'Fine by me. I will buy the first three days here and we split the rest at the huts.',
        },
      ],
    },
  ],
}

const dayByDay: SampleFolder = {
  name: 'Day by day',
  parent: 'Kungsleden hike',
  icon: 'route',
  color: '#3F8F6B',
  description: 'The seven stages, hut to hut.',
  doc: [
    {
      kind: 'paragraph',
      text: 'Distances from the STF hut list. The Tjäktja pass on day four is the highest point, at 1,140 m.',
    },
    { kind: 'numbered', text: 'Abisko to Abiskojaure, 15 km. Flat birch forest along the river, an easy first day after the train.' },
    { kind: 'numbered', text: 'Abiskojaure to Alesjaure, 20 km. The long day. Above the tree line by lunch.' },
    { kind: 'numbered', text: 'Alesjaure to Tjäktja, 13 km. Buy food at Alesjaure first; there is a sauna if we arrive early.' },
    { kind: 'numbered', text: 'Tjäktja to Sälka, 12 km. Over the pass. Start early if the forecast turns.' },
    { kind: 'numbered', text: 'Sälka to Singi, 12 km. Down the Tjäktjavagge valley.' },
    { kind: 'numbered', text: 'Singi to Kebnekaise fjällstation, 14 km. Leave the Kungsleden here and turn east.' },
    { kind: 'numbered', text: 'Kebnekaise fjällstation to Nikkaluokta, 19 km. The 16:30 bus waits for no one.' },
    { kind: 'divider' },
    {
      kind: 'callout',
      text: [
        'A spare day at the fjällstation if we ',
        { text: 'climb Kebnekaise', task: 'Decide whether we climb Kebnekaise' },
        ', or for weather anywhere on the way.',
      ],
    },
  ],
}

export const KUNGSLEDEN: readonly SampleFolder[] = [kungsleden, dayByDay]
