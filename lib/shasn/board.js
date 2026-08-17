// SHASN — board mechanics (Phase 1)
//
// Voters, areas, forming and breaking majorities, Gerrymandering Rights, scoring,
// and game-end detection. All functions here are PURE: they take a board and
// return a new board. No I/O, no Supabase, no randomness.
//
// KEY MODELLING DECISION — majority status is DERIVED, never stored.
//
//   The rulebook has you flip N tokens face-up to mark a majority, but never says
//   *which* N. It is the player's free choice and mechanically irrelevant. So we
//   store only who owns each area and derive the rest:
//
//     - Player P holds the majority in zone Z iff count(P, Z) >= Z.majority
//     - Because Z.majority > Z.areas / 2, at most one player can ever hold it
//     - P has (count - majority) spare non-majority tokens when holding
//     - A token is "non-majority" (and so Gerrymanderable) iff removing it would
//       not drop its owner below the majority requirement
//
//   This makes "breaking majorities" (p.8) fall out for free: remove a token and
//   the majority simply stops being true. Nothing to un-flip.

import { ZONES, ZONE_IDS, isVolatile, areAdjacent } from './zones'

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function initBoard(playerIds) {
  const zones = {}
  for (const id of ZONE_IDS) {
    zones[id] = { owners: new Array(ZONES[id].areas).fill(null) }
  }
  return {
    zones,
    // Voters evicted from the board, awaiting replacement on their owner's next
    // turn (p.23 Breaking Ground, glossary "Evict"). Discarded if not replaced.
    evicted: Object.fromEntries(playerIds.map((id) => [id, 0])),
    playerIds: [...playerIds],
  }
}

