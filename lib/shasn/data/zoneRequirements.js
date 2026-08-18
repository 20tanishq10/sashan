// ⚠ STUB CONTENT — Zone Requirement Cards (2-player mode only)
//
// 14 cards ship in the box (rulebook p.3), used exclusively in 2-player mode
// (p.20-21). Neither the rulebook nor the Headlines/Conspiracies doc contains
// their text, so these are placeholders built to the documented SPEC.
//
// What the rulebook DOES specify (p.21):
//
//   "There are 14 unique Zone Requirements Cards. Shuffle and divide them
//    between the 2 players. Players have to take turns placing these Zone
//    Requirements on the board, until each of the 7 zones has a requirement."
//
//   Three types:
//     One-Time Requirement   — met once during the game; mark it with a voter
//                              peg on the card to denote eligibility
//     While Forming Majority — must be met EVERY time a majority forms there,
//                              including when a majority changes hands
//     Zonal Rule             — a rule modification applying only to that zone
//
// The `check` field describes the condition in structured form where the engine
// can evaluate it; `manual: true` means the players adjudicate it.
//
// Replace wholesale once the real cards are transcribed. Only twoPlayer.js
// imports this.

export const IS_STUB_CONTENT = true

export const REQUIREMENT_TYPES = {
  ONE_TIME: 'one_time',
  WHILE_FORMING: 'while_forming',
  ZONAL_RULE: 'zonal_rule',
}

export const ZONE_REQUIREMENTS = {
  // --- One-Time Requirements ---------------------------------------------
  req_ideologue_three: {
    id: 'req_ideologue_three',
    name: 'Party Line',
    type: REQUIREMENT_TYPES.ONE_TIME,
    text: 'Hold 3 Ideology Cards of a single Ideologue.',
    check: { kind: 'ideologueCount', min: 3 },
  },
  req_full_coffers: {
    id: 'req_full_coffers',
    name: 'Full Coffers',
    type: REQUIREMENT_TYPES.ONE_TIME,
    text: 'Reach your resource cap.',
    check: { kind: 'atResourceCap' },
  },
  req_conspirator: {
    id: 'req_conspirator',
    name: 'Conspirator',
    type: REQUIREMENT_TYPES.ONE_TIME,
    text: 'Hold 2 Conspiracy Cards at the same time.',
    check: { kind: 'conspiracyCount', min: 2 },
  },
  req_broad_church: {
    id: 'req_broad_church',
    name: 'Broad Church',
    type: REQUIREMENT_TYPES.ONE_TIME,
    text: 'Hold at least 1 Ideology Card of all four Ideologues.',
    check: { kind: 'allIdeologues' },
  },
  req_ground_game: {
    id: 'req_ground_game',
    name: 'Ground Game',
    type: REQUIREMENT_TYPES.ONE_TIME,
    text: 'Hold Gerrymandering Rights in 3 zones at once.',
    check: { kind: 'gerrymanderRights', min: 3 },
  },

  // --- While Forming Majority --------------------------------------------
  req_pay_toll: {
    id: 'req_pay_toll',
    name: 'Toll Road',
    type: REQUIREMENT_TYPES.WHILE_FORMING,
    text: 'Pay any 2 resources to the Public Reserve.',
    check: { kind: 'payment', cost: { any: 2 } },
  },
  req_trust_of_the_people: {
    id: 'req_trust_of_the_people',
    name: 'Trust Of The People',
    type: REQUIREMENT_TYPES.WHILE_FORMING,
    text: 'Spend 2 Trust.',
    check: { kind: 'payment', cost: { trust: 2 } },
  },
  req_war_chest: {
    id: 'req_war_chest',
    name: 'War Chest',
    type: REQUIREMENT_TYPES.WHILE_FORMING,
    text: 'Spend 2 Funds.',
    check: { kind: 'payment', cost: { funds: 2 } },
  },
  req_street_muscle: {
    id: 'req_street_muscle',
    name: 'Street Muscle',
    type: REQUIREMENT_TYPES.WHILE_FORMING,
    text: 'Spend 2 Clout.',
    check: { kind: 'payment', cost: { clout: 2 } },
  },
  req_column_inches: {
    id: 'req_column_inches',
    name: 'Column Inches',
    type: REQUIREMENT_TYPES.WHILE_FORMING,
    text: 'Spend 2 Media.',
    check: { kind: 'payment', cost: { media: 2 } },
  },
  req_neighbouring_support: {
    id: 'req_neighbouring_support',
    name: 'Neighbouring Support',
    type: REQUIREMENT_TYPES.WHILE_FORMING,
    text: 'Hold at least 2 voters in an adjacent zone.',
    check: { kind: 'adjacentVoters', min: 2 },
  },

  // --- Zonal Rules --------------------------------------------------------
  req_no_gerrymander: {
    id: 'req_no_gerrymander',
    name: 'Sealed Borders',
    type: REQUIREMENT_TYPES.ZONAL_RULE,
    text: 'Voters cannot be Gerrymandered into or out of this zone.',
    check: { kind: 'zonalRule', rule: 'noGerrymander' },
  },
  req_no_conversion: {
    id: 'req_no_conversion',
    name: 'Loyal Base',
    type: REQUIREMENT_TYPES.ZONAL_RULE,
    text: 'Voters in this zone cannot be converted.',
    check: { kind: 'zonalRule', rule: 'noConvert' },
  },
  req_costly_ground: {
    id: 'req_costly_ground',
    name: 'Costly Ground',
    type: REQUIREMENT_TYPES.ZONAL_RULE,
    text: 'Placing voters here costs any 1 extra resource per Voter Card.',
    check: { kind: 'zonalRule', rule: 'placementSurcharge', amount: 1 },
  },
}

export const ZONE_REQUIREMENT_IDS = Object.keys(ZONE_REQUIREMENTS)
export const ZONE_REQUIREMENT_COUNT = ZONE_REQUIREMENT_IDS.length // 14

export function getZoneRequirement(id) {
  return ZONE_REQUIREMENTS[id] || null
}
