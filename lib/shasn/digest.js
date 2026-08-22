// SHASN — what happened while you were away.
//
// In a five-player game you sit out four turns between your own. Nothing told
// you what happened in them. The log is there, but it is a flat scroll of two
// hundred lines and reading it is a chore you do instead of playing; the board
// simply looks different and you have to work out why.
//
// So when the turn comes back to you, this says what changed. Derived entirely
// from the log, which turned out to record the right things already — majorities
// forming and breaking, conspiracies played, headlines fired, trades and
// auctions. It needed one addition: every entry now carries the turn it happened
// on, without which none of this is filterable.
//
// Pure, so the wording and the ordering can be checked without a renderer.

/**
 * Turn order is fixed and every player takes exactly one turn per round, so
 * your previous turn was exactly `players` turns ago. No bookkeeping required,
 * and it survives a reload — which a remembered client-side marker would not.
 */
export function previousTurnOf(turnNumber, playerCount) {
  const prev = turnNumber - playerCount
  return prev >= 1 ? prev : null
}

// Most consequential first. A zone changing hands is the whole game; somebody
// buying a card is not.
const RANK = {
  majority: 0,
  headline: 1,
  conspiracy: 2,
  resolution: 2,
  gerrymander: 3,
  auction: 4,
  trade: 5,
  power: 6,
  influence: 7,
  place: 7,
  ideology: 8,
  system: 9,
  turn: 99, // "X's turn begins" is not news
  result: 99,
}

/**
 * The digest for `playerId`, or an empty list when there is nothing to say.
 *
 *   { entries, from, to, missedTurns }
 *
 * `entries` are the log's own entries, filtered and sorted, so the wording
 * stays in one place rather than being written twice.
 */
export function turnDigest(game, playerId, { limit = 6 } = {}) {
  const empty = { entries: [], from: null, to: null, missedTurns: 0 }
  if (!game?.log?.length || !playerId) return empty

  const players = game.players?.length || 0
  const from = previousTurnOf(game.turnNumber, players)
  if (!from) return empty // your first turn; there is nothing behind you

  // Everything after your last turn began, up to and including now. Entries
  // from before the turn stamp existed have no `turn` and are left out.
  const since = game.log.filter(
    (e) => typeof e.turn === 'number' && e.turn > from && e.turn <= game.turnNumber
  )

  const worth = since.filter((e) => (RANK[e.type] ?? 50) < 99)

  const entries = worth
    .map((e, i) => ({ ...e, i }))
    // Rank first, then most recent within a rank — so the important thing leads
    // and, among equals, the freshest wins.
    .sort((a, b) => (RANK[a.type] ?? 50) - (RANK[b.type] ?? 50) || b.i - a.i)
    .slice(0, limit)

  return {
    entries,
    from,
    to: game.turnNumber,
    missedTurns: Math.max(0, game.turnNumber - from - 1),
  }
}

/** Whether there is anything worth interrupting the player for. */
export function hasDigest(game, playerId) {
  return turnDigest(game, playerId).entries.length > 0
}
