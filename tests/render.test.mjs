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

// Next's own modules cannot be imported by bare Node, and marking them external
// only moves the failure to import time. They are navigation, which this suite
// does not test, so they are stubbed with the smallest thing that renders.
writeFileSync(
  join(dir, 'next-link.js'),
  `import React from 'react'
   export default function Link({ href, children, ...rest }) {
     return React.createElement('a', { href, ...rest }, children)
   }`
)
writeFileSync(
  join(dir, 'next-router.js'),
  `export function useRouter() { return { query: {}, push() {}, replace() {}, isReady: true } }
   export default { useRouter }`
)

writeFileSync(
  join(dir, 'entry.js'),
  [
    ...components.map(
      (f) => `export { default as ${f.replace('.js', '')} } from '${abs('components/' + f)}'`
    ),
    // The room's regions. Kept in their own folder because they are layout,
    // not game pieces.
    ...['RoomHeader', 'RivalRail', 'BoardStage', 'MarketRail', 'MatDock', 'CommandBar',
        'TurnDigest', 'ZoneCard', 'RoundPanel'].map(
      (n) => `export { default as ${n} } from '${abs('components/room/' + n + '.js')}'`
    ),
    `export * as G from '${abs('lib/shasn/game.js')}'`,
    `export * as I from '${abs('lib/shasn/ideology.js')}'`,
    `export * as Setup from '${abs('lib/shasn/setup.js')}'`,
    `export * as Persistence from '${abs('lib/shasn/persistence.js')}'`,
    `export * as Parties from '${abs('lib/shasn/parties.js')}'`,
    `export * as Zones from '${abs('lib/shasn/zones.js')}'`,
    `export * as MajorityTrack from '${abs('lib/shasn/majorityTrack.js')}'`,
    `export * as Effects from '${abs('lib/shasn/effects.js')}'`,
    `export * as Theme from '${abs('lib/ui/theme.js')}'`,
    `export * as Geometry from '${abs('lib/shasn/boardGeometry.js')}'`,
    `export * as Board from '${abs('components/ShasnBoard.js')}'`,
    `export { TURN_PHASES } from '${abs('lib/shasn/constants.js')}'`,
    `export * as Jumla from '${abs('lib/shasn/jumla.js')}'`,
    `export * as Rounds from '${abs('lib/shasn/rounds.js')}'`,
    `export * as ConspiracyData from '${abs('lib/shasn/data/conspiracyCards.js')}'`,
    `export * as HeadlineData from '${abs('lib/shasn/data/headlineCards.js')}'`,
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
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  alias: {
    'next/link': join(dir, 'next-link.js'),
    'next/router': join(dir, 'next-router.js'),
  },
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

check('every region of the room renders', () => {
  // The room was one 1278-line page. These are the five regions it became, and
  // a region that throws takes the whole table with it.
  const seat = (id) => ({
    ...GAME.players.find((p) => p.id === id),
    conspiracyCardCount: 0,
    conspiracyCards: [],
  })

  render(
    'RoomHeader',
    React.createElement(M.RoomHeader, {
      code: 'TEST',
      turnNumber: 4,
      turnLabel: 'Your turn',
      turnColor: '#6c3fb5',
      phase: 'actions',
    })
  )

  render(
    'RivalRail',
    React.createElement(M.RivalRail, {
      players: GAME.players,
      activeId: GAME.players[0].id,
      myPlayerId: 'p1',
      standings: STANDINGS,
      colorOf,
      partyOf: () => 'lantern',
      board: GAME.board,
      onFocus: () => {},
    })
  )

  render(
    'BoardStage',
    React.createElement(M.BoardStage, {
      board: GAME.board,
      players: GAME.players,
      colorOf,
      partyOf: () => 'lantern',
      myPlayerId: 'p1',
      selectedAreas: [],
      onZoneHover: () => {},
      prompt: { text: 'Click 2 empty areas in one zone.', onCancel: () => {} },
    })
  )

  render(
    'MarketRail',
    React.createElement(M.MarketRail, {
      market: GAME.market,
      pool: ME.pool,
      onSelect: () => {},
      conspiracyDeck: GAME.conspiracyDeck,
      headlineDeck: GAME.headlineDeck,
      log: GAME.log,
    })
  )

  render(
    'MatDock',
    React.createElement(M.MatDock, {
      player: ME,
      color: colorOf(ME.id),
      party: 'lantern',
      board: GAME.board,
      isMyTurn: true,
      score: 3,
    })
  )
})

check('the header always says whose turn it is', () => {
  // The turn used to be stated by a panel that has been removed, and by a banner
  // that announces the handoff and then leaves. Neither is a permanent answer.
  const html = render(
    'RoomHeader mid-game',
    React.createElement(M.RoomHeader, {
      code: 'TEST',
      turnNumber: 4,
      turnLabel: 'Bo is playing',
      turnColor: '#b3167a',
      phase: 'actions',
    })
  )
  ok(html.includes('Bo is playing'), 'the turn is stated')
  ok(html.includes('actions'), 'and so is the phase')
})

check('a command that cannot be used explains itself', () => {
  // "No rights — you need the most voters in a zone" used to be a permanent line
  // of text. It is now the reason on a control, which is where it is needed and
  // nowhere else.
  const html = render(
    'CommandBar',
    React.createElement(M.CommandBar, {
      actions: [
        {
          id: 'g',
          label: 'Gerrymander',
          available: false,
          why: 'You need the most voters in a zone (p.15).',
        },
      ],
      onEndTurn: () => {},
    })
  )
  ok(html.includes('most voters in a zone'), 'the reason is on the control')
  ok(html.includes('disabled'), 'and the control is unusable')
})

check('the zone card answers what the plaque cannot', () => {
  const { ZONE_IDS } = M.Zones
  const html = render(
    'ZoneCard',
    React.createElement(M.ZoneCard, {
      zoneId: ZONE_IDS[0],
      board: GAME.board,
      players: GAME.players,
      colorOf,
      myPlayerId: 'p1',
    })
  )
  ok(html.includes('to hold'), 'states the requirement')
  ok(html.includes('empty'), 'counts what is left')
  ok(/need|Yours|holds it|no longer|requirement/.test(html), 'and says what it means for you')
})

check('a card going round the table says whose slot it is', () => {
  // The unusual state: it is nobody's turn in the normal sense, and the person
  // who has to act is usually not the active player. If the panel does not say
  // whose slot it is, the table simply stalls while everyone waits for someone
  // else.
  const round = {
    kind: 'gerrymander',
    cardName: 'Submerged',
    queue: ['p2', 'p3'],
    acted: [{ playerId: 'p1', action: 'pass' }],
    options: {},
  }

  const theirs = render(
    'RoundPanel, not my slot',
    React.createElement(M.RoundPanel, {
      round,
      players: GAME.players,
      myPlayerId: 'p1',
      colorOf,
      onPass: () => {},
    })
  )
  ok(theirs.includes('Submerged'), 'the card is named')
  ok(theirs.includes('Bo'), 'and the player whose slot it is')
  ok(theirs.includes('1 of 3'), 'with progress through the table')
  ok(!theirs.includes('Pass'), 'and no controls, because I cannot act')

  const mine = render(
    'RoundPanel, my slot',
    React.createElement(M.RoundPanel, {
      round,
      players: GAME.players,
      myPlayerId: 'p2',
      colorOf,
      onPass: () => {},
    })
  )
  ok(/Move one voter/.test(mine), 'my slot states what to do')
  ok(mine.includes('Pass'), 'and always offers a way out — a slot that cannot be passed deadlocks')
})

check('the cash-out round asks for something different', () => {
  const html = render(
    'RoundPanel, cashing out',
    React.createElement(M.RoundPanel, {
      round: {
        kind: 'cashOutVoter',
        cardName: 'A Trip To Goalpara',
        queue: ['p1'],
        acted: [],
        options: {},
      },
      players: GAME.players,
      myPlayerId: 'p1',
      colorOf,
      onPass: () => {},
    })
  )
  ok(/Voter Card/.test(html), 'it is about the market, not the board')
  ok(!/Volatile/.test(html), 'and does not leak the other round\'s instructions')
})

check('Jumla and Polo Retreat get real pickers, not the manual box', () => {
  // Both used to fall through to "resolve it at the table and type what you
  // agreed", which is how four cards in the deck ended up inert.
  const jumla = render(
    'CardResolver, Jumla',
    React.createElement(M.CardResolver, {
      card: M.ConspiracyData.CONSPIRACY_CARDS.jumla,
      kind: 'conspiracy',
      onResolve: () => {},
      onManual: () => {},
      players: GAME.players,
      myPlayerId: 'p1',
    })
  )
  ok(/Place it/.test(jumla), 'Jumla offers placement')
  ok(!/What did you agree/.test(jumla), 'and not the manual box')

  const polo = render(
    'CardResolver, Polo Retreat',
    React.createElement(M.CardResolver, {
      card: M.HeadlineData.HEADLINE_CARDS.polo_retreat,
      kind: 'headline',
      onResolve: () => {},
      onManual: () => {},
      players: GAME.players,
      myPlayerId: 'p1',
    })
  )
  ok(/Pair them/.test(polo), 'Polo Retreat offers a pairing')
  for (const p of GAME.players) ok(polo.includes(p.name), `${p.name} can be chosen`)
  ok(!/What did you agree/.test(polo), 'and not the manual box')
})

check('the docked bar is the only home the cap-discard flow has left', () => {
  // Discarding to the resource cap is done by lifting tokens off your own
  // chain. That chain used to be inside the full mat; the mat is gone, so if
  // this bar's chain is not wired the flow has no surface at all.
  //
  // Chain tokens are ALWAYS <button> and merely disabled when inert, so this
  // counts enabled ones. An earlier version of this check counted every button
  // in the dock and passed happily with the chain completely dead.
  const live = render(
    'MatDock, discarding',
    React.createElement(M.MatDock, {
      player: ME,
      color: colorOf(ME.id),
      party: 'lantern',
      board: GAME.board,
      isMyTurn: true,
      score: 3,
      discardSelection: {}, // ResourceChain fills in the zeroes itself
      onDiscardToken: () => {},
    })
  )
  const enabled = (html) => (html.match(/<button(?![^>]*disabled)/g) || []).length

  ok(/shasn-chain/.test(live), 'the chain is in the bar')
  ok(enabled(live) > 0, 'and its tokens can be clicked while discarding')

  const idle = render(
    'MatDock, not discarding',
    React.createElement(M.MatDock, {
      player: ME,
      color: colorOf(ME.id),
      party: 'lantern',
      board: GAME.board,
      isMyTurn: true,
      score: 3,
    })
  )
  ok(enabled(idle) === 0, 'and cannot be clicked when you are not over the cap')
})

check('every deck glyph draws', () => {
  // Conspiracy was told apart by a red edge and Headline by an amber one — the
  // Street Clout and Public Trust hues. Each deck now has a mark as well, so
  // identity survives with colour switched off.
  const DeckGlyph = M.DeckGlyph
  for (const deck of ['ideology', 'conspiracy', 'headline', 'voter']) {
    const html = render(`DeckGlyph ${deck}`, React.createElement(DeckGlyph, { deck }))
    ok(/<(path|circle)/.test(html), `${deck} drew a shape`)
  }

  // The glyphs must actually differ, or they identify nothing.
  const shapes = ['ideology', 'conspiracy', 'headline', 'voter'].map((deck) =>
    renderToStaticMarkup(React.createElement(DeckGlyph, { deck }))
  )
  eq(new Set(shapes).size, 4, 'four distinct glyphs:')
})

check('all four card faces share one anatomy', () => {
  // The whole point of the shared shell: a Voter Card at 82px and a Conspiracy
  // resolver at full width are the same component with different slots filled.
  const Card = M.Card
  const faces = {
    ideology: { deck: 'ideology', title: 'Should the state fund private hospitals?' },
    conspiracy: { deck: 'conspiracy', title: 'Chai-Paani', badge: 3 },
    headline: { deck: 'headline', title: 'Farmers March' },
    voter: { deck: 'voter', title: '2', subtitle: 'voters', badge: 3, compact: true },
  }
  for (const [name, props] of Object.entries(faces)) {
    const html = render(
      `Card ${name}`,
      React.createElement(Card, props, React.createElement('p', null, 'body'))
    )
    ok(html.includes(String(props.title)), `${name} shows its title`)
    ok(/<svg/.test(html), `${name} carries its deck glyph`)
    if (props.badge != null) ok(html.includes(String(props.badge)), `${name} shows its badge`)
  }
})

check('a card carries each of its four states', () => {
  const Card = M.Card
  const base = { deck: 'voter', title: '1' }
  const plain = renderToStaticMarkup(React.createElement(Card, base))
  const selected = renderToStaticMarkup(React.createElement(Card, { ...base, selected: true }))
  const disabled = renderToStaticMarkup(React.createElement(Card, { ...base, disabled: true }))
  const spent = renderToStaticMarkup(React.createElement(Card, { ...base, spent: true }))

  ok(selected !== plain, 'selected looks different from plain')
  ok(disabled !== plain, 'disabled looks different from plain')
  ok(spent !== plain, 'spent looks different from plain')
  ok(selected.includes('--accent'), 'selection uses the one accent')
  ok(disabled.includes('opacity:0.45'), 'disabled dims')
  ok(spent.includes('grayscale'), 'spent desaturates')
})

check('a clickable card is reachable from the keyboard', () => {
  const Card = M.Card
  const html = renderToStaticMarkup(
    React.createElement(Card, { deck: 'voter', title: '1', onClick: () => {} })
  )
  ok(html.includes('role="button"'), 'announced as a button')
  ok(html.includes('tabindex="0"'), 'and reachable by tab')

  const inert = renderToStaticMarkup(React.createElement(Card, { deck: 'voter', title: '1' }))
  ok(!inert.includes('tabindex'), 'a card you cannot click is not a tab stop')
})

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
  ok(html.includes('holds the majority'), 'the plaque says so')
  // The pale face is whatever the palette calls a surface — asserting on a
  // literal white broke the moment the game stopped being white.
  ok(html.includes(M.Theme.RAW.surface), `the flipped face is pale (${M.Theme.RAW.surface})`)
})

