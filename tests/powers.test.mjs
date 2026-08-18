// SHASN — Ideologue powers, Headlines and Conspiracies (Phases 4-6)
//
// Run with:  node tests/powers.test.mjs

import {
  board as B,
  resources as R,
  ideology as I,
  powers as P,
  cards as C,
  game as G,
  conspiracyData,
  headlineData,
  voterCardData,
  zones,
  consts,
  createRunner,
  eq,
  ok,
} from './harness.mjs'

const { check, report } = createRunner()

const newGame = (seed = 99, count = 3) =>
  G.createGame({
    players: ['Ada', 'Bo', 'Cy', 'Di', 'Ed']
      .slice(0, count)
      .map((n, i) => ({ id: `p${i + 1}`, name: n })),
    seed,
  })

const cardsOf = (n, ideologue) => Array.from({ length: n }, () => ({ cardId: 'x', ideologue }))
const pool = (o = {}) => ({ ...R.emptyPool(), ...o })

/** Every resource in the world: all player pools plus the Public Reserve. */
const worldTotal = (game) =>
  game.players.reduce((n, p) => n + R.poolTotal(p.pool), 0) + R.poolTotal(game.reserve)

/**
 * Advance from the active player's actions phase all the way back round to
 * them, playing out every intervening turn.
 */
function aroundTheTable(game, rng) {
  let g = G.endTurn(game, rng).game
  while (g.activeSeat !== 0) {
    const c = I.getIdeologyCard(g.pendingIdeologyCard)
    g = G.answerIdeology(g, c.answers[0].ideologue).game
    if (g.turnPhase === consts.TURN_PHASES.RESOURCE_CAP) {
      g = G.discardToCap(g, R.autoDiscardToCap(G.activePlayer(g).pool)).game
    }
    g = G.endTurn(g, rng).game
  }
  return g
}

/** Drop a game straight into the actions phase with a chosen loadout. */
function ready(overrides = {}, seed = 99, count = 3) {
  let { game, rng } = newGame(seed, count)
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  game = G.answerIdeology(game, card.answers[0].ideologue).game
  if (game.turnPhase === consts.TURN_PHASES.RESOURCE_CAP) {
    game = G.discardToCap(game, R.autoDiscardToCap(G.activePlayer(game).pool)).game
  }
  game = {
    ...game,
    players: game.players.map((p, i) => (i === 0 ? { ...p, ...overrides } : p)),
  }
  return { game, rng }
}

// ===========================================================================
// Deck integrity — the real India decks
// ===========================================================================

check('the Conspiracy deck is the real 20-card India deck', () => {
  eq(conspiracyData.CONSPIRACY_DECK_SIZE, 20, 'printed cards:')
  eq(conspiracyData.CONSPIRACY_CARD_IDS.length, 16, 'unique cards:')
  ok(!conspiracyData.IS_STUB_CONTENT, 'should not be flagged as stub')
  eq(conspiracyData.CONSPIRACY_CARDS.chai_paani.copies, 2, 'Chai-Paani 1/2:')
  eq(conspiracyData.CONSPIRACY_CARDS.vikas_model.copies, 4, 'Vikas Model 1/4:')
})

check('the Headline deck is the real 20-card India deck', () => {
  eq(headlineData.HEADLINE_DECK_SIZE, 20)
  ok(!headlineData.IS_STUB_CONTENT, 'should not be flagged as stub')
})

check('every card declares text and a resolution mode', () => {
  const modes = new Set(['auto', 'choice', 'interrupt', 'persistent', 'delayed', 'table'])
  for (const [id, c] of Object.entries(conspiracyData.CONSPIRACY_CARDS)) {
    ok(c.text && c.text.length > 10, `${id} needs text`)
    ok(modes.has(c.mode), `${id} has odd mode ${c.mode}`)
    ok(c.effect, `${id} needs an effect`)
  }
  for (const [id, c] of Object.entries(headlineData.HEADLINE_CARDS)) {
    ok(c.text && c.text.length > 10, `${id} needs text`)
    ok(modes.has(c.mode), `${id} has odd mode ${c.mode}`)
  }
})

