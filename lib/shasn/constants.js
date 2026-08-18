// SHASN — rules constants
// Every value here is taken directly from the Essential Edition India rulebook.

export const GAME_NAME = 'SHASN'

// p.3 — 5 player mats ship in the box.
export const MIN_PLAYERS = 3          // 2-player uses a separate board side + Zone Requirements
export const MAX_PLAYERS = 5
export const TWO_PLAYER_SUPPORTED = false // Phase 8

// p.3 — 50 voter tokens per player.
export const VOTER_TOKENS_PER_PLAYER = 50

// ---------------------------------------------------------------------------
// Resources (p.10) — all four are equally important.
// Each resource corresponds to one Ideologue.
// ---------------------------------------------------------------------------
// The four resources keep the printed colours' hue identity but at a saturation
// that sits inside the neutral interface rather than shouting over it. `ink` is
// the text colour to use on top of `color`.
export const RESOURCES = {
  funds: { id: 'funds', label: 'Campaign Funds', ideologue: 'capitalist', color: '#3f9e63', ink: '#ffffff' },
  clout: { id: 'clout', label: 'Street Clout', ideologue: 'supremo', color: '#d2503c', ink: '#ffffff' },
  media: { id: 'media', label: 'Media Attention', ideologue: 'showstopper', color: '#2f6feb', ink: '#ffffff' },
  trust: { id: 'trust', label: 'Public Trust', ideologue: 'idealist', color: '#dba417', ink: '#2a1f05' },
}

export const RESOURCE_IDS = Object.keys(RESOURCES)

// p.3 — 30 of each resource in the box. This is the Public Reserve.
export const PUBLIC_RESERVE_START = 30

// p.11 — "Players have a default resource cap of 12."
export const DEFAULT_RESOURCE_CAP = 12

// p.12 — "you can also choose to have it redrawn by paying any 4 resources".
export const IDEOLOGY_REDRAW_COST = 4

// ---------------------------------------------------------------------------
// HOUSE RULE — not from the rulebook.
//
// A shot clock on answering your Ideology Card. The printed game has no timer;
// at a table the pressure is social, because four people are watching you dither.
// Online that pressure vanishes and a turn can stall indefinitely, so the clock
// restores it — and it suits the deck, which is meant to be answered from
// instinct rather than calculated (you cannot see the payouts anyway, p.12).
//
// On expiry the card is answered at RANDOM. That is deliberately a real cost:
// not deciding is itself a decision, and the dice do not care about your
// platform. Set to 0 to disable the clock entirely.
// ---------------------------------------------------------------------------
export const IDEOLOGY_ANSWER_SECONDS = 10
export const IDEOLOGY_ANSWER_MS = IDEOLOGY_ANSWER_SECONDS * 1000

// ---------------------------------------------------------------------------
// Ideologues (p.14, powers detailed p.23–27)
// ---------------------------------------------------------------------------
export const IDEOLOGUES = {
  capitalist: {
    id: 'capitalist',
    label: 'The Capitalist',
    resource: 'funds',
    color: '#3f9e63',
    level3: {
      name: 'Prospecting',
      usesPerTurn: 1,
      short: 'Trade 1 resource for 2',
      text: 'Give 1 resource to the Public Reserve to get up to 2 resources of your choice.',
    },
    level5: {
      name: 'Breaking Ground',
      usesPerTurn: 3,
      short: 'Evict 3 voters',
      text: 'Evict any 1 voter from the board and send it back to its player (including majority voters).',
    },
  },
  supremo: {
    id: 'supremo',
    label: 'The Supremo',
    resource: 'clout',
    color: '#d2503c',
    level3: {
      name: 'Donations',
      usesPerTurn: 2,
      short: 'Snatch 2 resources',
      text: 'Snatch 1 resource from another player.',
    },
    level5: {
      name: 'Payback',
      usesPerTurn: 2,
      short: 'Discard 2 voters',
      text: "Spend 1 resource to discard 1 of an opponent's voters (including majority voters).",
    },
  },
  showstopper: {
    id: 'showstopper',
    label: 'The Showstopper',
    resource: 'media',
    color: '#2f6feb',
    level3: {
      name: 'Going Viral',
      usesPerTurn: 2,
      short: '+1 voter / card',
      text: 'Get +1 voter for any Voter Card that you influence.',
    },
    level5: {
      name: 'Election Fever',
      usesPerTurn: Infinity,
      short: '+1 Gerrymander / zone',
      text: 'Gerrymander 2 voters instead of 1 for every zone where you have Gerrymandering Rights (including majority voters).',
    },
  },
  idealist: {
    id: 'idealist',
    label: 'The Idealist',
    resource: 'trust',
    color: '#dba417',
    level3: {
      name: 'Helping Hands',
      usesPerTurn: 2,
      short: '2 discounts',
      text: 'Get 1 resource discount on any purchase.',
    },
    level5: {
      name: 'Tough Love',
      usesPerTurn: 1,
      short: 'Convert 2 voters',
      text: "Spend 2 Trust + any 2 resources to convert 2 of an opponent's voters into yours (including majority voters).",
    },
  },
}

export const IDEOLOGUE_IDS = Object.keys(IDEOLOGUES)

// p.14 — passive: 1 extra resource per 2 cards. L3 at 3 cards, L5 at 5 cards.
export const PASSIVE_CARDS_PER_RESOURCE = 2
export const LEVEL_3_THRESHOLD = 3
export const LEVEL_5_THRESHOLD = 5

// p.18 — "bought for any 4-5 resources, as denoted by the cost on the back of the card"
export const CONSPIRACY_COST_MIN = 4
export const CONSPIRACY_COST_MAX = 5

// p.9 — "Three open Voter Cards must always be available on the board."
export const OPEN_VOTER_CARDS = 3

// p.22 — turn phases. Note: SHASN has NO action points.
export const TURN_PHASES = {
  IDEOLOGY: 'ideology',     // answer the Ideology Card drawn for you
  RESOURCE_CAP: 'resource_cap', // discard down to cap if over
  ACTIONS: 'actions',       // unlimited actions, any order
  HEADLINES: 'headlines',   // resolve one Headline per Volatile placement
}

export const GAME_PHASES = {
  SETUP: 'setup',
  PLAYING: 'playing',
  FINAL_ROUND: 'final_round', // p.19 — board filled before all majorities formed
  FINISHED: 'finished',
}

// p.6 — Player 1 gets 1 resource, Player 2 gets 2, … Player 5 gets 5.
export function startingResourceCount(seatIndex) {
  return seatIndex + 1
}

export function emptyResourcePool(value = 0) {
  return Object.fromEntries(RESOURCE_IDS.map((id) => [id, value]))
}

export function newPublicReserve() {
  return emptyResourcePool(PUBLIC_RESERVE_START)
}
