// SHASN — the trade negotiation flow (p.11)
//
// Run with:  node tests/trades.test.mjs

import {
  resources as R,
  ideology as I,
  game as G,
  persistence as P,
  consts,
  createRunner,
  eq,
  ok,
} from './harness.mjs'

const { check, report } = createRunner()

const pool = (o = {}) => ({ ...R.emptyPool(), ...o })
const newGame = (seed = 99, count = 3) =>
  G.createGame({
    players: ['Ada', 'Bo', 'Cy'].slice(0, count).map((n, i) => ({ id: `p${i + 1}`, name: n })),
    seed,
  })

/** Into the actions phase, with chosen holdings for everyone. */
function ready(pools = {}, cards = {}) {
  let { game, rng } = newGame()
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  game = G.answerIdeology(game, card.answers[0].ideologue).game
  if (game.turnPhase === consts.TURN_PHASES.RESOURCE_CAP) {
    game = G.discardToCap(game, R.autoDiscardToCap(G.activePlayer(game).pool)).game
  }
  game = {
    ...game,
    players: game.players.map((p) => ({
      ...p,
      pool: pools[p.id] ? pool(pools[p.id]) : p.pool,
      conspiracyCards: cards[p.id] || [],
    })),
  }
  return { game, rng }
}

const worldTotal = (g) =>
  g.players.reduce((n, p) => n + R.poolTotal(p.pool), 0) + R.poolTotal(g.reserve)

// ---------------------------------------------------------------------------
// Proposing
// ---------------------------------------------------------------------------

check('a proposal moves nothing until it is accepted', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } })
  const before = JSON.stringify(game.players.map((p) => p.pool))

  const r = G.proposeTrade(game, {
    proposerId: 'p1',
    targetId: 'p2',
    offer: { resources: { funds: 2 } },
    request: { resources: { trust: 1 } },
  })
  ok(!r.error, r.error)
  eq(r.game.pendingTrades.length, 1, 'offer recorded:')
  eq(r.game.pendingTrades[0].status, 'pending')
  eq(JSON.stringify(r.game.players.map((p) => p.pool)), before, 'nothing moved yet:')
})

check('both sides must move at least one resource (p.11)', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } })
  ok(
    G.proposeTrade(game, {
      proposerId: 'p1', targetId: 'p2',
      offer: {}, request: { resources: { trust: 1 } },
    }).error,
    'empty offer refused'
  )
  ok(
    G.proposeTrade(game, {
      proposerId: 'p1', targetId: 'p2',
      offer: { resources: { funds: 1 } }, request: {},
    }).error,
    'empty request refused'
  )
})

check('a card-for-card swap is not a legal trade', () => {
  const { game } = ready({ p1: { funds: 3 }, p2: { trust: 3 } }, { p1: ['benaami'], p2: ['nayi_soch'] })
  const r = G.proposeTrade(game, {
    proposerId: 'p1',
    targetId: 'p2',
    offer: { resources: {}, conspiracyCards: ['benaami'] },
    request: { resources: {}, conspiracyCardCount: 1 },
  })
  ok(r.error, 'refused — resources must move both ways')
})

check('one side of a trade must be the active player (p.11)', () => {
  const { game } = ready({ p2: { trust: 4 }, p3: { funds: 4 } })
  // p1 is active; p2 and p3 cannot trade with each other.
  const r = G.proposeTrade(game, {
    proposerId: 'p2', targetId: 'p3',
    offer: { resources: { trust: 1 } }, request: { resources: { funds: 1 } },
  })
  ok(r.error, 'refused')
  ok(r.error.includes('turn'), `unexpected: ${r.error}`)
})

check('a non-active player may propose TO the active player', () => {
  const { game } = ready({ p1: { funds: 4 }, p2: { trust: 4 } })
  const r = G.proposeTrade(game, {
    proposerId: 'p2', targetId: 'p1',
    offer: { resources: { trust: 1 } }, request: { resources: { funds: 1 } },
  })
  ok(!r.error, r.error)
})

check('you cannot offer what you do not hold', () => {
  const { game } = ready({ p1: { funds: 1 }, p2: { trust: 4 } })
  ok(
    G.proposeTrade(game, {
      proposerId: 'p1', targetId: 'p2',
      offer: { resources: { funds: 9 } }, request: { resources: { trust: 1 } },
    }).error,
    'refused'
  )
})

check('you cannot ask for more cards than they hold', () => {
  const { game } = ready({ p1: { funds: 4 }, p2: { trust: 4 } }, { p2: ['benaami'] })
  ok(
    G.proposeTrade(game, {
      proposerId: 'p1', targetId: 'p2',
      offer: { resources: { funds: 1 } },
      request: { resources: { trust: 1 }, conspiracyCardCount: 3 },
    }).error,
    'refused'
  )
})

