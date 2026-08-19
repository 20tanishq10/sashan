// SHASN — the animations actually fire.
//
// An animation that never triggers is invisible in every other kind of test: it
// compiles, it renders, it passes a snapshot, and the game just quietly does not
// move. An audit found the whole economy silent this way — resources changed
// every turn and the chain never once animated, because nothing was watching.
//
// So these mount the real components, change the model the way the game does,
// and assert the class arrives. The comparisons underneath are pure and tested
// separately in the first section; this section proves they are wired up.
//
// Run with:  node tests/animation.test.mjs

import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import { JSDOM } from 'jsdom'
import { changes as C, createRunner, eq, ok } from './harness.mjs'

const { check, report } = createRunner()

// ---------------------------------------------------------------------------
// The comparisons, as pure logic
// ---------------------------------------------------------------------------

const pool = (o = {}) => ({ funds: 0, clout: 0, media: 0, trust: 0, ...o })

check('a token that arrives is identified by position, not by type', () => {
  // Tokens of a type are interchangeable, so "which one is new" is only
  // answerable positionally: hold 2 Funds, gain 2 more, and the third and fourth
  // Funds in the row are the new ones.
  const before = pool({ funds: 2 })
  const after = pool({ funds: 4 })
  eq([...C.arrivedSlots(before, after)].sort((a, b) => a - b), [2, 3], 'the last two:')
})

check('arrivals account for the layout order, not just the counts', () => {
  // The chain groups by resource in RESOURCE_IDS order, so gaining a Clout when
  // you already hold Funds inserts it after them, not at the end of everything.
  const before = pool({ funds: 2, media: 1 })
  const after = pool({ funds: 2, clout: 1, media: 1 })
  const arrived = [...C.arrivedSlots(before, after)]
  eq(arrived, [2], 'the new Clout sits between the Funds and the Media:')
  eq(C.layoutTokens(after)[2], 'clout', 'and that slot really is the Clout:')
})

check('nothing arrives when nothing changed', () => {
  eq(C.arrivedSlots(pool({ funds: 3 }), pool({ funds: 3 })).size, 0)
})

check('a token that leaves is found in the OLD layout', () => {
  // It has to be, or the ghost flies from wherever the row reflowed to rather
  // than from where the token was actually sitting.
  const before = pool({ funds: 3, trust: 1 })
  const after = pool({ funds: 1, trust: 1 })
  eq([...C.departedSlots(before, after)].sort((a, b) => a - b), [1, 2], 'the last two Funds:')
})

check('spending and gaining at once reports both', () => {
  const before = pool({ funds: 3 })
  const after = pool({ funds: 1, media: 2 })
  eq([...C.departedSlots(before, after)].sort((a, b) => a - b), [1, 2], 'two Funds left:')
  eq([...C.arrivedSlots(before, after)].sort((a, b) => a - b), [1, 2], 'two Media arrived:')
  eq(C.poolDelta(before, after), { funds: -2, media: 2 }, 'net:')
})

check('a replaced market slot is found, and the others left alone', () => {
  eq([...C.replacedSlots(['a', 'b', 'c'], ['a', 'z', 'c'])], [1], 'only the middle:')
  eq([...C.replacedSlots(['a', 'b', 'c'], ['a', 'b', 'c'])], [], 'nothing when unchanged:')
})

check('crossing an unlock threshold is reported once, at the right level', () => {
  eq(C.crossedThresholds({ a: 2 }, { a: 3 }), { a: 3 }, 'level 3:')
  eq(C.crossedThresholds({ a: 4 }, { a: 5 }), { a: 5 }, 'level 5:')
  // Two cards at once can clear both; the bigger unlock is the news.
  eq(C.crossedThresholds({ a: 2 }, { a: 5 }), { a: 5 }, 'both at once:')
  eq(C.crossedThresholds({ a: 3 }, { a: 4 }), {}, 'no threshold between them:')
  eq(C.crossedThresholds({ a: 5 }, { a: 6 }), {}, 'nothing left to cross:')
})

check('newIds returns only what was not there before', () => {
  eq(C.newIds(['a', 'b'], ['a', 'b', 'c']), ['c'])
  eq(C.newIds([], ['a']), ['a'])
  eq(C.newIds(['a'], ['a']), [])
})

// ---------------------------------------------------------------------------
// Mounted: the beats really fire
// ---------------------------------------------------------------------------

