// SHASN board engine tests — Phase 1
//
// Run with:  node tests/board.test.mjs   (or npm test)

import { zones, consts, board as B, createRunner, eq, ok } from './harness.mjs'

const { check, report } = createRunner()

const [P1, P2, P3] = ['p1', 'p2', 'p3']
const fresh = () => B.initBoard([P1, P2, P3])

/** Fill `n` non-volatile areas of a zone with a player. */
function fill(board, zoneId, playerId, n, { includeVolatile = false } = {}) {
  const free = B.emptyAreaIndices(board, zoneId).filter(
    (i) => includeVolatile || !zones.isVolatile(zoneId, i)
  )
  const r = B.placeVoters(board, zoneId, playerId, free.slice(0, n))
  if (r.error) throw new Error(r.error)
  return r.board
}

// --- Geometry ---------------------------------------------------------------

check('geometry passes rulebook invariants', () => {
  eq(zones.validateGeometry(), [], 'validateGeometry:')
})

check('board totals match the printed board', () => {
  eq(zones.TOTAL_AREAS, 129, 'total areas:')
  eq(zones.TOTAL_MAJORITY_POINTS, 69, 'total majority points:')
  eq(zones.TOTAL_VOLATILE_AREAS, 11, 'volatile areas:')
  eq(zones.ZONE_IDS.length, 9, 'zone count:')
})

check('every zone majority is strictly more than half its areas', () => {
  for (const id of zones.ZONE_IDS) {
    const z = zones.ZONES[id]
    ok(z.majority > z.areas / 2, `${id}: ${z.majority} of ${z.areas}`)
  }
})

// --- Setup ------------------------------------------------------------------

check('starting resources are staggered 1..5 by seat (p.6)', () => {
  eq([0, 1, 2, 3, 4].map(consts.startingResourceCount), [1, 2, 3, 4, 5])
})

check('public reserve starts at 30 of each resource', () => {
  eq(consts.newPublicReserve(), { funds: 30, clout: 30, media: 30, trust: 30 })
})

check('fresh board is empty and nothing is settled', () => {
  const b = fresh()
  eq(B.emptyAreas(b, 'north_west'), 11)
  eq(B.majorityHolder(b, 'north_west'), null)
  ok(!B.isZoneSettled(b, 'north_west'), 'empty zone should be unsettled')
  ok(!B.isGameOver(b), 'fresh board should not be over')
  eq(B.scores(b), { p1: 0, p2: 0, p3: 0 })
})

// --- Forming majorities -----------------------------------------------------

check('majority forms exactly at the requirement, not before', () => {
  let b = fill(fresh(), 'north_west', P1, 5)
  eq(B.majorityHolder(b, 'north_west'), null, 'at 5 of 6:')
  b = fill(b, 'north_west', P1, 1)
  eq(B.majorityHolder(b, 'north_west'), P1, 'at 6 of 6:')
  ok(B.isZoneSettled(b, 'north_west'), 'zone should be settled')
})

check('extra voters past the requirement score nothing (p.8)', () => {
  const atReq = fill(fresh(), 'north_west', P1, 6)
  const over = fill(fresh(), 'north_west', P1, 9)
  eq(B.scores(atReq).p1, 6, 'exactly 6:')
  eq(B.scores(over).p1, 6, '9 voters still:')
})

check('two players cannot both hold a majority in one zone', () => {
  let b = fill(fresh(), 'north', P1, 11)
  b = fill(b, 'north', P2, 8) // 21 areas, 11+8 = 19
  eq(B.majorityHolder(b, 'north'), P1)
  eq(B.scores(b), { p1: 11, p2: 0, p3: 0 })
})

check('score is the sum of majority requirements held', () => {
  let b = fill(fresh(), 'central', P1, 5) // 5 pts
  b = fill(b, 'north', P1, 11) // 11 pts
  b = fill(b, 'south_east', P2, 6) // 6 pts
  eq(B.scores(b), { p1: 16, p2: 6, p3: 0 })
})

// --- Breaking majorities ----------------------------------------------------

check('removing a voter breaks a majority (p.8)', () => {
  const b = fill(fresh(), 'north_west', P1, 6)
  eq(B.majorityHolder(b, 'north_west'), P1)

  const idx = b.zones.north_west.owners.findIndex((o) => o === P1)
  const r = B.discardVoter(b, 'north_west', idx, { allowMajority: true })
  ok(!r.error, r.error)
  eq(B.majorityHolder(r.board, 'north_west'), null, 'after removal:')
  eq(B.scores(r.board).p1, 0, 'score after break:')
})

