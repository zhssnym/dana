/* The balcony weather station: a curiosity project with a Raspberry Pi,
   halfway through. The sensor reads indoors; next it goes outside. */
import type { SampleFolder } from '../content.js'

const STATION = 'Weather station'
const SHIELD = 'Radiation shield'

const station: SampleFolder = {
  name: STATION,
  icon: 'thermometer',
  color: '#4A7BD0',
  cover: 'colour-blue',
  description: 'A Raspberry Pi on the balcony that tells me what the weather in Södermalm is actually doing.',
  members: ['nadia'],
  purpose: [
    {
      kind: 'paragraph',
      text: 'The forecast says Stockholm; my balcony faces north over Ringvägen and is always colder. I want to measure it myself and understand how the numbers are made.',
    },
    {
      kind: 'paragraph',
      text: [
        { text: 'Done means: ', bold: true },
        'temperature, humidity, pressure and rain logged from the balcony every 5 minutes, and a page I can open on my phone that shows today and the last week.',
      ],
    },
    { kind: 'heading3', text: 'Constraints' },
    { kind: 'bullet', text: 'Under 1 500 kr for parts.' },
    { kind: 'bullet', text: 'Nothing drilled into the railing; the landlord said clamps only.' },
    { kind: 'bullet', text: 'Runs through a Swedish winter, so down to −20 °C and wet.' },
  ],
  doc: [
    { kind: 'section', text: 'Read the air indoors' },
    {
      kind: 'paragraph',
      text: 'Get one sensor talking to the Pi on my desk before anything goes outside.',
    },
    { task: 'Order the parts' },
    { task: 'Solder headers onto the BME280' },
    { task: 'Get the Pi reading the sensor over I2C' },
    { task: 'Log readings to SQLite every 5 minutes' },
    { task: 'Check humidity against the Clas Ohlson hygrometer' },
    { kind: 'section', text: 'Put it outside' },
    {
      kind: 'paragraph',
      text: [
        'The sensor has to sit in shade with air moving past it, or it measures the sun. Design notes are in ',
        { text: SHIELD, page: SHIELD },
        '.',
      ],
    },
    { page: SHIELD },
    { task: 'Seal the box and clamp it to the railing' },
    { task: 'Run a week outdoors against SMHI Bromma' },
    { kind: 'section', text: 'See it from anywhere' },
    {
      kind: 'paragraph',
      text: 'Nadia offered to help with the page. Rain comes last, once the rest is steady.',
    },
    { task: 'Build a page with today’s chart' },
    { task: 'Wire up the rain gauge' },
  ],
  tasks: [
    {
      title: 'Order the parts',
      notes: 'Electrokit for the Pi and sensor, Kjell for the box and glands.',
      doneDaysAgo: 26,
      steps: [
        { title: 'Pi Zero 2 W and power supply', done: true },
        { title: 'BME280 breakout', done: true },
        { title: 'Junction box and PG7 glands', done: true },
      ],
    },
    { title: 'Solder headers onto the BME280', doneDaysAgo: 21 },
    {
      title: 'Get the Pi reading the sensor over I2C',
      notes: 'It answers at 0x76, not 0x77 as the tutorial said. i2cdetect -y 1 found it.',
      doneDaysAgo: 18,
    },
    {
      title: 'Log readings to SQLite every 5 minutes',
      notes: 'A systemd timer runs read.py. One row per reading: time, °C, %RH, hPa.',
      doneDaysAgo: 13,
    },
    {
      title: 'Check humidity against the Clas Ohlson hygrometer',
      notes: 'Within 3 %RH over two days. Good enough.',
      doneDaysAgo: 7,
    },
    {
      title: 'Seal the box and clamp it to the railing',
      notes: 'Two PG7 glands: power in, sensor cable out. Silicone round the lid.',
      important: true,
      due: 5,
    },
    {
      title: 'Run a week outdoors against SMHI Bromma',
      notes: 'Compare hourly values from the SMHI open data API. Expect me to be colder.',
      due: 13,
    },
    {
      title: 'Build a page with today’s chart',
      notes: 'Static page rebuilt every 5 minutes, served from the Pi.',
      assignee: 'nadia',
      start: -2,
      due: 10,
    },
    {
      title: 'Wire up the rain gauge',
      notes: 'Misol tipping bucket, 0.3 mm per tip. Counts on GPIO 17.',
      due: 20,
    },
  ],
  results: [
    { kind: 'heading3', text: 'What works so far' },
    { kind: 'bullet', text: '13 days of readings indoors, about 3 700 rows, no gaps since the timer fix.' },
    { kind: 'bullet', text: 'Pressure matches SMHI Bromma within 0.4 hPa once corrected to sea level.' },
    {
      kind: 'bullet',
      text: 'Inside the closed box the sensor read 1.8 °C high. The Pi warms it. Moving the sensor out on a 30 cm cable fixed it.',
    },
    { kind: 'heading3', text: 'What I have learned' },
    {
      kind: 'paragraph',
      text: 'Measuring temperature is mostly about keeping everything else away from the thermometer: the sun, the wall, the computer doing the measuring.',
    },
  ],
  tab: {
    name: 'Parts',
    blocks: [
      { kind: 'paragraph', text: 'Budget 1 500 kr. Spent 1 012 kr, the rain gauge still to buy.' },
      { kind: 'checklist', checked: true, text: 'Raspberry Pi Zero 2 W — 229 kr' },
      { kind: 'checklist', checked: true, text: 'BME280 breakout, Adafruit 2652 — 219 kr' },
      { kind: 'checklist', checked: true, text: 'SanDisk microSD 32 GB — 99 kr' },
      { kind: 'checklist', checked: true, text: 'Official 5 V 2.5 A power supply — 119 kr' },
      { kind: 'checklist', checked: true, text: 'IP65 junction box 150 × 110 mm — 89 kr' },
      { kind: 'checklist', checked: true, text: 'PG7 cable glands, 4 pack — 39 kr' },
      { kind: 'checklist', checked: true, text: 'M3 threaded rod and nuts — 29 kr' },
      { kind: 'checklist', checked: true, text: 'White PETG filament, 0.5 kg — 189 kr' },
      { kind: 'checklist', checked: false, text: 'Misol WH-SP-RG rain gauge — 349 kr' },
    ],
  },
  threads: [
    {
      title: 'Where should the sensor sit?',
      by: 'me',
      posts: [
        {
          by: 'me',
          daysAgo: 12,
          text: 'The box gets warm from the Pi and the reading goes up almost 2 °C. Sensor inside the box, or out on a cable?',
          replies: [
            {
              by: 'nadia',
              daysAgo: 11,
              text: 'Out on a cable. Even a Pi Zero idling puts out enough heat. Keep the cable under a metre and I2C is fine.',
              likes: ['me'],
            },
            {
              by: 'me',
              daysAgo: 10,
              text: 'Tried 30 cm through a gland. Reading dropped to match the room. Doing that.',
            },
          ],
        },
      ],
      resolved: {
        by: 'me',
        daysAgo: 10,
        decision: 'The sensor goes on a 30 cm cable into its own shield, away from the box, on the shaded end of the railing.',
      },
    },
    {
      title: 'The chart page',
      by: 'nadia',
      posts: [
        {
          by: 'nadia',
          daysAgo: 4,
          text: 'I have a first version: one SVG per day, generated from the SQLite file. No JavaScript at all. Want live updates or is every 5 minutes enough?',
          replies: [
            {
              by: 'me',
              daysAgo: 3,
              text: [
                'Every 5 minutes is plenty, the readings only come that often. ',
                { mention: 'nadia' },
                ' could it show the week too, as a thin line under today?',
              ],
            },
            {
              by: 'nadia',
              daysAgo: 1,
              hoursAgo: 5,
              text: 'Yes. Pushing it tonight, then you can try it on your phone.',
              likes: ['me'],
            },
          ],
        },
      ],
    },
  ],
}

const shield: SampleFolder = {
  name: SHIELD,
  parent: STATION,
  icon: 'sunrise',
  color: '#4A7BD0',
  description: 'A stack of white plates that keeps the sun off the sensor.',
  doc: [
    {
      kind: 'paragraph',
      text: 'A Stevenson screen is too big for a balcony, so I am printing a small stack of louvred plates instead. Air passes between them; direct sun never reaches the sensor.',
    },
    { kind: 'bullet', text: 'Six plates, 110 mm across, 12 mm apart, in white PETG.' },
    { kind: 'bullet', text: 'Held together with three M3 rods; the sensor hangs in the middle.' },
    { kind: 'bullet', text: 'Mounted at least 30 cm from the wall, which stores heat all afternoon.' },
    { task: 'Print and assemble the shield' },
  ],
  tasks: [
    {
      title: 'Print and assemble the shield',
      notes: 'About 3 hours per plate at 0.2 mm layers on the library’s Prusa.',
      start: -3,
      due: 3,
      steps: [
        { title: 'Print six plates', done: true },
        { title: 'Sand the edges' },
        { title: 'Thread the M3 rods and set the spacing' },
      ],
    },
  ],
}

export const WEATHER_STATION: readonly SampleFolder[] = [station, shield]
