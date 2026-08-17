// ⚠ STUB CONTENT — Voter Cards
//
// The rulebook is mechanics-only and contains no card text or costs. These 60
// cards are placeholders generated to the correct SPEC so the engine is
// playable and testable; they are not the real deck.
//
// Spec confirmed from rulebook p.3 and the card art on p.9:
//   - 60 cards in the deck
//   - each card yields 1, 2 or 3 voters
//   - cost is a small set of coloured resource pips; grey pips are wildcards
//   - cost scales with voter count (the p.9 art shows a 3-voter card at 4 pips
//     and 2-voter cards at 2–3 pips)
//
// COST CURVE (tunable — this is the main balance lever in the game):
//   1 voter  → 2 resources
//   2 voters → 3 resources
//   3 voters → 4 resources
//
// WILDCARD-DOMINANT BY DESIGN — each card asks for exactly ONE specific
// resource and pays the rest in wildcards. This is deliberate, and it fixes a
// real deadlock found in playtesting:
//
//   An early stub used 3-4 specific pips per card. Because the market only
//   cycles when a card is BOUGHT, a table that had starved one resource (easy
//   to do — Trust is only paid out by Idealist answers) could reach a state
//   where all three open cards demanded that resource, nobody could pay, and
//   the game froze permanently with 126 of 129 areas still empty.
//
//   The real game has two pressure valves for this: trading (p.11) and the
//   Capitalist's Prospecting power, "give 1 resource, take any 2" (p.23).
//   Both are later phases here. Until they exist, the deck itself has to stay
//   liquid. Revisit this curve once trading and Ideologue powers are wired —
//   the real deck is very likely more demanding than this.
//
// Replace this file wholesale once the real deck is transcribed. Nothing else
// imports the card contents directly, so swapping it is a one-file change.

import { RESOURCE_IDS } from '../constants'

export const IS_STUB_CONTENT = true

const COST_BY_VOTERS = { 1: 2, 2: 3, 3: 4 }

// Deck composition — 60 cards, weighted toward the cheap end so the early game
// has traction and 3-voter cards feel like a genuine swing.
const COMPOSITION = [
  { voters: 1, count: 24 },
  { voters: 2, count: 24 },
  { voters: 3, count: 12 },
]

/**
 * Build one card's cost: one specific resource pip, the remainder as wildcards.
 * `variant` rotates the specific type so demand spreads evenly across all four.
 */
function buildCost(voters, variant) {
  const pips = COST_BY_VOTERS[voters]
  const specific = RESOURCE_IDS[variant % RESOURCE_IDS.length]
  return { [specific]: 1, any: pips - 1 }
}

function buildDeck() {
  const cards = {}
  let variant = 0

  for (const { voters, count } of COMPOSITION) {
    for (let i = 0; i < count; i++) {
      const id = `voter_${voters}v_${String(i + 1).padStart(2, '0')}`
      cards[id] = {
        id,
        voters,
        cost: buildCost(voters, variant),
        // Flavour is deliberately generic — real cards carry campaign-specific art.
        name: `${voters} Voter${voters > 1 ? 's' : ''}`,
      }
      variant++
    }
  }

  return cards
}

export const VOTER_CARDS = buildDeck()

export const VOTER_CARD_IDS = Object.keys(VOTER_CARDS)

/** Total voters obtainable from the deck — useful for balance sanity checks. */
export const TOTAL_VOTERS_IN_DECK = VOTER_CARD_IDS.reduce(
  (n, id) => n + VOTER_CARDS[id].voters,
  0
)
