// SHASN — the cards that go round the table.
//
// Four cards in the India deck could not be resolved by the engine and were
// handed back to the players with their text and a shrug. Two of them are the
// same shape: the game stops and walks round the seats, one at a time.
//
//   Submerged (p.17)          "Starting with you, every player can Gerrymander
//                              1 majority or non-majority voter immediately.
//                              These voters cannot be placed into Volatile
//                              Areas."
//   A Trip To Goalpara (p.17) "The next 3 players after you can select and
//                              discard an open Voter Card... New Voter Cards
//                              will only open after all 3 have been discarded."
//
// The interesting cases are the awkward ones: a three-player Goalpara wraps
// back onto the player who triggered it, and a player with no Gerrymandering
// Rights has nothing to do with their slot and must be able to pass without
// deadlocking the table.
//
// Run with:  node tests/rounds.test.mjs

import {
  rounds as Rounds,
  game as G,
  board as Board,
  cards as Cards,
  ideology as I,
  resources as R,
  voterCards as V,
  zones,
  consts,
  createRunner,
  eq,
  ok,
} from './harness.mjs'

const { check, report } = createRunner()

const PLAYERS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
  { id: 'p4', name: 'Di' },
]

function newGame(count = 4, seed = 7) {
  const { game, rng } = G.createGame({ players: PLAYERS.slice(0, count), seed })
  return { game, rng }
}

/** Past the Ideology step and into the actions phase. */
function inActions(count = 4, seed = 7) {
  let { game, rng } = newGame(count, seed)
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  game = G.answerIdeology(game, card.answers[0].ideologue).game
  if (game.turnPhase === consts.TURN_PHASES.RESOURCE_CAP) {
    game = G.discardToCap(game, R.autoDiscardToCap(G.activePlayer(game).pool)).game
  }
  return { game, rng }
}

// ---------------------------------------------------------------------------
// The queue itself
// ---------------------------------------------------------------------------

check('a round goes round the seats in turn order', () => {
  const players = PLAYERS.map((p) => ({ ...p }))
  eq(Rounds.seatsFrom(players, 'p3'), ['p3', 'p4', 'p1', 'p2'], 'starting with you:')
  eq(Rounds.seatsFrom(players, 'p3', { include: false }), ['p4', 'p1', 'p2'], 'after you:')
})

check('"the next 3 players" wraps back onto you when the table is small', () => {
  // The card's own clarification: "In a 3 player game, you discard the last open
  // card to receive the resources." Three slots, two other players — so the
  // third comes back round to the player who triggered it.
  const three = PLAYERS.slice(0, 3)
  eq(
    Rounds.seatsFrom(three, 'p1', { include: false, count: 3 }),
    ['p2', 'p3', 'p1'],
    'three players, three slots:'
  )
  eq(
    Rounds.seatsFrom(PLAYERS, 'p1', { include: false, count: 3 }),
    ['p2', 'p3', 'p4'],
    'four players, no wrap:'
  )
})

check('only the player whose slot it is may act', () => {
  const round = Rounds.openRound({ kind: 'gerrymander', queue: ['p2', 'p3'] })
  ok(Rounds.isCurrent(round, 'p2'), 'the live seat')
  ok(!Rounds.isCurrent(round, 'p3'), 'not the one behind them')
  eq(Rounds.currentPlayer(round), 'p2')
  eq(Rounds.waiting(round), ['p3'], 'still to be asked:')
})

check('a round reports how far through it is', () => {
  let round = Rounds.openRound({ kind: 'gerrymander', queue: ['p1', 'p2', 'p3'] })
  eq(Rounds.progress(round), { done: 0, total: 3 }, 'at the start:')
  round = Rounds.advance(round, { playerId: 'p1', action: 'pass' })
  eq(Rounds.progress(round), { done: 1, total: 3 }, 'one down:')
  ok(!Rounds.isFinished(round))
  round = Rounds.advance(round, { playerId: 'p2', action: 'pass' })
  round = Rounds.advance(round, { playerId: 'p3', action: 'pass' })
  ok(Rounds.isFinished(round), 'and then it is over')
})

// ---------------------------------------------------------------------------
// Submerged
// ---------------------------------------------------------------------------

