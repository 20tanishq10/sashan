// SHASN — trading and auctions (Phase 7)
//
// TRADING (rulebook p.11)
//   "You can trade resources and Conspiracy Cards with opponents."
//   "You can trade resources with other players in any ratio. At least 1 resource
//    must be exchanged by both parties. At least 1 player must be the active
//    player for a trade to occur."
//   "You can initiate a trade at any point during your turn."
//   "Ideology Cards cannot be traded (unless specified otherwise)."
//
//   Note the "at least 1 resource by both parties" rule is about RESOURCES, so a
//   pure card-for-card swap is not legal — each side must move at least one
//   resource. Cards ride along on top.
//
// AUCTIONS (p.11)
//   "You can bid up to as many resources as your resource cap during an auction.
//    You do not need to hold the number of resources you bid. If you win the bid,
//    you can pay off the bid amount in successive turns."
//   "However, you cannot make any purchases until you have completely paid off
//    your bid."
//   "If nobody places a bid for your auctioned item, discard it and receive the
//    minimum bid value from the Public Reserve."
//
//   Bidding on credit is the unusual part: the ceiling is your CAP, not your
//   holdings, and the shortfall becomes debt that freezes your purchasing.

import * as R from './resources'

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

/**
 * A trade offer. Either side may include Conspiracy Cards, but both sides must
 * move at least one resource.
 *
 * side = { resources: {...}, conspiracyCards: [cardId, ...] }
 */
export function validateTradeOffer({ proposer, target, offer, request, activePlayerId }) {
  if (proposer.id === target.id) return { ok: false, error: 'You cannot trade with yourself' }

  // p.11 — at least one party to the trade must be the active player.
  if (proposer.id !== activePlayerId && target.id !== activePlayerId) {
    return { ok: false, error: 'A trade must involve the active player' }
  }

  const offerRes = { ...R.emptyPool(), ...(offer.resources || {}) }
  const requestRes = { ...R.emptyPool(), ...(request.resources || {}) }

  if (R.poolTotal(offerRes) < 1) {
    return { ok: false, error: 'You must offer at least 1 resource' }
  }
  if (R.poolTotal(requestRes) < 1) {
    return { ok: false, error: 'You must request at least 1 resource' }
  }

  if (!R.poolIsNonNegative(R.subtractPools(proposer.pool, offerRes))) {
    return { ok: false, error: 'You do not hold the resources you offered' }
  }
  if (!R.poolIsNonNegative(R.subtractPools(target.pool, requestRes))) {
    return { ok: false, error: `${target.name} does not hold the resources you requested` }
  }

  for (const c of offer.conspiracyCards || []) {
    if (!proposer.conspiracyCards.includes(c)) {
      return { ok: false, error: 'You do not hold that Conspiracy Card' }
    }
  }
  for (const c of request.conspiracyCards || []) {
    if (!target.conspiracyCards.includes(c)) {
      return { ok: false, error: `${target.name} does not hold that Conspiracy Card` }
    }
  }

  return { ok: true }
}

/** Execute an accepted trade. Returns updated copies of both players. */
export function executeTradeOffer({ proposer, target, offer, request }) {
  const offerRes = { ...R.emptyPool(), ...(offer.resources || {}) }
  const requestRes = { ...R.emptyPool(), ...(request.resources || {}) }
  const offerCards = offer.conspiracyCards || []
  const requestCards = request.conspiracyCards || []

  const nextProposer = {
    ...proposer,
    pool: R.addPools(R.subtractPools(proposer.pool, offerRes), requestRes),
    conspiracyCards: [
      ...proposer.conspiracyCards.filter((c) => !offerCards.includes(c)),
      ...requestCards,
    ],
  }
  const nextTarget = {
    ...target,
    pool: R.addPools(R.subtractPools(target.pool, requestRes), offerRes),
    conspiracyCards: [
      ...target.conspiracyCards.filter((c) => !requestCards.includes(c)),
      ...offerCards,
    ],
  }

  return { proposer: nextProposer, target: nextTarget }
}

/** Trading can push a player over their cap; p.11 then forces a discard. */
export function tradeLeavesOverCap(player) {
  return R.isOverCap(player.pool, player.resourceCap)
}

// ---------------------------------------------------------------------------
// Negotiation: propose → accept / decline / counter
// ---------------------------------------------------------------------------
//
// A trade is an agreement, so it needs two consents. The engine holds proposals
// on the game and only moves anything when the other side accepts.
//
// HIDDEN HANDS
//   Conspiracy Cards are private (p.18 sets no hand limit and never makes them
//   public), so you cannot name a specific card in someone else's hand. You ask
//   for a NUMBER of cards and they choose which to hand over — which is what
//   happens at a table when you say "and one of your conspiracies".
//
//   Your own side of the offer names exact cards, because you can see them.

