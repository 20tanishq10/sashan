// SHASN — ongoing card effects.
//
// Most Conspiracy and Headline cards resolve and are done. A third of them do
// not: they install something that lasts. Three shapes:
//
//   persistent  runs for the rest of the game   (Chai-Paani, Hawala, Pythonpost)
//   delayed     changes your NEXT turn          (IT Raid, Too Much Freedom)
//   counted     lasts for N uses                (Nayi Soch, Not Indian Enough)
//
// They live on the player as `player.effects`, a flat bag of counters and flags
// rather than a list of card objects, because every consumer wants to ask a
// simple question — "is there a surcharge on this purchase?" — not walk a list.
//
// Everything here is pure. The hooks that read these live in the modules that
// own the relevant action.

import * as R from './resources'

export function emptyEffects() {
  return {
    conspiracySurcharge: 0,     // Pythonpost — every Conspiracy costs +1, forever
    voterCardSurcharge: 0,      // Too Much Freedom — Voter Cards cost +1 next turn
    suppressIdeologyPayout: 0,  // IT Raid — next N Ideology answers pay nothing
    lockedLevel3: 0,            // Tukde Tukde — one L3 power barred next turn
    owedTithe: null,            // Khaki Terror — blocks purchases until paid
    lethalGerrymander: 0,       // Nayi Soch — the next N Gerrymandered voters die
    voterPenalty: 0,            // Not Indian Enough — next N Voter Cards yield 1 less
    hawala: false,              // The Hawala Network — 2 alike -> 1 other, forever
    doubleLevel3: false,        // Maha Alliance — L3 powers usable twice this turn
    sharedLevel3With: null,     // Polo Retreat — may also use this player's L3s
  }
}

export function effectsOf(player) {
  return { ...emptyEffects(), ...(player.effects || {}) }
}

export function withEffects(player, patch) {
  return { ...player, effects: { ...effectsOf(player), ...patch } }
}

/**
 * Effects that only last a turn are cleared as that turn begins.
 * Anything persistent (surcharges, Hawala) deliberately survives.
 */
export function expireTurnEffects(player) {
  const e = effectsOf(player)
  return withEffects(player, {
    voterCardSurcharge: 0,
    lockedLevel3: 0,
    doubleLevel3: false,
    sharedLevel3With: null,
    // suppressIdeologyPayout is consumed by answering, not by the clock, so a
    // player cannot dodge IT Raid by simply letting their turn pass.
    suppressIdeologyPayout: e.suppressIdeologyPayout,
  })
}

// ---------------------------------------------------------------------------
// Hooks — asked by the modules that own each action
// ---------------------------------------------------------------------------

/** Pythonpost: every Conspiracy Card you buy costs an extra resource. */
export function conspiracySurcharge(player) {
  return effectsOf(player).conspiracySurcharge
}

/** Too Much Freedom: all Voter Cards cost any 1 extra on your next turn. */
export function voterCardSurcharge(player) {
  return effectsOf(player).voterCardSurcharge
}

/** Not Indian Enough: you get 1 less voter from the next Voter Cards you influence. */
export function voterPenalty(player) {
  return effectsOf(player).voterPenalty > 0 ? 1 : 0
}

export function consumeVoterPenalty(player) {
  const e = effectsOf(player)
  return e.voterPenalty > 0 ? withEffects(player, { voterPenalty: e.voterPenalty - 1 }) : player
}

/** Nayi Soch: the next 3 voters you Gerrymander are killed rather than moved. */
export function gerrymanderIsLethal(player) {
  return effectsOf(player).lethalGerrymander > 0
}

export function consumeLethalGerrymander(player) {
  const e = effectsOf(player)
  return e.lethalGerrymander > 0
    ? withEffects(player, { lethalGerrymander: e.lethalGerrymander - 1 })
    : player
}

