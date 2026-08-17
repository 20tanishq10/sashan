// SHASN economy tests — Phase 2 (resources, Voter Cards) and Phase 3 (Ideology)
//
// Run with:  node tests/economy.test.mjs

import {
  zones,
  consts,
  board as B,
  resources as R,
  deck as D,
  voterCards as V,
  ideology as I,
  voterCardData,
  ideologyCardData,
  createRunner,
  eq,
  ok,
} from './harness.mjs'

const { check, report } = createRunner()

const rng = () => D.makeRng(12345)
const pool = (o = {}) => ({ ...R.emptyPool(), ...o })

// ===========================================================================
// Phase 2 — resources
// ===========================================================================

check('a pool totals across all four resource types', () => {
  eq(R.poolTotal(pool({ funds: 3, trust: 2 })), 5)
})

check('specific costs must be paid in kind', () => {
  ok(R.canAfford(pool({ funds: 2 }), { funds: 2 }), 'exact funds')
  ok(!R.canAfford(pool({ trust: 5 }), { funds: 1 }), 'trust cannot pay a funds pip')
})

check('wildcard pips accept any resource (p.10)', () => {
  ok(R.canAfford(pool({ trust: 4 }), { any: 4 }), '4 trust covers 4 wildcards')
  ok(R.canAfford(pool({ funds: 1, clout: 1, media: 1, trust: 1 }), { any: 4 }), 'mixed')
  ok(!R.canAfford(pool({ funds: 3 }), { any: 4 }), 'not enough total')
})

check('mixed costs need the specific pips plus spare for wildcards', () => {
  ok(R.canAfford(pool({ funds: 2, trust: 1 }), { funds: 2, any: 1 }), 'exactly covered')
  ok(!R.canAfford(pool({ funds: 2 }), { funds: 2, any: 1 }), 'no spare left for the wildcard')
})

check('autoAllocate spends from the largest holdings first', () => {
  const r = R.autoAllocate(pool({ funds: 1, clout: 5, media: 1, trust: 1 }), { any: 2 })
  ok(!r.error, r.error)
  eq(r.allocation, pool({ clout: 2 }), 'should take from clout:')
})

check('autoAllocate keeps specific pips in kind', () => {
  const r = R.autoAllocate(pool({ funds: 1, clout: 5 }), { funds: 1, any: 2 })
  ok(!r.error, r.error)
  eq(r.allocation, pool({ funds: 1, clout: 2 }))
})

check('an allocation is rejected if it under- or over-pays', () => {
  ok(R.allocationSatisfies(pool({ funds: 2 }), { funds: 2 }).ok, 'exact payment accepted')
  ok(!R.allocationSatisfies(pool({ funds: 1 }), { funds: 2 }).ok, 'underpaying rejected')
  ok(!R.allocationSatisfies(pool({ funds: 4 }), { funds: 2 }).ok, 'overpaying rejected')
  ok(
    R.allocationSatisfies(pool({ funds: 2, trust: 1 }), { funds: 2, any: 1 }).ok,
    'surplus covers the wildcard'
  )
})

check('Idealist L3 discounts reduce a cost by 1 each (p.26)', () => {
  eq(R.applyDiscounts({ funds: 2, any: 2 }, ['funds']), { ...pool({ funds: 1 }), any: 2 })
  eq(R.applyDiscounts({ funds: 2, any: 2 }, ['any']), { ...pool({ funds: 2 }), any: 1 })
  eq(
    R.applyDiscounts({ funds: 2, any: 2 }, ['funds', 'funds']),
    { ...pool(), any: 2 },
    'two discounts on the same purchase:'
  )
})

check('a discount falls back to wildcards when the named pip is absent', () => {
  eq(R.applyDiscounts({ any: 3 }, ['funds']), { ...pool(), any: 2 })
})

