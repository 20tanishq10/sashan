// SHASN — the Conspiracy interrupt window (p.18, p.22)
//
// Run with:  node tests/interrupt.test.mjs

import {
  resources as R,
  ideology as I,
  game as G,
  consts,
  createRunner,
  eq,
  ok,
} from './harness.mjs'

const { check, report } = createRunner()

const pool = (o = {}) => ({ ...R.emptyPool(), ...o })
const newGame = (seed = 99) =>
  G.createGame({
    players: ['Ada', 'Bo', 'Cy'].map((n, i) => ({ id: `p${i + 1}`, name: n })),
    seed,
  })

/** Into the actions phase, with chosen hands. */
function ready(hands = {}, pools = {}) {
  let { game, rng } = newGame()
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  game = G.answerIdeology(game, card.answers[0].ideologue).game
  if (game.turnPhase === consts.TURN_PHASES.RESOURCE_CAP) {
    game = G.discardToCap(game, R.autoDiscardToCap(G.activePlayer(game).pool)).game
  }
  return {
    game: {
      ...game,
      players: game.players.map((p) => ({
        ...p,
        conspiracyCards: hands[p.id] || [],
        pool: pools[p.id] ? pool(pools[p.id]) : p.pool,
      })),
    },
    rng,
  }
}

// ---------------------------------------------------------------------------
// Opening the window
// ---------------------------------------------------------------------------

check('a card resolves at once when nobody can respond', () => {
  const { game } = ready({ p1: ['benaami'] })
  const r = G.playConspiracy(game, { cardId: 'benaami' })
  ok(!r.error, r.error)
  ok(!r.awaitingResponses, 'no window opened')
  eq(r.game.players[0].resourceCap, 14, 'effect applied immediately:')
})

check('a card waits when someone holds Block or Reverse', () => {
  const { game } = ready({ p1: ['benaami'], p2: ['block'] })
  const r = G.playConspiracy(game, { cardId: 'benaami' })
  ok(!r.error, r.error)
  ok(r.awaitingResponses, 'window opened')
  ok(r.game.interrupt, 'interrupt recorded')
  eq(r.game.interrupt.eligible, ['p2'], 'only the holder is asked:')
  eq(r.game.players[0].resourceCap, 12, 'nothing applied yet:')
})

check('only holders of an interrupt card are asked', () => {
  const { game } = ready({ p1: ['benaami'], p2: ['nayi_soch'], p3: ['reverse'] })
  const r = G.playConspiracy(game, { cardId: 'benaami' })
  eq(r.game.interrupt.eligible, ['p3'], 'p2 holds no response card:')
})

check('Block and Reverse cannot be played as openers', () => {
  const { game } = ready({ p1: ['block'] })
  const r = G.playConspiracy(game, { cardId: 'block' })
  ok(r.error, 'refused')
  ok(r.error.includes('in response'), `unexpected: ${r.error}`)
})

// ---------------------------------------------------------------------------
// Responding
// ---------------------------------------------------------------------------

check('passing lets the card through', () => {
  const { game } = ready({ p1: ['benaami'], p2: ['block'] })
  const played = G.playConspiracy(game, { cardId: 'benaami' }).game

  const r = G.respondInterrupt(played, { playerId: 'p2', action: 'pass' })
  ok(!r.error, r.error)
  eq(r.game.interrupt, null, 'window closed:')
  eq(r.game.players[0].resourceCap, 14, 'the card resolved:')
  eq(r.game.players[1].conspiracyCards, ['block'], 'Block was not spent:')
})

check('a Block negates the card outright', () => {
  const { game } = ready({ p1: ['benaami'], p2: ['block'] })
  const played = G.playConspiracy(game, { cardId: 'benaami' }).game

  const r = G.respondInterrupt(played, { playerId: 'p2', action: 'block', cardId: 'block' })
  ok(!r.error, r.error)
  ok(r.blocked, 'flagged as blocked')
  eq(r.game.players[0].resourceCap, 12, 'no effect applied:')
  eq(r.game.players[0].conspiracyCards, [], 'the original card was still spent:')
  eq(r.game.players[1].conspiracyCards, [], 'and so was the Block:')
})

check('a Reverse turns the card back on whoever played it', () => {
  const { game } = ready({ p1: ['benaami'], p2: ['reverse'] })
  const played = G.playConspiracy(game, { cardId: 'benaami' }).game

  const r = G.respondInterrupt(played, { playerId: 'p2', action: 'reverse', cardId: 'reverse' })
  ok(!r.error, r.error)
  eq(r.game.players[1].resourceCap, 14, 'the reverser got the benefit:')
  eq(r.game.players[0].resourceCap, 12, 'the player who played it did not:')
})