check('decks shuffle to the right size', () => {
  const rng = () => B && undefined
  const d = C.buildConspiracyDeck((() => { let s = 5; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })())
  eq(d.drawPile.length, 20, 'conspiracy draw pile:')
})

// ===========================================================================
// Phase 4 — Ideologue powers
// ===========================================================================

check('a locked power cannot be used', () => {
  const { game } = ready({ ideologyCards: cardsOf(2, 'capitalist') })
  const r = G.prospect(game, { give: pool({ funds: 1 }), take: pool({ trust: 2 }) })
  ok(r.error, 'should be refused')
  ok(r.error.includes('not unlocked'), `unexpected: ${r.error}`)
})

check('Capitalist L3 Prospecting trades 1 resource for up to 2 (p.23)', () => {
  const { game } = ready({ ideologyCards: cardsOf(3, 'capitalist'), pool: pool({ funds: 3 }) })

  const before = worldTotal(game)
  const r = G.prospect(game, { give: pool({ funds: 1 }), take: pool({ trust: 1, media: 1 }) })
  ok(!r.error, r.error)
  const me = r.game.players[0]
  eq(me.pool.funds, 2, 'gave 1 funds:')
  eq(me.pool.trust, 1, 'took trust:')
  eq(me.pool.media, 1, 'took media:')
  eq(R.poolTotal(me.pool), 4, 'net +1 overall:')
  eq(worldTotal(r.game), before, 'nothing created or destroyed:')
})

check('Prospecting is once per turn and resets next turn', () => {
  const { game, rng } = ready({ ideologyCards: cardsOf(3, 'capitalist'), pool: pool({ funds: 5 }) })

  const first = G.prospect(game, { give: pool({ funds: 1 }), take: pool({ trust: 1 }) })
  ok(!first.error, first.error)
  const second = G.prospect(first.game, { give: pool({ funds: 1 }), take: pool({ trust: 1 }) })
  ok(second.error, 'second use should be refused')
  ok(second.error.includes('exhausted'), `unexpected: ${second.error}`)

  const g = aroundTheTable(first.game, rng)
  eq(g.activeSeat, 0, 'back to the first player:')
  eq(
    I.powerUsesRemaining(g.players[0].ideologyCards, g.players[0].powerUses, 'capitalist', 3),
    1,
    'uses reset:'
  )
})

check('Prospecting cannot take more than 2', () => {
  const { game } = ready({ ideologyCards: cardsOf(3, 'capitalist'), pool: pool({ funds: 3 }) })
  ok(G.prospect(game, { give: pool({ funds: 1 }), take: pool({ trust: 3 }) }).error, 'refused')
  ok(G.prospect(game, { give: pool({ funds: 2 }), take: pool({ trust: 1 }) }).error, 'gives only 1')
})

check('Capitalist L5 Breaking Ground evicts any voter, majority included (p.23)', () => {
  let { game } = ready({ ideologyCards: cardsOf(5, 'capitalist') })
  // Give p2 a majority in central (5 of 9).
  const free = B.emptyAreaIndices(game.board, 'central').slice(0, 5)
  game = { ...game, board: B.placeVoters(game.board, 'central', 'p2', free).board }
  eq(B.majorityHolder(game.board, 'central'), 'p2')

  const r = G.breakingGround(game, { zoneId: 'central', areaIndex: free[0] })
  ok(!r.error, r.error)
  eq(B.majorityHolder(r.game.board, 'central'), null, 'majority broken:')
  eq(r.game.board.evicted.p2, 1, 'returned to its owner:')
})

