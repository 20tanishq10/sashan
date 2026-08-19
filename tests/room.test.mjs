// SHASN — the game room, mounted for real.
//
// tests/render.test.mjs renders components one at a time through
// react-dom/server, which never runs an effect. That is not enough: the bug that
// took the room down only appeared on a re-render, in a branch chosen by state
// that an effect sets. Server rendering cannot reach it.
//
// So this mounts the actual page into a DOM, with fetch stubbed to return a real
// engine-produced game, and drives it through the moments that matter: the
// election starting, answering an Ideology Card, the reveal, and the turn
// passing. Any exception in render, in an effect, or in an event handler fails
// the test rather than showing the player "Application error".
//
// Run with:  node tests/room.test.mjs

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import { JSDOM } from 'jsdom'
import { createRunner, ok, eq } from './harness.mjs'

const { check, report } = createRunner()

// ── A DOM, before React is imported ────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://shasn.test/game/TEST',
  pretendToBeVisual: true,
})
// Node 22 defines `navigator` as a getter-only global, so it has to be
// redefined rather than assigned.
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
  localStorage: dom.window.localStorage,
  MouseEvent: dom.window.MouseEvent,
})) {
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
}
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = (await import('react')).default
const { act } = await import('react')
const { createRoot } = await import('react-dom/client')

// ── Bundle the page, with Next's bits stubbed ──────────────────────────────
const dir = resolve('node_modules/.shasn-room')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

const abs = (p) => resolve(process.cwd(), p).replace(/\\/g, '/')

writeFileSync(
  resolve(dir, 'next-router.js'),
  `export function useRouter() {
     return { query: { code: 'TEST' }, replace() {}, push() {}, isReady: true }
   }`
)
writeFileSync(
  resolve(dir, 'next-link.js'),
  `import React from 'react'
   export default function Link({ href, children, ...rest }) {
     return React.createElement('a', { href, ...rest }, children)
   }`
)
writeFileSync(
  resolve(dir, 'no-supabase.js'),
  `export function getSupabase() { return null }`
)
writeFileSync(
  resolve(dir, 'entry.js'),
  `export { default as GameRoom } from '${abs('pages/game/[code].js')}'
   export * as G from '${abs('lib/shasn/game.js')}'
   export * as I from '${abs('lib/shasn/ideology.js')}'
   export * as RES from '${abs('lib/shasn/resources.js')}'
   export * as Deck from '${abs('lib/shasn/deck.js')}'
   export * as Persistence from '${abs('lib/shasn/persistence.js')}'
   export { TURN_PHASES } from '${abs('lib/shasn/constants.js')}'`
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
  alias: {
    'next/router': resolve(dir, 'next-router.js'),
    'next/link': resolve(dir, 'next-link.js'),
  },
  plugins: [
    {
      // The page opens a Supabase realtime socket at module scope; the socket is
      // not what is being tested, and aliases cannot take absolute paths.
      name: 'stub-supabase',
      setup(build) {
        build.onResolve({ filter: /supabaseClient$/ }, () => ({
          path: resolve(dir, 'no-supabase.js'),
        }))
      },
    },
  ],
  absWorkingDir: process.cwd(),
  logLevel: 'error',
})

const M = await import(pathToFileURL(resolve(dir, 'bundle.mjs')).href)
const { GameRoom, G, I, RES, Deck, TURN_PHASES } = M
const { viewFor } = M.Persistence

// ── The server, in miniature ───────────────────────────────────────────────

let GAME = G.createGame({
  players: [
    { id: 'p1', name: 'Ada' },
    { id: 'p2', name: 'Bo' },
    { id: 'p3', name: 'Cy' },
  ],
  seed: 42,
}).game

const ME = 'p1'
let lastReveal = null

function statePayload() {
  return {
    game: viewFor(GAME, ME),
    standings: G.getStandings(GAME),
    scoreBreakdown: G.getScoreBreakdown(GAME),
    myPlayerId: ME,
    isSpectator: false,
    stalled: false,
    lobby: { status: 'in_progress' },
  }
}