check('majority voters are protected unless a power allows it', () => {
  const b = fill(fresh(), 'north_west', P1, 6) // exactly at requirement
  const idx = b.zones.north_west.owners.findIndex((o) => o === P1)
  ok(!B.isNonMajorityVoter(b, 'north_west', idx), 'at requirement, all are majority voters')

  const blocked = B.discardVoter(b, 'north_west', idx)
  ok(blocked.error, 'should refuse to discard a majority voter')

  const allowed = B.discardVoter(b, 'north_west', idx, { allowMajority: true })
  ok(!allowed.error, 'Supremo L5 should be able to discard it')
})

check('spare voters above the requirement are removable', () => {
  const b = fill(fresh(), 'north_west', P1, 7) // 1 spare
  const idx = b.zones.north_west.owners.findIndex((o) => o === P1)
  ok(B.isNonMajorityVoter(b, 'north_west', idx), '7th voter should be non-majority')
  const r = B.discardVoter(b, 'north_west', idx)
  ok(!r.error, r.error)
  eq(B.majorityHolder(r.board, 'north_west'), P1, 'majority should survive')
})

// --- Volatile areas ---------------------------------------------------------

check('placing in a Volatile Area triggers a Headline (p.17)', () => {
  const v = zones.ZONES.central.volatile[0]
  const r = B.placeVoters(fresh(), 'central', P1, [v])
  eq(r.volatileTriggers.length, 1)
  eq(r.volatileTriggers[0], { zoneId: 'central', areaIndex: v, playerId: P1 })
})

check('Volatile voters cannot be discarded, evicted, converted or moved', () => {
  const v = zones.ZONES.central.volatile[0]
  const b = B.placeVoters(fresh(), 'central', P1, [v]).board

  ok(B.discardVoter(b, 'central', v, { allowMajority: true }).error, 'discard should fail')
  ok(B.evictVoter(b, 'central', v, { allowMajority: true }).error, 'evict should fail')
  ok(B.convertVoter(b, 'central', v, P2).error, 'convert should fail')
  ok(!B.isNonMajorityVoter(b, 'central', v), 'should never be Gerrymanderable')
})

check('multiple Volatile placements trigger multiple Headlines in order', () => {
  const [a, b2] = [zones.ZONES.north.volatile[0], zones.ZONES.north.volatile[1]]
  const r = B.placeVoters(fresh(), 'north', P1, [a, b2])
  eq(r.volatileTriggers.map((t) => t.areaIndex), [a, b2])
})

// --- Gerrymandering ---------------------------------------------------------

check('most voters in a zone grants Gerrymandering Rights (p.15)', () => {
  let b = fill(fresh(), 'west', P1, 3)
  b = fill(b, 'west', P2, 1)
  eq(B.gerrymanderingRights(b).west, P1)
})

check('a tie gives nobody Gerrymandering Rights (p.16)', () => {
  let b = fill(fresh(), 'west', P1, 3)
  b = fill(b, 'west', P2, 3)
  eq(B.gerrymanderingRights(b).west, null)
})

check('one voter alone in a zone grants rights there (p.16)', () => {
  const b = fill(fresh(), 'east', P1, 1)
  eq(B.gerrymanderingRights(b).east, P1)
})

check('cannot move your only voter out of the zone granting rights (p.16)', () => {
  const b = fill(fresh(), 'east', P1, 1)
  const from = { zoneId: 'east', areaIndex: b.zones.east.owners.findIndex((o) => o === P1) }
  const to = { zoneId: 'south_east', areaIndex: 0 }
  const r = B.gerrymander(b, P1, 'east', from, to)
  ok(r.error, 'should be refused')
})

check('gerrymandering moves an opponent voter between adjacent zones', () => {
  let b = fill(fresh(), 'west', P1, 4)
  b = fill(b, 'west', P2, 2)
  const from = { zoneId: 'west', areaIndex: b.zones.west.owners.findIndex((o) => o === P2) }
  const to = { zoneId: 'south_west', areaIndex: 0 }

  const r = B.gerrymander(b, P1, 'west', from, to)
  ok(!r.error, r.error)
  eq(B.voterCount(r.board, 'west', P2), 1, 'P2 left in west:')
  eq(B.voterCount(r.board, 'south_west', P2), 1, 'P2 moved to south_west:')
})

check('gerrymandering into non-adjacent zones is refused', () => {
  let b = fill(fresh(), 'north_west', P1, 3)
  const from = { zoneId: 'north_west', areaIndex: b.zones.north_west.owners.findIndex((o) => o === P1) }
  const r = B.gerrymander(b, P1, 'north_west', from, { zoneId: 'south_east', areaIndex: 0 })
  ok(r.error, 'north_west and south_east are not adjacent')
})

