// Runs vitest and fails when a file did not run. A dead worker can lose files while vitest exits 0.
import { spawn } from 'node:child_process'
import process from 'node:process'
import { URL, fileURLToPath } from 'node:url'

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')
const SUMMARY = /^\s*(Test Files|Tests)\s+(.+?)\s+\((\d+)\)\s*$/

/* Spawn vitest's entry with this node: a .cmd shim fails with EINVAL on Windows. */
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const child = spawn(process.execPath, [vitest, 'run', ...process.argv.slice(2)], {
  stdio: ['inherit', 'pipe', 'pipe'],
})

let output = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    output += chunk
    process.stdout.write(chunk)
  })
}

child.on('close', (code) => {
  if (code !== 0) process.exit(code ?? 1)
  const missing = []
  for (const line of output.split(/\r?\n/)) {
    const match = SUMMARY.exec(line.replace(ANSI, ''))
    if (match === null) continue
    const [, what, body, total] = match
    const counted = [...body.matchAll(/(\d+)\s+\w+/g)].reduce((sum, m) => sum + Number(m[1]), 0)
    if (counted > 0 && counted !== Number(total)) missing.push(`${what}: collected ${total}, reported ${counted}.`)
  }
  if (missing.length === 0) process.exit(0)
  process.stderr.write(
    `\nVitest exited 0, but some files did not run:\n${missing.map((l) => `  ${l}\n`).join('')}` +
      'Look above for "Worker exited unexpectedly". Run those files alone.\n',
  )
  process.exit(1)
})
