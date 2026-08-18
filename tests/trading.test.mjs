// SHASN — trading, auctions, 2-player mode and board geometry (Phases 7-8)
//
// Run with:  node tests/trading.test.mjs

import {
  board as B,
  resources as R,
  ideology as I,
  trading as T,
  twoPlayer as TP,
  game as G,
  zoneReqData,
  boardGeometry as boardGeo,
  zones,
  consts,
  createRunner,
  eq,
  ok,
} from './harness.mjs'

const { check, report } = createRunner()

const pool = (o = {}) => ({ ...R.emptyPool(), ...o })
const newGame = (seed = 99, count = 3) =>
  G.createGame({
    players: ['Ada', 'Bo', 'Cy', 'Di', 'Ed']
      .slice(0, count)
      .map((n, i) => ({ id: `p${i + 1}`, name: n })),
    seed,
  })

function ready(overrides = {}, seed = 99, count = 3) {
  let { game, rng } = newGame(seed, count)
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  game = G.answerIdeology(game, card.answers[0].ideologue).game
  if (game.turnPhase === consts.TURN_PHASES.RESOURCE_CAP) {
    game = G.discardToCap(game, R.autoDiscardToCap(G.activePlayer(game).pool)).game
  }
  return {
    game: { ...game, players: game.players.map((p, i) => (i === 0 ? { ...p, ...overrides } : p)) },
    rng,
  }
}

const worldTotal = (g) =>
  g.players.reduce((n, p) => n + R.poolTotal(p.pool), 0) + R.poolTotal(g.reserve)

// ===========================================================================
// Board geometry — recovered from the scan
// ===========================================================================

check('geometry still satisfies every rulebook invariant', () => {
  eq(zones.validateGeometry(), [])
})

check('the rendered board has exactly one pip per voter area', () => {
  for (const z of zones.ZONE_IDS) {
    const g = boardGeo.ZONE_GEOMETRY[z]
    ok(g, `${z} has geometry`)
    eq(g.pips.length, zones.ZONES[z].areas, `${z} pip count:`)
  }
})

check('drawn Volatile positions agree with the rules geometry', () => {
  for (const z of zones.ZONE_IDS) {
    eq(boardGeo.VOLATILE_INDICES[z], zones.ZONES[z].volatile, `${z}:`)
    for (const v of zones.ZONES[z].volatile) {
      ok(v >= 0 && v < boardGeo.ZONE_GEOMETRY[z].pips.length, `${z}: index ${v} in range`)
    }
  }
})

check('every pip sits inside the board viewBox', () => {
  const { x, y, w, h } = boardGeo.VIEW_BOX
  for (const z of zones.ZONE_IDS) {
    for (const [px, py] of boardGeo.ZONE_GEOMETRY[z].pips) {
      ok(px >= x && px <= x + w && py >= y && py <= y + h, `${z} pip (${px},${py}) out of view`)
    }
  }
})

check('Volatile Areas measured on the board total 11, one per zone minimum', () => {
  const counts = Object.fromEntries(
    zones.ZONE_IDS.map((z) => [z, zones.VOLATILE_PIXELS[z].length])
  )
  eq(Object.values(counts).reduce((a, b) => a + b, 0), 11, 'total:')
  ok(Object.values(counts).every((n) => n >= 1), 'every zone has at least one (p.17)')
  eq(counts.north, 2, 'North (21 areas) has 2:')
  eq(counts.south, 2, 'South (21 areas) has 2:')
})

check('Central borders only North and South', () => {
  eq(zones.ZONES.central.adjacent.sort(), ['north', 'south'])
  ok(!zones.areAdjacent('central', 'west'), 'Central does not touch West')
  ok(!zones.areAdjacent('central', 'east'), 'Central does not touch East')
})

check('opposite corner zones are not adjacent', () => {
  ok(!zones.areAdjacent('north_west', 'north_east'), 'NW/NE separated by North')
  ok(!zones.areAdjacent('south_west', 'south_east'), 'SW/SE separated by South')
  ok(!zones.areAdjacent('north', 'south'), 'N/S separated by Central')
})

