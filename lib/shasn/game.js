// SHASN — turn orchestration
//
// Ties board.js, resources.js, voterCards.js and ideology.js into a single game
// object with a turn machine. Pure and transport-agnostic: the hot-seat
// prototype and the Supabase API routes both drive it the same way.
//
// TURN SHAPE (rulebook p.22) — note there are no Action Points.
//
//   ideology  → answer the card drawn for you (or pay 4 to redraw)
//   cap       → discard down to 12 if the payout took you over
//   actions   → unlimited actions in any order, until you end your turn
//
// Not yet wired (phases 4-7): Ideologue L3/L5 active powers, Headline effects,
// Conspiracy Cards, trading and auctions. Their unlock state IS tracked, so the
// UI can show what a player has earned.

import {
  DEFAULT_RESOURCE_CAP,
  TURN_PHASES,
  GAME_PHASES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  startingResourceCount,
  newPublicReserve,
  RESOURCE_IDS,
  IDEOLOGY_ANSWER_MS,
} from './constants'
import * as Board from './board'
import * as R from './resources'
import * as Deck from './deck'
import * as Voter from './voterCards'
import * as Ideology from './ideology'
import * as Powers from './powers'
import * as Cards from './cards'
import * as Trading from './trading'
import * as Effects from './effects'
import { ZONE_IDS } from './zones'

// Activated Ideologue powers are re-exported so callers drive everything
// through the game module.
export const {
  prospect,
  breakingGround,
  donations,
  payback,
  toughLove,
  availableActions: availablePowers,
  gerrymanderUsesRemaining,
  gerrymanderAllowance,
  discountsAvailable,
  goingViralAvailable,
} = Powers

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * @param players  [{ id, name }]  in seat order
 * @param seed     stored so the whole game can be replayed deterministically
 */
export function createGame({
  players,
  seed = Date.now(),
  excludeAdvisory = [],
  startingResources = null, // p.6 — each player's own choice, by player id
}) {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    return { error: `SHASN is for ${MIN_PLAYERS}-${MAX_PLAYERS} players` }
  }

  const rng = Deck.makeRng(seed)
  let reserve = newPublicReserve()
  const log = []

  // p.6 — "Player 1 receives any 1 resource of their choice... Player 5 receives
  // any 5." The count is fixed by seat to offset first-player advantage; WHICH
  // resources is the player's call. A chosen mix is used when supplied, and we
  // fall back to spreading round-robin so a game can still start without one.
  const seated = players.map((p, seatIndex) => {
    const want = startingResourceCount(seatIndex)
    let gains = startingResources?.[p.id]
      ? { ...R.emptyPool(), ...startingResources[p.id] }
      : null

    if (gains && R.poolTotal(gains) !== want) gains = null // wrong count, ignore it
    if (!gains) {
      gains = R.emptyPool()
      for (let i = 0; i < want; i++) {
        gains[RESOURCE_IDS[(seatIndex + i) % RESOURCE_IDS.length]] += 1
      }
    }

    const taken = R.takeFromReserve(R.emptyPool(), reserve, gains)
    reserve = taken.reserve

    return {
      id: p.id,
      name: p.name,
      seatIndex,
      pool: taken.pool,
      ideologyCards: [],
      conspiracyCards: [],
      powerUses: {},
      gerrymanderUses: {},
      resourceCap: DEFAULT_RESOURCE_CAP,
      auctionDebt: 0,
      effects: Effects.emptyEffects(),
    }
  })

  log.push({ type: 'system', message: 'Setup complete. The election begins.' })

  const game = {
    seed,
    phase: GAME_PHASES.PLAYING,
    turnPhase: TURN_PHASES.IDEOLOGY,
    players: seated,
    activeSeat: 0,
    turnNumber: 1,
    board: Board.initBoard(seated.map((p) => p.id)),
    reserve,
    market: Voter.initMarket(rng),
    ideologyDeck: Ideology.buildIdeologyDeck(rng, { exclude: excludeAdvisory }),
    headlineDeck: Cards.buildHeadlineDeck(rng),
    conspiracyDeck: Cards.buildConspiracyDeck(rng),
    pendingIdeologyCard: null,
    pendingHeadlines: [],
    // Headlines drawn and awaiting resolution, and any card the table is
    // currently resolving by hand.
    activeHeadlines: [],
    awaitingResolution: null,
    auctions: [],
    diversions: [],
    interrupt: null,
    pendingTrades: [],
    tradeSeq: 0,
    finalRoundTriggeredBy: null,
    finalRoundSeatsRemaining: null,
    // Setup entries are collected before the game object exists, so addLog
    // never sees them. They all belong to turn 1.
    log: log.map((e) => ({ turn: 1, ...e })),
  }

  return { game: beginTurn(game, rng), rng }
}

export function activePlayer(game) {
  return game.players[game.activeSeat]
}

function updatePlayer(game, playerId, patch) {
  return {
    ...game,
    players: game.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
  }
}

function addLog(game, entry) {
  // Every entry carries the turn it happened on. Without it the log is a flat
  // scroll and there is no way to answer "what happened while I was away" —
  // which in a five-player game is four turns of things you did not see.
  // Entries written before this existed simply have no `turn` and are treated
  // as older than anything, so old games degrade rather than break.
  return {
    ...game,
    log: [...game.log, { ...entry, turn: game.turnNumber }].slice(-200),
  }
}

// ---------------------------------------------------------------------------
// Turn machine
// ---------------------------------------------------------------------------

/** Draw the Ideology Card for whoever is about to act and reset their powers. */
export function beginTurn(game, rng) {
  const player = activePlayer(game)
  const drawn = Deck.draw(game.ideologyDeck, rng)

  let next = {
    ...game,
    ideologyDeck: drawn.deck,
    pendingIdeologyCard: drawn.cardId,
    turnPhase: TURN_PHASES.IDEOLOGY,
    // House rule: a shot clock on answering. Stamped by whoever owns the game
    // (the server online) so every client counts down to the same instant.
    ideologyDeadline: IDEOLOGY_ANSWER_MS ? Date.now() + IDEOLOGY_ANSWER_MS : null,
  }
  // p.22 — power uses and the per-zone Gerrymander allowance reset each turn.
  next = updatePlayer(next, player.id, {
    powerUses: Ideology.resetPowerUses(),
    gerrymanderUses: {},
    // Turn-scoped card effects lapse now; persistent ones survive.
    effects: Effects.effectsOf(Effects.expireTurnEffects(player)),
  })

  // p.23 — evicted voters not replaced on your next turn are discarded.
  if ((game.board.evicted[player.id] || 0) > 0) {
    next = addLog(next, {
      type: 'system',
      message: `${player.name} has ${game.board.evicted[player.id]} evicted voter(s) to place this turn.`,
    })
  }

  return addLog(next, { type: 'turn', message: `${player.name}'s turn begins.` })
}