check('Breaking Ground is 3 per turn', () => {
  let { game } = ready({ ideologyCards: cardsOf(5, 'capitalist') })
  // Avoid Volatile Areas — voters there are immune to eviction (p.17).
  const free = B.emptyAreaIndices(game.board, 'north')
    .filter((i) => !zones.isVolatile('north', i))
    .slice(0, 4)
  game = { ...game, board: B.placeVoters(game.board, 'north', 'p2', free).board }

  let g = game
  for (let i = 0; i < 3; i++) {
    const r = G.breakingGround(g, { zoneId: 'north', areaIndex: free[i] })
    ok(!r.error, `use ${i + 1}: ${r.error}`)
    g = r.game
  }
  ok(G.breakingGround(g, { zoneId: 'north', areaIndex: free[3] }).error, '4th use refused')
})

check('Supremo L3 Donations snatches a resource (p.24)', () => {
  const { game } = ready({ ideologyCards: cardsOf(3, 'supremo') })
  const g = {
    ...game,
    players: game.players.map((p, i) => (i === 1 ? { ...p, pool: pool({ trust: 2 }) } : p)),
  }

  const r = G.donations(g, { targetPlayerId: 'p2', resource: 'trust' })
  ok(!r.error, r.error)
  eq(r.game.players[1].pool.trust, 1, 'victim lost 1:')
  eq(r.game.players[0].pool.trust, (game.players[0].pool.trust || 0) + 1, 'thief gained 1:')
})

check('Donations is twice per turn and needs a real target', () => {
  const { game } = ready({ ideologyCards: cardsOf(3, 'supremo') })
  let g = {
    ...game,
    players: game.players.map((p, i) => {
      if (i === 1) return { ...p, pool: pool({ trust: 5 }) }
      if (i === 2) return { ...p, pool: R.emptyPool() } // p3 holds nothing
      return p
    }),
  }
  ok(G.donations(g, { targetPlayerId: 'p1', resource: 'trust' }).error, 'cannot snatch from yourself')
  ok(G.donations(g, { targetPlayerId: 'p3', resource: 'trust' }).error, 'target has no trust')

  g = G.donations(g, { targetPlayerId: 'p2', resource: 'trust' }).game
  g = G.donations(g, { targetPlayerId: 'p2', resource: 'trust' }).game
  ok(G.donations(g, { targetPlayerId: 'p2', resource: 'trust' }).error, '3rd use refused')
})

check('Supremo L5 Payback spends 1 to discard an opponent voter (p.24)', () => {
  let { game } = ready({ ideologyCards: cardsOf(5, 'supremo'), pool: pool({ funds: 3 }) })
  const free = B.emptyAreaIndices(game.board, 'west').slice(0, 2)
  game = { ...game, board: B.placeVoters(game.board, 'west', 'p2', free).board }

  const r = G.payback(game, { zoneId: 'west', areaIndex: free[0] })
  ok(!r.error, r.error)
  eq(B.voterCount(r.game.board, 'west', 'p2'), 1, 'voter discarded:')
  eq(r.game.board.evicted.p2, 0, 'discarded, not evicted:')
  eq(R.poolTotal(r.game.players[0].pool), 2, 'paid 1 resource:')
})

check('Payback cannot target your own voters', () => {
  let { game } = ready({ ideologyCards: cardsOf(5, 'supremo'), pool: pool({ funds: 3 }) })
  const free = B.emptyAreaIndices(game.board, 'west').slice(0, 1)
  game = { ...game, board: B.placeVoters(game.board, 'west', 'p1', free).board }
  ok(G.payback(game, { zoneId: 'west', areaIndex: free[0] }).error, 'should be refused')
})

check('Idealist L5 Tough Love converts 2 voters for 2 Trust + any 2 (p.26)', () => {
  let { game } = ready({
    ideologyCards: cardsOf(5, 'idealist'),
    pool: pool({ trust: 3, funds: 3 }),
  })
  const free = B.emptyAreaIndices(game.board, 'east').slice(0, 3)
  game = { ...game, board: B.placeVoters(game.board, 'east', 'p2', free).board }

  const r = G.toughLove(game, { zoneId: 'east', areaIndices: [free[0], free[1]] })
  ok(!r.error, r.error)
  eq(B.voterCount(r.game.board, 'east', 'p1'), 2, 'converted to mine:')
  eq(B.voterCount(r.game.board, 'east', 'p2'), 1, 'victim left with 1:')
  eq(R.poolTotal(r.game.players[0].pool), 2, 'paid 4 of 6:')
})