check('paying moves resources into the Public Reserve, conserving the total', () => {
  const before = pool({ funds: 5 })
  const reserve = consts.newPublicReserve()
  const r = R.payToReserve(before, reserve, pool({ funds: 2 }))
  ok(!r.error, r.error)
  eq(r.pool.funds, 3, 'player funds:')
  eq(r.reserve.funds, 32, 'reserve funds:')
  eq(
    R.poolTotal(r.pool) + R.poolTotal(r.reserve),
    R.poolTotal(before) + R.poolTotal(reserve),
    'total conserved:'
  )
})

check('the Public Reserve is finite and reports a shortfall', () => {
  const reserve = pool({ funds: 1 })
  const r = R.takeFromReserve(pool(), reserve, pool({ funds: 3 }))
  eq(r.granted.funds, 1, 'granted:')
  eq(r.reserve.funds, 0, 'reserve drained:')
  ok(r.shortfall, 'shortfall should be reported')
  eq(r.shortfall.funds, 2)
})

// --- Resource cap (p.11) ---------------------------------------------------

check('the resource cap is a total of 12, not per type', () => {
  eq(consts.DEFAULT_RESOURCE_CAP, 12)
  ok(!R.isOverCap(pool({ funds: 3, clout: 3, media: 3, trust: 3 })), '12 total is at cap')
  ok(R.isOverCap(pool({ funds: 3, clout: 3, media: 3, trust: 4 })), '13 total is over')
})

check('cap discard must shed exactly the excess', () => {
  const p = pool({ funds: 8, clout: 7 }) // 15, excess 3
  const reserve = consts.newPublicReserve()
  eq(R.excessOverCap(p), 3)

  ok(R.discardToCap(p, reserve, pool({ funds: 2 })).error, 'too few rejected')
  ok(R.discardToCap(p, reserve, pool({ funds: 4 })).error, 'too many rejected')

  const good = R.discardToCap(p, reserve, pool({ funds: 3 }))
  ok(!good.error, good.error)
  eq(R.poolTotal(good.pool), 12, 'down to cap:')
  eq(good.reserve.funds, 33, 'discards return to the Reserve:')
})

check('cannot discard resources you do not hold', () => {
  const r = R.discardToCap(pool({ funds: 15 }), consts.newPublicReserve(), pool({ trust: 3 }))
  ok(r.error, 'should be refused')
})

check('autoDiscardToCap sheds from the largest holding', () => {
  const d = R.autoDiscardToCap(pool({ funds: 10, clout: 5 })) // 15, excess 3
  eq(R.poolTotal(d), 3)
  eq(d.funds, 3, 'should come off funds:')
})

// --- Trading (p.11) --------------------------------------------------------

check('a trade needs at least one resource from each side', () => {
  const a = pool({ funds: 3 })
  const b = pool({ trust: 3 })
  ok(!R.validateTrade(pool(), pool({ trust: 1 }), a, b).ok, 'empty offer rejected')
  ok(!R.validateTrade(pool({ funds: 1 }), pool(), a, b).ok, 'empty request rejected')
  ok(R.validateTrade(pool({ funds: 1 }), pool({ trust: 1 }), a, b).ok, 'valid')
})

check('trades work in any ratio and conserve resources', () => {
  const a = pool({ funds: 3 })
  const b = pool({ trust: 5 })
  const offer = pool({ funds: 3 })
  const request = pool({ trust: 1 })

  ok(R.validateTrade(offer, request, a, b).ok, '3-for-1 is legal')
  const r = R.executeTrade(a, b, offer, request)
  eq(r.proposerPool, pool({ trust: 1 }))
  eq(r.targetPool, pool({ funds: 3, trust: 4 }))
  eq(
    R.poolTotal(r.proposerPool) + R.poolTotal(r.targetPool),
    R.poolTotal(a) + R.poolTotal(b),
    'conserved:'
  )
})

check('you cannot trade away resources you do not hold', () => {
  const r = R.validateTrade(pool({ funds: 9 }), pool({ trust: 1 }), pool({ funds: 2 }), pool({ trust: 3 }))
  ok(!r.ok, 'should be refused')
})

