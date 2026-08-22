// SHASN — what happened while you were away.
//
// In a five-player game you sit out four turns between your own, and nothing
// told you what happened in them. The log had the right events all along —
// majorities forming, conspiracies played, headlines fired — but no turn stamp,
// so none of it was filterable. That is now one field in addLog(), and this is
// the logic that reads it.
//
// Run with:  node tests/digest.test.mjs

import { digest as D, game as G, ideology as I, resources as R, consts, createRunner, eq, ok } from './harness.mjs'

const { check, report } = createRunner()

const entry = (turn, type, message) => ({ turn, type, message })
const fake = (turnNumber, playerCount, log) => ({
  turnNumber,
  players: Array.from({ length: playerCount }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })),
  log,
})

// ---------------------------------------------------------------------------
// Which turns count as "away"
// ---------------------------------------------------------------------------

check('your previous turn is exactly one round back', () => {
  // Turn order is fixed and everyone takes one turn per round, so this needs no
  // bookkeeping — and unlike a remembered marker it survives a page reload.
  eq(D.previousTurnOf(11, 5), 6, 'five players, turn 11:')
  eq(D.previousTurnOf(4, 3), 1, 'three players, turn 4:')
})

check('there is nothing behind your first turn', () => {
  eq(D.previousTurnOf(3, 5), null, 'turn 3 of a five-player game:')
  eq(D.previousTurnOf(1, 3), null, 'the very first turn:')
})

check('a first turn produces no digest at all', () => {
  const g = fake(2, 5, [entry(1, 'majority', 'Bo formed a majority in north.')])
  eq(D.turnDigest(g, 'p1').entries, [], 'nothing to report yet:')
  ok(!D.hasDigest(g, 'p1'))
})

// ---------------------------------------------------------------------------
// What gets reported
// ---------------------------------------------------------------------------

check('only what happened since your last turn', () => {
  const g = fake(11, 5, [
    entry(5, 'majority', 'ancient history'),
    entry(6, 'majority', 'your own turn — you were there'),
    entry(7, 'majority', 'Bo took the North.'),
    entry(9, 'conspiracy', 'Cy played Chai-Paani.'),
    entry(11, 'majority', 'happening now'),
  ])
  const messages = D.turnDigest(g, 'p1').entries.map((e) => e.message)
  ok(!messages.includes('ancient history'), 'nothing from before')
  ok(!messages.includes('your own turn — you were there'), 'not your own turn')
  ok(messages.includes('Bo took the North.'), 'what you missed')
  ok(messages.includes('Cy played Chai-Paani.'), 'and the rest of it')
})

check('the number of turns missed is counted', () => {
  const g = fake(11, 5, [entry(8, 'majority', 'something')])
  eq(D.turnDigest(g, 'p1').missedTurns, 4, 'four players went between:')
})

check('a zone changing hands leads', () => {
  // The most consequential thing that happens in this game should not be
  // fourth in a list under somebody buying a card.
  const g = fake(11, 5, [
    entry(7, 'ideology', 'Bo answered as capitalist.'),
    entry(8, 'trade', 'Cy offered a trade.'),
    entry(9, 'majority', 'Bo took the majority in north.'),
    entry(10, 'auction', 'An auction opened.'),
  ])
  const first = D.turnDigest(g, 'p1').entries[0]
  eq(first.type, 'majority', 'the zone change is first:')
})

check('turn announcements are not news', () => {
  const g = fake(11, 5, [
    entry(7, 'turn', "Bo's turn begins."),
    entry(8, 'turn', "Cy's turn begins."),
    entry(9, 'majority', 'Bo took the North.'),
  ])
  const types = D.turnDigest(g, 'p1').entries.map((e) => e.type)
  eq(types, ['majority'], 'only the thing that actually happened:')
})

check('the digest is a briefing, not the log', () => {
  const many = Array.from({ length: 30 }, (_, i) => entry(8, 'conspiracy', `thing ${i}`))
  const g = fake(11, 5, many)
  ok(D.turnDigest(g, 'p1').entries.length <= 6, 'capped at six lines')
  eq(D.turnDigest(g, 'p1', { limit: 3 }).entries.length, 3, 'and the cap is adjustable:')
})

check('within a rank, the most recent wins', () => {
  const g = fake(11, 5, [
    entry(7, 'majority', 'older'),
    entry(9, 'majority', 'newer'),
  ])
  const first = D.turnDigest(g, 'p1', { limit: 1 }).entries[0]
  eq(first.message, 'newer', 'the fresher of two equals:')
})

// ---------------------------------------------------------------------------
// Not breaking on the unexpected
// ---------------------------------------------------------------------------

check('entries from before the turn stamp existed are skipped', () => {
  // Games in progress when this shipped have log entries with no `turn`. They
  // should be ignored rather than crashing or being reported as new.
  const g = fake(11, 5, [
    { type: 'majority', message: 'no turn stamp' },
    entry(9, 'majority', 'stamped'),
  ])
  const messages = D.turnDigest(g, 'p1').entries.map((e) => e.message)
  eq(messages, ['stamped'], 'only what can be placed in time:')
})

check('an empty or missing log is harmless', () => {
  eq(D.turnDigest(fake(11, 5, []), 'p1').entries, [])
  eq(D.turnDigest({ turnNumber: 11, players: [] }, 'p1').entries, [])
  eq(D.turnDigest(null, 'p1').entries, [])
  eq(D.turnDigest(fake(11, 5, []), null).entries, [])
})

// ---------------------------------------------------------------------------
// Against a real game
// ---------------------------------------------------------------------------

check('a real game produces a digest with real events in it', () => {
  let { game, rng } = G.createGame({
    players: [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
      { id: 'p3', name: 'Cy' },
    ],
    seed: 42,
  })

  // Play a full round so p1 has something behind them.
  for (let i = 0; i < 4; i++) {
    if (game.turnPhase === consts.TURN_PHASES.IDEOLOGY && game.pendingIdeologyCard) {
      const card = I.getIdeologyCard(game.pendingIdeologyCard)
      const r = G.answerIdeology(game, card.answers[0].ideologue)
      if (!r.error) game = r.game
    }
    if (game.turnPhase === consts.TURN_PHASES.RESOURCE_CAP) {
      game = G.discardToCap(game, R.autoDiscardToCap(G.activePlayer(game).pool)).game
    }
    const end = G.endTurn(game, rng)
    if (end.error) break
    game = end.game
  }

  ok(game.log.length > 0, 'the game logged something')
  ok(
    game.log.every((e) => typeof e.turn === 'number'),
    'and every entry carries the turn it happened on'
  )

  const d = D.turnDigest(game, 'p1')
  ok(d.entries.every((e) => e.turn > d.from), 'nothing from your own turn or before')
  ok(d.entries.every((e) => e.message), 'every line has something to say')
})

report('The turn digest')