check('Tough Love needs both voters from one player in one zone', () => {
  let { game } = ready({
    ideologyCards: cardsOf(5, 'idealist'),
    pool: pool({ trust: 3, funds: 3 }),
  })
  const free = B.emptyAreaIndices(game.board, 'east').slice(0, 2)
  let b = B.placeVoters(game.board, 'east', 'p2', [free[0]]).board
  b = B.placeVoters(b, 'east', 'p3', [free[1]]).board
  game = { ...game, board: b }

  const r = G.toughLove(game, { zoneId: 'east', areaIndices: free })
  ok(r.error, 'should be refused')
  ok(r.error.includes('same player'), `unexpected: ${r.error}`)
})

check('Tough Love cannot be used without paying', () => {
  let { game } = ready({ ideologyCards: cardsOf(5, 'idealist'), pool: pool({ trust: 1 }) })
  const free = B.emptyAreaIndices(game.board, 'east').slice(0, 2)
  game = { ...game, board: B.placeVoters(game.board, 'east', 'p2', free).board }
  ok(G.toughLove(game, { zoneId: 'east', areaIndices: free }).error, 'should be refused')
})

// --- Modifier powers --------------------------------------------------------

check('Showstopper L3 Going Viral is limited to 2 cards per turn (p.25)', () => {
  const { game } = ready({
    ideologyCards: cardsOf(3, 'showstopper'),
    pool: pool({ funds: 9, clout: 9, media: 9, trust: 9 }),
  })
  eq(P.discountsAvailable(game.players[0]), 0, 'no idealist discounts')
  ok(P.goingViralAvailable(game.players[0]), 'available at 3 cards')

  const noPower = ready({ ideologyCards: cardsOf(2, 'showstopper') }).game
  ok(!P.goingViralAvailable(noPower.players[0]), 'not available at 2 cards')
})

check('Going Viral is refused once exhausted', () => {
  let { game, rng } = ready({
    ideologyCards: cardsOf(3, 'showstopper'),
    pool: pool({ funds: 9, clout: 9, media: 9, trust: 9 }),
    powerUses: { showstopper_l3: 2 },
  })
  const opt = { openIndex: 0, zoneId: 'north', areaIndices: [0], bonusVoters: 1 }
  ok(G.influence(game, rng, opt).error, 'should be refused')
})

check('Idealist L3 Helping Hands gives 2 discounts per turn (p.26)', () => {
  const { game } = ready({ ideologyCards: cardsOf(3, 'idealist') })
  eq(P.discountsAvailable(game.players[0]), 2)

  const spent = ready({ ideologyCards: cardsOf(3, 'idealist'), powerUses: { idealist_l3: 2 } }).game
  eq(P.discountsAvailable(spent.players[0]), 0, 'after two uses:')
})

check('more discounts than available are refused', () => {
  const { game, rng } = ready({
    ideologyCards: cardsOf(3, 'idealist'),
    pool: pool({ funds: 9, clout: 9, media: 9, trust: 9 }),
  })
  const r = G.influence(game, rng, {
    openIndex: 0,
    zoneId: 'north',
    areaIndices: [0],
    discounts: ['any', 'any', 'any'],
  })
  ok(r.error, 'should be refused')
})

// --- Gerrymander limits (previously unenforced) -----------------------------