// ===========================================================================
// Phase 2 — decks and the Voter Card market
// ===========================================================================

check('the same seed always produces the same shuffle', () => {
  const a = D.shuffle([1, 2, 3, 4, 5, 6, 7, 8], D.makeRng(42))
  const b = D.shuffle([1, 2, 3, 4, 5, 6, 7, 8], D.makeRng(42))
  const c = D.shuffle([1, 2, 3, 4, 5, 6, 7, 8], D.makeRng(43))
  eq(a, b, 'same seed:')
  ok(JSON.stringify(a) !== JSON.stringify(c), 'different seeds should differ')
})

check('an emptied draw pile reshuffles from the discard (p.9)', () => {
  let d = { drawPile: ['a'], discard: ['b', 'c'] }
  const r1 = D.draw(d, D.makeRng(1))
  eq(r1.cardId, 'a')
  eq(r1.deck.drawPile.length, 0, 'draw pile now empty:')

  const r2 = D.draw(r1.deck, D.makeRng(1))
  ok(['b', 'c'].includes(r2.cardId), 'drew from the reshuffled discard')
  eq(r2.deck.discard.length, 0, 'discard consumed:')
})

check('a truly empty deck yields nothing rather than throwing', () => {
  eq(D.draw({ drawPile: [], discard: [] }, D.makeRng(1)).cardId, null)
})

check('the stub Voter deck matches the 60-card spec', () => {
  eq(voterCardData.VOTER_CARD_IDS.length, 60, 'deck size:')
  ok(voterCardData.IS_STUB_CONTENT, 'must be flagged as stub content')
  for (const id of voterCardData.VOTER_CARD_IDS) {
    const c = voterCardData.VOTER_CARDS[id]
    ok([1, 2, 3].includes(c.voters), `${id} yields 1-3 voters, got ${c.voters}`)
    ok(R.costTotal(c.cost) > 0, `${id} must cost something`)
  }
})

check('exactly 3 Voter Cards are open at all times (p.9)', () => {
  const m = V.initMarket(rng())
  eq(m.open.length, 3, 'at setup:')
  eq(m.drawPile.length, 57, 'remaining draw pile:')
})

check('influencing discards the card and immediately flips a replacement', () => {
  const r = rng()
  const m = V.initMarket(r)
  const first = m.open[0]

  const res = V.influenceVoterCard({
    market: m,
    pool: pool({ funds: 9, clout: 9, media: 9, trust: 9 }),
    reserve: consts.newPublicReserve(),
    board: B.initBoard(['p1']),
    playerId: 'p1',
    openIndex: 0,
    zoneId: 'north',
    areaIndices: [0, 1, 2].slice(0, V.getVoterCard(first).voters),
    rng: r,
  })

  ok(!res.error, res.error)
  eq(res.market.open.length, 3, 'row refilled:')
  ok(!res.market.open.includes(first), 'influenced card left the row')
  ok(res.market.discard.includes(first), 'and went to the discard')
})

check('influencing pays the Public Reserve and places voters', () => {
  const r = rng()
  const m = V.initMarket(r)
  const card = V.getVoterCard(m.open[0])
  const startPool = pool({ funds: 9, clout: 9, media: 9, trust: 9 })
  const reserve = consts.newPublicReserve()

  const res = V.influenceVoterCard({
    market: m,
    pool: startPool,
    reserve,
    board: B.initBoard(['p1']),
    playerId: 'p1',
    openIndex: 0,
    zoneId: 'north',
    areaIndices: Array.from({ length: card.voters }, (_, i) => i),
    rng: r,
  })

  ok(!res.error, res.error)
  eq(res.votersPlaced, card.voters, 'voters placed:')
  eq(B.voterCount(res.board, 'north', 'p1'), card.voters, 'on the board:')
  eq(
    R.poolTotal(startPool) - R.poolTotal(res.pool),
    R.costTotal(card.cost),
    'resources spent equal the card cost:'
  )
  eq(
    R.poolTotal(res.pool) + R.poolTotal(res.reserve),
    R.poolTotal(startPool) + R.poolTotal(reserve),
    'nothing created or destroyed:'
  )
})