check('only one live offer per direction', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } })
  const first = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 } }, request: { resources: { trust: 1 } },
  })
  const second = G.proposeTrade(first.game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 2 } }, request: { resources: { trust: 1 } },
  })
  ok(second.error, 'second offer to the same player refused')
})

// ---------------------------------------------------------------------------
// Responding
// ---------------------------------------------------------------------------

check('accepting moves both sides and conserves resources', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } })
  const before = worldTotal(game)

  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 3 } }, request: { resources: { trust: 1 } },
  }).game

  const r = G.respondTrade(proposed, {
    tradeId: proposed.pendingTrades[0].id,
    playerId: 'p2',
    action: 'accept',
  })
  ok(!r.error, r.error)
  eq(r.game.players[0].pool.funds, 2, 'gave 3 funds:')
  eq(r.game.players[0].pool.trust, 1, 'got 1 trust:')
  eq(r.game.players[1].pool.funds, 3, 'they got the funds:')
  eq(worldTotal(r.game), before, 'conserved:')
  eq(r.game.pendingTrades[0].status, 'accepted')
})

check('only the target can accept', () => {
  const { game } = ready({ p1: { funds: 4 }, p2: { trust: 4 } })
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 } }, request: { resources: { trust: 1 } },
  }).game

  const id = proposed.pendingTrades[0].id
  ok(G.respondTrade(proposed, { tradeId: id, playerId: 'p1', action: 'accept' }).error, 'proposer cannot self-accept')
  ok(G.respondTrade(proposed, { tradeId: id, playerId: 'p3', action: 'accept' }).error, 'bystander cannot accept')
})

check('the proposer can withdraw, the target can decline', () => {
  const { game } = ready({ p1: { funds: 4 }, p2: { trust: 4 } })
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 } }, request: { resources: { trust: 1 } },
  }).game
  const id = proposed.pendingTrades[0].id

  const withdrawn = G.respondTrade(proposed, { tradeId: id, playerId: 'p1', action: 'withdraw' })
  ok(!withdrawn.error, withdrawn.error)
  eq(withdrawn.game.pendingTrades[0].status, 'withdrawn')

  const declined = G.respondTrade(proposed, { tradeId: id, playerId: 'p2', action: 'decline' })
  ok(!declined.error, declined.error)
  eq(declined.game.pendingTrades[0].status, 'declined')
})

check('an offer is re-validated at accept time, not just when proposed', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } })
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 4 } }, request: { resources: { trust: 1 } },
  }).game

  // p1 spends the funds before p2 gets round to accepting.
  const spent = {
    ...proposed,
    players: proposed.players.map((p) => (p.id === 'p1' ? { ...p, pool: pool({ funds: 1 }) } : p)),
  }

  const r = G.respondTrade(spent, {
    tradeId: proposed.pendingTrades[0].id,
    playerId: 'p2',
    action: 'accept',
  })
  ok(r.error, 'refused rather than half-applied')
  ok(r.error.includes('no longer'), `unexpected: ${r.error}`)
})

check('a settled offer cannot be accepted twice', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } })
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 } }, request: { resources: { trust: 1 } },
  }).game
  const id = proposed.pendingTrades[0].id

  const once = G.respondTrade(proposed, { tradeId: id, playerId: 'p2', action: 'accept' })
  ok(!once.error, once.error)
  const twice = G.respondTrade(once.game, { tradeId: id, playerId: 'p2', action: 'accept' })
  ok(twice.error, 'refused the second time')
})

// ---------------------------------------------------------------------------
// Conspiracy Cards, and hidden hands
// ---------------------------------------------------------------------------

check('the target chooses which of their cards to hand over', () => {
  const { game } = ready(
    { p1: { funds: 5 }, p2: { trust: 5 } },
    { p2: ['benaami', 'nayi_soch'] }
  )
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 2 } },
    request: { resources: { trust: 1 }, conspiracyCardCount: 1 },
  }).game
  const id = proposed.pendingTrades[0].id

  ok(
    G.respondTrade(proposed, { tradeId: id, playerId: 'p2', action: 'accept', giveCards: [] }).error,
    'must choose the right number'
  )

  const r = G.respondTrade(proposed, {
    tradeId: id, playerId: 'p2', action: 'accept', giveCards: ['nayi_soch'],
  })
  ok(!r.error, r.error)
  eq(r.game.players[0].conspiracyCards, ['nayi_soch'], 'proposer received their pick:')
  eq(r.game.players[1].conspiracyCards, ['benaami'], 'target kept the other:')
})