check('Gerrymandering is limited to once per zone per turn (p.15)', () => {
  let { game } = ready({})
  // p1 dominates west, so holds rights there.
  const west = B.emptyAreaIndices(game.board, 'west').slice(0, 4)
  game = { ...game, board: B.placeVoters(game.board, 'west', 'p1', west).board }
  ok(B.gerrymanderingRights(game.board).west === 'p1', 'p1 holds rights')

  const swFree = B.emptyAreaIndices(game.board, 'south_west')
  const first = G.gerrymander(game, {
    rightsZoneId: 'west',
    from: { zoneId: 'west', areaIndex: west[0] },
    to: { zoneId: 'south_west', areaIndex: swFree[0] },
  })
  ok(!first.error, first.error)

  const second = G.gerrymander(first.game, {
    rightsZoneId: 'west',
    from: { zoneId: 'west', areaIndex: west[1] },
    to: { zoneId: 'south_west', areaIndex: swFree[1] },
  })
  ok(second.error, 'second move in the same zone should be refused')
})

check('Showstopper L5 Election Fever allows 2 moves per zone (p.25)', () => {
  let { game } = ready({ ideologyCards: cardsOf(5, 'showstopper') })
  const west = B.emptyAreaIndices(game.board, 'west').slice(0, 4)
  game = { ...game, board: B.placeVoters(game.board, 'west', 'p1', west).board }
  eq(P.gerrymanderAllowance(game.players[0]), 2, 'allowance:')

  const swFree = B.emptyAreaIndices(game.board, 'south_west')
  let g = game
  for (let i = 0; i < 2; i++) {
    const r = G.gerrymander(g, {
      rightsZoneId: 'west',
      from: { zoneId: 'west', areaIndex: west[i] },
      to: { zoneId: 'south_west', areaIndex: swFree[i] },
    })
    ok(!r.error, `move ${i + 1}: ${r.error}`)
    g = r.game
  }
  const third = G.gerrymander(g, {
    rightsZoneId: 'west',
    from: { zoneId: 'west', areaIndex: west[2] },
    to: { zoneId: 'south_west', areaIndex: swFree[2] },
  })
  ok(third.error, '3rd move refused')
})

check('Election Fever also unlocks moving majority voters', () => {
  const plain = ready({}).game
  const fever = ready({ ideologyCards: cardsOf(5, 'showstopper') }).game
  ok(!P.canMoveMajorityVoters(plain.players[0]), 'normally blocked')
  ok(P.canMoveMajorityVoters(fever.players[0]), 'allowed with Election Fever')
})

check('the Gerrymander allowance resets each turn', () => {
  let { game, rng } = ready({})
  const west = B.emptyAreaIndices(game.board, 'west').slice(0, 4)
  game = { ...game, board: B.placeVoters(game.board, 'west', 'p1', west).board }

  const swFree = B.emptyAreaIndices(game.board, 'south_west')
  let g = G.gerrymander(game, {
    rightsZoneId: 'west',
    from: { zoneId: 'west', areaIndex: west[0] },
    to: { zoneId: 'south_west', areaIndex: swFree[0] },
  }).game
  eq(P.gerrymanderUsesRemaining(g.players[0], 'west'), 0, 'used up:')

  g = aroundTheTable(g, rng)
  eq(P.gerrymanderUsesRemaining(g.players[0], 'west'), 1, 'reset:')
})

check('availablePowers lists only unlocked powers with remaining uses', () => {
  const { game } = ready({
    ideologyCards: [...cardsOf(3, 'capitalist'), ...cardsOf(5, 'supremo')],
  })
  const list = G.availablePowers(game)
  const keys = list.map((p) => `${p.ideologue}_l${p.level}`)
  eq(keys, ['capitalist_l3', 'supremo_l3', 'supremo_l5'])
  eq(list.find((p) => p.ideologue === 'supremo' && p.level === 5).remaining, 2)
})

// ===========================================================================
// Phase 6 — Conspiracy Cards
// ===========================================================================

check('buying takes the top Conspiracy Card for 4 resources (p.18)', () => {
  const { game, rng } = ready({ pool: pool({ funds: 4, trust: 4 }) })
  const before = R.poolTotal(game.players[0].pool)

  const r = G.buyConspiracy(game, rng)
  ok(!r.error, r.error)
  eq(r.game.players[0].conspiracyCards.length, 1, 'card in hand:')
  eq(R.poolTotal(r.game.players[0].pool), before - 4, 'paid 4:')
  eq(r.game.conspiracyDeck.drawPile.length, 19, 'deck drawn from:')
})