const dom = new JSDOM('<!doctype html><body><div id="root"></div>', {
  url: 'https://shasn.test/',
  pretendToBeVisual: true,
})
for (const [k, v] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
  localStorage: dom.window.localStorage,
})) {
  Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true })
}
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = (await import('react')).default
const { act } = await import('react')
const { createRoot } = await import('react-dom/client')

const dir = resolve('node_modules/.shasn-animation')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
const abs = (p) => resolve(process.cwd(), p).replace(/\\/g, '/')

writeFileSync(
  resolve(dir, 'entry.js'),
  `export { default as ResourceChain } from '${abs('components/ResourceChain.js')}'
   export { default as UnlockTrack } from '${abs('components/UnlockTrack.js')}'
   export { default as MatStatus } from '${abs('components/MatStatus.js')}'
   export { default as ShasnBoard } from '${abs('components/ShasnBoard.js')}'
   export { default as VoterCardRow } from '${abs('components/VoterCardRow.js')}'
   export * as VoterData from '${abs('lib/shasn/data/voterCards.js')}'
   export * as B from '${abs('lib/shasn/board.js')}'
   export * as FX from '${abs('lib/shasn/effects.js')}'
   export * as RES from '${abs('lib/shasn/resources.js')}'`
)
await esbuild.build({
  entryPoints: [resolve(dir, 'entry.js')],
  outfile: resolve(dir, 'bundle.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  absWorkingDir: process.cwd(),
  logLevel: 'error',
})
const M = await import(pathToFileURL(resolve(dir, 'bundle.mjs')).href)

const host = dom.window.document.getElementById('root')
const root = createRoot(host)

/** Every shasn-* class currently on screen. */
const anim = () =>
  new Set(
    [...host.querySelectorAll('[class]')]
      .flatMap((n) => [...n.classList])
      .filter((c) => c.startsWith('shasn-'))
  )

/** Render, let effects settle, and report what is animating. */
async function show(el, settleMs = 30) {
  await act(async () => {
    root.render(el)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, settleMs))
  })
  return anim()
}

// Long enough for any beat to have cleared itself. Needed before asserting that
// something did NOT animate: a class from the previous scenario is held for its
// animation's length, so checking too early tests the last change, not this one.
const QUIET = 1000

const chain = (p) => React.createElement(M.ResourceChain, { pool: p, cap: 12 })
const track = (held) => React.createElement(M.UnlockTrack, { held, color: '#3f9e63' })

const player = (patch = {}) => ({
  id: 'p1',
  name: 'Ada',
  pool: pool(),
  resourceCap: 12,
  ideologyCards: [],
  conspiracyCards: [],
  powerUses: {},
  auctionDebt: 0,
  effects: M.FX.emptyEffects(),
  ...patch,
})

// The mounting is done up here, at the top level, because `check` refuses async
// callbacks — an async check resolves after report() has run and its failure
// surfaces as an unhandled rejection long after the suite claimed success.
// So: drive the components first, collect what happened, then assert on it.
const seen = {}

await act(async () => {
  root.render(null)
})
seen.firstRender = await show(chain(pool({ funds: 5, trust: 2 })))

await show(chain(pool({ funds: 1 })))
seen.gained = await show(chain(pool({ funds: 3 })))

await show(chain(pool({ funds: 4 })))
seen.spent = await show(chain(pool({ funds: 1 })))

await show(chain(pool({ funds: 2 })), QUIET)
seen.unchanged = await show(chain(pool({ funds: 2 })))

await show(track(2))
seen.crossed = await show(track(3))

await show(track(3), QUIET)
seen.noCrossing = await show(track(4))

await show(React.createElement(M.MatStatus, { player: player() }))
seen.statusLanded = await show(
  React.createElement(M.MatStatus, { player: player({ auctionDebt: 3 }) })
)

// The Voter Card market: buying a card empties its slot and the deck flips a
// replacement (p.9). Both halves should be visible.
const ids = M.VoterData.VOTER_CARD_IDS
const market = (open) => ({ open, drawPileSize: 40, discard: [] })
const row = (open) =>
  React.createElement(M.VoterCardRow, {
    market: market(open),
    pool: pool({ funds: 9, clout: 9, media: 9, trust: 9 }),
    onSelect: () => {},
  })

const openA = ids.slice(0, 3)
const openB = [openA[0], ids[3], openA[2]] // the middle card is bought and replaced

await show(row(openA), QUIET)
seen.marketReplaced = await show(row(openB))

await show(row(openB), QUIET)
seen.marketSteady = await show(row(openB))

