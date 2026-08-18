// SHASN — pre-game setup (rulebook p.6, p.13)
//
// Three things happen at the table before the first Ideology Card is drawn, and
// none of them were in the app until now:
//
//   p.6  "All players vote to determine Player 1. In the case of a tie, vote
//         again. Players cannot vote for themselves."
//
//   p.6  "Player 1 receives any 1 resource of their choice, Player 2 receives
//         any 2 ... Player 5 receives any 5." The COUNT is fixed by seat, to
//         offset first-player advantage. WHICH resources is the player's call —
//         it is the first real decision of the game and we were making it for
//         them by spreading round-robin.
//
//   p.13 "Cards marked with a content advisory may be removed before the game
//         begins without affecting gameplay."
//
// This module is pure: it takes a setup object and returns a new one. The lobby
// stores it as JSON on the `lobbies` row so every seat sees the same state, and
// `start-game` reads it once to build the game.

import { RESOURCE_IDS, startingResourceCount } from './constants'
import * as R from './resources'

export const SETUP_STEPS = {
  VOTE: 'vote', // choosing Player 1
  RESOURCES: 'resources', // each player picks their opening resources
  READY: 'ready', // the host may start
}

export const ADVISORIES = [
  { id: 'mature', label: 'Mature themes' },
  { id: 'trigger', label: 'Distressing content' },
]

export function defaultSetup() {
  return {
    step: SETUP_STEPS.VOTE,
    round: 1, // vote round; a tie means voting again (p.6)
    votes: {}, // voterId -> candidateId
    tally: null, // filled in once a round resolves
    order: null, // [playerId] — seat order, winner first
    resources: {}, // playerId -> pool
    excludeAdvisory: [], // p.13
    skipped: false, // the host waived the ceremony
  }
}

/** Tolerates a null/legacy value so old lobbies keep working. */
export function normaliseSetup(setup) {
  return { ...defaultSetup(), ...(setup || {}) }
}

// ---------------------------------------------------------------------------
// p.6 — the vote for Player 1
// ---------------------------------------------------------------------------

/**
 * Resolve a completed round of voting.
 *
 * Returns `{ pending }` while votes are outstanding, `{ tie, tied }` when the
 * lead is shared — the rulebook's instruction there is simply to vote again —
 * and `{ order, tally }` once there is a single winner.
 */
export function resolvePlayerOneVote(votes, players) {
  const ids = players.map((p) => p.id)

  for (const [voter, choice] of Object.entries(votes)) {
    if (!ids.includes(voter)) return { error: `Unknown voter ${voter}` }
    if (!ids.includes(choice)) return { error: `Unknown candidate ${choice}` }
    if (voter === choice) return { error: 'You cannot vote for yourself' }
  }
  if (Object.keys(votes).length !== players.length) {
    return { pending: true, message: 'Waiting for every player to vote.' }
  }

  const tally = Object.fromEntries(ids.map((id) => [id, 0]))
  for (const choice of Object.values(votes)) tally[choice] += 1

  const best = Math.max(...Object.values(tally))
  const winners = ids.filter((id) => tally[id] === best)
  if (winners.length > 1) return { tie: true, tied: winners, tally }

  // The winner takes seat 1. Everyone else keeps their relative order, so the
  // table still goes round in the order people sat down.
  const first = winners[0]
  return { order: [first, ...ids.filter((id) => id !== first)], tally }
}

export function castVote(setup, { playerId, choice, players }) {
  const s = normaliseSetup(setup)
  if (s.step !== SETUP_STEPS.VOTE) return { error: 'The vote is already settled' }
  if (!players.some((p) => p.id === playerId)) return { error: 'You are not in this lobby' }
  if (!players.some((p) => p.id === choice)) return { error: 'No such player' }
  if (playerId === choice) return { error: 'You cannot vote for yourself (p.6)' }

  const votes = { ...s.votes, [playerId]: choice }
  const result = resolvePlayerOneVote(votes, players)
  if (result.error) return { error: result.error }

  if (result.pending) return { setup: { ...s, votes } }

  if (result.tie) {
    // Vote again, from scratch, with the tie on the record so the UI can say why.
    return {
      setup: { ...s, votes: {}, round: s.round + 1, tally: result.tally, tiedLast: result.tied },
      tie: true,
    }
  }

  return {
    setup: {
      ...s,
      votes,
      tally: result.tally,
      order: result.order,
      tiedLast: null,
      step: SETUP_STEPS.RESOURCES,
    },
    firstPlayerId: result.order[0],
  }
}

// ---------------------------------------------------------------------------
// p.6 — choosing your opening resources
// ---------------------------------------------------------------------------

/** How many resources this player takes, given the settled seat order. */
export function resourceAllowance(setup, playerId) {
  const s = normaliseSetup(setup)
  const seat = s.order ? s.order.indexOf(playerId) : -1
  return seat < 0 ? 0 : startingResourceCount(seat)
}

export function pickResources(setup, { playerId, pool, players }) {
  const s = normaliseSetup(setup)
  if (s.step !== SETUP_STEPS.RESOURCES) return { error: 'Not choosing resources right now' }
  if (!players.some((p) => p.id === playerId)) return { error: 'You are not in this lobby' }

  const want = resourceAllowance(s, playerId)
  const chosen = { ...R.emptyPool() }
  for (const [id, n] of Object.entries(pool || {})) {
    if (!RESOURCE_IDS.includes(id)) return { error: `Unknown resource ${id}` }
    if (!Number.isInteger(n) || n < 0) return { error: 'Resource counts must be whole numbers' }
    chosen[id] = n
  }
  const total = R.poolTotal(chosen)
  if (total !== want) {
    return { error: `Choose exactly ${want} resource${want === 1 ? '' : 's'} — you chose ${total}` }
  }

  const resources = { ...s.resources, [playerId]: chosen }
  const everyoneChose = players.every((p) => resources[p.id])
  return {
    setup: { ...s, resources, step: everyoneChose ? SETUP_STEPS.READY : SETUP_STEPS.RESOURCES },
  }
}

// ---------------------------------------------------------------------------
// p.13 — content advisory
// ---------------------------------------------------------------------------

export function setAdvisory(setup, exclude) {
  const s = normaliseSetup(setup)
  const valid = ADVISORIES.map((a) => a.id)
  const list = (exclude || []).filter((id) => valid.includes(id))
  return { setup: { ...s, excludeAdvisory: [...new Set(list)] } }
}

// ---------------------------------------------------------------------------
// Skipping
// ---------------------------------------------------------------------------

/**
 * Not every table wants the ceremony. The host can waive it: seat order stays as
 * people joined, and the engine spreads each player's opening resources
 * round-robin as it did before.
 */
export function skipSetup(setup, players) {
  const s = normaliseSetup(setup)
  return {
    setup: {
      ...s,
      step: SETUP_STEPS.READY,
      order: players.map((p) => p.id),
      resources: {},
      skipped: true,
    },
  }
}

export function isReady(setup) {
  return normaliseSetup(setup).step === SETUP_STEPS.READY
}

/** Who the lobby is still waiting on, for the UI. */
export function waitingOn(setup, players) {
  const s = normaliseSetup(setup)
  if (s.step === SETUP_STEPS.VOTE) return players.filter((p) => !s.votes[p.id]).map((p) => p.id)
  if (s.step === SETUP_STEPS.RESOURCES) {
    return players.filter((p) => !s.resources[p.id]).map((p) => p.id)
  }
  return []
}