check('no zone plaque sits on top of a voter area', () => {
  // Plaques used to be centred on the zone centroid, which in a 21-area zone is
  // squarely on top of half a dozen voters — you could not see or click them.
  // They are now placed at the clearest spot and shrink where the zone is tight.
  const { plaquePlacement } = M.Board
  const { ZONE_GEOMETRY, PIP_RADIUS } = M.Geometry
  const { ZONE_IDS, ZONES } = M.Zones

  const covered = []
  for (const zoneId of ZONE_IDS) {
    const { x, y, w, h } = plaquePlacement(zoneId, 96, 42)
    for (const [px, py] of ZONE_GEOMETRY[zoneId].pips) {
      const dx = Math.max(Math.abs(px - x) - w / 2, 0)
      const dy = Math.max(Math.abs(py - y) - h / 2, 0)
      if (Math.hypot(dx, dy) < PIP_RADIUS) {
        covered.push(`${zoneId} (${ZONES[zoneId].areas} areas)`)
      }
    }
  }
  eq([...new Set(covered)], [], 'zones whose plaque covers a voter:')
})

check('the track stays legible in the biggest zones', () => {
  // A 21-area zone drew 21 separate ticks in a 90px plaque, which is a barcode
  // rather than a reading. The plaque now draws one block per holder.
  const { majorityTrack } = M.MajorityTrack
  const { ZONE_IDS, ZONES } = M.Zones

  const biggest = ZONE_IDS.reduce((a, b) => (ZONES[a].areas >= ZONES[b].areas ? a : b))
  eq(ZONES[biggest].areas, 21, 'the biggest zone:')

  const board = JSON.parse(JSON.stringify(GAME.board))
  const owners = board.zones[biggest].owners
  owners.fill(null)
  for (let i = 0; i < 5; i++) owners[i] = 'p1'
  for (let i = 5; i < 8; i++) owners[i] = 'p2'

  const t = majorityTrack(board, biggest)
  eq(t.segments.length, 21, 'still one segment per area underneath:')
  eq(t.runs.length, 3, 'but only three blocks to draw:')
  eq(t.runs.map((r) => r.count), [5, 3, 13], 'p1, p2, then the empties:')
  ok(t.runs.length <= 6, 'never more blocks than there are players plus one')
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
  ok(html.includes('NORTH'), 'drew zone plaques')
  ok(html.includes('areas still open') || html.includes('holds the majority'), 'described each zone')
})