/** p.12 — pay any 4 resources to have your Ideology Card swapped. */
export function redrawIdeology(game, rng, allocation = null) {
  if (game.turnPhase !== TURN_PHASES.IDEOLOGY) return { error: 'Not awaiting an Ideology answer' }
  const player = activePlayer(game)

  const r = Ideology.redrawIdeologyCard({
    deck: game.ideologyDeck,
    pool: player.pool,
    reserve: game.reserve,
    currentCardId: game.pendingIdeologyCard,
    allocation,
    rng,
  })
  if (r.error) return { error: r.error }

  let next = {
    ...game,
    ideologyDeck: r.deck,
    pendingIdeologyCard: r.cardId,
    reserve: r.reserve,
    ideologyDeadline: IDEOLOGY_ANSWER_MS ? Date.now() + IDEOLOGY_ANSWER_MS : null,
  }
  next = updatePlayer(next, player.id, { pool: r.pool })
  return {
    game: addLog(next, { type: 'ideology', message: `${player.name} paid 4 to redraw their card.` }),
  }
}

/**
 * Answer the pending Ideology Card.
 *
 * `choice` is either an Ideologue id or an answer INDEX. The index form exists
 * because the answering player is not allowed to see which Ideologue is which
 * (p.12) — their client genuinely cannot name it.
 */
export function answerIdeology(game, choice) {
  if (game.turnPhase !== TURN_PHASES.IDEOLOGY) return { error: 'Not awaiting an Ideology answer' }
  // p.22 — a Conspiracy may be played right before you answer, so the answer
  // waits until that window has closed. Otherwise the window would be a race.
  if (game.interrupt) return { error: 'A Conspiracy Card is being resolved first' }
  const player = activePlayer(game)

  const card = Ideology.getIdeologyCard(game.pendingIdeologyCard)
  if (!card) return { error: 'No Ideology Card is pending' }

  let ideologue = choice
  if (typeof choice === 'number') {
    const answer = card.answers[choice]
    if (!answer) return { error: `No answer at index ${choice}` }
    ideologue = answer.ideologue
  }

  // IT Raid (Headline): "You will not receive the resources denoted on your next
  // Ideology Card." Ideologue passives are explicitly unaffected.
  const suppressed = Effects.ideologyPayoutSuppressed(player)

  const r = Ideology.answerIdeologyCard({
    cardId: game.pendingIdeologyCard,
    ideologue,
    pool: player.pool,
    reserve: game.reserve,
    ideologyCards: player.ideologyCards,
    cap: player.resourceCap,
    suppressAnswerPayout: suppressed,
  })
  if (r.error) return { error: r.error }

  const before = Ideology.unlockedPowers(player.ideologyCards)

  let next = {
    ...game,
    reserve: r.reserve,
    ideologyDeck: Deck.discardCard(game.ideologyDeck, game.pendingIdeologyCard),
    pendingIdeologyCard: null,
    ideologyDeadline: null,
    turnPhase: r.overCap ? TURN_PHASES.RESOURCE_CAP : TURN_PHASES.ACTIONS,
  }
  next = updatePlayer(next, player.id, {
    pool: r.pool,
    ideologyCards: r.ideologyCards,
    ...(suppressed
      ? { effects: Effects.effectsOf(Effects.consumeIdeologySuppression(player)) }
      : {}),
  })
  if (suppressed) {
    next = addLog(next, {
      type: 'ideology',
      message: `${player.name} was raided — the card paid nothing.`,
    })
  }

  const gained = RESOURCE_IDS.filter((id) => r.granted[id] > 0)
    .map((id) => `${r.granted[id]} ${id}`)
    .join(', ')
  next = addLog(next, {
    type: 'ideology',
    message: `${player.name} answered as ${ideologue} and took ${gained || 'nothing'}.`,
  })

  // Announce newly unlocked powers.
  for (const [id, state] of Object.entries(r.powers)) {
    if (state.level3 && !before[id].level3) {
      next = addLog(next, { type: 'power', message: `${player.name} unlocked ${id} Level 3.` })
    }
    if (state.level5 && !before[id].level5) {
      next = addLog(next, { type: 'power', message: `${player.name} unlocked ${id} Level 5.` })
    }
  }

  if (r.reserveShortfall) {
    next = addLog(next, {
      type: 'system',
      message: 'The Public Reserve could not pay in full — it is running low.',
    })
  }

  // Everything the UI needs to play the reveal: the card is only unmasked once
  // the answer is locked in.
  const reveal = {
    cardId: card.id,
    prompt: card.prompt,
    chosen: {
      ideologue,
      text: card.answers.find((a) => a.ideologue === ideologue)?.text,
      resources: r.answerGain,
    },
    rejected: card.answers
      .filter((a) => a.ideologue !== ideologue)
      .map((a) => ({ ideologue: a.ideologue, text: a.text, resources: a.resources })),
    passiveGain: r.passiveGain,
    granted: r.granted,
    unlocked: unlockedSince(before, r.powers),
    heldAfter: Ideology.ideologueCounts(r.ideologyCards),
  }

  return { game: next, result: r, reveal }
}

/**
 * House rule: the clock ran out, so the card answers itself.
 *
 * ANY player may trigger this, not just the one on the clock — otherwise a
 * player who closes their tab stalls the table forever. The deadline is checked
 * here against the server's own clock, so a client cannot rush it.
 *
 * The choice comes from the game rng rather than Math.random, keeping the game
 * replayable from its seed.
 */