check('a card you cannot afford is refused', () => {
  const r = rng()
  const m = V.initMarket(r)
  const res = V.influenceVoterCard({
    market: m,
    pool: pool(),
    reserve: consts.newPublicReserve(),
    board: B.initBoard(['p1']),
    playerId: 'p1',
    openIndex: 0,
    zoneId: 'north',
    areaIndices: [0],
    rng: r,
  })
  ok(res.error, 'should be refused')
})

check('area selection must match the card voter count (no splitting, p.9)', () => {
  const r = rng()
  const m = V.initMarket(r)
  const card = V.getVoterCard(m.open[0])

  const res = V.influenceVoterCard({
    market: m,
    pool: pool({ funds: 9, clout: 9, media: 9, trust: 9 }),
    reserve: consts.newPublicReserve(),
    board: B.initBoard(['p1']),
    playerId: 'p1',
    openIndex: 0,
    zoneId: 'north',
    areaIndices: Array.from({ length: card.voters + 1 }, (_, i) => i),
    rng: r,
  })
  ok(res.error, 'wrong area count should be refused')
})

check('a card is wasted if the zone lacks room for all its voters (p.9)', () => {
  const r = rng()
  let m = V.initMarket(r)
  // Find an open card yielding more than 1 voter.
  const openIndex = m.open.findIndex((id) => V.getVoterCard(id).voters > 1)
  const card = V.getVoterCard(m.open[openIndex])

  // Fill central (9 areas) leaving exactly 1 empty.
  let b = B.initBoard(['p1', 'p2'])
  const free = B.emptyAreaIndices(b, 'central')
  b = B.placeVoters(b, 'central', 'p2', free.slice(0, 8)).board
  eq(B.emptyAreas(b, 'central'), 1)

  const res = V.influenceVoterCard({
    market: m,
    pool: pool({ funds: 9, clout: 9, media: 9, trust: 9 }),
    reserve: consts.newPublicReserve(),
    board: b,
    playerId: 'p1',
    openIndex,
    zoneId: 'central',
    areaIndices: [],
    rng: r,
  })

  ok(!res.error, res.error)
  eq(res.votersPlaced, 0, 'nothing placed:')
  eq(res.votersDiscarded, card.voters, 'all voters discarded:')
  ok(res.market.discard.includes(m.open[openIndex]), 'card still leaves the market')
})

check('Showstopper L3 grants +1 voter on an influenced card (p.25)', () => {
  const r = rng()
  const m = V.initMarket(r)
  const card = V.getVoterCard(m.open[0])

  const res = V.influenceVoterCard({
    market: m,
    pool: pool({ funds: 9, clout: 9, media: 9, trust: 9 }),
    reserve: consts.newPublicReserve(),
    board: B.initBoard(['p1']),
    playerId: 'p1',
    openIndex: 0,
    zoneId: 'north',
    areaIndices: Array.from({ length: card.voters + 1 }, (_, i) => i),
    bonusVoters: 1,
    rng: r,
  })

  ok(!res.error, res.error)
  eq(res.votersPlaced, card.voters + 1, 'one extra voter:')
})

check('placing into a Volatile Area via a Voter Card triggers a Headline', () => {
  const r = rng()
  const m = V.initMarket(r)
  const openIndex = m.open.findIndex((id) => V.getVoterCard(id).voters === 1)
  const v = zones.ZONES.central.volatile[0]

  const res = V.influenceVoterCard({
    market: m,
    pool: pool({ funds: 9, clout: 9, media: 9, trust: 9 }),
    reserve: consts.newPublicReserve(),
    board: B.initBoard(['p1']),
    playerId: 'p1',
    openIndex,
    zoneId: 'central',
    areaIndices: [v],
    rng: r,
  })

  ok(!res.error, res.error)
  eq(res.volatileTriggers.length, 1, 'one Headline queued:')
})