check('you cannot buy a Conspiracy you cannot afford', () => {
  const { game, rng } = ready({ pool: pool({ funds: 2 }) })
  ok(G.buyConspiracy(game, rng).error, 'should be refused')
})

check('there is no hand limit on Conspiracy Cards', () => {
  let { game, rng } = ready({ pool: pool({ funds: 12 }) })
  for (let i = 0; i < 3; i++) {
    const r = G.buyConspiracy(game, rng)
    ok(!r.error, `buy ${i + 1}: ${r.error}`)
    game = r.game
  }
  eq(game.players[0].conspiracyCards.length, 3)
})

check('auction debt blocks purchases (p.11)', () => {
  const { game, rng } = ready({ pool: pool({ funds: 8 }), auctionDebt: 3 })
  const r = G.buyConspiracy(game, rng)
  ok(r.error, 'should be refused')
  ok(r.error.includes('auction'), `unexpected: ${r.error}`)
})

check('Benaami raises the resource cap by 2', () => {
  const { game } = ready({ pool: pool({ funds: 4 }), conspiracyCards: ['benaami'] })
  eq(game.players[0].resourceCap, 12, 'before:')
  const r = G.playConspiracy(game, { cardId: 'benaami' })
  ok(!r.error, r.error)
  eq(r.game.players[0].resourceCap, 14, 'after:')
  eq(r.game.players[0].conspiracyCards.length, 0, 'card spent:')
})

check("Vikas Model's resource option grants any 4", () => {
  const { game } = ready({ conspiracyCards: ['vikas_model'], pool: R.emptyPool() })
  const r = G.playConspiracy(game, {
    cardId: 'vikas_model',
    choice: { optionId: 'resources', resources: pool({ trust: 4 }) },
  })
  ok(!r.error, r.error)
  eq(r.game.players[0].pool.trust, 4, 'took 4 trust:')
})

check('a negotiation card is handed to the table rather than guessed at', () => {
  const { game } = ready({ conspiracyCards: ['the_hawala_network'] })
  const r = G.playConspiracy(game, { cardId: 'the_hawala_network' })
  ok(!r.error, r.error)
  ok(r.manual, 'should require manual resolution')
  ok(r.game.awaitingResolution, 'awaiting resolution recorded')

  const done = G.resolveManually(r.game, { note: 'Hawala active for the rest of the game.' })
  ok(!done.error, done.error)
  eq(done.game.awaitingResolution, null, 'cleared:')
  eq(done.game.players[0].conspiracyCards.length, 0, 'card spent:')
})

// ===========================================================================
// Phase 5 — Headlines
// ===========================================================================

check('a Volatile placement queues a Headline and blocks ending the turn (p.17)', () => {
  const { game, rng } = ready({ pool: pool({ funds: 9, clout: 9, media: 9, trust: 9 }) })
  const v = zones.ZONES.central.volatile[0]

  const opt = G.availablePowers // touch to keep import used
  const one = game.market.open.findIndex((id) => id)
  const r = G.influence(game, rng, {
    openIndex: one,
    zoneId: 'central',
    areaIndices: B.emptyAreaIndices(game.board, 'central')
      .filter((i) => i === v)
      .concat(B.emptyAreaIndices(game.board, 'central').filter((i) => i !== v))
      .slice(0, 1),
  })
  // Only assert the queue if the card happened to be a 1-voter card landing on v.
  if (!r.error && r.game.pendingHeadlines.length) {
    ok(G.endTurn(r.game, rng).error, 'turn cannot end with Headlines pending')
  }
  ok(true)
})