export function answerIdeologyByTimeout(game, rng) {
  if (game.turnPhase !== TURN_PHASES.IDEOLOGY) {
    return { error: 'Not awaiting an Ideology answer' }
  }
  if (game.interrupt) return { error: 'A Conspiracy Card is being resolved first' }
  if (!game.ideologyDeadline) return { error: 'No clock is running' }
  if (Date.now() < game.ideologyDeadline - 250) {
    return { error: 'There is still time on the clock' }
  }

  const index = rng() < 0.5 ? 0 : 1
  const result = answerIdeology(game, index)
  if (result.error) return result

  const player = activePlayer(game)
  return {
    ...result,
    game: addLog(result.game, {
      type: 'ideology',
      message: `${player.name} ran out of time — the card answered itself.`,
    }),
    reveal: { ...result.reveal, timedOut: true },
    timedOut: true,
  }
}

/** Powers that flipped from locked to unlocked, for the reveal to announce. */
function unlockedSince(before, after) {
  const out = []
  for (const [id, state] of Object.entries(after)) {
    if (state.level3 && !before[id].level3) out.push({ ideologue: id, level: 3 })
    if (state.level5 && !before[id].level5) out.push({ ideologue: id, level: 5 })
  }
  return out
}

/** p.11 — discard down to the cap before taking any other action. */
export function discardToCap(game, discard) {
  if (game.turnPhase !== TURN_PHASES.RESOURCE_CAP) return { error: 'Not over the resource cap' }
  const player = activePlayer(game)

  const r = R.discardToCap(player.pool, game.reserve, discard, player.resourceCap)
  if (r.error) return { error: r.error }

  let next = { ...game, reserve: r.reserve, turnPhase: TURN_PHASES.ACTIONS }
  next = updatePlayer(next, player.id, { pool: r.pool })
  return {
    game: addLog(next, {
      type: 'system',
      message: `${player.name} discarded ${R.poolTotal(discard)} resource(s) to the cap.`,
    }),
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function influence(game, rng, { openIndex, zoneId, areaIndices, allocation, discounts = [], bonusVoters = 0 }) {
  if (game.turnPhase !== TURN_PHASES.ACTIONS) return { error: 'Finish your Ideology Card first' }
  const player = activePlayer(game)

  // Idealist L3 Helping Hands — at most 2 discounts per turn, across purchases.
  if (discounts.length > Powers.discountsAvailable(player)) {
    return { error: `Only ${Powers.discountsAvailable(player)} discount(s) left this turn` }
  }
  // Showstopper L3 Going Viral — +1 voter, on up to 2 distinct cards per turn.
  if (bonusVoters > 0) {
    if (bonusVoters > 1) return { error: 'Going Viral grants +1 voter per Voter Card' }
    if (!Powers.goingViralAvailable(player)) {
      return { error: 'Going Viral is exhausted this turn' }
    }
  }

  const surcharge = Effects.voterCardSurcharge(player)
  const penalty = Effects.voterPenalty(player)

  const r = Voter.influenceVoterCard({
    market: game.market,
    surcharge,
    voterPenalty: penalty,
    pool: player.pool,
    reserve: game.reserve,
    board: game.board,
    playerId: player.id,
    openIndex,
    zoneId,
    areaIndices,
    allocation,
    discounts,
    bonusVoters,
    rng,
  })
  if (r.error) return { error: r.error }

  let next = {
    ...game,
    market: r.market,
    reserve: r.reserve,
    board: r.board,
    pendingHeadlines: [...game.pendingHeadlines, ...r.volatileTriggers],
  }
  next = updatePlayer(next, player.id, { pool: r.pool })

  if (discounts.length) next = Powers.consumeDiscounts(next, player.id, discounts.length)
  if (bonusVoters > 0) next = Powers.consumeGoingViral(next, player.id)
  if (penalty) {
    next = updatePlayer(next, player.id, {
      effects: Effects.effectsOf(Effects.consumeVoterPenalty(player)),
    })
  }

  next = addLog(next, {
    type: 'influence',
    message: r.votersDiscarded
      ? `${player.name} influenced ${r.card.name} but had no room — ${r.votersDiscarded} voter(s) discarded.`
      : `${player.name} influenced ${r.card.name} and placed ${r.votersPlaced} voter(s).`,
  })

  next = announceMajorities(next, game.board)
  return { game: checkGameEnd(next), result: r }
}

export function gerrymander(game, { rightsZoneId, from, to }) {
  if (game.turnPhase !== TURN_PHASES.ACTIONS) return { error: 'Finish your Ideology Card first' }
  const player = activePlayer(game)

  // p.15 — one move per zone you hold rights in, per turn. Showstopper L5
  // Election Fever raises this to 2 and unlocks majority voters (p.25).
  if (Powers.gerrymanderUsesRemaining(player, rightsZoneId) <= 0) {
    return {
      error: `You have used your Gerrymander in ${rightsZoneId} this turn (${Powers.gerrymanderAllowance(
        player
      )} per zone)`,
    }
  }
  const allowMajority = Powers.canMoveMajorityVoters(player)

  // Nayi Soch (Conspiracy): "The next 3 voters you Gerrymander will die." The
  // card is explicit that a voter killed on the way into a Volatile Area does
  // NOT trigger a Headline, so the move is resolved as a discard instead.
  const lethal = Effects.gerrymanderIsLethal(player)

  let r
  if (lethal) {
    r = Board.discardVoter(game.board, from.zoneId, from.areaIndex, { allowMajority })
    if (r.error) return { error: r.error }
    r = { board: r.board, volatileTriggers: [] }
  } else {
    r = Board.gerrymander(game.board, player.id, rightsZoneId, from, to, { allowMajority })
    if (r.error) return { error: r.error }
  }

  let next = {
    ...game,
    board: r.board,
    pendingHeadlines: [...game.pendingHeadlines, ...r.volatileTriggers],
  }
  next = Powers.recordGerrymanderUse(next, player.id, rightsZoneId)
  if (lethal) {
    next = updatePlayer(next, player.id, {
      effects: Effects.effectsOf(Effects.consumeLethalGerrymander(player)),
    })
    next = addLog(next, { type: 'gerrymander', message: `A voter died on the way (Nayi Soch).` })
  }
  next = addLog(next, {
    type: 'gerrymander',
    message: `${player.name} Gerrymandered a voter using ${rightsZoneId}.`,
  })

  next = announceMajorities(next, game.board)
  return { game: checkGameEnd(next) }
}

export function placeEvicted(game, { zoneId, areaIndex }) {
  if (game.turnPhase !== TURN_PHASES.ACTIONS) return { error: 'Finish your Ideology Card first' }
  const player = activePlayer(game)

  const r = Board.replaceEvictedVoter(game.board, player.id, zoneId, areaIndex)
  if (r.error) return { error: r.error }

  let next = {
    ...game,
    board: r.board,
    pendingHeadlines: [...game.pendingHeadlines, ...r.volatileTriggers],
  }
  next = addLog(next, { type: 'place', message: `${player.name} placed an evicted voter.` })
  next = announceMajorities(next, game.board)
  return { game: checkGameEnd(next) }
}

// ---------------------------------------------------------------------------
// Trading (p.11)
// ---------------------------------------------------------------------------

/**
 * Execute a trade. Structured propose/accept lives in the transport layer (the
 * `trades` table for multiplayer, direct call for hot-seat); by the time this
 * runs, both sides have agreed.
 *
 * Either party may be the active player, and a trade may be initiated at any
 * point during a turn.
 */
/**
 * Propose a trade. Nothing moves until the other player accepts.
 *
 * p.11 lets you trade at any point during your turn, and either party may be the
 * active player — so this is deliberately not gated on whose turn it is beyond
 * that one requirement.
 */
export function proposeTrade(game, { proposerId, targetId, offer = {}, request = {} }) {
  const proposer = game.players.find((p) => p.id === proposerId)
  const target = game.players.find((p) => p.id === targetId)

  const check = Trading.validateProposal({
    proposer,
    target,
    offer,
    request,
    activePlayerId: activePlayer(game).id,
  })
  if (!check.ok) return { error: check.error }

  // One live proposal per direction, so the table cannot be spammed.
  const duplicate = (game.pendingTrades || []).some(
    (t) => t.status === 'pending' && t.proposerId === proposerId && t.targetId === targetId
  )
  if (duplicate) return { error: 'You already have an offer open with them' }

  const seq = (game.tradeSeq || 0) + 1
  const trade = {
    id: Trading.newTradeId(proposerId, targetId, game.turnNumber, seq),
    proposerId,
    targetId,
    offer: {
      resources: { ...R.emptyPool(), ...(offer.resources || {}) },
      conspiracyCards: offer.conspiracyCards || [],
    },
    request: {
      resources: { ...R.emptyPool(), ...(request.resources || {}) },
      conspiracyCardCount: request.conspiracyCardCount || 0,
    },
    status: 'pending',
    counteredFrom: offer.counteredFrom || null,
  }

  let next = { ...game, pendingTrades: [...(game.pendingTrades || []), trade], tradeSeq: seq }
  return {
    game: addLog(next, {
      type: 'trade',
      message: Trading.describeTrade(trade, game.players) + '.',
    }),
    trade,
  }
}

/**
 * Respond to a proposal: accept, decline, or counter.
 *
 * Only the target may accept or decline. Either party may withdraw their own
 * offer. A counter declines the original and opens a fresh one the other way
 * round, which is how haggling actually goes.
 */
export function respondTrade(game, { tradeId, playerId, action, giveCards = [], counter = null }) {
  const trade = (game.pendingTrades || []).find((t) => t.id === tradeId)
  if (!trade) return { error: 'That offer is no longer on the table' }
  if (trade.status !== 'pending') return { error: 'That offer has already been settled' }

  const close = (status) => ({
    ...game,
    pendingTrades: game.pendingTrades.map((t) => (t.id === tradeId ? { ...t, status } : t)),
  })

  if (action === 'withdraw') {
    if (playerId !== trade.proposerId) return { error: 'Only the proposer can withdraw' }
    return {
      game: addLog(close('withdrawn'), { type: 'trade', message: 'An offer was withdrawn.' }),
    }
  }

  if (playerId !== trade.targetId) return { error: 'That offer is not addressed to you' }

  if (action === 'decline') {
    const who = game.players.find((p) => p.id === playerId)
    return {
      game: addLog(close('declined'), {
        type: 'trade',
        message: `${who?.name} declined an offer.`,
      }),
    }
  }

  if (action === 'counter') {
    if (!counter) return { error: 'A counter needs terms' }
    const declined = close('countered')
    // Sides swap: what they asked of you becomes what you now offer.
    return proposeTrade(declined, {
      proposerId: playerId,
      targetId: trade.proposerId,
      offer: { ...counter.offer, counteredFrom: tradeId },
      request: counter.request,
    })
  }

  if (action !== 'accept') return { error: `Unknown response ${action}` }

  const proposer = game.players.find((p) => p.id === trade.proposerId)
  const target = game.players.find((p) => p.id === trade.targetId)

  // Re-validate: the proposer may have spent those resources since offering.
  const check = Trading.validateProposal({
    proposer,
    target,
    offer: trade.offer,
    request: trade.request,
    activePlayerId: activePlayer(game).id,
  })
  if (!check.ok) return { error: `That offer is no longer valid — ${check.error}` }

  const settled = Trading.settleTrade({
    proposer,
    target,
    offer: trade.offer,
    request: trade.request,
    giveCards,
  })
  if (settled.error) return { error: settled.error }

  let next = {
    ...close('accepted'),
    players: game.players.map((p) =>
      p.id === proposer.id ? settled.proposer : p.id === target.id ? settled.target : p
    ),
  }

  next = addLog(next, {
    type: 'trade',
    message: `${target.name} accepted: ${Trading.describeTrade(trade, game.players)}.`,
  })

  // p.11 — a trade can push you over the cap, and you must discard before doing
  // anything else. Only the active player can act right now, so only they are
  // routed into the discard; anyone else is caught at the top of their own turn.
  const activeAfter = next.players[next.activeSeat]
  if (Trading.tradeLeavesOverCap(activeAfter)) {
    next = { ...next, turnPhase: TURN_PHASES.RESOURCE_CAP }
  }

  return { game: next, trade }
}

/** Offers still open, from a given player's point of view. */
export function openTradesFor(game, playerId) {
  const all = (game.pendingTrades || []).filter((t) => t.status === 'pending')
  return {
    incoming: all.filter((t) => t.targetId === playerId),
    outgoing: all.filter((t) => t.proposerId === playerId),
  }
}

/** Clear stale offers when the turn passes, so they cannot linger for hours. */
function expireTrades(game) {
  const open = (game.pendingTrades || []).filter((t) => t.status === 'pending')
  if (!open.length) return game
  return {
    ...game,
    pendingTrades: game.pendingTrades.map((t) =>
      t.status === 'pending' ? { ...t, status: 'expired' } : t
    ),
  }
}

// ---------------------------------------------------------------------------
// Auctions (p.11)
// ---------------------------------------------------------------------------

export function openAuction(game, { id, sellerId = null, itemType, itemRef, minBid = 0 }) {
  const auction = Trading.createAuction({ id, sellerId, itemType, itemRef, minBid })
  return {
    game: addLog(
      { ...game, auctions: [...(game.auctions || []), auction] },
      { type: 'auction', message: `An auction opened, starting at ${minBid}.` }
    ),
  }
}

export function bid(game, { auctionId, playerId, amount }) {
  const auction = (game.auctions || []).find((a) => a.id === auctionId)
  if (!auction) return { error: 'Unknown auction' }
  const player = game.players.find((p) => p.id === playerId)
  if (!player) return { error: 'Unknown player' }

  const r = Trading.placeBid(auction, player, amount)
  if (r.error) return { error: r.error }

  return {
    game: {
      ...game,
      auctions: game.auctions.map((a) => (a.id === auctionId ? r.auction : a)),
    },
  }
}

export function closeAuction(game, { auctionId }) {
  const auction = (game.auctions || []).find((a) => a.id === auctionId)
  if (!auction) return { error: 'Unknown auction' }

  const r = Trading.resolveAuction({ auction, players: game.players, reserve: game.reserve })
  if (r.error) return { error: r.error }

  let next = {
    ...game,
    players: r.players,
    reserve: r.reserve,
    auctions: game.auctions.map((a) => (a.id === auctionId ? r.auction : a)),
  }
  for (const m of r.messages) next = addLog(next, { type: 'auction', message: m })
  return { game: next }
}

/** Pay down auction debt. Purchases stay frozen until it clears (p.11). */
export function repayAuctionDebt(game, { playerId, payment }) {
  const player = game.players.find((p) => p.id === playerId)
  if (!player) return { error: 'Unknown player' }

  const r = Trading.repayDebt({ player, reserve: game.reserve, payment })
  if (r.error) return { error: r.error }

  let next = {
    ...game,
    reserve: r.reserve,
    players: game.players.map((p) => (p.id === playerId ? r.player : p)),
  }
  return {
    game: addLog(next, {
      type: 'auction',
      message:
        r.player.auctionDebt > 0
          ? `${player.name} repaid some debt, ${r.player.auctionDebt} remaining.`
          : `${player.name} cleared their auction debt.`,
    }),
  }
}

// ---------------------------------------------------------------------------
// Conspiracy Cards (p.18)
// ---------------------------------------------------------------------------

/** Buy the top Conspiracy Card. Only the top card is ever purchasable. */
export function buyConspiracy(game, rng, { discounts = [] } = {}) {
  if (game.turnPhase !== TURN_PHASES.ACTIONS) return { error: 'Finish your Ideology Card first' }
  const player = activePlayer(game)

  const blocked = Effects.purchasesBlocked(player)
  if (blocked) return { error: `You cannot make purchases while you have ${blocked}` }
  if (discounts.length > Powers.discountsAvailable(player)) {
    return { error: 'Not enough Helping Hands discounts left this turn' }
  }

  const r = Cards.buyTopConspiracy({
    deck: game.conspiracyDeck,
    pool: player.pool,
    reserve: game.reserve,
    rng,
    discounts,
    surcharge: Effects.conspiracySurcharge(player),
  })
  if (r.error) return { error: r.error }

  let next = { ...game, conspiracyDeck: r.deck, reserve: r.reserve }
  next = updatePlayer(next, player.id, {
    pool: r.pool,
    conspiracyCards: [...player.conspiracyCards, r.cardId],
  })
  if (discounts.length) next = Powers.consumeDiscounts(next, player.id, discounts.length)

  return {
    game: addLog(next, {
      type: 'conspiracy',
      message: `${player.name} bought a Conspiracy Card.`,
    }),
    card: r.card,
  }
}

/**
 * Play a Conspiracy Card from hand. Mechanically-resolvable cards are applied;
 * negotiation and vote cards are surfaced for the table to settle.
 */
/**
 * Play a Conspiracy Card.
 *
 * TIMING (p.18, p.22)
 *   "You can use a Conspiracy Card at any point in your turn. You can also use
 *    one right before an opponent answers their Ideology Card and begins their
 *    turn."
 *
 *   So there are two legal moments: your own actions phase, and the window while
 *   someone else is on their Ideology Card. Both are allowed here.
 *
 * THE RESPONSE WINDOW
 *   A played card does not resolve at once if anyone else is holding Block or
 *   Reverse — they get the chance the rulebook promises them. Only players
 *   actually holding one of those cards are asked, since nobody else could
 *   respond anyway, which keeps the game moving.
 */
export function playConspiracy(game, { cardId, choice, targets, recipientId, playerId }) {
  const actorId = playerId || activePlayer(game).id
  const player = game.players.find((p) => p.id === actorId)
  if (!player) return { error: 'Unknown player' }
  if (!player.conspiracyCards.includes(cardId)) return { error: 'That card is not in your hand' }
  if (game.interrupt) return { error: 'A card is already awaiting responses' }

  const isActive = activePlayer(game).id === actorId
  const inWindow = game.turnPhase === TURN_PHASES.IDEOLOGY
  if (!isActive && !inWindow) {
    return { error: 'You can only play out of turn while an opponent is answering their card' }
  }

  const card = Cards.getConspiracyCard(cardId)
  if (!card) return { error: `Unknown Conspiracy Card ${cardId}` }

  // Block and Reverse are responses, not openers — they need something to answer.
  if (card.mode === 'interrupt') {
    return { error: `${card.name} is played in response to another Conspiracy Card` }
  }

  const canRespond = game.players.filter(
    (p) => p.id !== actorId && p.conspiracyCards.some((c) => isInterruptCard(c))
  )

  if (canRespond.length) {
    const next = addLog(
      {
        ...game,
        interrupt: {
          cardId,
          playerId: actorId,
          choice: choice || null,
          targets: targets || null,
          recipientId: recipientId || null,
          eligible: canRespond.map((p) => p.id),
          responses: [],
        },
      },
      {
        type: 'conspiracy',
        message: `${player.name} played ${card.name} — holders of Block or Reverse may respond.`,
      }
    )
    return { game: next, card, awaitingResponses: true }
  }

  return resolveConspiracy(game, { cardId, actorId, choice, targets, recipientId })
}

function isInterruptCard(cardId) {
  return Cards.getConspiracyCard(cardId)?.mode === 'interrupt'
}

/**
 * Respond to a played Conspiracy Card, or wave it through.
 *
 * p.18 on Block: "A block cannot be reversed or deflected." So a Block always
 * wins, whatever else was played — including against a Reverse.
 * p.18 on Reverse: "Reverse can be blocked or deflected."
 */
export function respondInterrupt(game, { playerId, action, cardId }) {
  const int = game.interrupt
  if (!int) return { error: 'Nothing is awaiting a response' }
  if (!int.eligible.includes(playerId)) return { error: 'You have nothing to respond with' }
  if (int.responses.some((r) => r.playerId === playerId)) {
    return { error: 'You have already responded' }
  }

  const responder = game.players.find((p) => p.id === playerId)

  if (action !== 'pass') {
    if (!cardId || !responder.conspiracyCards.includes(cardId)) {
      return { error: 'You do not hold that card' }
    }
    const rc = Cards.getConspiracyCard(cardId)
    if (!rc || rc.mode !== 'interrupt') return { error: 'That card is not a response' }
    if (action === 'block' && rc.id !== 'block') return { error: 'That card does not Block' }
    if (action === 'reverse' && rc.id !== 'reverse') return { error: 'That card does not Reverse' }
  }

  let next = {
    ...game,
    interrupt: {
      ...int,
      responses: [...int.responses, { playerId, action, cardId: cardId || null }],
    },
  }
  next = addLog(next, {
    type: 'conspiracy',
    message:
      action === 'pass'
        ? `${responder.name} let it stand.`
        : `${responder.name} played ${Cards.getConspiracyCard(cardId).name}.`,
  })

  // Everyone who could respond has now spoken.
  const done = next.interrupt.eligible.every((id) =>
    next.interrupt.responses.some((r) => r.playerId === id)
  )
  if (!done) return { game: next }

  return settleInterrupt(next)
}

/** Resolve an interrupt once every eligible player has answered. */
function settleInterrupt(game) {
  const int = game.interrupt
  const played = int.responses.filter((r) => r.action !== 'pass')

  // Responses resolve in turn order (p.18), so sort by seat.
  const seatOf = (id) => game.players.findIndex((p) => p.id === id)
  played.sort((a, b) => seatOf(a.playerId) - seatOf(b.playerId))

  let next = { ...game, interrupt: null }

  // Spend every response card regardless of outcome.
  for (const r of played) {
    const holder = next.players.find((p) => p.id === r.playerId)
    next = updatePlayer(next, r.playerId, {
      conspiracyCards: holder.conspiracyCards.filter((c) => c !== r.cardId),
    })
    next = { ...next, conspiracyDeck: Deck.discardCard(next.conspiracyDeck, r.cardId) }
  }

  const blocked = played.some((r) => r.action === 'block')
  const reversal = played.find((r) => r.action === 'reverse')

  if (blocked) {
    // "A block cannot be reversed or deflected" — it beats everything, and the
    // original card is spent for nothing.
    const owner = next.players.find((p) => p.id === int.playerId)
    next = updatePlayer(next, int.playerId, {
      conspiracyCards: owner.conspiracyCards.filter((c) => c !== int.cardId),
    })
    next = { ...next, conspiracyDeck: Deck.discardCard(next.conspiracyDeck, int.cardId) }
    return {
      game: addLog(next, {
        type: 'conspiracy',
        message: `${Cards.getConspiracyCard(int.cardId).name} was blocked and does nothing.`,
      }),
      blocked: true,
    }
  }

  // A Reverse turns the card back on whoever played it.
  const actorId = reversal ? reversal.playerId : int.playerId
  if (reversal) {
    next = addLog(next, {
      type: 'conspiracy',
      message: `The card was reversed back onto ${
        next.players.find((p) => p.id === int.playerId)?.name
      }.`,
    })
  }

  return resolveConspiracy(next, {
    cardId: int.cardId,
    actorId,
    ownerId: int.playerId,
    choice: int.choice,
    targets: int.targets,
    recipientId: int.recipientId,
    reversed: Boolean(reversal),
  })
}

/** Apply a Conspiracy Card that has survived the response window. */
function resolveConspiracy(game, { cardId, actorId, ownerId, choice, targets, recipientId, reversed }) {
  const card = Cards.getConspiracyCard(cardId)
  const holderId = ownerId || actorId
  const holder = game.players.find((p) => p.id === holderId)
  const actor = game.players.find((p) => p.id === actorId)

  const result = Cards.applyEffect(card.effect, {
    players: game.players,
    board: game.board,
    reserve: game.reserve,
    actorId,
    choice,
    targets,
    recipientId,
  })
  if (result.error) return { error: result.error }

  if (result.manual) {
    return {
      game: addLog(
        {
          ...game,
          awaitingResolution: {
            kind: 'conspiracy',
            cardId,
            playerId: holderId,
            prompt: result.prompt,
          },
        },
        {
          type: 'conspiracy',
          message: `${actor?.name} played ${card.name}. ${result.prompt || 'Resolve at the table.'}`,
        }
      ),
      manual: true,
      card,
    }
  }

  let next = applySideEffects(
    {
      ...game,
      players: result.players,
      board: result.board,
      reserve: result.reserve,
      conspiracyDeck: Deck.discardCard(game.conspiracyDeck, cardId),
    },
    result
  )
  next = updatePlayer(next, holderId, {
    conspiracyCards: (next.players.find((p) => p.id === holderId)?.conspiracyCards || []).filter(
      (c) => c !== cardId
    ),
  })
  if (!reversed) {
    next = addLog(next, { type: 'conspiracy', message: `${actor?.name} played ${card.name}.` })
  }
  for (const m of result.messages || []) next = addLog(next, { type: 'conspiracy', message: m })

  next = announceMajorities(next, game.board)
  return { game: checkGameEnd(next), card }
}

/**
 * Resolve whatever card is on the table.
 *
 * If the card's effect is mechanically resolvable and the caller supplies the
 * choice or targets it needs, the effect is applied. Otherwise the outcome the
 * players agreed is simply recorded. Both paths retire the card the same way.
 *
 * This is one entry point rather than two because a card only reveals whether it
 * needs input once it has been drawn — Headlines especially, since the deck is
 * server-side.
 */
export function resolveAwaiting(game, { choice, targets, recipientId, note } = {}) {
  if (!game.awaitingResolution) return { error: 'Nothing is awaiting resolution' }
  const { kind, cardId, playerId } = game.awaitingResolution

  const card =
    kind === 'headline' ? Cards.getHeadlineCard(cardId) : Cards.getConspiracyCard(cardId)
  if (!card) return { error: `Unknown card ${cardId}` }

  let applied = null
  if (choice || targets) {
    const result = Cards.applyEffect(card.effect, {
      players: game.players,
      board: game.board,
      reserve: game.reserve,
      actorId: playerId,
      choice,
      targets,
      recipientId,
    })
    if (result.error) return { error: result.error }
    if (!result.manual) applied = result
  }

  let next = { ...game, awaitingResolution: null }
  if (applied) {
    next = applySideEffects(
      { ...next, players: applied.players, board: applied.board, reserve: applied.reserve },
      applied
    )
  }

  // Retire the card.
  if (kind === 'conspiracy') {
    const player = next.players.find((p) => p.id === playerId)
    if (player) {
      next = updatePlayer(next, playerId, {
        conspiracyCards: player.conspiracyCards.filter((c) => c !== cardId),
      })
    }
    next = { ...next, conspiracyDeck: Deck.discardCard(next.conspiracyDeck, cardId) }
  } else {
    next = { ...next, headlineDeck: Deck.discardCard(next.headlineDeck, cardId) }
  }

  if (applied) {
    for (const m of applied.messages || []) {
      next = addLog(next, { type: 'resolution', message: m })
    }
  } else {
    next = addLog(next, {
      type: 'resolution',
      message: note ? `${card.name}: ${note}` : `${card.name} resolved at the table.`,
    })
  }

  next = announceMajorities(next, game.board)
  return { game: checkGameEnd(next), applied: Boolean(applied) }
}

/** Back-compat alias — records a table-agreed outcome with no mechanical effect. */
export function resolveManually(game, { note } = {}) {
  return resolveAwaiting(game, { note })
}

// ---------------------------------------------------------------------------
// Headlines (p.17)
// ---------------------------------------------------------------------------

/**
 * Draw and resolve one queued Headline. Called repeatedly at end of turn until
 * the queue is empty, preserving the order the Volatile voters were placed.
 */
export function resolveNextHeadline(game, rng, { choice, targets, recipientId } = {}) {
  if (!game.pendingHeadlines.length) return { error: 'No Headlines pending' }
  if (game.awaitingResolution) return { error: 'Resolve the current card first' }

  const [trigger, ...rest] = game.pendingHeadlines
  const drawn = Deck.draw(game.headlineDeck, rng)
  if (!drawn.cardId) return { error: 'The Headline deck is empty' }

  const card = Cards.getHeadlineCard(drawn.cardId)
  const actor = game.players.find((p) => p.id === trigger.playerId)

  let base = { ...game, headlineDeck: drawn.deck, pendingHeadlines: rest }
  base = addLog(base, {
    type: 'headline',
    message: `Headline: ${card.name} — triggered by ${actor?.name} in ${trigger.zoneId}.`,
  })

  const result = Cards.applyEffect(card.effect, {
    players: base.players,
    board: base.board,
    reserve: base.reserve,
    actorId: trigger.playerId,
    choice,
    targets,
    recipientId,
  })
  if (result.error) return { error: result.error }

  if (result.manual) {
    return {
      game: {
        ...base,
        awaitingResolution: {
          kind: 'headline',
          cardId: drawn.cardId,
          playerId: trigger.playerId,
          prompt: result.prompt,
        },
      },
      card,
      manual: true,
    }
  }

  let next = applySideEffects({
    ...base,
    players: result.players,
    board: result.board,
    reserve: result.reserve,
    headlineDeck: Deck.discardCard(base.headlineDeck, drawn.cardId),
  }, result)
  for (const m of result.messages || []) next = addLog(next, { type: 'headline', message: m })

  next = announceMajorities(next, game.board)
  return { game: checkGameEnd(next), card }
}

/**
 * Some card effects do more than move resources and voters: they open an auction
 * or install a standing diversion. Those ride out on the effect result and are
 * folded into the game here, so applyEffect can stay a pure function over
 * players/board/reserve.
 */
function applySideEffects(game, result) {
  let next = game
  if (result.auction) {
    const id = `auction_${next.turnNumber}_${(next.auctions || []).length + 1}`
    next = {
      ...next,
      auctions: [...(next.auctions || []), Trading.createAuction({ id, ...result.auction })],
    }
    next = addLog(next, {
      type: 'auction',
      message: `An auction opened, starting at ${result.auction.minBid}.`,
    })
  }
  if (result.diversion) {
    next = Effects.setDiversion(next, result.diversion)
  }
  return next
}

/** Compare majority holders before and after an action and log any changes. */
function announceMajorities(game, previousBoard) {
  let next = game
  for (const zoneId of ZONE_IDS) {
    const before = Board.majorityHolder(previousBoard, zoneId)
    const after = Board.majorityHolder(game.board, zoneId)
    if (before === after) continue

    const name = (id) => game.players.find((p) => p.id === id)?.name || 'someone'
    if (after && !before) {
      next = addLog(next, { type: 'majority', message: `${name(after)} formed a majority in ${zoneId}.` })
    } else if (!after && before) {
      next = addLog(next, { type: 'majority', message: `${name(before)}'s majority in ${zoneId} broke.` })
    } else {
      next = addLog(next, {
        type: 'majority',
        message: `${name(after)} took the majority in ${zoneId} from ${name(before)}.`,
      })
    }
  }
  return next
}

// ---------------------------------------------------------------------------
// Ending a turn
// ---------------------------------------------------------------------------

export function endTurn(game, rng) {
  if (game.turnPhase === TURN_PHASES.IDEOLOGY) return { error: 'Answer your Ideology Card first' }
  if (game.turnPhase === TURN_PHASES.RESOURCE_CAP) {
    return { error: 'Discard down to your resource cap first' }
  }
  if (game.interrupt) return { error: 'A Conspiracy Card is still awaiting responses' }
  // p.17 — Headlines triggered this turn resolve before the turn can end.
  if (game.awaitingResolution) {
    return { error: 'Resolve the card on the table first' }
  }
  if (game.pendingHeadlines.length) {
    return {
      error: `${game.pendingHeadlines.length} Headline(s) must be resolved before ending your turn`,
    }
  }

  const player = activePlayer(game)
  let next = game

  // p.23 — any evicted voters not replaced this turn are now discarded.
  if ((next.board.evicted[player.id] || 0) > 0) {
    const lost = next.board.evicted[player.id]
    next = { ...next, board: Board.discardUnplacedEvicted(next.board, player.id) }
    next = addLog(next, {
      type: 'system',
      message: `${player.name} lost ${lost} unplaced evicted voter(s).`,
    })
  }

  next = expireTrades(next)

  if (Board.isGameOver(next.board)) return { game: finishGame(next) }

  // p.19 — once the board fills, everyone gets one final turn.
  if (next.finalRoundSeatsRemaining !== null) {
    const remaining = next.finalRoundSeatsRemaining - 1
    if (remaining <= 0) return { game: finishGame({ ...next, finalRoundSeatsRemaining: 0 }) }
    next = { ...next, finalRoundSeatsRemaining: remaining }
  }

  next = {
    ...next,
    activeSeat: (next.activeSeat + 1) % next.players.length,
    turnNumber: next.turnNumber + 1,
  }

  return { game: beginTurn(next, rng) }
}

function checkGameEnd(game) {
  if (game.finalRoundSeatsRemaining === null && Board.isBoardFull(game.board) && !Board.isGameOver(game.board)) {
    return addLog(
      { ...game, finalRoundSeatsRemaining: game.players.length, finalRoundTriggeredBy: activePlayer(game).id },
      { type: 'system', message: 'The board is full — every player takes one final turn.' }
    )
  }
  return game
}

function finishGame(game) {
  const table = getStandings(game)
  const winners = table.filter((r) => r.rank === 1)

  let next = { ...game, phase: GAME_PHASES.FINISHED, turnPhase: null, pendingIdeologyCard: null }

  next = addLog(next, {
    type: 'system',
    message:
      winners.length > 1
        ? `Election over. ${winners.map((w) => w.nickname).join(' and ')} tie on ${winners[0].score} majority voters.`
        : `Election over. ${winners[0].nickname} wins with ${winners[0].score} majority voters.`,
  })

  // Record the final scorecard in the log so the result is auditable.
  for (const row of table) {
    next = addLog(next, {
      type: 'result',
      message: `${row.nickname}: ${row.score} point(s) from ${row.zonesHeld.length} zone(s)${
        row.zonesHeld.length ? ` — ${row.zonesHeld.join(', ')}` : ''
      }`,
    })
  }

  return next
}

export function getStandings(game) {
  return Board.standings(
    game.board,
    game.players.map((p) => ({ id: p.id, nickname: p.name }))
  )
}

/** Per-zone scorecard — who holds what, and what it is worth. */
export function getScoreBreakdown(game) {
  return Board.scoreBreakdown(
    game.board,
    game.players.map((p) => ({ id: p.id, nickname: p.name }))
  )
}

// ---------------------------------------------------------------------------
// Stall detection
// ---------------------------------------------------------------------------

/**
 * The Voter Card market only cycles when a card is bought. If no player can
 * afford any of the three open cards, nothing can ever change: the board stops
 * filling, no majority can form, and the game cannot reach its end condition.
 *
 * Playtesting hit exactly this — a table starved of Trust froze with 126 of 129
 * areas empty. The physical game escapes via trading (p.11) and the Capitalist's
 * Prospecting power (p.23), both of which are later phases here.
 *
 * This is not a rulebook concept. It exists so the UI can say "the campaign has
 * stalled" instead of hanging silently, and so tests can assert games terminate.
 */
export function isStalled(game) {
  if (game.phase === GAME_PHASES.FINISHED) return false
  if (Board.isGameOver(game.board)) return false

  // Anyone owed evicted voters can still act.
  if (game.players.some((p) => (game.board.evicted[p.id] || 0) > 0)) return false

  // Anyone holding Gerrymandering Rights can still move a voter.
  const rights = Board.gerrymanderingRights(game.board)
  if (ZONE_IDS.some((z) => rights[z])) return false

  // Capitalist Prospecting converts a resource you hold into ones you need, so
  // anyone holding it with something to spend can always break the logjam (p.23).
  const canProspect = game.players.some(
    (p) =>
      Ideology.unlockedPowers(p.ideologyCards).capitalist?.level3 && R.poolTotal(p.pool) >= 1
  )
  if (canProspect) return false

  // Being broke early is not a stall — answering an Ideology Card pays out every
  // turn, so a player below their cap is still accumulating and will eventually
  // afford something. A true deadlock needs everyone pinned AT the cap with
  // nothing buyable: more income cannot help, because it gets discarded.
  if (game.players.some((p) => !R.isOverCap(p.pool, p.resourceCap - 1))) return false

  // Everyone is capped out. The only way to change the board is buying a card.
  return !game.players.some((p) =>
    Voter.affordableCards(game.market, p.pool).some((o) => o.affordable)
  )
}

/** Diagnostic detail for the stall warning in the UI. */
export function stallReport(game) {
  return {
    stalled: isStalled(game),
    emptyAreas: ZONE_IDS.reduce((n, z) => n + Board.emptyAreas(game.board, z), 0),
    openCards: game.market.open.map((cardId) => {
      const card = Voter.getVoterCard(cardId)
      return {
        cardId,
        voters: card.voters,
        cost: card.cost,
        affordableBy: game.players
          .filter((p) => R.canAfford(p.pool, card.cost))
          .map((p) => p.name),
      }
    }),
    pools: game.players.map((p) => ({ name: p.name, pool: p.pool, total: R.poolTotal(p.pool) })),
  }
}
