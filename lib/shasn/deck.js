// SHASN — seeded RNG and generic deck handling
//
// Shuffles run server-side and must be reproducible: a game stores its seed so
// a desync can be replayed and diagnosed. Math.random cannot do that, so we use
// mulberry32 — small, fast, and good enough for card shuffling.

export function makeRng(seed = Date.now()) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates. Returns a new array; does not mutate. */
export function shuffle(items, rng) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export function initDeck(cardIds, rng) {
  return { drawPile: shuffle(cardIds, rng), discard: [] }
}

/**
 * Draw the top card. When the draw pile empties, reshuffle the discard back in
 * — the rulebook specifies this for Voter Cards (p.9) and it is the sane
 * default for the others.
 *
 * Returns { deck, cardId } with cardId null only if the deck is truly empty.
 */
export function draw(deck, rng) {
  let { drawPile, discard } = deck

  if (drawPile.length === 0) {
    if (discard.length === 0) return { deck, cardId: null }
    drawPile = shuffle(discard, rng)
    discard = []
  }

  const [cardId, ...rest] = drawPile
  return { deck: { drawPile: rest, discard }, cardId }
}

export function drawMany(deck, count, rng) {
  let d = deck
  const cardIds = []
  for (let i = 0; i < count; i++) {
    const r = draw(d, rng)
    if (!r.cardId) break
    d = r.deck
    cardIds.push(r.cardId)
  }
  return { deck: d, cardIds }
}

export function discardCard(deck, cardId) {
  return { ...deck, discard: [...deck.discard, cardId] }
}

export function peek(deck) {
  return deck.drawPile[0] || null
}

export function deckSize(deck) {
  return deck.drawPile.length + deck.discard.length
}
