// SHASN — Ideology Cards and Ideologue progression (p.12, p.14, p.23)
//
// This is the engine of the whole game: every resource a player earns comes from
// answering Ideology Cards and from the passive Ideologue powers those answers
// unlock.
//
// TURN START SEQUENCE (p.22)
//   1. The player to your right draws the top Ideology Card and reads both sides
//   2. You may pay any 4 resources to have it redrawn
//   3. You choose one of the two answers
//   4. You receive that answer's resources PLUS passive Ideologue income
//   5. You check your resource cap and discard down if over
//
// Each answer belongs to a different Ideologue. The answered card is kept under
// your player mat with your answer face up, and permanently counts toward that
// Ideologue's total.

import {
  IDEOLOGUES,
  IDEOLOGUE_IDS,
  PASSIVE_CARDS_PER_RESOURCE,
  LEVEL_3_THRESHOLD,
  LEVEL_5_THRESHOLD,
  IDEOLOGY_REDRAW_COST,
} from './constants'
import { IDEOLOGY_CARDS } from './data/ideologyCards'
import * as Deck from './deck'
import * as R from './resources'

export function getIdeologyCard(cardId) {
  return IDEOLOGY_CARDS[cardId] || null
}

/**
 * p.13 — cards carrying sensitive themes are marked and may be removed before
 * the game begins without affecting gameplay. `exclude` takes 'mature',
 * 'trigger', or both.
 */
export function buildIdeologyDeck(rng, { exclude = [] } = {}) {
  const ids = Object.keys(IDEOLOGY_CARDS).filter((id) => {
    const advisory = IDEOLOGY_CARDS[id].advisory
    return !advisory || !exclude.includes(advisory)
  })
  return Deck.initDeck(ids, rng)
}

// ---------------------------------------------------------------------------
// Ideologue tallies and progression
// ---------------------------------------------------------------------------

/**
 * Count answered cards per Ideologue.
 * `ideologyCards` is the player's kept pile: [{ cardId, ideologue }, ...]
 */
export function ideologueCounts(ideologyCards = []) {
  const counts = Object.fromEntries(IDEOLOGUE_IDS.map((id) => [id, 0]))
  for (const entry of ideologyCards) {
    if (counts[entry.ideologue] !== undefined) counts[entry.ideologue] += 1
  }
  return counts
}

/**
 * p.14 — "For every 2 Ideology Cards you hold of an Ideologue, get 1 extra
 * resource of that type." Received when you answer at the start of your turn.
 */
export function passiveIncome(ideologyCards = []) {
  const counts = ideologueCounts(ideologyCards)
  const income = R.emptyPool()
  for (const id of IDEOLOGUE_IDS) {
    const bonus = Math.floor(counts[id] / PASSIVE_CARDS_PER_RESOURCE)
    if (bonus > 0) income[IDEOLOGUES[id].resource] += bonus
  }
  return income
}

/** p.14 — L3 unlocks at 3 cards, L5 at 5, and both stay active while held. */
export function unlockedPowers(ideologyCards = []) {
  const counts = ideologueCounts(ideologyCards)
  const out = {}
  for (const id of IDEOLOGUE_IDS) {
    out[id] = {
      count: counts[id],
      level3: counts[id] >= LEVEL_3_THRESHOLD,
      level5: counts[id] >= LEVEL_5_THRESHOLD,
    }
  }
  return out
}

export function activePowerList(ideologyCards = []) {
  const unlocked = unlockedPowers(ideologyCards)
  const powers = []
  for (const id of IDEOLOGUE_IDS) {
    if (unlocked[id].level3) {
      powers.push({ ideologue: id, level: 3, key: `${id}_l3`, ...IDEOLOGUES[id].level3 })
    }
    if (unlocked[id].level5) {
      powers.push({ ideologue: id, level: 5, key: `${id}_l5`, ...IDEOLOGUES[id].level5 })
    }
  }
  return powers
}

/** Remaining uses of a power this turn, given the turn's use counters. */
export function powerUsesRemaining(ideologyCards, powerUses = {}, ideologueId, level) {
  const unlocked = unlockedPowers(ideologyCards)
  if (!unlocked[ideologueId]?.[`level${level}`]) return 0
  const def = IDEOLOGUES[ideologueId][`level${level}`]
  const used = powerUses[`${ideologueId}_l${level}`] || 0
  return Math.max(0, def.usesPerTurn - used)
}

export function recordPowerUse(powerUses = {}, ideologueId, level) {
  const key = `${ideologueId}_l${level}`
  return { ...powerUses, [key]: (powerUses[key] || 0) + 1 }
}

/** p.22 — power use counters reset at the start of each turn. */
export function resetPowerUses() {
  return {}
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

/**
 * p.12 — "Before answering an Ideology Card, you can also choose to have it
 * redrawn by paying any 4 resources to the Public Reserve."
 */
export function redrawIdeologyCard({ deck, pool, reserve, currentCardId, allocation = null, rng }) {
  const cost = { any: IDEOLOGY_REDRAW_COST }
  if (!R.canAfford(pool, cost)) {
    return { error: `Redrawing costs any ${IDEOLOGY_REDRAW_COST} resources` }
  }

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

  const discarded = Deck.discardCard(deck, currentCardId)
  const drawn = Deck.draw(discarded, rng)
  if (!drawn.cardId) return { error: 'Ideology deck is exhausted' }

  return { deck: drawn.deck, cardId: drawn.cardId, pool: paid.pool, reserve: paid.reserve }
}

/**
 * Answer an Ideology Card.
 *
 * Grants the chosen answer's resources plus passive Ideologue income, then
 * reports whether the player is now over their resource cap — they must discard
 * down before taking any other action (p.11).
 */
export function answerIdeologyCard({
  cardId,
  ideologue,
  pool,
  reserve,
  ideologyCards = [],
  cap,
  suppressAnswerPayout = false,
}) {
  const card = getIdeologyCard(cardId)
  if (!card) return { error: `Unknown Ideology Card ${cardId}` }

  const answer = card.answers.find((a) => a.ideologue === ideologue)
  if (!answer) return { error: `${cardId} has no answer for ${ideologue}` }

  // The kept card counts immediately, so a card that takes you to 2 (or 4, 6…)
  // pays its passive bonus in the same turn — p.23 is explicit about this.
  const nextIdeologyCards = [...ideologyCards, { cardId, ideologue }]

  // IT Raid (Headline): "You will not receive the resources denoted on your next
  // Ideology Card. You will still earn the resources from your ideologue powers."
  const answerGain = suppressAnswerPayout
    ? R.emptyPool()
    : { ...R.emptyPool(), ...answer.resources }
  const passive = passiveIncome(nextIdeologyCards)
  const totalGain = R.addPools(answerGain, passive)

  const taken = R.takeFromReserve(pool, reserve, totalGain)

  return {
    pool: taken.pool,
    reserve: taken.reserve,
    ideologyCards: nextIdeologyCards,
    answerGain,
    passiveGain: passive,
    granted: taken.granted,
    reserveShortfall: taken.shortfall,
    powers: unlockedPowers(nextIdeologyCards),
    payoutSuppressed: suppressAnswerPayout,
    overCap: R.isOverCap(taken.pool, cap),
    excess: R.excessOverCap(taken.pool, cap),
  }
}