check('a Block beats a Reverse — it cannot itself be reversed (p.18)', () => {
  const { game } = ready({ p1: ['benaami'], p2: ['reverse'], p3: ['block'] })
  let g = G.playConspiracy(game, { cardId: 'benaami' }).game
  eq(g.interrupt.eligible.sort(), ['p2', 'p3'])

  g = G.respondInterrupt(g, { playerId: 'p2', action: 'reverse', cardId: 'reverse' }).game
  ok(g.interrupt, 'still waiting on p3')

  const r = G.respondInterrupt(g, { playerId: 'p3', action: 'block', cardId: 'block' })
  ok(!r.error, r.error)
  ok(r.blocked, 'the Block wins')
  eq(r.game.players[0].resourceCap, 12, 'nobody gained the cap:')
  eq(r.game.players[1].resourceCap, 12)
})

check('the window stays open until everyone eligible has answered', () => {
  const { game } = ready({ p1: ['benaami'], p2: ['block'], p3: ['reverse'] })
  let g = G.playConspiracy(game, { cardId: 'benaami' }).game

  g = G.respondInterrupt(g, { playerId: 'p2', action: 'pass' }).game
  ok(g.interrupt, 'one still to answer')

  const r = G.respondInterrupt(g, { playerId: 'p3', action: 'pass' })
  eq(r.game.interrupt, null, 'closed once both passed:')
  eq(r.game.players[0].resourceCap, 14, 'and the card resolved:')
})

check('you cannot respond twice, or with a card you do not hold', () => {
  const { game } = ready({ p1: ['benaami'], p2: ['block'] })
  const played = G.playConspiracy(game, { cardId: 'benaami' }).game

  ok(
    G.respondInterrupt(played, { playerId: 'p3', action: 'pass' }).error,
    'an ineligible player is refused'
  )
  ok(
    G.respondInterrupt(played, { playerId: 'p2', action: 'reverse', cardId: 'reverse' }).error,
    'cannot Reverse without holding one'
  )

  const once = G.respondInterrupt(played, { playerId: 'p2', action: 'pass' })
  ok(G.respondInterrupt(once.game, { playerId: 'p2', action: 'pass' }).error, 'no second answer')
})

// ---------------------------------------------------------------------------
// Timing (p.22)
// ---------------------------------------------------------------------------

check('a Conspiracy may be played while an opponent is on their Ideology Card', () => {
  let { game, rng } = newGame()
  // p1 is answering; p2 plays out of turn.
  game = {
    ...game,
    players: game.players.map((p) => (p.id === 'p2' ? { ...p, conspiracyCards: ['benaami'] } : p)),
  }
  eq(game.turnPhase, consts.TURN_PHASES.IDEOLOGY)

  const r = G.playConspiracy(game, { cardId: 'benaami', playerId: 'p2' })
  ok(!r.error, r.error)
  eq(r.game.players[1].resourceCap, 14, 'it resolved out of turn:')
})

check('you cannot play out of turn once the answer is done', () => {
  const { game } = ready({ p2: ['benaami'] })
  eq(game.turnPhase, consts.TURN_PHASES.ACTIONS)
  const r = G.playConspiracy(game, { cardId: 'benaami', playerId: 'p2' })
  ok(r.error, 'refused outside the window')
})

check('answering waits for an open window to close', () => {
  let { game, rng } = newGame()
  game = {
    ...game,
    players: game.players.map((p) =>
      p.id === 'p2' ? { ...p, conspiracyCards: ['benaami'] } : p.id === 'p3' ? { ...p, conspiracyCards: ['block'] } : p
    ),
  }
  const played = G.playConspiracy(game, { cardId: 'benaami', playerId: 'p2' })
  ok(played.awaitingResponses, 'window open')

  const card = I.getIdeologyCard(played.game.pendingIdeologyCard)
  const r = G.answerIdeology(played.game, card.answers[0].ideologue)
  ok(r.error, 'the answer waits')
  ok(r.error.includes('Conspiracy'), `unexpected: ${r.error}`)
})

check('the shot clock will not fire while a card is being resolved', () => {
  let { game, rng } = newGame()
  game = {
    ...game,
    ideologyDeadline: Date.now() - 1,
    players: game.players.map((p) =>
      p.id === 'p2' ? { ...p, conspiracyCards: ['benaami'] } : p.id === 'p3' ? { ...p, conspiracyCards: ['block'] } : p
    ),
  }
  const played = G.playConspiracy(game, { cardId: 'benaami', playerId: 'p2' }).game
  const r = G.answerIdeologyByTimeout(played, rng)
  ok(r.error, 'refused while the window is open')
})

check('a turn cannot end with a card still awaiting responses', () => {
  const { game, rng } = ready({ p1: ['benaami'], p2: ['block'] })
  const played = G.playConspiracy(game, { cardId: 'benaami' }).game
  const r = G.endTurn(played, rng)
  ok(r.error, 'refused')
  ok(r.error.includes('awaiting responses'), `unexpected: ${r.error}`)
})

check('only one card may be in the window at a time', () => {
  const { game } = ready({ p1: ['benaami', 'nayi_soch'], p2: ['block'] })
  const played = G.playConspiracy(game, { cardId: 'benaami' }).game
  const second = G.playConspiracy(played, { cardId: 'nayi_soch' })
  ok(second.error, 'refused')
})

report('Conspiracy interrupt window (p.18, p.22)')