export function newTradeId(proposerId, targetId, turnNumber, n) {
  return `trade_${proposerId}_${targetId}_t${turnNumber}_${n}`
}

/**
 * Validate a proposal. Re-run on ACCEPT as well as on propose: the proposer may
 * have spent the resources in between, and a trade that silently half-applies
 * would be far worse than one that is refused late.
 */
export function validateProposal({ proposer, target, offer, request, activePlayerId }) {
  if (!proposer || !target) return { ok: false, error: 'Unknown player in trade' }
  if (proposer.id === target.id) return { ok: false, error: 'You cannot trade with yourself' }

  // p.11 — "At least 1 player must be the active player for a trade to occur."
  if (proposer.id !== activePlayerId && target.id !== activePlayerId) {
    return { ok: false, error: 'A trade must involve the player whose turn it is' }
  }

  const offerRes = { ...R.emptyPool(), ...(offer.resources || {}) }
  const requestRes = { ...R.emptyPool(), ...(request.resources || {}) }

  // p.11 — "At least 1 resource must be exchanged by both parties." Note that is
  // RESOURCES specifically, so a pure card-for-card swap is not a legal trade.
  if (R.poolTotal(offerRes) < 1) return { ok: false, error: 'You must offer at least 1 resource' }
  if (R.poolTotal(requestRes) < 1) {
    return { ok: false, error: 'You must ask for at least 1 resource' }
  }

  if (!R.poolIsNonNegative(R.subtractPools(proposer.pool, offerRes))) {
    return { ok: false, error: 'You no longer hold what you offered' }
  }
  if (!R.poolIsNonNegative(R.subtractPools(target.pool, requestRes))) {
    return { ok: false, error: `${target.name} does not hold what you asked for` }
  }

  for (const c of offer.conspiracyCards || []) {
    if (!proposer.conspiracyCards.includes(c)) {
      return { ok: false, error: 'You no longer hold that Conspiracy Card' }
    }
  }

  const wanted = request.conspiracyCardCount || 0
  if (wanted > (target.conspiracyCards?.length || 0)) {
    return { ok: false, error: `${target.name} does not have ${wanted} Conspiracy Card(s)` }
  }

  return { ok: true }
}

/**
 * Execute an accepted trade. `giveCards` is the target's choice of which of
 * their Conspiracy Cards to hand over, since the proposer could not name them.
 */
export function settleTrade({ proposer, target, offer, request, giveCards = [] }) {
  const offerRes = { ...R.emptyPool(), ...(offer.resources || {}) }
  const requestRes = { ...R.emptyPool(), ...(request.resources || {}) }
  const offerCards = offer.conspiracyCards || []
  const wanted = request.conspiracyCardCount || 0

  if (giveCards.length !== wanted) {
    return { error: `Choose exactly ${wanted} Conspiracy Card(s) to give` }
  }
  for (const c of giveCards) {
    if (!target.conspiracyCards.includes(c)) return { error: 'You do not hold that card' }
  }

  const nextProposer = {
    ...proposer,
    pool: R.addPools(R.subtractPools(proposer.pool, offerRes), requestRes),
    conspiracyCards: [
      ...proposer.conspiracyCards.filter((c) => !offerCards.includes(c)),
      ...giveCards,
    ],
  }
  const nextTarget = {
    ...target,
    pool: R.addPools(R.subtractPools(target.pool, requestRes), offerRes),
    conspiracyCards: [
      ...target.conspiracyCards.filter((c) => !giveCards.includes(c)),
      ...offerCards,
    ],
  }

  return { proposer: nextProposer, target: nextTarget }
}