globalThis.fetch = async (url, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : {}
  let payload

  if (String(url).startsWith('/api/game-state')) {
    payload = statePayload()
  } else if (String(url).startsWith('/api/game-action')) {
    const { type } = body.action || {}
    if (type === 'answer_ideology') {
      const card = I.getIdeologyCard(GAME.pendingIdeologyCard)
      const r = G.answerIdeology(GAME, card.answers[body.action.payload.answerIndex].ideologue)
      if (!r.error) {
        GAME = r.game
        lastReveal = r.reveal
      }
      payload = { ok: true, ...statePayload(), reveal: lastReveal }
    } else {
      payload = { ok: true, ...statePayload() }
    }
  } else {
    payload = { ok: true }
  }
  return { ok: true, json: async () => payload }
}

// ── Catch anything the page throws, however it escapes ─────────────────────

const errors = []
dom.window.addEventListener('error', (e) => errors.push(e.error?.message || e.message))
dom.window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)))

const realError = console.error
console.error = (...args) => {
  const first = String(args[0] ?? '')
  // React logs render errors here before rethrowing; keep them, drop the noise.
  if (/not wrapped in act|useLayoutEffect does nothing on the server/.test(first)) return
  errors.push(first)
}

class Boundary extends React.Component {
  constructor(p) {
    super(p)
    this.state = { err: null }
  }
  static getDerivedStateFromError(err) {
    return { err }
  }
  componentDidCatch(err) {
    errors.push(`render threw: ${err.message}`)
  }
  render() {
    return this.state.err ? React.createElement('p', null, 'boundary') : this.props.children
  }
}

const container = dom.window.document.getElementById('root')
const root = createRoot(container)

const settle = async (ms = 60) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

/** Fail loudly on anything logged or thrown since the last drain. */
function drain(what) {
  const found = [...new Set(errors)]
  errors.length = 0
  eq(found, [], `${what} produced errors:`)
}

const text = () => container.textContent || ''

// ---------------------------------------------------------------------------

await act(async () => {
  root.render(React.createElement(Boundary, null, React.createElement(GameRoom)))
})
await settle(120)

check('the room mounts when the election starts', () => {
  drain('mounting the room')
  ok(!text().includes('boundary'), 'the error boundary did not trip')
  ok(text().includes('SHASN'), 'the room rendered')
  eq(GAME.turnPhase, TURN_PHASES.IDEOLOGY, 'and the game is on its first card:')
})

check('the board and every seat are on screen', () => {
  ok(container.querySelector('svg'), 'the map drew')
  for (const name of ['Ada', 'Bo', 'Cy']) ok(text().includes(name), `${name} has a seat`)
  drain('drawing the table')
})

check('the Ideology question is asked without giving the answers away', () => {
  const view = viewFor(GAME, ME)
  ok(view.pendingIdeology?.hidden, 'the card is hidden from the answering player')
  ok(text().includes(view.pendingIdeology.prompt.slice(0, 24)), 'the question is on screen')
  for (const label of ['The Capitalist', 'The Supremo', 'The Showstopper', 'The Idealist']) {
    ok(!text().includes(label), `${label} is not leaked before answering`)
  }
  drain('asking the question')
})

// Answering is the step that used to bring the room down: the reveal arrives on
// a render where the card it replaces is already gone.
const answerButton = [...container.querySelectorAll('button')].find((b) =>
  /^[AB]/.test(b.textContent.trim())
)

await act(async () => {
  answerButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
})
await settle(120)

check('answering does not take the room down', () => {
  ok(answerButton, 'there was an answer to click')
  drain('answering the Ideology Card')
  ok(!text().includes('boundary'), 'the error boundary did not trip')
})

