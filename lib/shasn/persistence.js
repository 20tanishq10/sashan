// SHASN — persistence
//
// The engine's `game` object is a single plain-JSON value with no functions, so
// it is stored whole in game_state.board_state rather than being decomposed
// across the normalised tables. A few columns are mirrored alongside it (round,
// phase, current_turn_player_id) purely so they can be queried and so Supabase
// Realtime has something to fire on.
//
// This is the right trade for a private friends game: the engine stays the single
// source of truth, and there is no mapping layer to drift out of sync.
//
// RANDOMNESS
//   Actions need an rng, but the game must be reconstructible from the database.
//   Deck contents are already stored explicitly, so the rng is only consulted for
//   reshuffles and market refills. We keep a `rngTicks` counter in the game and
//   derive `makeRng(seed + rngTicks)` per request, bumping the counter whenever an
//   action consumes randomness. That keeps every game replayable from its seed
//   while avoiding a fresh rng handing out the same sequence on every request.

import { makeRng } from './deck'
import { getIdeologyCard } from './ideology'

export function rngFor(game) {
  return makeRng((game.seed || 0) + (game.rngTicks || 0))
}

export function bumpRng(game) {
  return { ...game, rngTicks: (game.rngTicks || 0) + 1 }
}

/** Columns mirrored out of the game object for querying and realtime. */
export function mirrorColumns(game) {
  return {
    round: game.turnNumber || 1,
    phase: game.phase,
    turn_phase: game.turnPhase,
    current_turn_player_id: game.players[game.activeSeat]?.id ?? null,
    board_state: game,
    updated_at: new Date().toISOString(),
  }
}

export function hydrate(row) {
  const game = row?.board_state
  if (!game || !game.players || !game.board) return null
  return game
}

/**
 * Strip everything a given player is not entitled to see.
 *
 * Public: the board, resource totals, answered Ideology Cards (they sit face up
 * under the mat), scores, and the log.
 * Private: Conspiracy Cards in hand.
 *
 * THE IDEOLOGY CARD IS HIDDEN FROM THE PLAYER ANSWERING IT (p.12)
 *
 *   "At the start of each turn, the player on your right will read aloud both
 *    sides of the top Ideology Card for you."
 *   "Keep the Ideology Card hidden until the active player has confirmed their
 *    answer. Every Campaign Box is especially designed for this purpose."
 *
 *   So the active player hears only the two answer TEXTS. They do not see which
 *   Ideologue each answer belongs to, nor what resources it pays. Choosing is
 *   supposed to be a position you take, not a payout you optimise for — showing
 *   the numbers collapses the whole point of the deck.
 *
 *   Everyone else sees the full card, exactly as the player reading it aloud
 *   does. That asymmetry is the mechanic, so it is enforced here on the server
 *   rather than merely hidden in the UI.
 */
export function viewFor(game, viewerPlayerId) {
  const isActive = game.players[game.activeSeat]?.id === viewerPlayerId

  return {
    ...game,
    pendingIdeologyCard: undefined,
    pendingIdeology: redactIdeology(game.pendingIdeologyCard, isActive),
    players: game.players.map((p) => {
      const mine = p.id === viewerPlayerId
      return {
        ...p,
        conspiracyCards: mine ? p.conspiracyCards : [],
        conspiracyCardCount: p.conspiracyCards.length,
      }
    }),
    // Decks are hidden; only their sizes are public.
    ideologyDeck: { size: deckSize(game.ideologyDeck) },
    conspiracyDeck: { size: deckSize(game.conspiracyDeck) },
    headlineDeck: { size: deckSize(game.headlineDeck) },
    market: { ...game.market, drawPile: undefined, drawPileSize: game.market.drawPile.length },
  }
}

function deckSize(d) {
  if (!d) return 0
  return (d.drawPile?.length || 0) + (d.discard?.length || 0)
}

/**
 * The pending Ideology Card as a given viewer may see it.
 *
 * `hidden: true` means the viewer is the one answering: they get the question
 * and the two answer texts and nothing else. Answers are addressed by index,
 * because the client legitimately does not know which Ideologue is which.
 */
function redactIdeology(cardId, hideFromViewer) {
  if (!cardId) return null
  const card = getIdeologyCard(cardId)
  if (!card) return null

  if (hideFromViewer) {
    return {
      hidden: true,
      prompt: card.prompt,
      advisory: card.advisory,
      answers: card.answers.map((a) => ({ text: a.text })),
    }
  }

  return {
    hidden: false,
    cardId,
    prompt: card.prompt,
    advisory: card.advisory,
    answers: card.answers.map((a) => ({
      text: a.text,
      ideologue: a.ideologue,
      resources: a.resources,
    })),
  }
}