function openSubmerged(game, actorId = 'p1') {
  const effect = { type: 'roundOfGerrymanders', allowMajority: true, blockVolatile: true }
  const result = Cards.applyEffect(effect, {
    players: game.players,
    board: game.board,
    reserve: game.reserve,
    actorId,
  })
  ok(!result.error, result.error)
  ok(result.round, 'the effect asks for a round')
  return result
}

check('Submerged is no longer handed back to the table', () => {
  const { game } = inActions()
  const result = openSubmerged(game)
  ok(!result.manual, 'the engine resolves it now')
  eq(result.round.kind, 'gerrymander')
  eq(result.round.include, true, 'starting with you:')
})

check('Submerged queues every player, starting with the one who triggered it', () => {
  const { game } = inActions()
  const result = openSubmerged(game, 'p2')
  const queue = Rounds.seatsFrom(game.players, result.round.from, { include: true })
  eq(queue, ['p2', 'p3', 'p4', 'p1'], 'everyone, from the trigger:')
})

check('a player with no Gerrymandering Rights can pass, and the round moves on', () => {
  // This is the case that would otherwise deadlock the game. On a fresh board
  // nobody holds a majority anywhere, so nobody has rights, and every slot is a
  // pass. The round still has to close.
  let { game, rng } = inActions()
  game = { ...game, round: Rounds.openRound({
    kind: 'gerrymander',
    cardId: 'submerged',
    cardName: 'Submerged',
    queue: ['p1', 'p2', 'p3', 'p4'],
    options: { allowMajority: true, blockVolatileDestination: true },
  }) }

  for (const id of ['p1', 'p2', 'p3', 'p4']) {
    const r = G.actInRound(game, rng, { playerId: id, action: 'pass' })
    ok(!r.error, r.error)
    game = r.game
  }
  eq(game.round, null, 'the round closed:')
})

check('acting out of turn is refused', () => {
  let { game, rng } = inActions()
  game = { ...game, round: Rounds.openRound({
    kind: 'gerrymander',
    cardName: 'Submerged',
    queue: ['p1', 'p2'],
    options: {},
  }) }
  const r = G.actInRound(game, rng, { playerId: 'p2', action: 'pass' })
  ok(r.error, 'refused')
  ok(/Ada/.test(r.error), `and it says whose slot it is; got: ${r.error}`)
})

check('Submerged lets you move a majority voter, which normal rules forbid', () => {
  // The whole point of the card. Set up a zone where p1 holds the majority, then
  // move one of the very voters giving them that majority.
  let { game, rng } = inActions()
  const zoneId = zones.ZONE_IDS[0]
  const size = zones.ZONES[zoneId].areas

  // Fill the zone with p1 so they hold it outright, leaving one area free.
  const owners = Array(size).fill(null)
  for (let i = 0; i < size - 1; i++) owners[i] = 'p1'
  game = {
    ...game,
    board: { ...game.board, zones: { ...game.board.zones, [zoneId]: { owners } } },
  }
  ok(Board.holdsMajority(game.board, zoneId, 'p1'), 'p1 holds the zone')

  // A non-volatile source and an empty non-volatile destination in the same zone.
  const from = owners.findIndex((o, i) => o === 'p1' && !Board.isProtected(zoneId, i))
  const to = size - 1
  ok(from >= 0, 'found a movable voter')

  const plain = Board.gerrymander(game.board, 'p1', zoneId, { zoneId, areaIndex: from }, { zoneId, areaIndex: to })
  const majorityVoter = !Board.isNonMajorityVoter(game.board, zoneId, from)

  game = { ...game, round: Rounds.openRound({
    kind: 'gerrymander',
    cardName: 'Submerged',
    queue: ['p1'],
    options: { allowMajority: true, blockVolatileDestination: true },
  }) }
  const r = G.actInRound(game, rng, {
    playerId: 'p1',
    action: 'act',
    rightsZoneId: zoneId,
    from: { zoneId, areaIndex: from },
    to: { zoneId, areaIndex: to },
  })

  if (majorityVoter) {
    ok(plain.error, 'the ordinary rules refuse this move')
    ok(!r.error, `but Submerged allows it; got: ${r.error}`)
  }
  ok(!r.error, r.error)
  eq(r.game.board.zones[zoneId].owners[from], null, 'the voter left:')
  eq(r.game.board.zones[zoneId].owners[to], 'p1', 'and arrived:')
})