const held = player({ auctionDebt: 3 })
await show(React.createElement(M.MatStatus, { player: held }), QUIET)
seen.statusUnchanged = await show(React.createElement(M.MatStatus, { player: held }))

await act(async () => {
  root.render(null)
})

// ---------------------------------------------------------------------------

check('a resource arriving drops into the chain', () => {
  ok(seen.gained.has('shasn-token-in'), `expected a token to drop in; saw ${[...seen.gained]}`)
})

check('a resource leaving flies off the chain', () => {
  ok(seen.spent.has('shasn-token-out'), `expected a token to leave; saw ${[...seen.spent]}`)
})

check('a chain that has not changed does not animate', () => {
  // The whole point of comparing rather than reacting to renders: an unrelated
  // re-render must not make the mat twitch.
  ok(!seen.unchanged.has('shasn-token-in'), `nothing should arrive; saw ${[...seen.unchanged]}`)
  ok(!seen.unchanged.has('shasn-token-out'), `nothing should leave; saw ${[...seen.unchanged]}`)
})

check('the first render never animates', () => {
  // Otherwise every reload would look like the whole game being dealt out.
  ok(!seen.firstRender.has('shasn-token-in'), `mounting is not an event; saw ${[...seen.firstRender]}`)
})

check('crossing an unlock threshold lights the track', () => {
  ok(seen.crossed.has('shasn-track-hit'), `expected the track to fire; saw ${[...seen.crossed]}`)
})

check('gaining a card without crossing a line stays quiet', () => {
  ok(!seen.noCrossing.has('shasn-track-hit'), `nothing crossed; saw ${[...seen.noCrossing]}`)
})

check('buying a Voter Card empties the slot and flips a replacement', () => {
  ok(
    seen.marketReplaced.has('shasn-card-flip'),
    `expected the replacement to turn up; saw ${[...seen.marketReplaced]}`
  )
  ok(
    seen.marketReplaced.has('shasn-card-leave'),
    `expected the bought card to leave; saw ${[...seen.marketReplaced]}`
  )
})

check('an untouched market does not flip', () => {
  ok(!seen.marketSteady.has('shasn-card-flip'), `nothing bought; saw ${[...seen.marketSteady]}`)
  ok(!seen.marketSteady.has('shasn-card-leave'), `nothing left; saw ${[...seen.marketSteady]}`)
})

check('a status effect landing on you says so', () => {
  ok(
    seen.statusLanded.has('shasn-status-land'),
    `expected the chip to land; saw ${[...seen.statusLanded]}`
  )
})

check('a status that was already there does not re-land', () => {
  ok(
    !seen.statusUnchanged.has('shasn-status-land'),
    `already true; saw ${[...seen.statusUnchanged]}`
  )
})

// ---------------------------------------------------------------------------
// Everything stays switchable off
// ---------------------------------------------------------------------------

check('every new beat is covered by the reduced-motion guard', () => {
  // The guard is a blanket rule over `*`, so anything added is caught by it —
  // but only while that rule stays blanket. Worth pinning.
  const css = readFileSync('styles/globals.css', 'utf8')
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion'))
  ok(block.includes('*, *::before, *::after'), 'the guard applies to everything')
  ok(block.includes('animation-duration'), 'and neutralises animations')

  // And every keyframe the economy added is actually defined.
  for (const name of [
    'shasn-token-in',
    'shasn-token-out',
    'shasn-card-leave',
    'shasn-card-flip',
    'shasn-power-open',
    'shasn-track-hit',
    'shasn-status-land',
  ]) {
    ok(css.includes(`@keyframes ${name}`), `${name} is defined`)
    ok(css.includes(`.${name}`), `${name} has a class to apply it`)
  }
})

check('the motion scale is named rather than scattered', () => {
  const css = readFileSync('styles/globals.css', 'utf8')
  const root = css.match(/:root \{([\s\S]*?)\n\}/)[1]
  for (const token of ['--t-tick', '--t-beat', '--t-move', '--t-story', '--t-stagger']) {
    ok(root.includes(token), `${token} is declared`)
  }
  // Durations should come from the scale, not be typed in by hand.
  const economy = css.slice(css.indexOf('── The economy'), css.indexOf('── Cards and decks'))
  const hardcoded = [...economy.matchAll(/animation:[^;]*?(\d{2,4})ms/g)].map((m) => m[0])
  eq(hardcoded, [], 'hardcoded durations in the economy block:')
})

report('Animation')
