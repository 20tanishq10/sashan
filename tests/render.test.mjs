// SHASN — the game room actually renders.
//
// Every other test in this suite exercises the engine, which is pure and easy to
// check. The UI had nothing, and it showed: a redesign shipped a client-side
// exception that took down the whole room the moment an election started, past a
// clean `next build` and a clean esbuild parse. Neither of those runs a single
// component.
//
// So this renders the real components with a real engine-produced game, through
// react-dom/server. It will not catch a layout mistake, but it catches the thing
// that actually broke: a component that throws.
//
// Run with:  node tests/render.test.mjs

import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import { createRunner, ok, eq } from './harness.mjs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const { check, report } = createRunner()

// Node cannot import JSX, so bundle every component and the engine into one
// module first, with React left external so it stays a single instance.
// Inside node_modules so the bundle can still resolve `react` from here; the
// system temp dir is outside the project and cannot.
const dir = resolve('node_modules/.shasn-render')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
const components = readdirSync('components').filter((f) => f.endsWith('.js'))
// The entry lives in a temp dir, so every path in it has to be absolute.
const abs = (p) => resolve(process.cwd(), p).replace(/\\/g, '/')

writeFileSync(
  join(dir, 'entry.js'),
  [
    ...components.map(
      (f) => `export { default as ${f.replace('.js', '')} } from '${abs('components/' + f)}'`
    ),
    `export * as G from '${abs('lib/shasn/game.js')}'`,
    `export * as I from '${abs('lib/shasn/ideology.js')}'`,
    `export * as R from '${abs('lib/shasn/resources.js')}'`,
    `export * as Setup from '${abs('lib/shasn/setup.js')}'`,
    `export * as Persistence from '${abs('lib/shasn/persistence.js')}'`,
    `export * as Parties from '${abs('lib/shasn/parties.js')}'`,
    `export * as Zones from '${abs('lib/shasn/zones.js')}'`,
    `export { TURN_PHASES } from '${abs('lib/shasn/constants.js')}'`,
  ].join('\n')
)