check('corner zones each touch exactly one side zone and one band', () => {
  eq(zones.ZONES.north_west.adjacent.sort(), ['north', 'west'])
  eq(zones.ZONES.north_east.adjacent.sort(), ['east', 'north'])
  eq(zones.ZONES.south_west.adjacent.sort(), ['south', 'west'])
  eq(zones.ZONES.south_east.adjacent.sort(), ['east', 'south'])
})

check('gerrymandering between Central and West is now illegal', () => {
  let { game } = ready({})
  // Give p1 dominance in Central so they hold rights there.
  const c = B.emptyAreaIndices(game.board, 'central').slice(0, 3)
  game = { ...game, board: B.placeVoters(game.board, 'central', 'p1', c).board }
  eq(B.gerrymanderingRights(game.board).central, 'p1')

  const w = B.emptyAreaIndices(game.board, 'west')[0]
  const r = G.gerrymander(game, {
    rightsZoneId: 'central',
    from: { zoneId: 'central', areaIndex: c[0] },
    to: { zoneId: 'west', areaIndex: w },
  })
  ok(r.error, 'should be refused — Central does not border West')
})

// ===========================================================================
// Phase 7 — trading
// ===========================================================================
//
// Trading moved from a single immediate call to a propose/accept/counter
// negotiation, so its tests live in tests/trades.test.mjs. The primitives below
// (validateTradeOffer / executeTrade) remain as the low-level building blocks.

check('the low-level trade primitives still enforce the ratio rule', () => {
  const a = pool({ funds: 3 })
  const b = pool({ trust: 3 })
  ok(!R.validateTrade(pool(), pool({ trust: 1 }), a, b).ok, 'empty offer rejected')
  ok(!R.validateTrade(pool({ funds: 1 }), pool(), a, b).ok, 'empty request rejected')
  ok(R.validateTrade(pool({ funds: 1 }), pool({ trust: 1 }), a, b).ok, 'valid')
})

// ===========================================================================
// Phase 7 — auctions
// ===========================================================================

check('you may bid above your holdings but not above your cap (p.11)', () => {
  const { game } = ready({ pool: pool({ funds: 2 }) })
  let g = G.openAuction(game, { id: 'a1', itemType: 'conspiracy', minBid: 2 }).game

  const over = G.bid(g, { auctionId: 'a1', playerId: 'p1', amount: 13 })
  ok(over.error, 'above the cap of 12 is refused')

  const credit = G.bid(g, { auctionId: 'a1', playerId: 'p1', amount: 10 })
  ok(!credit.error, credit.error)
  eq(credit.game.auctions[0].bids.p1, 10, 'bid on credit accepted:')
})

check('bids below the minimum are refused', () => {
  const { game } = ready({})
  const g = G.openAuction(game, { id: 'a1', itemType: 'conspiracy', minBid: 5 }).game
  ok(G.bid(g, { auctionId: 'a1', playerId: 'p1', amount: 3 }).error, 'refused')
})

check('winning beyond your means creates debt that blocks purchases', () => {
  const { game, rng } = ready({ pool: pool({ funds: 3 }) })
  let g = G.openAuction(game, { id: 'a1', itemType: 'conspiracy', minBid: 2 }).game
  g = G.bid(g, { auctionId: 'a1', playerId: 'p1', amount: 8 }).game

  const closed = G.closeAuction(g, { auctionId: 'a1' })
  ok(!closed.error, closed.error)
  const winner = closed.game.players[0]
  eq(R.poolTotal(winner.pool), 0, 'paid everything they had:')
  eq(winner.auctionDebt, 5, 'the rest became debt:')

  const buy = G.buyConspiracy(closed.game, rng)
  ok(buy.error, 'purchases are frozen')
  ok(buy.error.includes('auction'), `unexpected: ${buy.error}`)
})

