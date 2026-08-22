// SHASN — going round the table.
//
// Some cards do not resolve for one player. They stop the game and walk it
// round the table, one seat at a time:
//
//   Submerged (p.17)          "Starting with you, every player can Gerrymander
//                              1 majority or non-majority voter immediately."
//   A Trip To Goalpara (p.17) "The next 3 players after you can select and
//                              discard an open Voter Card."
//
// Neither of the existing pauses fits. `interrupt` is simultaneous — everyone
// eligible answers and then it settles in one go, which is right for Block and
// Reverse and wrong here, because a gerrymander changes the board the next
// player is looking at. `awaitingResolution` is a single actor. What these need
// is a queue: a strict order, one live slot at a time, and the game waiting.
//
// So that is what this is, and it is deliberately generic. The two cards differ
// only in who is queued and what a slot does; the waiting, the ordering, the
// skipping and the finishing are identical, and writing that twice is how the
// two of them drift apart.
//
// Shape on the game object:
//
//   game.round = {
//     kind,        // 'gerrymander' | 'cashOutVoter' — what a slot does
//     cardId,      // what put us here, so the UI can name it
//     cardName,
//     queue,       // player ids still to act, in order; queue[0] is live
//     acted,       // [{ playerId, action, note }] — what has happened so far
//     options,     // per-card settings, passed through untouched
//   }
//
// Pure: every function takes a round (or a game) and returns a new one.

/**
 * Seats in turn order starting from `fromId`, going round once.
 *
 * Turn order is seat order, and both cards are phrased relative to the player
 * who triggered them ("starting with you", "the next 3 players after you"), so
 * every queue this module builds is a rotation of the seating.
 */
export function seatsFrom(players, fromId, { include = true, count = null } = {}) {
  const start = players.findIndex((p) => p.id === fromId)
  if (start < 0) return []

  const ordered = []
  for (let i = 0; i < players.length; i++) {
    ordered.push(players[(start + i) % players.length].id)
  }
  if (!include) ordered.shift()

  if (count === null) return ordered

  // "The next 3 players after you" in a 3-player game is only 2 other people,
  // and the card says so: "In a 3 player game, you discard the last open card."
  // So the rotation wraps back onto the actor rather than stopping short.
  const out = []
  const cycle = include ? ordered : [...ordered, fromId]
  for (let i = 0; i < count; i++) out.push(cycle[i % cycle.length])
  return out
}

/** Open a round. Returns the round object to hang on the game. */
export function openRound({ kind, cardId, cardName, queue, options = {} }) {
  return { kind, cardId, cardName, queue: [...queue], acted: [], options }
}

/** Whose slot is live, or null when the round is over. */
export function currentPlayer(round) {
  return round?.queue?.[0] ?? null
}

/** Whether it is this player's slot right now. */
export function isCurrent(round, playerId) {
  return Boolean(round) && round.queue[0] === playerId
}

/**
 * Record what a player did and advance to the next seat.
 *
 * The caller applies the mechanical effect; this only moves the queue, so the
 * two concerns stay separable and a card's rules can be tested without a queue.
 */
export function advance(round, { playerId, action, note = null }) {
  return {
    ...round,
    queue: round.queue.slice(1),
    acted: [...round.acted, { playerId, action, note }],
  }
}

/** A round with nobody left to act is finished and should be taken down. */
export function isFinished(round) {
  return Boolean(round) && round.queue.length === 0
}

/** How far through we are, for the UI to say "2 of 5". */
export function progress(round) {
  if (!round) return { done: 0, total: 0 }
  const done = round.acted.length
  return { done, total: done + round.queue.length }
}

/**
 * The player ids still waiting, excluding the live one — so the UI can grey out
 * the people who are about to be asked without implying they can act now.
 */
export function waiting(round) {
  return round?.queue?.slice(1) ?? []
}
