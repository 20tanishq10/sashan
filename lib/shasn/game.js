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
export function createGame({ players, seed = Date.now(), excludeAdvisory = [] }) {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    return { error: `SHASN is for ${MIN_PLAYERS}-${MAX_PLAYERS} players` }
  }

  const rng = Deck.makeRng(seed)
  let reserve = newPublicReserve()
  const log = []

  // p.6 — Player 1 takes 1 resource, Player 2 takes 2, and so on, to offset
  // first-player advantage. Choice is the player's; we spread round-robin.
  const seated = players.map((p, seatIndex) => {
    const want = startingResourceCount(seatIndex)
    const gains = R.emptyPool()
    for (let i = 0; i < want; i++) {
      gains[RESOURCE_IDS[(seatIndex + i) % RESOURCE_IDS.length]] += 1
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
    finalRoundTriggeredBy: null,
    finalRoundSeatsRemaining: null,
    log,
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
  return { ...game, log: [...game.log, entry].slice(-200) }
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
  const player = activePlayer(game)

  const card = Ideology.getIdeologyCard(game.pendingIdeologyCard)
  if (!card) return { error: 'No Ideology Card is pending' }

  let ideologue = choice
  if (typeof choice === 'number') {
    const answer = card.answers[choice]
    if (!answer) return { error: `No answer at index ${choice}` }
    ideologue = answer.ideologue
  }

  const r = Ideology.answerIdeologyCard({
    cardId: game.pendingIdeologyCard,
    ideologue,
    pool: player.pool,
    reserve: game.reserve,
    ideologyCards: player.ideologyCards,
    cap: player.resourceCap,
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
  next = updatePlayer(next, player.id, { pool: r.pool, ideologyCards: r.ideologyCards })

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

  const r = Voter.influenceVoterCard({
    market: game.market,
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

  const r = Board.gerrymander(game.board, player.id, rightsZoneId, from, to, { allowMajority })
  if (r.error) return { error: r.error }

  let next = {
    ...game,
    board: r.board,
    pendingHeadlines: [...game.pendingHeadlines, ...r.volatileTriggers],
  }
  next = Powers.recordGerrymanderUse(next, player.id, rightsZoneId)
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
export function trade(game, { proposerId, targetId, offer, request }) {
  const proposer = game.players.find((p) => p.id === proposerId)
  const target = game.players.find((p) => p.id === targetId)
  if (!proposer || !target) return { error: 'Unknown player in trade' }

  const check = Trading.validateTradeOffer({
    proposer,
    target,
    offer,
    request,
    activePlayerId: activePlayer(game).id,
  })
  if (!check.ok) return { error: check.error }

  const result = Trading.executeTradeOffer({ proposer, target, offer, request })
  let next = {
    ...game,
    players: game.players.map((p) =>
      p.id === proposerId ? result.proposer : p.id === targetId ? result.target : p
    ),
  }

  next = addLog(next, {
    type: 'trade',
    message: `${proposer.name} and ${target.name} traded.`,
  })

  // p.11 — a trade can push you over the cap, and you must then discard before
  // taking any other action.
  for (const p of [result.proposer, result.target]) {
    if (Trading.tradeLeavesOverCap(p) && p.id === activePlayer(next).id) {
      next = { ...next, turnPhase: TURN_PHASES.RESOURCE_CAP }
    }
  }

  return { game: next }
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

  if (player.auctionDebt > 0) {
    return { error: 'You cannot make purchases until your auction bid is paid off (p.11)' }
  }
  if (discounts.length > Powers.discountsAvailable(player)) {
    return { error: 'Not enough Helping Hands discounts left this turn' }
  }

  const r = Cards.buyTopConspiracy({
    deck: game.conspiracyDeck,
    pool: player.pool,
    reserve: game.reserve,
    rng,
    discounts,
    surcharge: player.conspiracySurcharge || 0,
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
export function playConspiracy(game, { cardId, choice, targets, recipientId }) {
  const player = activePlayer(game)
  if (!player.conspiracyCards.includes(cardId)) return { error: 'That card is not in your hand' }

  const card = Cards.getConspiracyCard(cardId)
  if (!card) return { error: `Unknown Conspiracy Card ${cardId}` }

  const result = Cards.applyEffect(card.effect, {
    players: game.players,
    board: game.board,
    reserve: game.reserve,
    actorId: player.id,
    choice,
    targets,
    recipientId,
  })
  if (result.error) return { error: result.error }

  // Card needs the table — hand it back with its text and wait.
  if (result.manual) {
    return {
      game: addLog(
        { ...game, awaitingResolution: { kind: 'conspiracy', cardId, playerId: player.id, prompt: result.prompt } },
        { type: 'conspiracy', message: `${player.name} played ${card.name}. ${result.prompt || 'Resolve at the table.'}` }
      ),
      manual: true,
      card,
    }
  }

  let next = {
    ...game,
    players: result.players,
    board: result.board,
    reserve: result.reserve,
    conspiracyDeck: Deck.discardCard(game.conspiracyDeck, cardId),
  }
  next = updatePlayer(next, player.id, {
    conspiracyCards: player.conspiracyCards.filter((c) => c !== cardId),
  })
  next = addLog(next, { type: 'conspiracy', message: `${player.name} played ${card.name}.` })
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
    next = { ...next, players: applied.players, board: applied.board, reserve: applied.reserve }
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

  let next = {
    ...base,
    players: result.players,
    board: result.board,
    reserve: result.reserve,
    headlineDeck: Deck.discardCard(base.headlineDeck, drawn.cardId),
  }
  for (const m of result.messages || []) next = addLog(next, { type: 'headline', message: m })

  next = announceMajorities(next, game.board)
  return { game: checkGameEnd(next), card }
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
