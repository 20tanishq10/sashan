// SHASN — 2-player mode (Phase 8, rulebook p.20-21)
//
// "Face off with a singular enemy in a relentless battle for every square inch of
//  this unique board."
//
// The 2-player game uses the OTHER side of the double-sided board: 7 zones rather
// than 9. On top of the standard rules:
//
//   - Each player receives 8 resources (2 of each type)
//   - Both secretly bid resources and reveal simultaneously; higher bid is
//     Player 1. All bid resources go back to the Public Reserve. Tie -> bid again
//   - The 14 Zone Requirement Cards are shuffled and split between the players,
//     who alternate placing them until all 7 zones have one. PLAYER 2 places
//     first, so Player 2 sets 4 requirements and Player 1 sets 3 — deliberately
//     offsetting Player 1's advantage
//   - Remove Conspiracy and Headline cards not applicable to this mode
//   - Ideology Cards are drawn from the MIDDLE of the deck so neither player
//     knows what the other was dealt
//   - All other standard SHASN rules apply
//
// ⚠ The 7-zone board side is not in any source I have. The scan in Images/board/
// is the 5-player side. TWO_PLAYER_ZONES below is a placeholder preserving the
// documented shape (7 zones, one requirement each); its majority/area values are
// invented and must be replaced from the real board.

import { ZONE_REQUIREMENT_IDS, getZoneRequirement } from './data/zoneRequirements'
import * as Deck from './deck'
import * as R from './resources'
import { RESOURCE_IDS } from './constants'

export const TWO_PLAYER_ZONE_COUNT = 7
export const STARTING_RESOURCES_EACH = 8 // 2 of each type
export const IS_BOARD_STUB = true

/** ⚠ PLACEHOLDER geometry for the 2-player board side. */
export const TWO_PLAYER_ZONES = {
  north: { id: 'north', label: 'North', majority: 6, areas: 11, volatile: [3], adjacent: ['north_east', 'central', 'north_west'] },
  north_east: { id: 'north_east', label: 'North-East', majority: 5, areas: 9, volatile: [4], adjacent: ['north', 'east', 'central'] },
  east: { id: 'east', label: 'East', majority: 6, areas: 11, volatile: [6], adjacent: ['north_east', 'central', 'south'] },
  central: { id: 'central', label: 'Central', majority: 7, areas: 13, volatile: [5, 9], adjacent: ['north', 'north_east', 'east', 'south', 'west', 'north_west'] },
  south: { id: 'south', label: 'South', majority: 6, areas: 11, volatile: [2], adjacent: ['east', 'central', 'west'] },
  west: { id: 'west', label: 'West', majority: 6, areas: 11, volatile: [7], adjacent: ['south', 'central', 'north_west'] },
  north_west: { id: 'north_west', label: 'North-West', majority: 5, areas: 9, volatile: [1], adjacent: ['west', 'central', 'north'] },
}

export const TWO_PLAYER_ZONE_IDS = Object.keys(TWO_PLAYER_ZONES)

// ---------------------------------------------------------------------------
// Determining Player 1 (p.20)
// ---------------------------------------------------------------------------

/**
 * Both players start with 8 resources (2 of each), then secretly bid. Higher bid
 * takes the first seat; every bid resource returns to the Public Reserve.
 *
 * Bids are revealed simultaneously, so callers must collect both before calling.
 * A tie is not resolved here — the rulebook says bid again.
 */
export function resolveOpeningBid({ bids, players, reserve }) {
  const ids = Object.keys(bids)
  if (ids.length !== 2) return { error: 'Both players must bid' }

  for (const id of ids) {
    const p = players.find((x) => x.id === id)
    if (!p) return { error: `Unknown player ${id}` }
    if (R.poolTotal(bids[id]) < 1) return { error: `${p.name} must bid at least 1 resource` }
    // Must be checked per resource, not just on the total: bidding 5 Trust while
    // holding 2 Trust and 6 Funds passes a total check but cannot actually be paid.
    if (!R.poolIsNonNegative(R.subtractPools(p.pool, bids[id]))) {
      return { error: `${p.name} cannot bid resources they do not hold` }
    }
  }

  const [a, b] = ids
  const totalA = R.poolTotal(bids[a])
  const totalB = R.poolTotal(bids[b])
  if (totalA === totalB) return { tie: true, message: 'Bids are tied — bid again.' }

  // All bid resources go back to the Reserve regardless of who wins.
  let nextReserve = { ...reserve }
  let payError = null
  const nextPlayers = players.map((p) => {
    if (!bids[p.id]) return p
    const paid = R.payToReserve(p.pool, nextReserve, bids[p.id])
    if (paid.error) {
      payError = `${p.name}: ${paid.error}`
      return p
    }
    nextReserve = paid.reserve
    return { ...p, pool: paid.pool }
  })
  if (payError) return { error: payError }

  const firstId = totalA > totalB ? a : b
  const ordered = [
    nextPlayers.find((p) => p.id === firstId),
    nextPlayers.find((p) => p.id !== firstId),
  ].map((p, i) => ({ ...p, seatIndex: i }))

  return {
    players: ordered,
    reserve: nextReserve,
    firstPlayerId: firstId,
    message: `${ordered[0].name} bid ${Math.max(totalA, totalB)} and takes the first seat.`,
  }
}

