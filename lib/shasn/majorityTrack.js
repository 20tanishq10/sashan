// SHASN — the majority track.
//
// The plaque told you a zone needed 6 of 11 and, at best, that the leader had 4.
// It never said who else was in the zone, how full it was, or whether it could
// still be won at all. Those are the questions people actually ask every turn —
// "can I still take this, and how badly do I need to" — and the board answered
// none of them.
//
// A track is the zone's areas SORTED: every player's holding grouped together,
// biggest first, then the empty areas, with a tick where the majority
// requirement falls. The board already draws the same areas scattered across the
// map; sorting them is the whole trick, because a sorted row can be read against
// a threshold and a scattered one has to be counted.
//
// Kept out of the component and in the engine so it can be tested without a
// renderer, and reused by anything else that wants to show zone progress.

import { ZONES } from './zones'
import * as Board from './board'

/**
 * One segment per area in the zone.
 *
 *   { owner }        the player holding it, or null for an empty area
 *   { threshold }    true on the LAST segment before the majority line, so a
 *                    renderer knows where to put the tick
 *
 * Returns { segments, majority, areas, holder, leader, settled, empty }.
 */
export function majorityTrack(board, zoneId) {
  const zone = ZONES[zoneId]
  const counts = Board.voterCounts(board, zoneId)
  const holder = Board.majorityHolder(board, zoneId)
  const empty = Board.emptyAreas(board, zoneId)

  // Biggest holding first. Ties break on player id so the track does not
  // reshuffle itself between renders for no reason.
  const ranked = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))

  const segments = []
  for (const [playerId, n] of ranked) {
    for (let i = 0; i < n; i++) segments.push({ owner: playerId })
  }
  for (let i = 0; i < empty; i++) segments.push({ owner: null })

  // The tick sits after the majority-th segment.
  if (segments[zone.majority - 1]) segments[zone.majority - 1].threshold = true

  return {
    segments,
    majority: zone.majority,
    areas: zone.areas,
    holder,
    leader: ranked.length ? { playerId: ranked[0][0], count: ranked[0][1] } : null,
    empty,
    // A zone can fill up with nobody reaching the requirement, and those points
    // simply go unclaimed (p.19). Nothing on the board used to say so.
    settled: Board.isZoneSettled(board, zoneId),
    dead: !holder && Board.isZoneSettled(board, zoneId),
  }
}

/** How many more areas `playerId` needs here, or null if they cannot get there. */
export function needed(board, zoneId, playerId) {
  const zone = ZONES[zoneId]
  const mine = Board.voterCount(board, zoneId, playerId)
  const short = zone.majority - mine
  if (short <= 0) return 0
  return short <= Board.emptyAreas(board, zoneId) ? short : null
}