check('debt can be repaid across turns and then unfreezes purchases', () => {
  let { game, rng } = ready({ pool: pool({ funds: 3 }) })
  let g = G.openAuction(game, { id: 'a1', itemType: 'conspiracy', minBid: 2 }).game
  g = G.bid(g, { auctionId: 'a1', playerId: 'p1', amount: 8 }).game
  g = G.closeAuction(g, { auctionId: 'a1' }).game
  eq(g.players[0].auctionDebt, 5)

  // Hand them income and pay it down in two instalments.
  g = { ...g, players: g.players.map((p, i) => (i === 0 ? { ...p, pool: pool({ trust: 6 }) } : p)) }
  g = G.repayAuctionDebt(g, { playerId: 'p1', payment: pool({ trust: 2 }) }).game
  eq(g.players[0].auctionDebt, 3, 'partial repayment:')
  ok(!T.canPurchase(g.players[0]), 'still frozen')

  g = G.repayAuctionDebt(g, { playerId: 'p1', payment: pool({ trust: 3 }) }).game
  eq(g.players[0].auctionDebt, 0, 'cleared:')
  ok(T.canPurchase(g.players[0]), 'purchases unfrozen')
})

check('overpaying debt is refused', () => {
  const player = { id: 'p1', name: 'A', pool: pool({ funds: 9 }), auctionDebt: 2 }
  const r = T.repayDebt({ player, reserve: consts.newPublicReserve(), payment: pool({ funds: 5 }) })
  ok(r.error, 'refused')
})

check('an auction with no bids pays the seller the reserve price', () => {
  const { game } = ready({})
  let g = {
    ...game,
    players: game.players.map((p, i) => (i === 1 ? { ...p, pool: R.emptyPool() } : p)),
  }
  g = G.openAuction(g, { id: 'a1', sellerId: 'p2', itemType: 'conspiracy', minBid: 2 }).game

  const closed = G.closeAuction(g, { auctionId: 'a1' })
  ok(!closed.error, closed.error)
  eq(closed.game.auctions[0].status, 'discarded', 'item discarded:')
  eq(R.poolTotal(closed.game.players[1].pool), 2, 'seller compensated:')
})

check('a seller receives the proceeds of a won auction', () => {
  const { game } = ready({ pool: pool({ funds: 6 }) })
  let g = {
    ...game,
    players: game.players.map((p, i) => (i === 1 ? { ...p, pool: R.emptyPool() } : p)),
  }
  g = G.openAuction(g, { id: 'a1', sellerId: 'p2', itemType: 'conspiracy', minBid: 1 }).game
  g = G.bid(g, { auctionId: 'a1', playerId: 'p1', amount: 4 }).game

  const before = worldTotal(g)
  const closed = G.closeAuction(g, { auctionId: 'a1' })
  ok(!closed.error, closed.error)
  eq(R.poolTotal(closed.game.players[0].pool), 2, 'buyer paid 4 of 6:')
  eq(R.poolTotal(closed.game.players[1].pool), 4, 'seller received 4:')
  eq(worldTotal(closed.game), before, 'conserved:')
})

check('A Call From Karachi opens an auction (p.11)', () => {
  // p.11: "Certain events in the game will initiate an auction." Nothing in the
  // game ever did until this Headline was wired up.
  let { game, rng } = ready({})
  game = {
    ...game,
    pendingHeadlines: [{ zoneId: 'central', areaIndex: 0, playerId: 'p1' }],
    headlineDeck: { drawPile: ['a_call_from_karachi'], discard: [] },
  }

  const r = G.resolveNextHeadline(game, rng)
  ok(!r.error, r.error)
  eq(r.game.auctions.length, 1, 'an auction opened:')

  const a = r.game.auctions[0]
  eq(a.status, 'open')
  eq(a.sellerId, 'p1', 'the player who triggered it is selling:')
  eq(a.minBid, 2, 'starting at 2, as the card says:')
  ok(r.game.log.some((l) => l.type === 'auction'), 'logged')
})

check('an auction can be closed by anyone, and the engine picks the winner', () => {
  const { game } = ready({ pool: pool({ funds: 6 }) })
  let g = G.openAuction(game, { id: 'a1', itemType: 'conspiracy', minBid: 1 }).game
  g = G.bid(g, { auctionId: 'a1', playerId: 'p2', amount: 3 }).game
  g = G.bid(g, { auctionId: 'a1', playerId: 'p3', amount: 5 }).game

  const closed = G.closeAuction(g, { auctionId: 'a1' })
  ok(!closed.error, closed.error)
  eq(closed.game.auctions[0].winnerId, 'p3', 'highest bid wins:')
  eq(closed.game.auctions[0].winningBid, 5)
})

