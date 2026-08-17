// SHASN — board geometry (5-player board side)
//
// Source: Essential Edition India rulebook + board scan.
// Zone majority/total values are READ DIRECTLY off the printed board and are final.
//
// ⚠ PROVISIONAL: `volatile` indices and `adjacent` lists are placeholders. The board
// scan in Images/board/ is cropped and too low-res to locate the 11 Volatile Areas or
// confirm which zones physically touch. Both are isolated here so a proper scan only
// requires editing this file.

export const ZONE_IDS = [
  'north_west',
  'north',
  'north_east',
  'west',
  'central',
  'east',
  'south_west',
  'south',
  'south_east',
]

/**
 * majority — voters needed to hold the zone (printed numerator)
 * areas    — total voter areas in the zone (printed denominator)
 * volatile — area indices that are Volatile Areas (PROVISIONAL)
 * adjacent — zones reachable by Gerrymandering (PROVISIONAL)
 */
export const ZONES = {
  north_west: {
    id: 'north_west',
    label: 'North-West',
    majority: 6,
    areas: 11,
    volatile: [3],
    adjacent: ['north', 'west'],
  },
  north: {
    id: 'north',
    label: 'North',
    majority: 11,
    areas: 21,
    volatile: [5, 14],
    adjacent: ['north_west', 'north_east', 'west', 'central', 'east'],
  },
  north_east: {
    id: 'north_east',
    label: 'North-East',
    majority: 6,
    areas: 11,
    volatile: [4],
    adjacent: ['north', 'east'],
  },
  west: {
    id: 'west',
    label: 'West',
    majority: 9,
    areas: 17,
    volatile: [6],
    adjacent: ['north_west', 'north', 'central', 'south', 'south_west'],
  },
  central: {
    id: 'central',
    label: 'Central',
    majority: 5,
    areas: 9,
    volatile: [4],
    adjacent: ['north', 'west', 'east', 'south'],
  },
  east: {
    id: 'east',
    label: 'East',
    majority: 9,
    areas: 17,
    volatile: [9],
    adjacent: ['north_east', 'north', 'central', 'south', 'south_east'],
  },
  south_west: {
    id: 'south_west',
    label: 'South-West',
    majority: 6,
    areas: 11,
    volatile: [7],
    adjacent: ['west', 'south'],
  },
  south: {
    id: 'south',
    label: 'South',
    majority: 11,
    areas: 21,
    volatile: [8, 16],
    adjacent: ['south_west', 'south_east', 'west', 'central', 'east'],
  },
  south_east: {
    id: 'south_east',
    label: 'South-East',
    majority: 6,
    areas: 11,
    volatile: [2],
    adjacent: ['east', 'south'],
  },
}

export const TOTAL_AREAS = ZONE_IDS.reduce((n, z) => n + ZONES[z].areas, 0)          // 129
export const TOTAL_MAJORITY_POINTS = ZONE_IDS.reduce((n, z) => n + ZONES[z].majority, 0) // 69
export const TOTAL_VOLATILE_AREAS = ZONE_IDS.reduce((n, z) => n + ZONES[z].volatile.length, 0) // 11

export function isVolatile(zoneId, areaIndex) {
  return ZONES[zoneId].volatile.includes(areaIndex)
}

export function areAdjacent(zoneA, zoneB) {
  return ZONES[zoneA]?.adjacent.includes(zoneB) || false
}

// Sanity checks — these encode rulebook invariants and should never fail.
export function validateGeometry() {
  const errors = []

  if (TOTAL_VOLATILE_AREAS !== 11) {
    errors.push(`Expected 11 Volatile Areas, geometry defines ${TOTAL_VOLATILE_AREAS}`)
  }

  for (const id of ZONE_IDS) {
    const z = ZONES[id]

    // Rulebook p.7: a majority is "more than half the voters in that zone".
    if (z.majority <= z.areas / 2) {
      errors.push(`${id}: majority ${z.majority} is not more than half of ${z.areas}`)
    }
    // Only one player may ever hold a majority in a zone.
    if (z.majority * 2 <= z.areas) {
      errors.push(`${id}: two players could both reach ${z.majority} of ${z.areas}`)
    }
    // p.17: "Every zone on the board has at least one Volatile Area in it."
    if (z.volatile.length < 1) {
      errors.push(`${id}: no Volatile Area defined`)
    }
    for (const v of z.volatile) {
      if (v < 0 || v >= z.areas) errors.push(`${id}: volatile index ${v} out of range`)
    }
    // Adjacency must be symmetric.
    for (const other of z.adjacent) {
      if (!ZONES[other]) {
        errors.push(`${id}: unknown adjacent zone ${other}`)
      } else if (!ZONES[other].adjacent.includes(id)) {
        errors.push(`${id} ↔ ${other}: adjacency is not symmetric`)
      }
    }
  }

  return errors
}