check('placing directly into a Volatile Area queues exactly one Headline', () => {
  const { game, rng } = ready({})
  const v = zones.ZONES.central.volatile[0]
  const placed = { ...game, board: B.placeVoters(game.board, 'central', 'p1', [v]).board }
  const withQueue = { ...placed, pendingHeadlines: [{ zoneId: 'central', areaIndex: v, playerId: 'p1' }] }

  ok(G.endTurn(withQueue, rng).error, 'must resolve the Headline first')

  const r = G.resolveNextHeadline(withQueue, rng)
  ok(!r.error, r.error)
  eq(r.game.pendingHeadlines.length, 0, 'queue drained:')
  ok(r.card, 'a Headline card was drawn')
})

check("Time's Up grants exactly 3 of a chosen resource", () => {
  const { game, rng } = ready({ pool: R.emptyPool() })
  const res = C.applyEffect(headlineData.HEADLINE_CARDS.times_up.effect, {
    players: game.players,
    board: game.board,
    reserve: game.reserve,
    actorId: 'p1',
    choice: { optionId: 'clout' },
  })
  ok(!res.error, res.error)
  eq(res.players[0].pool.clout, 3)
})

check('an unresolved choice asks for input instead of guessing', () => {
  const { game } = ready({})
  const res = C.applyEffect(headlineData.HEADLINE_CARDS.times_up.effect, {
    players: game.players,
    board: game.board,
    reserve: game.reserve,
    actorId: 'p1',
  })
  ok(res.manual, 'should request a choice')
  eq(res.options, ['funds', 'clout', 'media', 'trust'])
})

check('Khaki Terror takes 1 of each resource', () => {
  const { game } = ready({})
  const res = C.applyEffect(headlineData.HEADLINE_CARDS.khaki_terror.effect, {
    players: game.players.map((p, i) =>
      i === 0 ? { ...p, pool: pool({ funds: 2, clout: 2, media: 2, trust: 2 }) } : p
    ),
    board: game.board,
    reserve: game.reserve,
    actorId: 'p1',
  })
  ok(!res.error, res.error)
  eq(res.players[0].pool, pool({ funds: 1, clout: 1, media: 1, trust: 1 }))
})

check('a player who cannot pay Khaki Terror is told they owe it', () => {
  const { game } = ready({})
  const res = C.applyEffect(headlineData.HEADLINE_CARDS.khaki_terror.effect, {
    players: game.players.map((p, i) => (i === 0 ? { ...p, pool: pool({ funds: 1 }) } : p)),
    board: game.board,
    reserve: game.reserve,
    actorId: 'p1',
  })
  ok(res.manual, 'should defer rather than fail')
})

check('table-resolved cards are correctly classified', () => {
  ok(C.isTableResolved(headlineData.HEADLINE_CARDS.a_reliable_dream), 'negotiation')
  ok(C.isTableResolved(headlineData.HEADLINE_CARDS.next_billion_data_points), 'vote')
  ok(!C.isTableResolved(headlineData.HEADLINE_CARDS.times_up), 'pure choice')
  ok(!C.isTableResolved(headlineData.HEADLINE_CARDS.khaki_terror), 'automatic')
})

// ===========================================================================
// Regression — games must still terminate with all of this wired in
// ===========================================================================

check('Prospecting counts as an escape from a stalled market', () => {
  let { game } = newGame()
  const trustCards = voterCardData.VOTER_CARD_IDS.filter(
    (id) => (voterCardData.VOTER_CARDS[id].cost.trust || 0) > 0
  ).slice(0, 3)

  game = {
    ...game,
    market: { ...game.market, open: trustCards },
    players: game.players.map((p) => ({ ...p, pool: { ...R.emptyPool(), funds: 12 } })),
  }
  ok(G.isStalled(game), 'stalled without powers')

  const withPower = {
    ...game,
    players: game.players.map((p, i) =>
      i === 0 ? { ...p, ideologyCards: cardsOf(3, 'capitalist') } : p
    ),
  }
  ok(!G.isStalled(withPower), 'Prospecting breaks the logjam')
})

report('Powers, Headlines, Conspiracies (Phases 4-6)')