check('you cannot bid on your own auction', () => {
  const { game } = ready({})
  const g = G.openAuction(game, { id: 'a1', sellerId: 'p1', itemType: 'conspiracy', minBid: 1 }).game
  ok(G.bid(g, { auctionId: 'a1', playerId: 'p1', amount: 3 }).error, 'refused')
})

// ===========================================================================
// Phase 8 — 2-player mode
// ===========================================================================

check('the 2-player board has 7 zones with one requirement each', () => {
  eq(TP.TWO_PLAYER_ZONE_IDS.length, 7)
  eq(TP.TWO_PLAYER_ZONE_COUNT, 7)
})

check('there are 14 Zone Requirement Cards across three types (p.21)', () => {
  eq(zoneReqData.ZONE_REQUIREMENT_COUNT, 14)
  const types = new Set(Object.values(zoneReqData.ZONE_REQUIREMENTS).map((r) => r.type))
  eq([...types].sort(), ['one_time', 'while_forming', 'zonal_rule'])
})

check('each player starts with 8 resources, 2 of each type (p.20)', () => {
  const p = TP.startingPool()
  eq(R.poolTotal(p), 8)
  ok(Object.values(p).every((n) => n === 2), 'evenly spread')
})

check('the higher secret bid takes the first seat, all bids returned (p.20)', () => {
  const players = [
    { id: 'a', name: 'Ada', pool: TP.startingPool() },
    { id: 'b', name: 'Bo', pool: TP.startingPool() },
  ]
  const reserve = consts.newPublicReserve()
  const before = players.reduce((n, p) => n + R.poolTotal(p.pool), 0) + R.poolTotal(reserve)

  // Bo bids 5 across three types; each player holds only 2 of each.
  const r = TP.resolveOpeningBid({
    bids: { a: pool({ funds: 2 }), b: pool({ trust: 2, funds: 2, clout: 1 }) },
    players,
    reserve,
  })
  ok(!r.error, r.error)
  eq(r.firstPlayerId, 'b', 'higher bid goes first:')
  eq(r.players[0].name, 'Bo', 'seat order:')
  eq(R.poolTotal(r.players[0].pool), 3, 'Bo spent 5 of 8:')
  eq(
    r.players.reduce((n, p) => n + R.poolTotal(p.pool), 0) + R.poolTotal(r.reserve),
    before,
    'bids returned to the Reserve:'
  )
})

check('a tied opening bid asks for another round', () => {
  const players = [
    { id: 'a', name: 'Ada', pool: TP.startingPool() },
    { id: 'b', name: 'Bo', pool: TP.startingPool() },
  ]
  // Both bid 3, spread across types they actually hold.
  const r = TP.resolveOpeningBid({
    bids: { a: pool({ funds: 2, clout: 1 }), b: pool({ trust: 2, media: 1 }) },
    players,
    reserve: consts.newPublicReserve(),
  })
  ok(r.tie, 'should report a tie')
})

check('you cannot bid more than you hold in the opening bid', () => {
  const players = [
    { id: 'a', name: 'Ada', pool: TP.startingPool() },
    { id: 'b', name: 'Bo', pool: TP.startingPool() },
  ]
  const reserve = consts.newPublicReserve()

  ok(
    TP.resolveOpeningBid({
      bids: { a: pool({ funds: 9 }), b: pool({ trust: 1 }) },
      players,
      reserve,
    }).error,
    'more than the total held is refused'
  )

  // The subtle case: 5 Trust is within the 8-resource total but they hold only 2.
  const r = TP.resolveOpeningBid({
    bids: { a: pool({ trust: 5 }), b: pool({ trust: 1 }) },
    players,
    reserve,
  })
  ok(r.error, 'over-bidding a single resource type is refused')
  ok(!r.players, 'and no partial state is returned')
})