check('you cannot hand over a card you do not hold', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } }, { p2: ['benaami'] })
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 } },
    request: { resources: { trust: 1 }, conspiracyCardCount: 1 },
  }).game
  const r = G.respondTrade(proposed, {
    tradeId: proposed.pendingTrades[0].id,
    playerId: 'p2', action: 'accept', giveCards: ['jumla'],
  })
  ok(r.error, 'refused')
})

check('your own offered cards are named exactly', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } }, { p1: ['benaami'] })
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 }, conspiracyCards: ['benaami'] },
    request: { resources: { trust: 1 } },
  }).game

  const r = G.respondTrade(proposed, {
    tradeId: proposed.pendingTrades[0].id, playerId: 'p2', action: 'accept',
  })
  ok(!r.error, r.error)
  eq(r.game.players[0].conspiracyCards, [], 'proposer gave it up:')
  eq(r.game.players[1].conspiracyCards, ['benaami'], 'target received it:')
})

check('an offer does not leak the proposer\'s hand to bystanders', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } }, { p1: ['benaami'] })
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 }, conspiracyCards: ['benaami'] },
    request: { resources: { trust: 1 } },
  }).game

  const asBystander = P.viewFor(proposed, 'p3').pendingTrades[0]
  eq(asBystander.offer.conspiracyCards, [], 'card ids withheld:')
  eq(asBystander.offer.conspiracyCardCount, 1, 'but the count is public:')

  for (const party of ['p1', 'p2']) {
    eq(
      P.viewFor(proposed, party).pendingTrades[0].offer.conspiracyCards,
      ['benaami'],
      `${party} is a party and sees it:`
    )
  }
})

// ---------------------------------------------------------------------------
// Countering, cap, expiry
// ---------------------------------------------------------------------------

check('countering closes the original and opens the mirror', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } })
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 } }, request: { resources: { trust: 3 } },
  }).game
  const id = proposed.pendingTrades[0].id

  const r = G.respondTrade(proposed, {
    tradeId: id,
    playerId: 'p2',
    action: 'counter',
    counter: {
      offer: { resources: { trust: 1 } },
      request: { resources: { funds: 3 } },
    },
  })
  ok(!r.error, r.error)
  eq(r.game.pendingTrades.find((t) => t.id === id).status, 'countered', 'original closed:')

  const fresh = r.game.pendingTrades.filter((t) => t.status === 'pending')
  eq(fresh.length, 1, 'one new offer:')
  eq(fresh[0].proposerId, 'p2', 'sides swapped:')
  eq(fresh[0].targetId, 'p1')
  eq(fresh[0].counteredFrom, id, 'and it remembers what it answers:')
})

check('a trade that busts the cap forces the active player to discard', () => {
  const { game } = ready({ p1: { funds: 12 }, p2: { trust: 5 } })
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 } }, request: { resources: { trust: 4 } },
  }).game

  const r = G.respondTrade(proposed, {
    tradeId: proposed.pendingTrades[0].id, playerId: 'p2', action: 'accept',
  })
  ok(!r.error, r.error)
  eq(R.poolTotal(r.game.players[0].pool), 15, 'over the cap:')
  eq(r.game.turnPhase, consts.TURN_PHASES.RESOURCE_CAP, 'routed into the discard:')
})

check('open offers lapse when the turn ends', () => {
  const { game, rng } = ready({ p1: { funds: 5 }, p2: { trust: 5 } })
  const proposed = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 } }, request: { resources: { trust: 1 } },
  }).game

  const ended = G.endTurn(proposed, rng)
  ok(!ended.error, ended.error)
  eq(ended.game.pendingTrades[0].status, 'expired', 'no offer outlives its turn:')
})

check('openTradesFor splits incoming from outgoing', () => {
  const { game } = ready({ p1: { funds: 5 }, p2: { trust: 5 } })
  let g = G.proposeTrade(game, {
    proposerId: 'p1', targetId: 'p2',
    offer: { resources: { funds: 1 } }, request: { resources: { trust: 1 } },
  }).game
  g = G.proposeTrade(g, {
    proposerId: 'p2', targetId: 'p1',
    offer: { resources: { trust: 1 } }, request: { resources: { funds: 1 } },
  }).game

  const mine = G.openTradesFor(g, 'p1')
  eq(mine.outgoing.length, 1, 'one sent:')
  eq(mine.incoming.length, 1, 'one received:')
})

report('Trading negotiation (p.11)')