// ===========================================================================
// Phase 3 — Ideology Cards and Ideologues
// ===========================================================================

check('the stub Ideology deck conforms to spec', () => {
  ok(ideologyCardData.IS_STUB_CONTENT, 'must be flagged as stub content')
  for (const id of ideologyCardData.IDEOLOGY_CARD_IDS) {
    const c = ideologyCardData.IDEOLOGY_CARDS[id]
    eq(c.answers.length, 2, `${id} answer count:`)
    ok(
      c.answers[0].ideologue !== c.answers[1].ideologue,
      `${id}: both answers belong to ${c.answers[0].ideologue}`
    )
    for (const a of c.answers) {
      ok(consts.IDEOLOGUE_IDS.includes(a.ideologue), `${id}: unknown ideologue ${a.ideologue}`)
      ok(R.poolTotal({ ...R.emptyPool(), ...a.resources }) > 0, `${id}: answer pays nothing`)
    }
  }
})

check('content advisory cards can be removed before play (p.13)', () => {
  const full = I.buildIdeologyDeck(rng())
  const filtered = I.buildIdeologyDeck(rng(), { exclude: ['mature'] })
  ok(
    D.deckSize(filtered) < D.deckSize(full),
    'excluding an advisory should shrink the deck'
  )
})

check('passive income is 1 resource per 2 cards of an Ideologue (p.14)', () => {
  const cards = (n, ideologue) => Array.from({ length: n }, () => ({ cardId: 'x', ideologue }))

  eq(R.poolTotal(I.passiveIncome(cards(1, 'capitalist'))), 0, '1 card pays nothing:')
  eq(I.passiveIncome(cards(2, 'capitalist')).funds, 1, '2 cards:')
  eq(I.passiveIncome(cards(3, 'capitalist')).funds, 1, '3 cards still 1:')
  eq(I.passiveIncome(cards(4, 'capitalist')).funds, 2, '4 cards:')
})

check('each Ideologue pays its own resource type', () => {
  const two = (ideologue) => [
    { cardId: 'a', ideologue },
    { cardId: 'b', ideologue },
  ]
  eq(I.passiveIncome(two('capitalist')).funds, 1, 'capitalist → funds')
  eq(I.passiveIncome(two('supremo')).clout, 1, 'supremo → clout')
  eq(I.passiveIncome(two('showstopper')).media, 1, 'showstopper → media')
  eq(I.passiveIncome(two('idealist')).trust, 1, 'idealist → trust')
})

check('L3 unlocks at 3 cards and L5 at 5 (p.14)', () => {
  const cards = (n) => Array.from({ length: n }, () => ({ cardId: 'x', ideologue: 'supremo' }))

  eq(I.unlockedPowers(cards(2)).supremo, { count: 2, level3: false, level5: false })
  eq(I.unlockedPowers(cards(3)).supremo, { count: 3, level3: true, level5: false })
  eq(I.unlockedPowers(cards(5)).supremo, { count: 5, level3: true, level5: true })
})

check('multiple Ideologue powers can be active at once', () => {
  const cards = [
    ...Array.from({ length: 3 }, () => ({ cardId: 'x', ideologue: 'capitalist' })),
    ...Array.from({ length: 5 }, () => ({ cardId: 'y', ideologue: 'idealist' })),
  ]
  const active = I.activePowerList(cards)
  eq(active.map((p) => p.key), ['capitalist_l3', 'idealist_l3', 'idealist_l5'])
})

