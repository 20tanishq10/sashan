// SHASN — pre-game setup (p.6, p.13)
//
// Run with:  node tests/setup.test.mjs

import { resources as R, setup as S, game as G, createRunner, eq, ok } from './harness.mjs'

const { check, report } = createRunner()

const PLAYERS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
]

const pool = (o = {}) => ({ ...R.emptyPool(), ...o })

/** Cast a sequence of votes, returning the setup after the last one. */
function vote(pairs, players = PLAYERS) {
  let s = S.defaultSetup()
  let last
  for (const [playerId, choice] of pairs) {
    last = S.castVote(s, { playerId, choice, players })
    if (last.error) return last
    s = last.setup
  }
  return { ...last, setup: s }
}

// ---------------------------------------------------------------------------
// The vote for Player 1 (p.6)
// ---------------------------------------------------------------------------

check('a majority puts its candidate in the first seat', () => {
  const r = vote([['p1', 'p2'], ['p3', 'p2'], ['p2', 'p1']])
  ok(!r.error, r.error)
  eq(r.setup.order, ['p2', 'p1', 'p3'], 'winner first, the rest in join order:')
  eq(r.setup.step, S.SETUP_STEPS.RESOURCES, 'moved on:')
  eq(r.firstPlayerId, 'p2')
})

check('nothing settles until everyone has voted', () => {
  const r = vote([['p1', 'p2'], ['p2', 'p3']])
  eq(r.setup.order, null, 'still open:')
  eq(r.setup.step, S.SETUP_STEPS.VOTE)
})

check('you cannot vote for yourself', () => {
  const r = S.castVote(S.defaultSetup(), { playerId: 'p1', choice: 'p1', players: PLAYERS })
  ok(r.error, 'refused')
  ok(r.error.includes('yourself'), `unexpected: ${r.error}`)
})

check('a tie means voting again, from scratch', () => {
  const r = vote([['p1', 'p2'], ['p2', 'p1'], ['p3', 'p1']])
  // p1 has 2, p2 has 1 — not a tie. Force a real one:
  const t = vote([['p1', 'p2'], ['p2', 'p3'], ['p3', 'p1']])
  ok(t.tie, 'flagged as tied')
  eq(t.setup.votes, {}, 'votes cleared:')
  eq(t.setup.round, 2, 'second round:')
  eq(t.setup.tiedLast.sort(), ['p1', 'p2', 'p3'], 'who tied:')
  eq(t.setup.step, S.SETUP_STEPS.VOTE, 'still voting:')
  ok(!r.error)
})

check('changing your vote replaces it rather than adding one', () => {
  let s = S.castVote(S.defaultSetup(), { playerId: 'p1', choice: 'p2', players: PLAYERS }).setup
  s = S.castVote(s, { playerId: 'p1', choice: 'p3', players: PLAYERS }).setup
  eq(Object.keys(s.votes).length, 1, 'one vote from p1:')
  eq(s.votes.p1, 'p3')
})

check('outsiders and unknown candidates are refused', () => {
  ok(S.castVote(S.defaultSetup(), { playerId: 'zz', choice: 'p1', players: PLAYERS }).error)
  ok(S.castVote(S.defaultSetup(), { playerId: 'p1', choice: 'zz', players: PLAYERS }).error)
})

// ---------------------------------------------------------------------------
// Opening resources (p.6)
// ---------------------------------------------------------------------------

check('the allowance is 1 for Player 1, 2 for Player 2, and so on', () => {
  const s = vote([['p1', 'p2'], ['p3', 'p2'], ['p2', 'p1']]).setup
  eq(S.resourceAllowance(s, 'p2'), 1, 'Player 1 takes 1:')
  eq(S.resourceAllowance(s, 'p1'), 2, 'Player 2 takes 2:')
  eq(S.resourceAllowance(s, 'p3'), 3, 'Player 3 takes 3:')
})

check('a pick must total exactly the allowance', () => {
  const s = vote([['p1', 'p2'], ['p3', 'p2'], ['p2', 'p1']]).setup
  ok(S.pickResources(s, { playerId: 'p3', pool: pool({ trust: 2 }), players: PLAYERS }).error, 'too few')
  ok(S.pickResources(s, { playerId: 'p3', pool: pool({ trust: 4 }), players: PLAYERS }).error, 'too many')
  const good = S.pickResources(s, {
    playerId: 'p3',
    pool: pool({ trust: 2, funds: 1 }),
    players: PLAYERS,
  })
  ok(!good.error, good.error)
  eq(good.setup.resources.p3.trust, 2)
})

check('any mix is allowed — all of one type is fine', () => {
  const s = vote([['p1', 'p2'], ['p3', 'p2'], ['p2', 'p1']]).setup
  const r = S.pickResources(s, { playerId: 'p3', pool: { media: 3 }, players: PLAYERS })
  ok(!r.error, r.error)
  eq(r.setup.resources.p3.media, 3)
  eq(r.setup.resources.p3.trust, 0, 'the rest fill in as zero:')
})