check('the majority track sorts a zone and marks the line', () => {
  // Sorting is the whole trick. The map already shows these areas scattered, so
  // you have to count them; grouped and laid against a threshold you can read
  // "two more and it is mine" without counting anything.
  const { majorityTrack, needed } = M.MajorityTrack
  const { ZONES } = M.Zones

  const zoneId = 'north'
  const board = JSON.parse(JSON.stringify(GAME.board))
  const owners = board.zones[zoneId].owners
  owners.fill(null)
  for (let i = 0; i < 2; i++) owners[i] = 'p2' // the smaller holding first, on purpose
  for (let i = 2; i < 6; i++) owners[i] = 'p1'

  const t = majorityTrack(board, zoneId)
  eq(t.segments.length, ZONES[zoneId].areas, 'one segment per area:')
  eq(t.leader.playerId, 'p1', 'biggest holding leads:')
  eq(t.leader.count, 4)

  // Sorted: all of p1, then all of p2, then the empties — regardless of where
  // they actually sit on the map.
  eq(t.segments.slice(0, 4).map((s) => s.owner), ['p1', 'p1', 'p1', 'p1'])
  eq(t.segments.slice(4, 6).map((s) => s.owner), ['p2', 'p2'])
  ok(t.segments.slice(6).every((s) => s.owner === null), 'then the empty areas')

  const tick = t.segments.findIndex((s) => s.threshold)
  eq(tick, ZONES[zoneId].majority - 1, 'the line falls at the requirement:')

  eq(needed(board, zoneId, 'p1'), ZONES[zoneId].majority - 4, 'p1 needs the difference:')
})