export function startingPool() {
  return Object.fromEntries(RESOURCE_IDS.map((id) => [id, 2]))
}

// ---------------------------------------------------------------------------
// Zone Requirement placement (p.21)
// ---------------------------------------------------------------------------

/**
 * Shuffle the 14 Zone Requirement Cards and split them 7/7.
 * Player 2 places first and therefore sets 4 of the 7 zones; Player 1 sets 3.
 */
export function dealZoneRequirements(rng) {
  const shuffled = Deck.shuffle(ZONE_REQUIREMENT_IDS, rng)
  return {
    // hands are indexed by seat: 0 = Player 1, 1 = Player 2
    hands: [shuffled.slice(0, 7), shuffled.slice(7, 14)],
    placements: {}, // zoneId -> requirementId
    // p.21 — "Player 2 will place the first requirement on the board."
    toPlaceSeat: 1,
    placedCount: 0,
  }
}

/** Whose turn it is to place: Player 2, then Player 1, alternating. */
export function nextPlacingSeat(placedCount) {
  return placedCount % 2 === 0 ? 1 : 0
}

export function placeZoneRequirement(state, { seatIndex, requirementId, zoneId }) {
  if (state.placedCount >= TWO_PLAYER_ZONE_COUNT) {
    return { error: 'Every zone already has a requirement' }
  }
  if (seatIndex !== nextPlacingSeat(state.placedCount)) {
    return { error: `It is Player ${nextPlacingSeat(state.placedCount) + 1}'s turn to place` }
  }
  if (!TWO_PLAYER_ZONES[zoneId]) return { error: `Unknown zone ${zoneId}` }
  if (state.placements[zoneId]) return { error: `${zoneId} already has a requirement` }
  if (!state.hands[seatIndex].includes(requirementId)) {
    return { error: 'That requirement is not in your hand' }
  }

  const placedCount = state.placedCount + 1
  return {
    state: {
      ...state,
      hands: state.hands.map((h, i) => (i === seatIndex ? h.filter((r) => r !== requirementId) : h)),
      placements: { ...state.placements, [zoneId]: requirementId },
      placedCount,
      toPlaceSeat: placedCount >= TWO_PLAYER_ZONE_COUNT ? null : nextPlacingSeat(placedCount),
    },
    complete: placedCount >= TWO_PLAYER_ZONE_COUNT,
  }
}

/** p.21 — Player 2 determines 4 requirements, Player 1 determines 3. */
export function placementsPerSeat(zoneCount = TWO_PLAYER_ZONE_COUNT) {
  let p1 = 0
  let p2 = 0
  for (let i = 0; i < zoneCount; i++) (nextPlacingSeat(i) === 0 ? p1++ : p2++)
  return { player1: p1, player2: p2 }
}

// ---------------------------------------------------------------------------
// Evaluating requirements
// ---------------------------------------------------------------------------

/**
 * Can this player currently satisfy the requirement on `zoneId`?
 *
 * One-Time requirements are checked once and then marked satisfied. While-Forming
 * requirements are re-checked every time a majority forms, including when one
 * changes hands. Zonal Rules are not conditions at all — they modify play in that
 * zone and are read by the action handlers instead.
 */
export function checkRequirement({ requirement, player, board, zoneId, satisfied = {} }) {
  const req = typeof requirement === 'string' ? getZoneRequirement(requirement) : requirement
  if (!req) return { ok: true } // no requirement on this zone

  if (req.type === 'zonal_rule') return { ok: true, rule: req.check }

  if (req.type === 'one_time' && satisfied[`${player.id}:${zoneId}`]) {
    return { ok: true, alreadyMet: true }
  }

  const c = req.check
  switch (c.kind) {
    case 'ideologueCount': {
      const counts = {}
      for (const e of player.ideologyCards) counts[e.ideologue] = (counts[e.ideologue] || 0) + 1
      const best = Math.max(0, ...Object.values(counts))
      return best >= c.min
        ? { ok: true }
        : { ok: false, error: `${req.name}: needs ${c.min} cards of one Ideologue` }
    }
    case 'conspiracyCount':
      return player.conspiracyCards.length >= c.min
        ? { ok: true }
        : { ok: false, error: `${req.name}: needs ${c.min} Conspiracy Cards` }
    case 'allIdeologues': {
      const held = new Set(player.ideologyCards.map((e) => e.ideologue))
      return held.size >= 4 ? { ok: true } : { ok: false, error: `${req.name}: needs all four Ideologues` }
    }
    case 'atResourceCap':
      return R.poolTotal(player.pool) >= player.resourceCap
        ? { ok: true }
        : { ok: false, error: `${req.name}: you must be at your resource cap` }
    case 'payment':
      return R.canAfford(player.pool, c.cost)
        ? { ok: true, cost: c.cost }
        : { ok: false, error: `${req.name}: cannot afford the cost` }
    default:
      // Anything the engine cannot evaluate is adjudicated by the players.
      return { ok: true, manual: true }
  }
}

/** Zonal Rules in force on a zone, read by the action handlers. */
export function zonalRuleFor(placements, zoneId) {
  const req = getZoneRequirement(placements?.[zoneId])
  return req && req.type === 'zonal_rule' ? req.check : null
}
