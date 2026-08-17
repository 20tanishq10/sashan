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
 * Build one card's cost. `variant` walks the resource types so the deck spreads
 * demand evenly across all four, with a wildcard pip on roughly a third of
 * cards to keep payment flexible.
 */
function buildCost(voters, variant) {
  const pips = COST_BY_VOTERS[voters]
  const cost = {}
  let wildcards = 0

  // Every third card converts one pip into a wildcard.
  const wildcardPips = variant % 3 === 0 ? 1 : 0
  const specificPips = pips - wildcardPips
  wildcards += wildcardPips

  for (let i = 0; i < specificPips; i++) {
    const id = RESOURCE_IDS[(variant + i) % RESOURCE_IDS.length]
    cost[id] = (cost[id] || 0) + 1
  }
  if (wildcards) cost.any = wildcards

  return cost
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