check('a zone nobody can win is marked dead', () => {
  // A zone can fill up with no one reaching the requirement, and those points
  // simply go unclaimed (p.19). The board never used to admit it.
  const { majorityTrack } = M.MajorityTrack
  const ShasnBoard = M.ShasnBoard
  const { ZONES } = M.Zones

  const zoneId = 'north'
  const board = JSON.parse(JSON.stringify(GAME.board))
  const owners = board.zones[zoneId].owners
  // Fill every area, spread so thin that nobody reaches the majority.
  for (let i = 0; i < owners.length; i++) owners[i] = ['p1', 'p2', 'p3'][i % 3]

  const t = majorityTrack(board, zoneId)
  ok(!t.holder, 'nobody holds it')
  ok(t.dead, 'and nobody can')
  eq(t.empty, 0, 'it is full:')

  const html = render(
    'ShasnBoard with a dead zone',
    React.createElement(ShasnBoard, { board, players: GAME.players, colorOf, selectedAreas: [] })
  )
  ok(html.includes('NO MAJORITY POSSIBLE'), 'the plaque says so')
  ok(html.includes('points go unclaimed'), 'and explains the cost')
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

check('the mat shows what is currently true about a player', () => {
  // The whole point of the rebuild: a player can be carrying ten states that
  // change what they may do, and the mat used to mention none of them.
  const PlayerMat = M.PlayerMat
  const afflicted = {
    ...ME,
    auctionDebt: 3,
    effects: { ...M.Effects.emptyEffects(), conspiracySurcharge: 2, hawala: true },
  }
  const board = { ...GAME.board, evicted: { ...GAME.board.evicted, [ME.id]: 2 } }

  const html = render(
    'PlayerMat with status',
    React.createElement(PlayerMat, {
      player: afflicted,
      color: colorOf(ME.id),
      board,
      variant: 'full',
      isYou: true,
    })
  )
  ok(html.includes('Owe 3'), 'the debt is on the mat')
  ok(html.includes('Purchases blocked'), 'and why it matters')
  ok(html.includes('+2'), 'the surcharge is shown')
  ok(html.includes('evicted voter'), 'and voters waiting to be placed')
})

check('an opponent mat carries the same status, because it is public', () => {
  // viewFor passes effects and auctionDebt straight through — only Conspiracy
  // card identities are hidden. Knowing the player to your left cannot buy
  // anything is exactly what an open-information game should let you see.
  const PlayerMat = M.PlayerMat
  const them = {
    ...GAME.players[1],
    auctionDebt: 4,
    conspiracyCardCount: 2,
    conspiracyCards: [],
  }
  const html = render(
    'PlayerMat compact with status',
    React.createElement(PlayerMat, {
      player: them,
      color: '#c2185b',
      variant: 'compact',
      score: 1,
    })
  )
  ok(html.includes('Owe 4'), 'an opponent debt is visible')
})

check('the unlock track shows how far an Ideologue has to go', () => {
  const UnlockTrack = M.UnlockTrack
  eq(
    renderToStaticMarkup(React.createElement(UnlockTrack, { held: 0, color: '#3f9e63' })).includes(
      'none yet'
    ),
    true
  )
  ok(
    renderToStaticMarkup(React.createElement(UnlockTrack, { held: 4, color: '#3f9e63' })).includes(
      '1 more to level 5'
    ),
    'counts down to the next unlock'
  )
  ok(
    renderToStaticMarkup(React.createElement(UnlockTrack, { held: 5, color: '#3f9e63' })).includes(
      'both unlocked'
    ),
    'and says when it is done'
  )
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
