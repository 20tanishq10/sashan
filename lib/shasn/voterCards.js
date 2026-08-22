// SHASN — Voter Cards and the open market (p.9)
//
// "Voters can be influenced through Voter Cards. Each Voter Card has a
//  combination of resources on it. Pay these resources to the Public Reserve in
//  order to influence that many voters and place them on the board."
//
// Rules enforced here:
//   - exactly 3 open cards at all times
//   - influencing discards the card and immediately flips a replacement
//   - the draw pile reshuffles from the discard when it empties
//   - all voters from one card go into a SINGLE zone, and if that zone lacks
//     room for the whole card, every voter on it is discarded
//   - no limit on how many cards you may influence in a turn
//
// Placement itself lives in board.js; this module handles the market and payment.

import { OPEN_VOTER_CARDS } from './constants'
import { VOTER_CARDS } from './data/voterCards'
import * as Deck from './deck'
import * as R from './resources'
import { canPlaceCard, placeVoters } from './board'

export function getVoterCard(cardId) {
  return VOTER_CARDS[cardId] || null
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export function initMarket(rng, cardIds = Object.keys(VOTER_CARDS)) {
  let deck = Deck.initDeck(cardIds, rng)
  const { deck: after, cardIds: open } = Deck.drawMany(deck, OPEN_VOTER_CARDS, rng)
  return { ...after, open }
}

/**
 * Refill the open row back to 3 after a card leaves it.
 *
 * Exported because A Trip To Goalpara (p.17) deliberately holds the refill back
 * until three cards have been taken — "New Voter Cards will only open after all
 * 3 cards have been discarded" — so the round has to ask for it by hand.
 */
export function refillMarket(market, rng) {
  let deck = { drawPile: market.drawPile, discard: market.discard }
  const open = [...market.open]
  while (open.length < OPEN_VOTER_CARDS) {
    const r = Deck.draw(deck, rng)
    if (!r.cardId) break
    deck = r.deck
    open.push(r.cardId)
  }
  return { ...deck, open }
}

// ---------------------------------------------------------------------------
// Influencing
// ---------------------------------------------------------------------------

/**
 * Influence one open Voter Card and place its voters into a single zone.
 *
 * @param areaIndices  target areas in `zoneId`; length must equal the voter
 *                     count the card yields (after any Showstopper bonus)
 * @param allocation   which resources the player is spending, including their
 *                     wildcard choices. Omit to auto-allocate.
 * @param discounts    Idealist L3 discounts to apply ('any' or a resource id)
 * @param bonusVoters  Showstopper L3 "Going Viral" — +1 voter on this card
 */
export function influenceVoterCard({
  market,
  pool,
  reserve,
  board,
  playerId,
  openIndex,
  zoneId,
  areaIndices = [],
  allocation = null,
  discounts = [],
  bonusVoters = 0,
  surcharge = 0,      // Too Much Freedom — every Voter Card costs 1 more
  voterPenalty = 0,   // Not Indian Enough — this card yields 1 fewer voter
  rng,
}) {
  const cardId = market.open[openIndex]
  if (!cardId) return { error: 'No Voter Card in that slot' }

  const card = getVoterCard(cardId)
  if (!card) return { error: `Unknown Voter Card ${cardId}` }

  const voterCount = Math.max(0, card.voters + bonusVoters - voterPenalty)
  const surcharged = surcharge
    ? { ...card.cost, any: (card.cost.any || 0) + surcharge }
    : card.cost
  const cost = R.applyDiscounts(surcharged, discounts)

  if (!R.canAfford(pool, cost)) {
    return { error: 'You cannot afford that Voter Card' }
  }

  // p.9 — if the zone lacks room for the whole card, every voter on it is
  // discarded. The card is still paid for and still leaves the market.
  const roomAvailable = canPlaceCard(board, zoneId, voterCount)

  let alloc = allocation
  if (!alloc) {
    const auto = R.autoAllocate(pool, cost)
    if (auto.error) return { error: auto.error }
    alloc = auto.allocation
  } else {
    const check = R.allocationSatisfies(alloc, cost)
    if (!check.ok) return { error: check.error }
  }

  const paid = R.payToReserve(pool, reserve, alloc)
  if (paid.error) return { error: paid.error }

  let nextBoard = board
  let volatileTriggers = []
  let votersDiscarded = 0

  if (roomAvailable) {
    if (areaIndices.length !== voterCount) {
      return {
        error: `This card places ${voterCount} voter(s); you selected ${areaIndices.length} area(s)`,
      }
    }
    const placement = placeVoters(board, zoneId, playerId, areaIndices)
    if (placement.error) return { error: placement.error }
    nextBoard = placement.board
    volatileTriggers = placement.volatileTriggers
  } else {
    votersDiscarded = voterCount
  }

  const afterRemoval = {
    drawPile: market.drawPile,
    discard: [...market.discard, cardId],
    open: market.open.filter((_, i) => i !== openIndex),
  }

  return {
    market: refillMarket(afterRemoval, rng),
    pool: paid.pool,
    reserve: paid.reserve,
    board: nextBoard,
    volatileTriggers,
    votersPlaced: roomAvailable ? voterCount : 0,
    votersDiscarded,
    card,
    paid: alloc,
  }
}

/** Which open cards can this player currently pay for? */
export function affordableCards(market, pool, discounts = []) {
  return market.open.map((cardId, i) => {
    const card = getVoterCard(cardId)
    const cost = R.applyDiscounts(card.cost, discounts)
    return {
      openIndex: i,
      cardId,
      card,
      cost,
      affordable: R.canAfford(pool, cost),
    }
  })
}
