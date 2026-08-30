/*
Runs before every vitest file. One line of policy: a fresh account under
this suite is the empty one its criteria have counted on since AC-005, so
RFC 0005 change control item 60's sample workspace is off here by default.
The file that measures the sample, AC-297 to AC-302, passes
`sampleWorkspace: true` to its own application and is the only one that
sees it. Read at createApp() call time, like DANA_DEV_LOGIN.
*/
process.env.DANA_SAMPLE_WORKSPACE = 'off'
