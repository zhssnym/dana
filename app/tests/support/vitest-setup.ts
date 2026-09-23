/*
Runs before every vitest file. One line of policy: a fresh account under
this suite is the empty one its criteria count on, so 7.20's sample
workspace is off here by default. A file that measures the sample passes
`sampleWorkspace: true` to its own application. Read at createApp() call time, like DANA_DEV_LOGIN.
*/
process.env.DANA_SAMPLE_WORKSPACE = 'off'