check('Zone Requirements are split 7/7 between the players', () => {
  const rng = (() => { let s = 3; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()
  const st = TP.dealZoneRequirements(rng)
  eq(st.hands[0].length, 7)
  eq(st.hands[1].length, 7)
  eq(new Set([...st.hands[0], ...st.hands[1]]).size, 14, 'all distinct:')
})

check('Player 2 places first, so sets 4 of the 7 zones (p.21)', () => {
  eq(TP.nextPlacingSeat(0), 1, 'Player 2 first:')
  eq(TP.nextPlacingSeat(1), 0, 'then Player 1:')
  eq(TP.placementsPerSeat(7), { player1: 3, player2: 4 })
})

check('requirements are placed alternately until every zone has one', () => {
  const rng = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()
  let st = TP.dealZoneRequirements(rng)

  const zoneIds = [...TP.TWO_PLAYER_ZONE_IDS]
  for (let i = 0; i < 7; i++) {
    const seat = TP.nextPlacingSeat(st.placedCount)
    const reqId = st.hands[seat][0]
    const r = TP.placeZoneRequirement(st, { seatIndex: seat, requirementId: reqId, zoneId: zoneIds[i] })
    ok(!r.error, `placement ${i + 1}: ${r.error}`)
    st = r.state
  }
  eq(Object.keys(st.placements).length, 7, 'every zone covered:')
  eq(st.toPlaceSeat, null, 'placement complete:')
})

check('placing out of turn or twice in a zone is refused', () => {
  const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()
  const st = TP.dealZoneRequirements(rng)

  const wrongSeat = TP.placeZoneRequirement(st, {
    seatIndex: 0, // Player 2 places first
    requirementId: st.hands[0][0],
    zoneId: 'north',
  })
  ok(wrongSeat.error, 'out of turn refused')

  const first = TP.placeZoneRequirement(st, {
    seatIndex: 1,
    requirementId: st.hands[1][0],
    zoneId: 'north',
  })
  ok(!first.error, first.error)

  const dup = TP.placeZoneRequirement(first.state, {
    seatIndex: 0,
    requirementId: first.state.hands[0][0],
    zoneId: 'north',
  })
  ok(dup.error, 'zone already has a requirement')
})

check('a While-Forming requirement is checked against the player', () => {
  const player = {
    id: 'p1',
    name: 'Ada',
    pool: pool({ trust: 3 }),
    resourceCap: 12,
    ideologyCards: [],
    conspiracyCards: [],
  }
  const met = TP.checkRequirement({
    requirement: 'req_trust_of_the_people',
    player,
    zoneId: 'north',
  })
  ok(met.ok, 'affordable')

  const poor = TP.checkRequirement({
    requirement: 'req_trust_of_the_people',
    player: { ...player, pool: pool({ trust: 1 }) },
    zoneId: 'north',
  })
  ok(!poor.ok, 'not affordable')
})

check('a One-Time requirement stops being checked once satisfied', () => {
  const player = {
    id: 'p1',
    name: 'Ada',
    pool: R.emptyPool(),
    resourceCap: 12,
    ideologyCards: [],
    conspiracyCards: [],
  }
  const unmet = TP.checkRequirement({ requirement: 'req_conspirator', player, zoneId: 'north' })
  ok(!unmet.ok, 'not yet met')

  const already = TP.checkRequirement({
    requirement: 'req_conspirator',
    player,
    zoneId: 'north',
    satisfied: { 'p1:north': true },
  })
  ok(already.ok && already.alreadyMet, 'already marked')
})

check('a Zonal Rule is surfaced rather than treated as a condition', () => {
  const r = TP.checkRequirement({ requirement: 'req_no_gerrymander', player: {}, zoneId: 'north' })
  ok(r.ok, 'never blocks a majority')
  eq(r.rule.rule, 'noGerrymander')
  eq(TP.zonalRuleFor({ north: 'req_no_gerrymander' }, 'north').rule, 'noGerrymander')
  eq(TP.zonalRuleFor({ north: 'req_conspirator' }, 'north'), null, 'non-rules return null:')
})

report('Trading, auctions, 2-player, geometry (Phases 7-8)')
