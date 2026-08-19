// Shared test harness.
//
// lib/shasn uses extensionless ESM imports (webpack/Next style), which bare Node
// cannot resolve. This copies the tree into a scratch dir with .mjs extensions,
// rewriting specifiers, then hands back the loaded modules.

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', 'lib', 'shasn')

function copyTree(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const s = join(from, entry.name)
    if (entry.isDirectory()) {
      copyTree(s, join(to, entry.name))
    } else if (entry.name.endsWith('.js')) {
      const code = readFileSync(s, 'utf8').replace(
        /from '(\.\.?\/[A-Za-z0-9_/-]+)'/g,
        "from '$1.mjs'"
      )
      writeFileSync(join(to, entry.name.replace(/\.js$/, '.mjs')), code)
    }
  }
}

const out = mkdtempSync(join(tmpdir(), 'shasn-test-'))
copyTree(src, out)

const load = (name) => import(pathToFileURL(join(out, `${name}.mjs`)).href)

export const zones = await load('zones')
export const consts = await load('constants')
export const board = await load('board')
export const majorityTrack = await load('majorityTrack')
export const resources = await load('resources')
export const deck = await load('deck')
export const voterCards = await load('voterCards')
export const ideology = await load('ideology')
export const powers = await load('powers')
export const cards = await load('cards')
export const effects = await load('effects')
export const matStatus = await load('matStatus')
export const trading = await load('trading')
export const twoPlayer = await load('twoPlayer')
export const zoneReqData = await load('data/zoneRequirements')
export const boardGeometry = await load('boardGeometry')
export const setup = await load('setup')
export const game = await load('game')
export const persistence = await load('persistence')
export const conspiracyData = await load('data/conspiracyCards')
export const headlineData = await load('data/headlineCards')
export const voterCardData = await load('data/voterCards')
export const ideologyCardData = await load('data/ideologyCards')

export function cleanup() {
  rmSync(out, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

export function createRunner() {
  let passed = 0
  const failures = []

  function check(name, fn) {
    try {
      const r = fn()
      // An async check would resolve after report() has already run, so its
      // failure would surface as an unhandled rejection long after the suite
      // said everything passed. Refuse them outright rather than lie.
      if (r && typeof r.then === 'function') {
        throw new Error('check() must be synchronous — resolve promises before calling it')
      }
      passed++
    } catch (err) {
      failures.push(`${name}\n    ${err.message}`)
    }
  }

  function report(label) {
    cleanup()
    console.log(`\n  ${label}: ${passed} passed, ${failures.length} failed\n`)
    if (failures.length) {
      for (const f of failures) console.error(`  ✗ ${f}\n`)
      process.exit(1)
    }
  }

  return { check, report }
}

export function eq(actual, expected, what = '') {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${what} expected ${e}, got ${a}`)
}

export function ok(cond, what = '') {
  if (!cond) throw new Error(what || 'expected truthy')
}
