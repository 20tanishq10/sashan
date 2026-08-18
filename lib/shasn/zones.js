// SHASN — board geometry (5-player board side)
//
// Zone majority/total values are read directly off the printed board and are final.
//
// ADJACENCY and VOLATILE COUNTS were recovered from the board scan in Images/board/
// by image analysis rather than guesswork:
//
//   - Zones were segmented by flood-filling the light map regions (and the tan
//     band for Central, which would otherwise bridge West into North-West).
//   - Adjacency was measured by dilating each zone mask and testing overlap, swept
//     across dilation radii so that pairs separated by a boundary LINE (truly
//     adjacent) separate cleanly from pairs separated by a whole ZONE.
//   - The 11 Volatile Areas were found with a ring-shape filter: light centre
//     against a dark annulus, which survives both light and dark backgrounds.
//     Result: 1 per zone, except North and South (the two 21-area zones) with 2
//     each. Total 11, matching rulebook p.17 and its "at least one per zone".
//
// This corrected one real mistake in the original guess: CENTRAL borders only
// North and South. It sits inside the inner diamond, so it does NOT touch West or
// East, and you therefore cannot Gerrymander between Central and those zones.
//
// ⚠ STILL APPROXIMATE: the `volatile` INDICES below. The scan is cropped at the
// right edge (East is clipped), so a complete 129-area coordinate map cannot be
// recovered from it. Indices are cosmetic in this engine — areas within a zone are
// interchangeable, and only the COUNT of Volatile Areas affects play. The measured
// pixel positions are recorded in VOLATILE_PIXELS for whenever the real board art
// is available to map against.

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
    adjacent: ['north_west', 'north', 'south', 'south_west'],
  },
  central: {
    id: 'central',
    label: 'Central',
    majority: 5,
    areas: 9,
    volatile: [4],
    // Central is embedded in the inner diamond between North and South only.
    adjacent: ['north', 'south'],
  },
  east: {
    id: 'east',
    label: 'East',
    majority: 9,
    areas: 17,
    volatile: [9],
    adjacent: ['north_east', 'north', 'south', 'south_east'],
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

/**
 * Volatile Area centres as measured on Images/board/ (864x1790 px), listed in
 * the order they were detected top-to-bottom. Kept so the abstract `volatile`
 * indices above can be pinned to real board positions once uncropped art exists.
 */
export const VOLATILE_PIXELS = {
  north_west: [[186, 371]],
  north_east: [[609, 363]],
  north: [[440, 518], [632, 724]],
  west: [[185, 771]],
  central: [[405, 795]],
  east: [[735, 928]],
  south: [[368, 1018], [485, 1171]],
  south_west: [[240, 1270]],
  south_east: [[626, 1274]],
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

    // The declared Volatile count must match what was measured on the board.
    const measured = VOLATILE_PIXELS[id]?.length ?? 0
    if (measured !== z.volatile.length) {
      errors.push(`${id}: ${z.volatile.length} volatile indices but ${measured} measured on the board`)
    }
  }

  return errors
}
