// SHASN — Jumla (Conspiracy, p.18).
//
//   "This is an extra Ideology Card of your choice. Opponents can take this card
//    by paying you as many resources as the Ideologue level this card is on. At
//    the end of your turn, you may place this card under a different Ideologue."
//   Clarification: "Moving this card around at the end of the turn is strictly
//    optional."
//
// Unlike every other Conspiracy Card, Jumla does not resolve and leave. It joins
// your Ideology stack and stays there, counting toward passive income and toward
// the 3- and 5-card power thresholds — and it can be bought out from under you,
// which is the whole tension of the card. Losing it can un-unlock a power.
//
// IMPLEMENTATION
//
// It is stored as an ordinary entry in the holder's `ideologyCards`, flagged
// `jumla: true`. That was the deciding choice: every existing consumer —
// ideologueCounts, passiveIncome, unlockedPowers, the player mat — then counts
// it correctly with no changes at all. A parallel field would have meant finding
// and fixing every one of those call sites, and missing one silently.
//
// LEVEL — one interpretation, flagged as such
//
// "as many resources as the Ideologue level this card is on" is the one phrase
// on the card that this file has to interpret. Ideology Cards physically stack
// under an Ideologue, and a stack position IS a level, so the level here is
// taken as Jumla's 1-based position in that Ideologue's pile. Placing it on a
// tall pile makes it expensive to steal; placing it on a short one makes it
// cheap. If the table reads this differently, `levelOf` is the only thing to
// change.

import * as R from './resources'

export const JUMLA_ID = 'jumla'

/** Is this Ideology stack entry the Jumla card? */
export function isJumla(entry) {
  return Boolean(entry?.jumla) || entry?.cardId === JUMLA_ID
}

/** Who is holding Jumla, and under which Ideologue — or null if it is not in play. */
export function findJumla(game) {
  for (const p of game.players || []) {
    const index = (p.ideologyCards || []).findIndex(isJumla)
    if (index >= 0) {
      const entry = p.ideologyCards[index]
      return { playerId: p.id, index, ideologue: entry.ideologue }
    }
  }
  return null
}

export function inPlay(game) {
  return findJumla(game) !== null
}

/**
 * The level Jumla sits on: its 1-based position among that Ideologue's cards,
 * in the order they were placed. This is the price an opponent pays to take it.
 */
export function levelOf(player, ideologue = null) {
  const cards = player?.ideologyCards || []
  const under = ideologue ?? cards.find(isJumla)?.ideologue
  if (!under) return 0

  let level = 0
  for (const entry of cards) {
    if (entry.ideologue !== under) continue
    level += 1
    if (isJumla(entry)) return level
  }
  return level
}

/** The cost to take Jumla off its current holder. */
export function priceOf(game) {
  const at = findJumla(game)
  if (!at) return 0
  const holder = game.players.find((p) => p.id === at.playerId)
  return levelOf(holder, at.ideologue)
}

/** Build the stack entry. Kept here so the flag is written in exactly one place. */
export function entry(ideologue) {
  return { cardId: JUMLA_ID, ideologue, jumla: true }
}

/**
 * Place Jumla into a player's stack under `ideologue`, removing any existing
 * copy first so a move cannot duplicate it.
 */
export function place(players, playerId, ideologue) {
  return players.map((p) => {
    const without = (p.ideologyCards || []).filter((e) => !isJumla(e))
    if (p.id !== playerId) {
      return without.length === (p.ideologyCards || []).length
        ? p
        : { ...p, ideologyCards: without }
    }
    return { ...p, ideologyCards: [...without, entry(ideologue)] }
  })
}

/** Remove Jumla from play entirely. */
export function remove(players) {
  return players.map((p) =>
    (p.ideologyCards || []).some(isJumla)
      ? { ...p, ideologyCards: p.ideologyCards.filter((e) => !isJumla(e)) }
      : p
  )
}

/**
 * Can `playerId` afford to take it, and what would they pay?
 *
 * The price is a number of resources, not particular ones — "as many resources
 * as the Ideologue level" — so any mix will do and the buyer chooses.
 */
export function canTake(game, playerId, payment = null) {
  const at = findJumla(game)
  if (!at) return { error: 'Jumla is not in play' }
  if (at.playerId === playerId) return { error: 'You already hold Jumla' }

  const buyer = game.players.find((p) => p.id === playerId)
  if (!buyer) return { error: 'Unknown player' }

  const price = priceOf(game)
  if (R.poolTotal(buyer.pool) < price) {
    return { error: `Taking Jumla costs ${price} resource(s) and you have fewer` }
  }

  if (payment) {
    const offered = { ...R.emptyPool(), ...payment }
    if (R.poolTotal(offered) !== price) {
      return { error: `Jumla is on level ${price} — pay exactly ${price} resource(s)` }
    }
    if (!R.poolIsNonNegative(R.subtractPools(buyer.pool, offered))) {
      return { error: 'You do not have those resources' }
    }
    return { price, payment: offered, from: at.playerId }
  }

  // No mix chosen: take it off the buyer's largest holdings first, so the
  // fallback never spends a resource they only have one of if it can help it.
  const auto = R.autoDiscardToCap(buyer.pool, Math.max(0, R.poolTotal(buyer.pool) - price))
  return { price, payment: auto, from: at.playerId }
}