await esbuild.build({
  entryPoints: [join(dir, 'entry.js')],
  outfile: join(dir, 'bundle.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'next/link', 'next/router'],
  absWorkingDir: process.cwd(),
  logLevel: 'error',
})

const M = await import(pathToFileURL(join(dir, 'bundle.mjs')).href)
const { G, I, R, Setup, TURN_PHASES } = M
const { viewFor } = M.Persistence


// ---------------------------------------------------------------------------
// A real game, a few turns in, so the components see populated state rather
// than the empty board they would get at turn 1.
// ---------------------------------------------------------------------------

function playedGame() {
  let { game, rng } = G.createGame({
    players: [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
      { id: 'p3', name: 'Cy' },
    ],
    seed: 42,
  })

  for (let i = 0; i < 6; i++) {
    if (game.turnPhase === TURN_PHASES.IDEOLOGY) {
      const card = I.getIdeologyCard(game.pendingIdeologyCard)
      const r = G.answerIdeology(game, card.answers[i % 2].ideologue)
      if (r.error) break
      game = r.game
    }
    if (game.turnPhase === TURN_PHASES.RESOURCE_CAP) {
      game = G.discardToCap(game, R.autoDiscardToCap(G.activePlayer(game).pool)).game
    }
    const end = G.endTurn(game, rng)
    if (end.error) break
    game = end.game
  }

  // Put voters on the board so zones, majorities and plaques all have something
  // to draw — an empty board exercises almost nothing.
  const zones = Object.keys(game.board.zones)
  let seat = 0
  for (const zoneId of zones.slice(0, 4)) {
    const owners = game.board.zones[zoneId].owners
    for (let i = 0; i < owners.length; i++) {
      if (i % 3 === 0) owners[i] = game.players[seat++ % game.players.length].id
    }
  }
  return game
}

const GAME = playedGame()
const ME = GAME.players[0]
const STANDINGS = G.getStandings(GAME)
const BREAKDOWN = G.getScoreBreakdown(GAME)
const colorOf = (id) => ['#d2503c', '#2f6feb', '#1f8a5c'][GAME.players.findIndex((p) => p.id === id)]

/** Render, and surface the real error rather than a generic failure. */
function render(label, el) {
  try {
    const html = renderToStaticMarkup(el)
    ok(html.length > 0, `${label} produced no markup`)
    return html
  } catch (e) {
    throw new Error(`${label} threw: ${e.message}`)
  }
}

// ---------------------------------------------------------------------------

check('every party emblem draws', () => {
  const PartyEmblem = M.PartyEmblem
  for (const id of M.Parties.PARTY_IDS) {
    const html = render(`PartyEmblem ${id}`, React.createElement(PartyEmblem, { party: id, size: 20 }))
    ok(html.includes('<svg'), `${id} drew an svg`)
    ok(/<(path|ellipse|circle|rect)/.test(html), `${id} drew a shape rather than an empty frame`)
  }
})

check('a majority voter is turned over and shows its emblem', () => {
  // p.7 — the token is physically flipped. On screen that means a pale face with
  // the owner's colour as a thick rim, and the party emblem showing. It is the
  // only token on the map worth a point, so it is the only one that carries a mark.
  const ShasnBoard = M.ShasnBoard
  const board = JSON.parse(JSON.stringify(GAME.board))
  const zoneId = Object.keys(board.zones)[0]
  const owners = board.zones[zoneId].owners
  for (let i = 0; i < owners.length; i++) owners[i] = 'p1' // a guaranteed majority

  const html = render(
    'ShasnBoard with a majority',
    React.createElement(ShasnBoard, { board, players: GAME.players, colorOf, selectedAreas: [] })
  )
  ok(html.includes('MAJORITY'), 'the plaque says so')
  ok(html.includes('#ffffff'), 'the flipped face is pale')
})

check('a Volatile Area stays marked once someone occupies it', () => {
  // Its voters are immune to gerrymandering (p.15-16), so the marker has to
  // outlive the Headline it triggered. It used to vanish the moment it was used.
  const ShasnBoard = M.ShasnBoard
  const { ZONES } = M.Zones
  const zoneId = Object.keys(GAME.board.zones).find((z) => ZONES[z].volatile.length > 0)
  const index = ZONES[zoneId].volatile[0]

  const occupied = JSON.parse(JSON.stringify(GAME.board))
  occupied.zones[zoneId].owners[index] = 'p2'

  const el = (board) =>
    React.createElement(ShasnBoard, { board, players: GAME.players, colorOf, selectedAreas: [] })

  const dashes = (html) => (html.match(/stroke-dasharray="6 4"/g) || []).length
  const empty = dashes(render('board, volatile empty', el(GAME.board)))
  const held = dashes(render('board, volatile held', el(occupied)))

  ok(empty > 0, 'volatile areas are marked when empty')
  eq(held, empty, 'and still marked once occupied:')
})

check('the board renders with voters, majorities and plaques', () => {
  const ShasnBoard = M.ShasnBoard
  const html = render(
    'ShasnBoard',
    React.createElement(ShasnBoard, {
      board: GAME.board,
      players: GAME.players,
      colorOf,
      onAreaClick: () => {},
      selectedAreas: [],
    })
  )
  ok(html.includes('<svg'), 'drew an svg')
  ok(html.includes('MAJORITY') || html.includes('needed'), 'drew zone plaques')
})

check('the board survives a state change, which is what drives the animations', () => {
  const ShasnBoard = M.ShasnBoard
  const before = JSON.parse(JSON.stringify(GAME.board))
  const zoneId = Object.keys(before.zones)[0]
  before.zones[zoneId].owners[1] = null // so the diff sees an arrival

  const el = (board) =>
    React.createElement(ShasnBoard, { board, players: GAME.players, colorOf, selectedAreas: [] })
  render('ShasnBoard (before)', el(before))
  render('ShasnBoard (after)', el(GAME.board))
})

check('a full player mat renders', () => {
  const PlayerMat = M.PlayerMat
  const html = render(
    'PlayerMat full',
    React.createElement(PlayerMat, {
      player: ME,
      color: colorOf(ME.id),
      isActive: true,
      isYou: true,
      score: 4,
      variant: 'full',
      powerActionFor: () => 'prospect',
      onUsePower: () => {},
    })
  )
  ok(html.includes(ME.name), 'named the player')
})

check('a compact opponent mat renders', () => {
  const PlayerMat = M.PlayerMat
  render(
    'PlayerMat compact',
    React.createElement(PlayerMat, {
      player: GAME.players[1],
      color: colorOf(GAME.players[1].id),
      variant: 'compact',
      score: 2,
    })
  )
})

check('the mat renders from a redacted opponent view', () => {
  // Online, opponents arrive with `conspiracyCardCount` and no `conspiracyCards`.
  const PlayerMat = M.PlayerMat
  const view = viewFor(GAME, 'p1')
  const them = view.players.find((p) => p.id === 'p2')
  render(
    'PlayerMat redacted',
    React.createElement(PlayerMat, { player: them, color: '#2f6feb', variant: 'compact', score: 1 })
  )
})

check('the resource chain renders, including over cap', () => {
  const ResourceChain = M.ResourceChain
  render('ResourceChain', React.createElement(ResourceChain, { pool: ME.pool, cap: ME.resourceCap }))
  render(
    'ResourceChain over cap',
    React.createElement(ResourceChain, {
      pool: { funds: 6, clout: 5, media: 3, trust: 1 },
      cap: 12,
      onTokenClick: () => {},
      selected: { funds: 1, clout: 0, media: 0, trust: 0 },
    })
  )
})

check('the deck strip renders from redacted counts', () => {
  const DeckStrip = M.DeckStrip
  const view = viewFor(GAME, 'p1')
  render(
    'DeckStrip',
    React.createElement(DeckStrip, {
      conspiracyDeck: view.conspiracyDeck,
      headlineDeck: view.headlineDeck,
      canBuy: true,
      hand: 2,
    })
  )
})

check('the voter card row renders', () => {
  const VoterCardRow = M.VoterCardRow
  render(
    'VoterCardRow',
    React.createElement(VoterCardRow, {
      market: GAME.market,
      pool: ME.pool,
      onSelect: () => {},
      selectedIndex: 0,
    })
  )
})

check('the scoreboard survives arriving empty and then filling', () => {
  // Standings are empty on the very first render and populated a moment later.
  // A hook called after the early-return guard would run on the second render
  // but not the first, which React treats as fatal — the bug this once had.
  const Scoreboard = M.Scoreboard
  renderToStaticMarkup(React.createElement(Scoreboard, { standings: [], colorOf }))
  render(
    'Scoreboard after filling',
    React.createElement(Scoreboard, { standings: STANDINGS, colorOf, myPlayerId: 'p1' })
  )
})

check('the scoreboard renders, in play and at the end', () => {
  const Scoreboard = M.Scoreboard
  render(
    'Scoreboard live',
    React.createElement(Scoreboard, { standings: STANDINGS, colorOf, myPlayerId: 'p1' })
  )
  render(
    'Scoreboard finished',
    React.createElement(Scoreboard, {
      standings: STANDINGS,
      breakdown: BREAKDOWN,
      colorOf,
      myPlayerId: 'p1',
      finished: true,
    })
  )
})

check('the Ideology prompt renders — this is the first thing an election shows', () => {
  const IdeologyPrompt = M.IdeologyPrompt
  const active = GAME.players[GAME.activeSeat].id

  // The answering player: the card is redacted, so answers carry text only and
  // no ideologue or resources. This is the exact shape the server sends.
  const mine = viewFor(GAME, active)
  ok(mine.pendingIdeology, 'the server sent a pending card')
  ok(mine.pendingIdeology.hidden, 'and it is hidden from the answering player')
  const asAnswerer = render(
    'IdeologyPrompt (answering)',
    React.createElement(IdeologyPrompt, {
      pending: mine.pendingIdeology,
      deadline: mine.ideologyDeadline,
      canRedraw: true,
      onAnswer: () => {},
      onRedraw: () => {},
      onTimeout: () => {},
    })
  )
  ok(asAnswerer.includes(mine.pendingIdeology.prompt.slice(0, 20)), 'showed the question')

  // Everyone else sees the whole card, including the payouts.
  const other = GAME.players.find((p) => p.id !== active).id
  const theirs = viewFor(GAME, other)
  render(
    'IdeologyPrompt (watching)',
    React.createElement(IdeologyPrompt, {
      pending: theirs.pendingIdeology,
      spectatorName: 'Ada',
      deadline: theirs.ideologyDeadline,
      onTimeout: () => {},
    })
  )
})

check('the Ideology reveal renders', () => {
  const IdeologyPrompt = M.IdeologyPrompt
  const active = GAME.players[GAME.activeSeat].id
  const card = I.getIdeologyCard(GAME.pendingIdeologyCard)
  const answered = G.answerIdeology(GAME, card.answers[0].ideologue)
  ok(!answered.error, answered.error)
  ok(answered.reveal, 'answering produced a reveal')

  render(
    'IdeologyPrompt (reveal)',
    React.createElement(IdeologyPrompt, {
      pending: null,
      reveal: answered.reveal,
      onRevealDone: () => {},
    })
  )
})

check('the trade and auction panels render', () => {
  const TradePanel = M.TradePanel
  const AuctionPanel = M.AuctionPanel
  const view = viewFor(GAME, 'p1')
  render(
    'TradePanel',
    React.createElement(TradePanel, {
      game: view,
      me: view.players.find((p) => p.id === 'p1'),
      isMyTurn: true,
      onPropose: () => {},
      onRespond: () => {},
    })
  )
  render(
    'AuctionPanel',
    React.createElement(AuctionPanel, {
      game: view,
      me: view.players.find((p) => p.id === 'p1'),
      onBid: () => {},
      onClose: () => {},
      onRepay: () => {},
    })
  )
})

check('the card stack renders full and empty', () => {
  const CardStack = M.CardStack
  render('CardStack', React.createElement(CardStack, { label: 'Conspiracy', count: 14, tone: 'conspiracy', cost: 3 }))
  render('CardStack empty', React.createElement(CardStack, { label: 'Headline', count: 0, empty: true }))
})

check('the Ideology card stack renders at zero and at depth', () => {
  const IdeologyCardStack = M.IdeologyCardStack
  render('IdeologyCardStack 0', React.createElement(IdeologyCardStack, { ideologue: 'capitalist', count: 0 }))
  render('IdeologyCardStack 7', React.createElement(IdeologyCardStack, { ideologue: 'idealist', count: 7, justAdded: true }))
})

check('the floating mat renders once it has read its saved position', () => {
  const FloatingMat = M.FloatingMat
  // It deliberately renders nothing until localStorage has been read, so on the
  // server there is no markup — only that it does not throw matters here.
  renderToStaticMarkup(
    React.createElement(FloatingMat, { player: ME, color: colorOf(ME.id), isMyTurn: true, score: 3 })
  )
})

check('the setup panel renders at each step', () => {
  const SetupPanel = M.SetupPanel
  const players = [
    { id: 'p1', nickname: 'Ada' },
    { id: 'p2', nickname: 'Bo' },
    { id: 'p3', nickname: 'Cy' },
  ]
  const el = (setup) =>
    React.createElement(SetupPanel, { setup, players, meId: 'p1', isHost: true, onAction: () => {} })

  render('SetupPanel vote', el(Setup.defaultSetup()))

  let s = Setup.defaultSetup()
  for (const [v, c] of [['p1', 'p2'], ['p3', 'p2'], ['p2', 'p1']]) {
    s = Setup.castVote(s, { playerId: v, choice: c, players }).setup
  }
  render('SetupPanel resources', el(s))
  render('SetupPanel ready', el(Setup.skipSetup(s, players).setup))
})

report('Rendering')