check('gerrymandering without rights is refused', () => {
  let b = fill(fresh(), 'west', P1, 1)
  b = fill(b, 'west', P2, 4)
  const from = { zoneId: 'west', areaIndex: b.zones.west.owners.findIndex((o) => o === P2) }
  const r = B.gerrymander(b, P1, 'west', from, { zoneId: 'south_west', areaIndex: 0 })
  ok(r.error, 'P1 does not hold rights in west')
})

// --- Evict / convert --------------------------------------------------------

check('evicted voters return to their owner and can be replaced', () => {
  const b = fill(fresh(), 'north', P2, 3)
  const idx = b.zones.north.owners.findIndex((o) => o === P2)

  const e = B.evictVoter(b, 'north', idx)
  ok(!e.error, e.error)
  eq(e.board.evicted[P2], 1, 'evicted pool:')

  const back = B.replaceEvictedVoter(e.board, P2, 'south', 0)
  ok(!back.error, back.error)
  eq(back.board.evicted[P2], 0, 'pool after replacing:')
  eq(B.voterCount(back.board, 'south', P2), 1)
})

check('unplaced evicted voters are discarded (p.23)', () => {
  const b = { ...fresh(), evicted: { p1: 0, p2: 2, p3: 0 } }
  eq(B.discardUnplacedEvicted(b, P2).evicted[P2], 0)
})

check('converting takes over the area and can flip a majority', () => {
  const b = fill(fresh(), 'central', P1, 5) // P1 holds central
  eq(B.majorityHolder(b, 'central'), P1)

  let next = b
  for (let n = 0; n < 5; n++) {
    const idx = next.zones.central.owners.findIndex((o) => o === P1)
    const r = B.convertVoter(next, 'central', idx, P2)
    ok(!r.error, r.error)
    next = r.board
  }
  eq(B.majorityHolder(next, 'central'), P2, 'after converting all 5:')
  eq(B.scores(next), { p1: 0, p2: 5, p3: 0 })
})

// --- Placement rules --------------------------------------------------------

check('cannot place into an occupied area', () => {
  const b = B.placeVoters(fresh(), 'central', P1, [0]).board
  ok(B.placeVoters(b, 'central', P2, [0]).error, 'should be refused')
})

check('a Voter Card is discarded if the zone lacks room (p.9)', () => {
  const b = fill(fresh(), 'central', P1, 9, { includeVolatile: true }) // fills all 9
  ok(!B.canPlaceCard(b, 'central', 1), 'no room for even 1')
  ok(B.canPlaceCard(fresh(), 'central', 3), 'fresh zone fits 3')
})

// --- Game end ---------------------------------------------------------------

check('a zone is settled once no player can still reach the majority', () => {
  // central: 5 of 9. Give P1 4 and P2 4 — 1 empty, neither can reach 5... but
  // whoever takes the last area reaches 5. So it is NOT yet settled.
  let b = fill(fresh(), 'central', P1, 4, { includeVolatile: true })
  b = fill(b, 'central', P2, 4, { includeVolatile: true })
  eq(B.emptyAreas(b, 'central'), 1)
  ok(!B.isZoneSettled(b, 'central'), 'one player can still reach 5')

  // Fill the last area with P3, who cannot reach 5 alone.
  b = fill(b, 'central', P3, 1, { includeVolatile: true })
  ok(B.isZoneSettled(b, 'central'), 'board full, no majority possible')
  eq(B.majorityHolder(b, 'central'), null)
})

check('game ends when every zone is settled', () => {
  let b = fresh()
  ok(!B.isGameOver(b), 'fresh board')
  for (const id of zones.ZONE_IDS) {
    b = fill(b, id, P1, zones.ZONES[id].majority, { includeVolatile: true })
  }
  ok(B.isGameOver(b), 'all majorities formed')
  eq(B.scores(b).p1, 69, 'sweeping the board scores 69:')
})

check('filling the board ends the game even with majorities unformed', () => {
  let b = fresh()
  for (const id of zones.ZONE_IDS) {
    const n = zones.ZONES[id].areas
    // Alternate owners so nobody reaches a majority anywhere.
    const free = B.emptyAreaIndices(b, id)
    for (let i = 0; i < n; i++) {
      b = B.placeVoters(b, id, [P1, P2, P3][i % 3], [free[i]]).board
    }
  }
  ok(B.isBoardFull(b), 'board should be full')
  ok(B.isGameOver(b), 'game should be over')
})