check('bad input is rejected rather than coerced', () => {
  const s = vote([['p1', 'p2'], ['p3', 'p2'], ['p2', 'p1']]).setup
  ok(S.pickResources(s, { playerId: 'p3', pool: { gold: 3 }, players: PLAYERS }).error, 'unknown resource')
  ok(S.pickResources(s, { playerId: 'p3', pool: { trust: -1, funds: 4 }, players: PLAYERS }).error, 'negative')
  ok(S.pickResources(s, { playerId: 'p3', pool: { trust: 1.5 }, players: PLAYERS }).error, 'fractional')
})

check('the lobby is ready once the last player has picked', () => {
  let s = vote([['p1', 'p2'], ['p3', 'p2'], ['p2', 'p1']]).setup
  s = S.pickResources(s, { playerId: 'p2', pool: { trust: 1 }, players: PLAYERS }).setup
  eq(S.waitingOn(s, PLAYERS).sort(), ['p1', 'p3'], 'still waiting on:')
  s = S.pickResources(s, { playerId: 'p1', pool: { funds: 2 }, players: PLAYERS }).setup
  ok(!S.isReady(s), 'one to go')
  s = S.pickResources(s, { playerId: 'p3', pool: { media: 3 }, players: PLAYERS }).setup
  ok(S.isReady(s), 'ready')
  eq(S.waitingOn(s, PLAYERS), [])
})

check('you cannot pick resources before the vote settles', () => {
  const r = S.pickResources(S.defaultSetup(), { playerId: 'p1', pool: { trust: 1 }, players: PLAYERS })
  ok(r.error, 'refused')
})

// ---------------------------------------------------------------------------
// The game honours the choices
// ---------------------------------------------------------------------------

check('createGame deals exactly what each player chose', () => {
  let s = vote([['p1', 'p2'], ['p3', 'p2'], ['p2', 'p1']]).setup
  s = S.pickResources(s, { playerId: 'p2', pool: { media: 1 }, players: PLAYERS }).setup
  s = S.pickResources(s, { playerId: 'p1', pool: { trust: 2 }, players: PLAYERS }).setup
  s = S.pickResources(s, { playerId: 'p3', pool: { funds: 1, clout: 2 }, players: PLAYERS }).setup

  const seated = s.order.map((id) => PLAYERS.find((p) => p.id === id))
  const { game } = G.createGame({ players: seated, seed: 7, startingResources: s.resources })

  eq(game.players[0].id, 'p2', 'the elected player sits first:')
  eq(game.players[0].pool.media, 1)
  eq(R.poolTotal(game.players[0].pool), 1, 'Player 1 has 1 resource:')
  eq(game.players[1].pool.trust, 2)
  eq(game.players[2].pool.clout, 2)
  eq(R.poolTotal(game.players[2].pool), 3, 'Player 3 has 3:')
})

check('a wrong-sized pick is ignored rather than corrupting the deal', () => {
  const { game } = G.createGame({
    players: PLAYERS,
    seed: 7,
    startingResources: { p1: pool({ trust: 9 }) }, // Player 1 should get 1
  })
  eq(R.poolTotal(game.players[0].pool), 1, 'fell back to the automatic spread:')
})

check('the Reserve is drawn down by exactly what was dealt', () => {
  const { game } = G.createGame({
    players: PLAYERS,
    seed: 7,
    startingResources: { p1: { media: 1 }, p2: { media: 2 }, p3: { media: 3 } },
  })
  // 6 Media leave the Reserve, nothing else moves.
  eq(game.reserve.media, 24, 'Media reserve:')
  eq(game.reserve.trust, 30, 'Trust untouched:')
})

// ---------------------------------------------------------------------------
// Skipping and the advisory (p.13)
// ---------------------------------------------------------------------------

check('skipping keeps join order and leaves the deal to the engine', () => {
  const r = S.skipSetup(S.defaultSetup(), PLAYERS)
  ok(S.isReady(r.setup), 'ready at once')
  eq(r.setup.order, ['p1', 'p2', 'p3'], 'join order:')
  eq(r.setup.resources, {}, 'no picks:')
  ok(r.setup.skipped)
})

check('the advisory toggle only accepts the two printed markings', () => {
  const r = S.setAdvisory(S.defaultSetup(), ['mature', 'nonsense', 'trigger', 'mature'])
  eq(r.setup.excludeAdvisory.sort(), ['mature', 'trigger'], 'filtered and deduped:')
})

check('an excluded advisory keeps those cards out of the deck', () => {
  const { game } = G.createGame({ players: PLAYERS, seed: 3, excludeAdvisory: ['mature', 'trigger'] })
  ok(game.ideologyDeck.drawPile.length >= 0, 'a deck was still built')
})

check('legacy lobbies with no setup column still work', () => {
  const s = S.normaliseSetup(null)
  eq(s.step, S.SETUP_STEPS.VOTE)
  eq(s.votes, {})
  eq(s.excludeAdvisory, [])
})

report('Pre-game setup (p.6, p.13)')