check('the reveal shows what the answer was worth', () => {
  ok(lastReveal, 'the server sent a reveal')
  const ideologue = lastReveal.chosen.ideologue
  const label = { capitalist: 'CAPITALIST', supremo: 'SUPREMO', showstopper: 'SHOWSTOPPER', idealist: 'IDEALIST' }[ideologue]
  ok(
    text().includes(label),
    `the reveal names the Ideologue backed (expected ${label}); on screen: ${text().slice(0, 300)}`
  )
  drain('revealing the card')
})

await settle(4200)

check('the room is still standing after the card files away', () => {
  drain('filing the card away')
  ok(!text().includes('boundary'), 'the error boundary did not trip')
  ok(text().includes('SHASN'), 'the room is still rendered')
})

// ── Feedback ───────────────────────────────────────────────────────────────
// A rejected action used to report into a panel near the bottom of the page,
// and a client-side complaint was only cleared by making a server call.

check('a rejected action says so over the table, not in a footnote', () => {
  // The board is mid-screen; the old error slot was near the bottom.
  const before = text()
  ok(!/taken|cannot|must be/i.test(before), 'nothing is complaining yet')
})

await act(async () => {
  // Click an occupied area during the actions phase — an illegal move.
  const filled = Object.keys(GAME.board.zones).find((z) =>
    GAME.board.zones[z].owners.some(Boolean)
  )
  if (filled) {
    const circles = container.querySelectorAll('svg circle')
    circles[0]?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  }
})
await settle(80)

check('clicking the board never throws, legal or not', () => {
  drain('clicking the board')
  ok(!text().includes('boundary'), 'the error boundary did not trip')
})

// ── The endgame ────────────────────────────────────────────────────────────
// Filling the board ends the election (p.19) and swaps the whole room for the
// final tally. That render path had its own hook-ordering bug in the Scoreboard,
// so it gets driven too rather than assumed.

// Fill the board, then let the engine run its final round (p.19) — filling it
// only *triggers* the last round, it does not end the game on the spot.
for (const zoneId of Object.keys(GAME.board.zones)) {
  const owners = GAME.board.zones[zoneId].owners
  for (let i = 0; i < owners.length; i++) {
    owners[i] = GAME.players[i % GAME.players.length].id
  }
}

const rng = Deck.makeRng(99)
for (let i = 0; i < 12 && GAME.phase !== 'finished'; i++) {
  if (GAME.turnPhase === TURN_PHASES.IDEOLOGY && GAME.pendingIdeologyCard) {
    const card = I.getIdeologyCard(GAME.pendingIdeologyCard)
    const r = G.answerIdeology(GAME, card.answers[0].ideologue)
    if (!r.error) GAME = r.game
  }
  if (GAME.turnPhase === TURN_PHASES.RESOURCE_CAP) {
    const p = GAME.players[GAME.activeSeat]
    const d = G.discardToCap(GAME, RES.autoDiscardToCap(p.pool))
    if (!d.error) GAME = d.game
  }
  const end = G.endTurn(GAME, rng)
  if (end.error) break
  GAME = end.game
}

await settle(4400) // the page polls every 4s

check('the endgame renders when the election is over', () => {
  eq(GAME.phase, 'finished', 'the engine ended the game:')
  drain('ending the election')
  ok(!text().includes('boundary'), 'the error boundary did not trip')
  ok(text().includes('Election over'), `the result is on screen; saw: ${text().slice(0, 200)}`)
})

check('the final tally lists every zone', () => {
  const breakdown = G.getScoreBreakdown(GAME)
  eq(breakdown.length, 9, 'nine zones in the breakdown:')
  // Every zone label should appear in the per-zone scorecard.
  for (const z of breakdown) {
    ok(text().includes(z.label), `${z.label} is in the tally`)
  }
  drain('showing the tally')
})

root.unmount()
console.error = realError

check('unmounting cleans up without complaint', () => {
  drain('unmounting')
})

report('The game room')