function cloneZone(board, zoneId) {
  return {
    ...board,
    zones: {
      ...board.zones,
      [zoneId]: { ...board.zones[zoneId], owners: [...board.zones[zoneId].owners] },
    },
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function voterCount(board, zoneId, playerId) {
  return board.zones[zoneId].owners.reduce((n, o) => (o === playerId ? n + 1 : n), 0)
}

export function voterCounts(board, zoneId) {
  const counts = {}
  for (const owner of board.zones[zoneId].owners) {
    if (owner) counts[owner] = (counts[owner] || 0) + 1
  }
  return counts
}

export function emptyAreas(board, zoneId) {
  return board.zones[zoneId].owners.reduce((n, o) => (o === null ? n + 1 : n), 0)
}

export function emptyAreaIndices(board, zoneId) {
  const out = []
  board.zones[zoneId].owners.forEach((o, i) => {
    if (o === null) out.push(i)
  })
  return out
}

/** p.7 — the player meeting the zone's majority requirement, or null. */
export function majorityHolder(board, zoneId) {
  const req = ZONES[zoneId].majority
  const counts = voterCounts(board, zoneId)
  for (const [playerId, n] of Object.entries(counts)) {
    if (n >= req) return playerId
  }
  return null
}

export function holdsMajority(board, zoneId, playerId) {
  return voterCount(board, zoneId, playerId) >= ZONES[zoneId].majority
}

/**
 * Can this specific voter be removed without breaking its owner's majority?
 * See the header note — equivalent to "is this a non-majority voter".
 * Voters in Volatile Areas are never affectable (p.17, glossary).
 */
export function isNonMajorityVoter(board, zoneId, areaIndex) {
  const owner = board.zones[zoneId].owners[areaIndex]
  if (!owner) return false
  if (isVolatile(zoneId, areaIndex)) return false
  const count = voterCount(board, zoneId, owner)
  return count !== ZONES[zoneId].majority
}

/** Voters in Volatile Areas cannot be discarded, evicted, converted or moved. */
export function isProtected(zoneId, areaIndex) {
  return isVolatile(zoneId, areaIndex)
}

// ---------------------------------------------------------------------------
// Placement (p.9)
// ---------------------------------------------------------------------------

/**
 * Place voters into specific areas of a single zone.
 *
 * Rulebook constraints enforced by the caller, not here:
 *   - voters from one Voter Card cannot be split across zones (p.9)
 *   - if a zone lacks room for the whole card, all its voters are discarded (p.9)
 *
 * Returns { board, volatileTriggers } — one Headline per voter landing in a
 * Volatile Area, resolved at end of turn in placement order (p.17).
 */
export function placeVoters(board, zoneId, playerId, areaIndices) {
  const zone = board.zones[zoneId]
  const volatileTriggers = []

  for (const i of areaIndices) {
    if (i < 0 || i >= zone.owners.length) {
      return { error: `Area ${i} does not exist in ${zoneId}` }
    }
    if (zone.owners[i] !== null) {
      return { error: `Area ${i} in ${zoneId} is already occupied` }
    }
  }
  if (new Set(areaIndices).size !== areaIndices.length) {
    return { error: 'Duplicate area indices' }
  }

  let next = cloneZone(board, zoneId)
  for (const i of areaIndices) {
    next.zones[zoneId].owners[i] = playerId
    if (isVolatile(zoneId, i)) {
      volatileTriggers.push({ zoneId, areaIndex: i, playerId })
    }
  }

  return { board: next, volatileTriggers }
}

/** p.9 — "If there aren't enough empty areas … all voters from that card get discarded." */
export function canPlaceCard(board, zoneId, voterCount) {
  return emptyAreas(board, zoneId) >= voterCount
}

// ---------------------------------------------------------------------------
// Removal — evict / discard / convert
// ---------------------------------------------------------------------------

/** Glossary: removed from board, returned to its player, replaceable next turn. */
export function evictVoter(board, zoneId, areaIndex, { allowMajority = false } = {}) {
  const owner = board.zones[zoneId].owners[areaIndex]
  if (!owner) return { error: 'No voter in that area' }
  if (isProtected(zoneId, areaIndex)) return { error: 'Voters in Volatile Areas cannot be evicted' }
  if (!allowMajority && !isNonMajorityVoter(board, zoneId, areaIndex)) {
    return { error: 'That is a majority voter' }
  }

  const next = cloneZone(board, zoneId)
  next.zones[zoneId].owners[areaIndex] = null
  next.evicted = { ...next.evicted, [owner]: (next.evicted[owner] || 0) + 1 }
  return { board: next, owner }
}

/** Glossary: removed from the board permanently. */
export function discardVoter(board, zoneId, areaIndex, { allowMajority = false } = {}) {
  const owner = board.zones[zoneId].owners[areaIndex]
  if (!owner) return { error: 'No voter in that area' }
  if (isProtected(zoneId, areaIndex)) return { error: 'Voters in Volatile Areas cannot be discarded' }
  if (!allowMajority && !isNonMajorityVoter(board, zoneId, areaIndex)) {
    return { error: 'That is a majority voter' }
  }

  const next = cloneZone(board, zoneId)
  next.zones[zoneId].owners[areaIndex] = null
  return { board: next, owner }
}

/** Glossary: replace the voter in the same area with yours (Idealist L5). */
export function convertVoter(board, zoneId, areaIndex, newOwnerId, { allowMajority = true } = {}) {
  const owner = board.zones[zoneId].owners[areaIndex]
  if (!owner) return { error: 'No voter in that area' }
  if (owner === newOwnerId) return { error: 'That voter is already yours' }
  if (isProtected(zoneId, areaIndex)) return { error: 'Voters in Volatile Areas cannot be converted' }
  if (!allowMajority && !isNonMajorityVoter(board, zoneId, areaIndex)) {
    return { error: 'That is a majority voter' }
  }

  const next = cloneZone(board, zoneId)
  next.zones[zoneId].owners[areaIndex] = newOwnerId
  return { board: next, previousOwner: owner }
}

/** Place a previously evicted voter back anywhere on the board (p.23). */
export function replaceEvictedVoter(board, playerId, zoneId, areaIndex) {
  if ((board.evicted[playerId] || 0) < 1) return { error: 'No evicted voters to place' }
  if (board.zones[zoneId].owners[areaIndex] !== null) return { error: 'Area is occupied' }

  const result = placeVoters(board, zoneId, playerId, [areaIndex])
  if (result.error) return result
  const next = {
    ...result.board,
    evicted: { ...result.board.evicted, [playerId]: board.evicted[playerId] - 1 },
  }
  return { board: next, volatileTriggers: result.volatileTriggers }
}

/** p.23 — evicted voters not replaced on the owner's next turn are discarded. */
export function discardUnplacedEvicted(board, playerId) {
  return { ...board, evicted: { ...board.evicted, [playerId]: 0 } }
}

// ---------------------------------------------------------------------------
// Gerrymandering (p.15–16)
// ---------------------------------------------------------------------------

/**
 * Rights go to whoever has strictly the most voters in a zone.
 * p.16 — ties mean nobody has rights. One voter alone in an empty zone counts.
 */
export function gerrymanderingRights(board) {
  const rights = {}
  for (const zoneId of ZONE_IDS) {
    const counts = voterCounts(board, zoneId)
    let best = null
    let bestN = 0
    let tied = false
    for (const [playerId, n] of Object.entries(counts)) {
      if (n > bestN) {
        best = playerId
        bestN = n
        tied = false
      } else if (n === bestN) {
        tied = true
      }
    }
    rights[zoneId] = tied || !best ? null : best
  }
  return rights
}

export function hasGerrymanderingRights(board, zoneId, playerId) {
  return gerrymanderingRights(board)[zoneId] === playerId
}

/**
 * Move a voter using a zone's Gerrymandering Rights.
 *
 * Legal moves (p.15): in or out of the rights zone, or between two zones adjacent
 * to it. `allowMajority` covers Showstopper L5 (Election Fever).
 */
export function gerrymander(board, playerId, rightsZoneId, from, to, { allowMajority = false } = {}) {
  if (!hasGerrymanderingRights(board, rightsZoneId, playerId)) {
    return { error: `No Gerrymandering Rights in ${rightsZoneId}` }
  }

  const involvesRightsZone = from.zoneId === rightsZoneId || to.zoneId === rightsZoneId
  const bothAdjacent =
    areAdjacent(rightsZoneId, from.zoneId) && areAdjacent(rightsZoneId, to.zoneId)
  if (!involvesRightsZone && !bothAdjacent) {
    return { error: `${rightsZoneId} rights do not reach that move` }
  }
  if (from.zoneId !== to.zoneId && !areAdjacent(from.zoneId, to.zoneId)) {
    return { error: 'Zones are not adjacent' }
  }

  const owner = board.zones[from.zoneId].owners[from.areaIndex]
  if (!owner) return { error: 'No voter in the source area' }
  if (isProtected(from.zoneId, from.areaIndex)) {
    return { error: 'Voters in Volatile Areas cannot be Gerrymandered' }
  }
  if (!allowMajority && !isNonMajorityVoter(board, from.zoneId, from.areaIndex)) {
    return { error: 'Only non-majority voters can be Gerrymandered' }
  }
  if (board.zones[to.zoneId].owners[to.areaIndex] !== null) {
    return { error: 'Destination area is occupied' }
  }

  // p.16 — you may not move your only voter out of the zone granting the rights.
  if (
    from.zoneId === rightsZoneId &&
    to.zoneId !== rightsZoneId &&
    owner === playerId &&
    voterCount(board, rightsZoneId, playerId) === 1
  ) {
    return { error: 'Cannot move your only voter out of the zone granting your rights' }
  }

  let next = cloneZone(board, from.zoneId)
  next.zones[from.zoneId].owners[from.areaIndex] = null
  next = cloneZone(next, to.zoneId)
  next.zones[to.zoneId].owners[to.areaIndex] = owner

  const volatileTriggers = isVolatile(to.zoneId, to.areaIndex)
    ? [{ zoneId: to.zoneId, areaIndex: to.areaIndex, playerId: owner }]
    : []

  return { board: next, volatileTriggers }
}

// ---------------------------------------------------------------------------
// Scoring and game end (p.19)
// ---------------------------------------------------------------------------

/** Only majority voters score. Each is worth 1 point. */
export function scores(board) {
  const out = Object.fromEntries(board.playerIds.map((id) => [id, 0]))
  for (const zoneId of ZONE_IDS) {
    const holder = majorityHolder(board, zoneId)
    if (holder) out[holder] = (out[holder] || 0) + ZONES[zoneId].majority
  }
  return out
}

export function standings(board, players) {
  const s = scores(board)
  return players
    .map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      score: s[p.id] || 0,
      zonesHeld: ZONE_IDS.filter((z) => majorityHolder(board, z) === p.id).map((z) => ZONES[z].label),
    }))
    .sort((a, b) => b.score - a.score)
}

/**
 * A zone is settled once its majority is formed, or once no player can still
 * reach the requirement with the empty areas remaining.
 */
export function isZoneSettled(board, zoneId) {
  if (majorityHolder(board, zoneId)) return true
  const req = ZONES[zoneId].majority
  const empty = emptyAreas(board, zoneId)
  const counts = voterCounts(board, zoneId)
  // A player not yet in the zone could still fill it from empty areas alone.
  const best = Math.max(0, ...Object.values(counts))
  return best + empty < req
}

/** p.19 — the game ends when all possible majorities in all zones are formed. */
export function isGameOver(board) {
  return ZONE_IDS.every((z) => isZoneSettled(board, z))
}

export function isBoardFull(board) {
  return ZONE_IDS.every((z) => emptyAreas(board, z) === 0)
}

export function boardSummary(board) {
  return ZONE_IDS.map((zoneId) => ({
    zoneId,
    label: ZONES[zoneId].label,
    majority: ZONES[zoneId].majority,
    areas: ZONES[zoneId].areas,
    filled: ZONES[zoneId].areas - emptyAreas(board, zoneId),
    holder: majorityHolder(board, zoneId),
    settled: isZoneSettled(board, zoneId),
    counts: voterCounts(board, zoneId),
  }))
}
