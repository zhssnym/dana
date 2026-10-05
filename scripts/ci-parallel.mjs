#!/usr/bin/env node
// Runs several shell commands at once and fails if any of them fails.
//
//   node scripts/ci-parallel.mjs "npm run lint" "npm run typecheck" "npm test"
//
// Each argument is one command, run through the platform shell (cmd on
// Windows, sh elsewhere). Output is streamed line by line with a [label]
// prefix, the label being the command itself or the part before "::" when an
// argument is written "label::command". Every command runs to completion even
// after another has failed, so one run reports every failure rather than the
// first. The exit code is 0 only when every command exited 0.
import { spawn } from 'node:child_process'
import console from 'node:console'
import process from 'node:process'

const specs = process.argv.slice(2).map((arg) => {
  const at = arg.indexOf('::')
  return at > 0 ? { label: arg.slice(0, at), command: arg.slice(at + 2) } : { label: arg, command: arg }
})

if (specs.length === 0) {
  console.error('usage: node scripts/ci-parallel.mjs "<command>" ["<label>::<command>" ...]')
  process.exit(2)
}

const width = Math.max(...specs.map((s) => s.label.length))
const children = new Set()

function pipe(stream, out, prefix) {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) out.write(`${prefix}${line}\n`)
  })
  stream.on('end', () => {
    if (pending !== '') out.write(`${prefix}${pending}\n`)
  })
}

function run({ label, command }) {
  const prefix = `[${label.padEnd(width)}] `
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    children.add(child)
    pipe(child.stdout, process.stdout, prefix)
    pipe(child.stderr, process.stderr, prefix)
    const finish = (code, detail) => {
      children.delete(child)
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      resolve({ label, code, seconds, detail })
    }
    child.on('error', (error) => finish(1, error.message))
    child.on('close', (code, signal) => finish(code ?? 1, signal ? `killed by ${signal}` : ''))
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal)
    process.exit(1)
  })
}

const results = await Promise.all(specs.map(run))

console.log('')
for (const r of results) {
  const verdict = r.code === 0 ? 'ok  ' : `FAIL (exit ${r.code}${r.detail ? `, ${r.detail}` : ''})`
  console.log(`${r.label.padEnd(width)}  ${verdict}  ${r.seconds}s`)
}
process.exit(results.every((r) => r.code === 0) ? 0 : 1)