check('Submerged will not let a voter be placed into a Volatile Area', () => {
  // "These voters cannot be placed into Volatile Areas" — the one restriction
  // the card ADDS. Ordinary gerrymandering may move into one deliberately, to
  // trigger a Headline, so this has to be a card-specific option.
  const zoneId = zones.ZONE_IDS.find((z) => zones.ZONES[z].volatile.length > 0)
  const volatileIndex = zones.ZONES[zoneId].volatile[0]

  let { game, rng } = inActions()
  const size = zones.ZONES[zoneId].areas
  const owners = Array(size).fill(null)
  for (let i = 0; i < size; i++) if (i !== volatileIndex) owners[i] = 'p1'
  owners[volatileIndex] = null
  game = {
    ...game,
    board: { ...game.board, zones: { ...game.board.zones, [zoneId]: { owners } } },
  }

  const from = owners.findIndex((o, i) => o === 'p1' && !Board.isProtected(zoneId, i))
  game = { ...game, round: Rounds.openRound({
    kind: 'gerrymander',
    cardName: 'Submerged',
    queue: ['p1'],
    options: { allowMajority: true, blockVolatileDestination: true },
  }) }

  const r = G.actInRound(game, rng, {
    playerId: 'p1',
    action: 'act',
    rightsZoneId: zoneId,
    from: { zoneId, areaIndex: from },
    to: { zoneId, areaIndex: volatileIndex },
  })
  ok(r.error, 'refused')
  ok(/Volatile/.test(r.error), `and says why; got: ${r.error}`)

  // The same move is legal without the card's restriction — proving the block
  // comes from Submerged and not from something else being wrong.
  const allowed = Board.gerrymander(
    game.board,
    'p1',
    zoneId,
    { zoneId, areaIndex: from },
    { zoneId, areaIndex: volatileIndex },
    { allowMajority: true }
  )
  ok(!allowed.error, `ordinarily legal; got: ${allowed.error}`)
})

check('Submerged does not eat your own Gerrymander for the turn', () => {
  // The card grants a move "immediately", outside the run of play. For three of
  // the four players there is no turn for it to come out of, so taking it from
  // the active player's allowance would penalise them for their own card.
  let { game, rng } = inActions()
  const zoneId = zones.ZONE_IDS[0]
  const size = zones.ZONES[zoneId].areas
  const owners = Array(size).fill(null)
  for (let i = 0; i < size - 1; i++) owners[i] = 'p1'
  game = {
    ...game,
    board: { ...game.board, zones: { ...game.board.zones, [zoneId]: { owners } } },
  }
  const from = owners.findIndex((o, i) => o === 'p1' && !Board.isProtected(zoneId, i))

  const before = G.gerrymanderUsesRemaining(game.players[0], zoneId)
  game = { ...game, round: Rounds.openRound({
    kind: 'gerrymander',
    cardName: 'Submerged',
    queue: ['p1'],
    options: { allowMajority: true, blockVolatileDestination: true },
  }) }
  const r = G.actInRound(game, rng, {
    playerId: 'p1',
    action: 'act',
    rightsZoneId: zoneId,
    from: { zoneId, areaIndex: from },
    to: { zoneId, areaIndex: size - 1 },
  })
  ok(!r.error, r.error)
  eq(G.gerrymanderUsesRemaining(r.game.players[0], zoneId), before, 'allowance untouched:')
})

// ---------------------------------------------------------------------------
// A Trip To Goalpara
// ---------------------------------------------------------------------------

check('A Trip To Goalpara is no longer handed back to the table', () => {
  const { game } = inActions()
  const result = Cards.applyEffect(
    { type: 'cashOutVoterCards', players: 3, holdRefill: true },
    { players: game.players, board: game.board, reserve: game.reserve, actorId: 'p1' }
  )
  ok(!result.error, result.error)
  ok(!result.manual, 'the engine resolves it now')
  eq(result.round.kind, 'cashOutVoter')
  eq(result.round.include, false, 'the next players AFTER you:')
  eq(result.round.count, 3, 'three of them:')
})

function goalpara(game, queue) {
  return {
    ...game,
    round: Rounds.openRound({
      kind: 'cashOutVoter',
      cardId: 'a_trip_to_goalpara',
      cardName: 'A Trip To Goalpara',
      queue,
      options: { holdRefill: true },
    }),
  }
}