check('power uses are limited per turn and reset', () => {
  const cards = Array.from({ length: 5 }, () => ({ cardId: 'x', ideologue: 'supremo' }))
  eq(I.powerUsesRemaining(cards, {}, 'supremo', 3), 2, 'Donations twice per turn:')

  let uses = I.recordPowerUse({}, 'supremo', 3)
  eq(I.powerUsesRemaining(cards, uses, 'supremo', 3), 1)
  uses = I.recordPowerUse(uses, 'supremo', 3)
  eq(I.powerUsesRemaining(cards, uses, 'supremo', 3), 0, 'exhausted:')
  eq(I.powerUsesRemaining(cards, I.resetPowerUses(), 'supremo', 3), 2, 'after reset:')
})

check('a locked power has no uses', () => {
  const cards = [{ cardId: 'x', ideologue: 'supremo' }]
  eq(I.powerUsesRemaining(cards, {}, 'supremo', 3), 0)
})

check('answering grants the chosen answer resources', () => {
  const cardId = ideologyCardData.IDEOLOGY_CARD_IDS[0]
  const card = ideologyCardData.IDEOLOGY_CARDS[cardId]
  const choice = card.answers[0]

  const r = I.answerIdeologyCard({
    cardId,
    ideologue: choice.ideologue,
    pool: pool(),
    reserve: consts.newPublicReserve(),
    ideologyCards: [],
  })

  ok(!r.error, r.error)
  eq(r.answerGain, { ...R.emptyPool(), ...choice.resources }, 'answer payout:')
  eq(r.ideologyCards.length, 1, 'card kept under the mat:')
  eq(r.ideologyCards[0].ideologue, choice.ideologue)
})

check('choosing an Ideologue not on the card is refused', () => {
  const cardId = ideologyCardData.IDEOLOGY_CARD_IDS[0]
  const card = ideologyCardData.IDEOLOGY_CARDS[cardId]
  const absent = consts.IDEOLOGUE_IDS.find(
    (id) => !card.answers.some((a) => a.ideologue === id)
  )
  const r = I.answerIdeologyCard({
    cardId,
    ideologue: absent,
    pool: pool(),
    reserve: consts.newPublicReserve(),
    ideologyCards: [],
  })
  ok(r.error, 'should be refused')
})

check('the card that reaches the threshold pays its passive bonus same turn (p.23)', () => {
  // Find a card with a capitalist answer.
  const cardId = ideologyCardData.IDEOLOGY_CARD_IDS.find((id) =>
    ideologyCardData.IDEOLOGY_CARDS[id].answers.some((a) => a.ideologue === 'capitalist')
  )
  const existing = [{ cardId: 'prior', ideologue: 'capitalist' }] // 1 card held

  const r = I.answerIdeologyCard({
    cardId,
    ideologue: 'capitalist',
    pool: pool(),
    reserve: consts.newPublicReserve(),
    ideologyCards: existing,
  })

  ok(!r.error, r.error)
  eq(r.passiveGain.funds, 1, 'the 2nd capitalist card pays immediately:')
  eq(r.pool.funds, r.answerGain.funds + 1, 'answer payout plus the bonus:')
})

check('answering reports when the player is over their resource cap', () => {
  const cardId = ideologyCardData.IDEOLOGY_CARD_IDS[0]
  const card = ideologyCardData.IDEOLOGY_CARDS[cardId]

  const r = I.answerIdeologyCard({
    cardId,
    ideologue: card.answers[0].ideologue,
    pool: pool({ funds: 11 }),
    reserve: consts.newPublicReserve(),
    ideologyCards: [],
  })

  ok(!r.error, r.error)
  ok(r.overCap, 'should be flagged over cap')
  eq(r.excess, R.poolTotal(r.pool) - 12, 'excess reported:')
})

check('answering conserves resources against the Public Reserve', () => {
  const cardId = ideologyCardData.IDEOLOGY_CARD_IDS[0]
  const card = ideologyCardData.IDEOLOGY_CARDS[cardId]
  const reserve = consts.newPublicReserve()

  const r = I.answerIdeologyCard({
    cardId,
    ideologue: card.answers[0].ideologue,
    pool: pool(),
    reserve,
    ideologyCards: [],
  })

  eq(R.poolTotal(r.pool) + R.poolTotal(r.reserve), R.poolTotal(reserve), 'conserved:')
})