// --- Scoring legibility and tie-breaks ------------------------------------

check('contested zones show how far short you are', () => {
  let b = fill(fresh(), 'central', P1, 3) // 3 of the 5 needed
  b = fill(b, 'central', P2, 1)

  const mine = B.contestedZones(b, P1)
  eq(mine.length, 1, 'one zone in contention:')
  eq(mine[0].held, 3)
  eq(mine[0].needed, 2, 'two more to take it:')
  ok(mine[0].leading, 'P1 is ahead there')
  ok(mine[0].reachable, 'still winnable')

  const theirs = B.contestedZones(b, P2)
  ok(!theirs[0].leading, 'P2 is behind')
})

check('a zone you already hold is not "contested"', () => {
  const b = fill(fresh(), 'central', P1, 5)
  eq(B.contestedZones(b, P1), [], 'held zones drop out:')
})

check('an unwinnable zone is flagged unreachable', () => {
  // central: 5 of 9. Fill all 9 split 4/4/1 so nobody can reach 5.
  let b = fill(fresh(), 'central', P1, 4, { includeVolatile: true })
  b = fill(b, 'central', P2, 4, { includeVolatile: true })
  b = fill(b, 'central', P3, 1, { includeVolatile: true })
  eq(B.contestedZones(b, P1), [], 'settled zones are not contests:')
})

check('projected score counts zones still winnable', () => {
  let b = fill(fresh(), 'north_west', P1, 6) // banked: 6
  b = fill(b, 'central', P1, 2)              // in contention: 5 more possible
  eq(B.scores(b)[P1], 6, 'banked:')
  eq(B.projectedScore(b, P1), 11, 'banked plus reachable:')
})

check('total voters counts every voter, scoring or not', () => {
  let b = fill(fresh(), 'north_west', P1, 6)
  b = fill(b, 'south', P1, 4)
  eq(B.scores(b)[P1], 6, 'only the majority scores:')
  eq(B.totalVoters(b, P1), 10, 'but all voters are counted:')
})

check('ties break on zones held, then on voters placed', () => {
  // Both on 6 points, but P1 took one 6/11 zone and P2 took one too —
  // separate them by voters on the board.
  let b = fill(fresh(), 'north_west', P1, 6)
  b = fill(b, 'north_east', P2, 6)
  b = fill(b, 'south', P2, 3) // P2 has more voters overall

  const table = B.standings(b, [
    { id: P1, nickname: 'Ada' },
    { id: P2, nickname: 'Bo' },
    { id: P3, nickname: 'Cy' },
  ])
  eq(table[0].nickname, 'Bo', 'more voters wins the tie-break:')
  eq(table[0].score, table[1].score, 'scores were level:')
  ok(!table[0].tied, 'and the tie was resolved')
})

check('a true deadlock is reported as a draw, not a fabricated winner', () => {
  let b = fill(fresh(), 'north_west', P1, 6)
  b = fill(b, 'north_east', P2, 6)

  const table = B.standings(b, [
    { id: P1, nickname: 'Ada' },
    { id: P2, nickname: 'Bo' },
  ])
  eq(table[0].rank, 1)
  eq(table[1].rank, 1, 'both rank first:')
  ok(table[0].tied && table[1].tied, 'flagged as tied')
})

check('the score breakdown accounts for every zone', () => {
  const b = fill(fresh(), 'central', P1, 5)
  const rows = B.scoreBreakdown(b, [{ id: P1, nickname: 'Ada' }])
  eq(rows.length, 9, 'one row per zone:')

  const central = rows.find((r) => r.zoneId === 'central')
  eq(central.holderName, 'Ada')
  eq(central.points, 5, 'worth its majority requirement:')

  const north = rows.find((r) => r.zoneId === 'north')
  eq(north.holder, null)
  eq(north.points, 0, 'unheld zones award nothing:')
  eq(rows.reduce((n, r) => n + r.points, 0), 5, 'total awarded:')
})

check('standings sort by score and list zones held', () => {
  let b = fill(fresh(), 'north', P2, 11)
  b = fill(b, 'central', P1, 5)
  const s = B.standings(b, [
    { id: P1, nickname: 'Ada' },
    { id: P2, nickname: 'Bo' },
    { id: P3, nickname: 'Cy' },
  ])
  eq(s.map((x) => [x.nickname, x.score]), [['Bo', 11], ['Ada', 5], ['Cy', 0]])
  eq(s[0].zonesHeld, ['North'])
})

// ---------------------------------------------------------------------------

report('Board engine (Phase 1)')