check('cashing out pays the resources printed on the card', () => {
  let { game, rng } = inActions()
  const cardId = game.market.open[0]
  const card = V.getVoterCard(cardId)
  const expected = G.cashOutValue(card).gains

  game = goalpara(game, ['p2'])
  const before = { ...game.players[1].pool }
  const r = G.actInRound(game, rng, { playerId: 'p2', action: 'act', openIndex: 0 })
  ok(!r.error, r.error)

  const after = r.game.players[1].pool
  for (const k of Object.keys(expected)) {
    eq(after[k] - before[k], expected[k], `${k} gained:`)
  }
  ok(R.poolTotal(expected) > 0, 'the card was worth something')
})

check('the wildcard pips pay whatever the player asks for', () => {
  // Most stub cards are mostly wildcards, and a wildcard that silently picks for
  // you is a worse card than one you choose.
  const card = { cost: { funds: 1, any: 2 } }
  const chosen = G.cashOutValue(card, { trust: 2 })
  eq(chosen.gains.funds, 1, 'the specific pip:')
  eq(chosen.gains.trust, 2, 'and the wildcards, as asked:')

  const wrong = G.cashOutValue(card, { trust: 1 })
  ok(wrong.error, 'the wrong number of wildcards is refused')

  const auto = G.cashOutValue(card)
  eq(R.poolTotal(auto.gains), 3, 'without a choice it still pays the full value:')
})

check('the open row is NOT refilled until all three are gone', () => {
  // "New Voter Cards will only open after all 3 cards have been discarded." The
  // point of the card is that each player picks from a shorter row than the
  // last, so a refill halfway through would gut it.
  let { game, rng } = inActions()
  eq(game.market.open.length, 3, 'the row starts full:')

  game = goalpara(game, ['p2', 'p3', 'p4'])

  let r = G.actInRound(game, rng, { playerId: 'p2', action: 'act', openIndex: 0 })
  ok(!r.error, r.error)
  eq(r.game.market.open.length, 2, 'after the first pick:')
  ok(r.game.round, 'the round is still open')

  r = G.actInRound(r.game, rng, { playerId: 'p3', action: 'act', openIndex: 0 })
  ok(!r.error, r.error)
  eq(r.game.market.open.length, 1, 'after the second:')

  r = G.actInRound(r.game, rng, { playerId: 'p4', action: 'act', openIndex: 0 })
  ok(!r.error, r.error)
  eq(r.game.round, null, 'the round closed:')
  eq(r.game.market.open.length, 3, 'and only now does the row refill:')
})

check('in a three-player game the last card comes back to you', () => {
  let { game, rng } = inActions(3)
  const queue = Rounds.seatsFrom(game.players, 'p1', { include: false, count: 3 })
  eq(queue, ['p2', 'p3', 'p1'], 'the third slot is your own:')

  game = goalpara(game, queue)
  const before = R.poolTotal(game.players[0].pool)

  let r = { game }
  for (const id of queue) {
    r = G.actInRound(r.game, rng, { playerId: id, action: 'act', openIndex: 0 })
    ok(!r.error, r.error)
  }
  eq(r.game.round, null, 'the round closed:')
  ok(
    R.poolTotal(r.game.players[0].pool) > before,
    'and the player who triggered it was paid for the last card'
  )
})

check('you cannot pick a card that is not there', () => {
  let { game, rng } = inActions()
  game = goalpara(game, ['p2'])
  const r = G.actInRound(game, rng, { playerId: 'p2', action: 'act', openIndex: 9 })
  ok(r.error, 'refused')
})

// ---------------------------------------------------------------------------
// The round blocks the game
// ---------------------------------------------------------------------------

check('the turn cannot end while a card is going round the table', () => {
  let { game, rng } = inActions()
  game = goalpara(game, ['p2', 'p3', 'p4'])
  const r = G.endTurn(game, rng)
  ok(r.error, 'refused')
  ok(/Goalpara/.test(r.error), `and names the card; got: ${r.error}`)
})

check('once the round closes the turn can end normally', () => {
  let { game, rng } = inActions()
  game = goalpara(game, ['p2'])
  const acted = G.actInRound(game, rng, { playerId: 'p2', action: 'act', openIndex: 0 })
  ok(!acted.error, acted.error)
  eq(acted.game.round, null, 'closed:')

  const r = G.endTurn(acted.game, rng)
  ok(!r.error, `the turn ends; got: ${r.error}`)
})

report('Cards that go round the table')