/** A human-readable summary, used in the log and in the UI. */
export function describeTrade(trade, players) {
  const name = (id) => players.find((p) => p.id === id)?.name || 'someone'
  const side = (res, cards) => {
    const parts = Object.entries({ ...R.emptyPool(), ...(res || {}) })
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k}`)
    if (cards) parts.push(`${cards} conspiracy card${cards === 1 ? '' : 's'}`)
    return parts.join(' + ') || 'nothing'
  }
  return `${name(trade.proposerId)} offers ${side(
    trade.offer.resources,
    (trade.offer.conspiracyCards || []).length
  )} for ${side(trade.request.resources, trade.request.conspiracyCardCount)} from ${name(
    trade.targetId
  )}`
}

// ---------------------------------------------------------------------------
// Auctions
// ---------------------------------------------------------------------------

export function createAuction({ id, sellerId, itemType, itemRef, minBid = 0 }) {
  return {
    id,
    sellerId, // null when the Public Reserve is selling
    itemType, // 'conspiracy' | 'voter_card' | other
    itemRef,
    minBid,
    bids: {}, // playerId -> amount
    status: 'open',
    winnerId: null,
    winningBid: null,
  }
}

/**
 * p.11 — you may bid up to your resource cap, whether or not you hold it.
 * The bid is a resource COUNT, not a specific mix; the payment is chosen when
 * the debt is settled.
 */
export function placeBid(auction, player, amount) {
  if (auction.status !== 'open') return { error: 'That auction has closed' }
  if (player.id === auction.sellerId) return { error: 'You cannot bid on your own item' }
  if (!Number.isInteger(amount) || amount < auction.minBid) {
    return { error: `Bids start at ${auction.minBid}` }
  }
  if (amount > player.resourceCap) {
    return { error: `You cannot bid above your resource cap of ${player.resourceCap}` }
  }
  return { auction: { ...auction, bids: { ...auction.bids, [player.id]: amount } } }
}

export function highestBid(auction) {
  const entries = Object.entries(auction.bids)
  if (!entries.length) return null
  let best = entries[0]
  for (const e of entries) if (e[1] > best[1]) best = e
  return { playerId: best[0], amount: best[1] }
}

/**
 * Close an auction.
 *
 * With a winner: they pay what they can immediately and carry the rest as debt,
 * which blocks all purchases until cleared (p.11).
 *
 * With no bids: "discard it and receive the minimum bid value from the Public
 * Reserve" — the seller is compensated at the reserve price.
 */
export function resolveAuction({ auction, players, reserve }) {
  if (auction.status !== 'open') return { error: 'That auction has already been resolved' }

  const top = highestBid(auction)
  let nextPlayers = [...players]
  let nextReserve = { ...reserve }
  const messages = []

  if (!top) {
    if (auction.sellerId) {
      const seller = nextPlayers.find((p) => p.id === auction.sellerId)
      const taken = R.takeFromReserve(seller.pool, nextReserve, R.autoTake(nextReserve, auction.minBid))
      nextPlayers = nextPlayers.map((p) => (p.id === seller.id ? { ...p, pool: taken.pool } : p))
      nextReserve = taken.reserve
      messages.push(`No bids — the item is discarded and ${seller.name} takes ${auction.minBid} from the Reserve.`)
    } else {
      messages.push('No bids — the item is discarded.')
    }
    return {
      auction: { ...auction, status: 'discarded' },
      players: nextPlayers,
      reserve: nextReserve,
      messages,
    }
  }

  const winner = nextPlayers.find((p) => p.id === top.playerId)
  const held = R.poolTotal(winner.pool)
  const payNow = Math.min(held, top.amount)
  const debt = top.amount - payNow

  // Pay what they can now, largest holdings first.
  const payment = R.autoDiscardToCap(winner.pool, held - payNow)
  const paid = R.payToReserve(winner.pool, nextReserve, payment)
  if (paid.error) return { error: paid.error }
  nextReserve = paid.reserve

  let winnerNext = { ...winner, pool: paid.pool, auctionDebt: (winner.auctionDebt || 0) + debt }

  // If a player is selling, the proceeds go to them rather than the bank.
  if (auction.sellerId) {
    const seller = nextPlayers.find((p) => p.id === auction.sellerId)
    const taken = R.takeFromReserve(seller.pool, nextReserve, R.autoTake(nextReserve, payNow))
    nextReserve = taken.reserve
    nextPlayers = nextPlayers.map((p) => (p.id === seller.id ? { ...p, pool: taken.pool } : p))
    messages.push(`${seller.name} received ${payNow} resource(s).`)
  }

  nextPlayers = nextPlayers.map((p) => (p.id === winnerNext.id ? winnerNext : p))
  messages.push(`${winner.name} won the auction at ${top.amount}.`)
  if (debt > 0) {
    messages.push(`${winner.name} owes ${debt} and cannot make purchases until it is paid.`)
  }

  return {
    auction: { ...auction, status: 'resolved', winnerId: winner.id, winningBid: top.amount },
    players: nextPlayers,
    reserve: nextReserve,
    messages,
  }
}

/** Pay down auction debt. Purchases stay frozen until it reaches zero (p.11). */
export function repayDebt({ player, reserve, payment }) {
  const owed = player.auctionDebt || 0
  if (owed <= 0) return { error: 'You have no auction debt' }

  const amount = R.poolTotal(payment)
  if (amount < 1) return { error: 'Pay at least 1 resource' }
  if (amount > owed) return { error: `You only owe ${owed}` }

  const paid = R.payToReserve(player.pool, reserve, payment)
  if (paid.error) return { error: paid.error }

  return {
    player: { ...player, pool: paid.pool, auctionDebt: owed - amount },
    reserve: paid.reserve,
  }
}

export function canPurchase(player) {
  return (player.auctionDebt || 0) === 0
}