check('redrawing an Ideology Card costs any 4 resources (p.12)', () => {
  const r = rng()
  const d = I.buildIdeologyDeck(r)
  const first = D.peek(d)
  const reserve = consts.newPublicReserve()

  const poor = I.redrawIdeologyCard({
    deck: d,
    pool: pool({ funds: 3 }),
    reserve,
    currentCardId: first,
    rng: r,
  })
  ok(poor.error, '3 resources is not enough')

  const rich = I.redrawIdeologyCard({
    deck: d,
    pool: pool({ funds: 2, trust: 2 }),
    reserve,
    currentCardId: first,
    rng: r,
  })
  ok(!rich.error, rich.error)
  eq(R.poolTotal(rich.pool), 0, 'all 4 spent:')
  eq(R.poolTotal(rich.reserve), R.poolTotal(reserve) + 4, 'paid to the Reserve:')
  ok(rich.cardId !== null, 'a new card was drawn')
  ok(rich.deck.discard.includes(first), 'the old card was discarded')
})

// ===========================================================================
// Integration — a few turns end to end
// ===========================================================================

check('a player can answer, earn, influence and take a zone', () => {
  const r = D.makeRng(7)
  let reserve = consts.newPublicReserve()
  let p = pool()
  let ideologyCards = []
  let market = V.initMarket(r)
  let b = B.initBoard(['p1', 'p2'])
  let ideologyDeck = I.buildIdeologyDeck(r)

  // Answer ideology cards until we can afford things.
  for (let turn = 0; turn < 6; turn++) {
    const drawn = D.draw(ideologyDeck, r)
    ideologyDeck = drawn.deck
    const card = I.getIdeologyCard(drawn.cardId)
    const ans = I.answerIdeologyCard({
      cardId: drawn.cardId,
      ideologue: card.answers[0].ideologue,
      pool: p,
      reserve,
      ideologyCards,
    })
    p = ans.pool
    reserve = ans.reserve
    ideologyCards = ans.ideologyCards

    // Honour the cap before continuing.
    if (R.isOverCap(p)) {
      const d = R.autoDiscardToCap(p)
      const capped = R.discardToCap(p, reserve, d)
      p = capped.pool
      reserve = capped.reserve
    }
  }

  ok(R.poolTotal(p) > 0, 'player earned resources')
  ok(R.poolTotal(p) <= 12, 'never exceeds the cap')

  // Six answers of the same first-listed ideologue should unlock powers.
  const powers = I.activePowerList(ideologyCards)
  ok(powers.length > 0, 'some power should be unlocked after 6 cards')

  // Spend on whatever is affordable and place into central.
  let placed = 0
  for (let i = 0; i < 3 && placed < 5; i++) {
    const options = V.affordableCards(market, p).filter((o) => o.affordable)
    if (!options.length) break
    const pick = options[0]
    const free = B.emptyAreaIndices(b, 'central')
    const need = V.getVoterCard(pick.cardId).voters
    if (free.length < need) break

    const res = V.influenceVoterCard({
      market,
      pool: p,
      reserve,
      board: b,
      playerId: 'p1',
      openIndex: pick.openIndex,
      zoneId: 'central',
      areaIndices: free.slice(0, need),
      rng: r,
    })
    if (res.error) break
    market = res.market
    p = res.pool
    reserve = res.reserve
    b = res.board
    placed += res.votersPlaced
  }

  ok(placed > 0, 'voters were placed on the board')
  eq(B.voterCount(b, 'central', 'p1'), placed, 'board agrees with the count')

  // Total resources in the world are still 120.
  eq(R.poolTotal(p) + R.poolTotal(reserve), 120, 'resource conservation across the game:')
})

report('Economy (Phases 2-3)')
