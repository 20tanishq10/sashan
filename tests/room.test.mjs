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
   export * as Rounds from '${abs('lib/shasn/rounds.js')}'
   export { TURN_PHASES, IDEOLOGUES } from '${abs('lib/shasn/constants.js')}'`
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
  // This check used to search the whole page for the Ideologue's name, and so
  // passed on the four panel headings inside the full player mat rather than on
  // the reveal. When the mat was removed it failed and exposed the real bug:
  // answering clears game.pendingIdeology, and the page unmounted the prompt in
  // the same commit the reveal arrived. So it now looks inside the card.
  ok(lastReveal, 'the server sent a reveal')
  const ideologue = lastReveal.chosen.ideologue
  // The card prints the Ideologue's real label ("The Supremo"). The old check
  // wanted "SUPREMO", which only ever existed as a CSS text-transform on the
  // mat headings — more evidence it was reading the wrong element.
  const label = M.IDEOLOGUES[ideologue].label

  const card = container.querySelector('.shasn-card-reveal, .shasn-card-file')
  ok(card, 'the reveal card is on screen at all')
  ok(
    card.textContent.toLowerCase().includes(label.toLowerCase()),
    `and names the Ideologue backed (expected ${label}); card said: ${card.textContent.slice(0, 200)}`
  )
  drain('revealing the card')
})

await settle(4200)

check('the room is still standing after the card files away', () => {
  drain('filing the card away')
  ok(!text().includes('boundary'), 'the error boundary did not trip')
  ok(text().includes('SHASN'), 'the room is still rendered')
})

// ── Nothing empty takes up room ────────────────────────────────────────────
// Roughly 450px of the scarce vertical dimension was being spent announcing
// that there was no auction, no gerrymandering right and no conspiracy card in
// hand. Two of those headings rendered whether or not they had anything under
// them. The board is portrait, so that height came straight out of the game.

check('an absent thing gets no heading and no box', () => {
  const t = text()

  // A fresh game: nobody holds a majority, so nobody has gerrymandering rights,
  // and nobody has bought a conspiracy yet.
  ok(!t.includes('No rights'), 'no "you have no rights" line')
  ok(
    !t.includes('Conspiracy Cards in hand'),
    'no conspiracy heading over an empty hand'
  )
  ok(!t.includes('No auction running'), 'no box explaining that nothing is happening')
  ok(
    !t.includes('No action points'),
    'the standing rule about action points belongs in the rulebook, not the turn'
  )
  drain('checking for empty furniture')
})

check('the things that ARE true still show', () => {
  // The guard against over-correcting: hiding empty states must not hide real
  // ones. Whatever phase we are in, the room still says whose turn it is.
  const t = text()
  ok(/Your turn|is playing/.test(t), `the turn is stated; saw: ${t.slice(0, 120)}`)
  ok(t.includes('SHASN'), 'and the room is still rendered')
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

// ── The new room ───────────────────────────────────────────────────────────
// The page was one column of stacked panels on a board that is portrait, so
// height was the scarce dimension and it was being spent on furniture. These
// check the three regions it became, and the three things they made possible.

check('the room is three columns with the mat docked', () => {
  ok(container.querySelector('.room'), 'the shell is there')
  ok(container.querySelector('.room-stage'), 'and the stage inside it')
  ok(container.querySelector('.room-rail'), 'the rivals have their own column')
  ok(container.querySelector('.room-board'), 'the board has the middle')
  drain('laying out the room')
})

check('every rival is in the rail, and I am not', () => {
  const rail = container.querySelector('.room-rail')
  const t = rail.textContent
  ok(t.includes('Bo') && t.includes('Cy'), 'the rivals are in the rail')
  ok(!t.includes('Ada'), 'and I am in the dock, not among them')
})

// Clicking a rival should light their territory and drop everything else. The
// point is to answer "where is Bo actually strong" by looking rather than
// counting.
const rivalSeat = [...container.querySelectorAll('[role="button"][aria-pressed]')][0]

await act(async () => {
  rivalSeat?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
})
await settle(80)

check('clicking a rival lights their territory', () => {
  ok(rivalSeat, 'there was a rival to click')
  drain('focusing a rival')
  eq(rivalSeat.getAttribute('aria-pressed'), 'true', 'the seat is held down:')
  ok(/Showing|territory/i.test(text()), 'and the room says whose territory is showing')
})

await act(async () => {
  rivalSeat?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
})
await settle(80)

check('clicking the same rival again releases the board', () => {
  eq(rivalSeat.getAttribute('aria-pressed'), 'false', 'the seat came back up:')
  drain('releasing the focus')
})

// Hovering a zone should answer what the plaque cannot: how many to hold it,
// how many are left, and what that means for me.
const zoneGroup = container.querySelector('svg g[opacity]')

await act(async () => {
  const ev = new dom.window.MouseEvent('mouseover', { bubbles: true })
  Object.defineProperty(ev, 'type', { value: 'mouseenter' })
  zoneGroup?.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }))
})
await settle(60)

check('hovering the board never throws', () => {
  // React attaches mouseenter through its own synthetic system, which jsdom
  // does not always deliver from a raw event. What this can prove is that the
  // hover path is wired and harmless; the zone card content itself is checked
  // directly in tests/render.test.mjs.
  drain('hovering a zone')
  ok(!text().includes('boundary'), 'the error boundary did not trip')
})

check('the mat is docked at the bottom, with the commands on it', () => {
  const dock = container.querySelector('.room-dock, .room-dock--full, .room-dock--summary')
  ok(dock, 'the dock is there')
  ok(text().includes('Ada'), 'my mat is in it')
  ok(/End turn/i.test(text()), 'and so is the way to finish')
  drain('checking the dock')
})

// ── A card going round the table ───────────────────────────────────────────
// Submerged and A Trip To Goalpara are the one state where you must act and it
// is NOT your turn. Everything else on this page is gated on isMyTurn, so this
// is exactly the sort of thing that renders as a dead panel.

GAME = {
  ...GAME,
  round: M.Rounds.openRound({
    kind: 'cashOutVoter',
    cardId: 'a_trip_to_goalpara',
    cardName: 'A Trip To Goalpara',
    queue: ['p2', 'p1'],
    options: { holdRefill: true },
  }),
}
await settle(4300) // the page polls every 4s; a server-side change needs one

check("someone else's slot renders without offering me controls", () => {
  drain('a round on somebody else')
  const t = text()
  ok(t.includes('A Trip To Goalpara'), 'the card is named')
  ok(t.includes('Bo'), 'and whose slot it is')
  ok(!/Click one of the open Voter Cards/.test(t), 'but I am not told to act')
})

GAME = { ...GAME, round: { ...GAME.round, queue: ['p1'], acted: [{ playerId: 'p2', action: 'act' }] } }
await settle(4300) // the page polls every 4s; a server-side change needs one

check('my slot tells me what to do, even though it is not my turn', () => {
  drain('my slot in a round')
  const t = text()
  ok(/Click one of the open Voter Cards/.test(t), `I am told to act; saw: ${t.slice(0, 200)}`)
  ok(/Pass/.test(t), 'and given a way out')
  ok(!text().includes('boundary'), 'the error boundary did not trip')
})

check('the round is the first thing in the rail, above everything else', () => {
  // It blocks the whole game — nothing else you could be asked to do outranks it.
  const rail = container.querySelector('.room-rail')
  const idx = rail.textContent.indexOf('A Trip To Goalpara')
  ok(idx >= 0 && idx < 80, `near the top of the rail; found at ${idx}`)
})

GAME = { ...GAME, round: null }
await settle(4300) // the page polls every 4s; a server-side change needs one

check('the panel goes when the round closes', () => {
  ok(!text().includes('A Trip To Goalpara'), 'no leftover furniture')
  drain('closing the round')
})

// ── Jumla ──────────────────────────────────────────────────────────────────

GAME = {
  ...GAME,
  players: GAME.players.map((p) =>
    p.id === 'p2'
      ? { ...p, ideologyCards: [...p.ideologyCards, { cardId: 'jumla', ideologue: 'capitalist', jumla: true }] }
      : p
  ),
}
await settle(4300) // the page polls every 4s; a server-side change needs one

check('Jumla in a rival stack can be bought from where I am sitting', () => {
  drain('Jumla on the table')
  const t = text()
  ok(/Take Jumla/.test(t), `the option is offered; saw: ${t.slice(0, 200)}`)
  ok(!text().includes('boundary'), 'the error boundary did not trip')
})

GAME = { ...GAME, players: GAME.players.map((p) => ({ ...p, ideologyCards: p.ideologyCards.filter((e) => e.cardId !== 'jumla') })) }
await settle(4300) // the page polls every 4s; a server-side change needs one

check('and the option goes when Jumla leaves play', () => {
  ok(!/Take Jumla/.test(text()), 'no offer to buy a card nobody holds')
  drain('Jumla gone')
})

// ── The dock is a bar, and nothing was stranded on the mat ─────────────────
//
// The full mat took 374px on a 936px screen — 40% of the viewport — and the
// board is portrait, so that height was the only thing deciding its width. The
// mat is gone. The danger of deleting a surface is that whatever lived on it
// quietly becomes unreachable, which is exactly what would have happened to the
// Ideologue powers and to the cap-discard flow.

GAME = {
  ...GAME,
  players: GAME.players.map((p) =>
    p.id === 'p1'
      ? {
          ...p,
          ideologyCards: [
            { cardId: 'a', ideologue: 'capitalist' },
            { cardId: 'b', ideologue: 'capitalist' },
            { cardId: 'c', ideologue: 'capitalist' },
          ],
        }
      : p
  ),
}
await settle(4300) // the page polls every 4s

check('an unlocked power is reachable without the mat', () => {
  // Prospecting used to be a button inside the full mat and nowhere else.
  drain('unlocking a power')
  ok(/Prospecting/i.test(text()), `the power is offered; saw: ${text().slice(0, 220)}`)
})

check('the power sits in the dock with the other actions, not in a panel', () => {
  const dock = container.querySelector('.room-dock--summary')
  ok(dock, 'the dock is a bar')
  ok(/Prospecting/i.test(dock.textContent), 'and the power is in it')
  ok(/End turn/i.test(dock.textContent), 'next to the way to finish')
})

check('the full mat is gone entirely, not merely hidden', () => {
  // Hidden-but-rendered is how a "removed" surface comes back on somebody
  // else's screen: one media query away from stealing the height again.
  ok(!container.querySelector('.room-dock--full'), 'no full mat in the DOM at all')
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