/** IT Raid: you receive nothing from the Ideology Card itself. Passives still pay. */
export function ideologyPayoutSuppressed(player) {
  return effectsOf(player).suppressIdeologyPayout > 0
}

export function consumeIdeologySuppression(player) {
  const e = effectsOf(player)
  return e.suppressIdeologyPayout > 0
    ? withEffects(player, { suppressIdeologyPayout: e.suppressIdeologyPayout - 1 })
    : player
}

/** Maha Alliance: use every unlocked Level 3 power twice this turn. */
export function level3Multiplier(player) {
  return effectsOf(player).doubleLevel3 ? 2 : 1
}

/**
 * Khaki Terror: "Donate 1 resource of each type to the Public Reserve. You
 * cannot make any purchases until you do so." Auction debt does the same job, so
 * both are checked in one place.
 */
export function purchasesBlocked(player) {
  if ((player.auctionDebt || 0) > 0) return 'auction debt'
  if (effectsOf(player).owedTithe) return 'an unpaid tithe (Khaki Terror)'
  return null
}

/**
 * Chai-Paani: an opponent's spend of one named resource comes to you instead of
 * the Public Reserve. Only one such card can be active at a time — a new one
 * discards the old (per the card).
 *
 * Stored on the game rather than the player, since it is a relationship.
 */
export function divertedTo(game, spenderId, resourceId) {
  const d = (game.diversions || []).find(
    (x) => x.victimId === spenderId && x.resource === resourceId
  )
  return d ? d.ownerId : null
}

export function setDiversion(game, { ownerId, victimId, resource }) {
  // "If another such card is played, this one will get discarded."
  return { ...game, diversions: [{ ownerId, victimId, resource }] }
}

/**
 * Route a payment. Normally it goes to the Public Reserve; Chai-Paani siphons a
 * named resource to whoever played it.
 *
 * p.6 clarification on the card: only resources spent INTO the Reserve can be
 * stolen — not resources placed on cards or discarded to meet the cap.
 */
export function routePayment(game, spenderId, allocation) {
  const diversions = game.diversions || []
  if (!diversions.length) return { toReserve: allocation, toPlayers: {} }

  const toReserve = { ...R.emptyPool(), ...allocation }
  const toPlayers = {}

  for (const d of diversions) {
    if (d.victimId !== spenderId) continue
    const amount = toReserve[d.resource] || 0
    if (amount <= 0) continue
    toReserve[d.resource] = 0
    toPlayers[d.ownerId] = R.addPools(
      toPlayers[d.ownerId] || R.emptyPool(),
      { ...R.emptyPool(), [d.resource]: amount }
    )
  }

  return { toReserve, toPlayers }
}

/**
 * The Hawala Network: for the rest of the game, hand the Reserve 2 of one
 * resource and take any 1 other. Multiple exchanges per turn are allowed.
 */
export function canUseHawala(player) {
  return effectsOf(player).hawala === true
}

export function hawalaExchange({ player, reserve, give, take }) {
  if (!canUseHawala(player)) return { error: 'You do not have The Hawala Network' }

  const giveTotal = R.poolTotal(give)
  if (giveTotal !== 2) return { error: 'Hand over exactly 2 resources' }
  const types = Object.keys(give).filter((k) => give[k] > 0)
  if (types.length !== 1) return { error: 'Both resources must be the same type' }
  if (R.poolTotal(take) !== 1) return { error: 'Take exactly 1 resource' }
  if (Object.keys(take).find((k) => take[k] > 0) === types[0]) {
    return { error: 'Take a different resource than the one you gave' }
  }

  const paid = R.payToReserve(player.pool, reserve, give)
  if (paid.error) return { error: paid.error }
  const taken = R.takeFromReserve(paid.pool, paid.reserve, take)
  if (taken.shortfall) return { error: 'The Public Reserve cannot cover that' }

  return { player: { ...player, pool: taken.pool }, reserve: taken.reserve }
}
