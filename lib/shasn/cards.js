// SHASN — Headline and Conspiracy handling (Phases 5 and 6)
//
// HEADLINES (p.17)
//   Placing a voter in a Volatile Area queues a Headline. All queued Headlines
//   are drawn and resolved at the END of that turn, in the order the voters were
//   placed. "You" on a Headline means the player who placed the voter.
//
// CONSPIRACIES (p.18)
//   Buy only the top card of the draw pile for any 4-5 resources. No hand limit.
//   Play at any point in your turn, or right before an opponent answers their
//   Ideology Card. Simultaneous plays resolve in turn order.
//
// RESOLUTION POLICY
//   The India deck is a social game in card form. Roughly a third of the cards
//   are explicit negotiations or votes — "convince 2 other players to become
//   investors", "your opponents will vote and decide where to place". Forcing
//   those through a UI would destroy the thing that makes them good.
//
//   So each card declares a `mode`. Cards the engine can resolve unaided are
//   applied automatically; `table` cards are surfaced with their full text and
//   the table's agreed outcome is recorded. Both paths are logged identically,
//   so the game history reads the same either way.

import * as Deck from './deck'
import * as R from './resources'
import * as Board from './board'
import * as E from './effects'
import * as Ideology from './ideology'
import { ZONES, areAdjacent } from './zones'
import { HEADLINE_CARDS, getHeadlineCard } from './data/headlineCards'
import { CONSPIRACY_CARDS, getConspiracyCard, buildConspiracyDeckList } from './data/conspiracyCards'
import { CONSPIRACY_COST_MIN } from './constants'

export { getHeadlineCard, getConspiracyCard }

// Modes the engine resolves without asking the table.
const MECHANICAL = new Set(['auto', 'choice', 'delayed', 'persistent'])

export function isTableResolved(card) {
  return !MECHANICAL.has(card.mode)
}

// ---------------------------------------------------------------------------
// Deck construction
// ---------------------------------------------------------------------------

export function buildHeadlineDeck(rng) {
  return Deck.initDeck(Object.keys(HEADLINE_CARDS), rng)
}

export function buildConspiracyDeck(rng) {
  return Deck.initDeck(buildConspiracyDeckList(), rng)
}

// ---------------------------------------------------------------------------
// Conspiracy purchase (p.18)
// ---------------------------------------------------------------------------

/**
 * Buy the top Conspiracy Card. Only the top card is ever available.
 *
 * `surcharge` carries the Pythonpost Headline: "for the rest of the game, you
 * have to pay an extra resource for every Conspiracy Card that you buy."
 */
export function buyTopConspiracy({ deck, pool, reserve, rng, discounts = [], surcharge = 0 }) {
  const cardId = Deck.peek(deck)
  if (!cardId) return { error: 'The Conspiracy deck is empty' }

  const card = getConspiracyCard(cardId)
  const base = { ...card.cost, any: (card.cost.any || CONSPIRACY_COST_MIN) + surcharge }
  const cost = R.applyDiscounts(base, discounts)

  if (!R.canAfford(pool, cost)) return { error: 'You cannot afford the top Conspiracy Card' }

  const auto = R.autoAllocate(pool, cost)
  if (auto.error) return { error: auto.error }

  const paid = R.payToReserve(pool, reserve, auto.allocation)
  if (paid.error) return { error: paid.error }

  const drawn = Deck.draw(deck, rng)
  return {
    deck: drawn.deck,
    cardId,
    card,
    pool: paid.pool,
    reserve: paid.reserve,
    paid: auto.allocation,
  }
}

// ---------------------------------------------------------------------------
// Effect application
// ---------------------------------------------------------------------------

/**
 * Apply one card effect.
 *
 * ctx: { players, board, reserve, actorId, choice, targets }
 * Returns { players, board, reserve, messages } or { error }.
 *
 * Only mechanically-resolvable effect types are handled. Anything else returns
 * `manual: true`, meaning the card's text stands and the table resolves it.
 */
export function applyEffect(effect, ctx) {
  const { actorId } = ctx
  const messages = []
  let { players, board, reserve } = ctx

  const actor = () => players.find((p) => p.id === actorId)
  const nameOf = (list, id) => list.find((p) => p.id === id)?.name || 'a player'
  const setPool = (id, pool) => {
    players = players.map((p) => (p.id === id ? { ...p, pool } : p))
  }

  switch (effect.type) {
    // --- resource gains and losses -----------------------------------------
    case 'gain': {
      const taken = R.takeFromReserve(actor().pool, reserve, { ...R.emptyPool(), ...effect.resources })
      setPool(actorId, taken.pool)
      reserve = taken.reserve
      messages.push(`${actor().name} gained resources.`)
      break
    }

    case 'gainAny': {
      // The player picks; ctx.choice carries their allocation.
      const want = ctx.choice?.resources
      if (!want) return { manual: true, prompt: `Choose any ${effect.amount} resources.` }
      if (R.poolTotal(want) !== effect.amount) {
        return { error: `Choose exactly ${effect.amount} resources` }
      }
      const taken = R.takeFromReserve(actor().pool, reserve, want)
      if (taken.shortfall) return { error: 'The Public Reserve cannot cover that' }
      setPool(actorId, taken.pool)
      reserve = taken.reserve
      messages.push(`${actor().name} took ${effect.amount} resources.`)
      break
    }

    case 'loseAny': {
      const give = ctx.choice?.resources || R.autoDiscardToCap(actor().pool, Math.max(0, R.poolTotal(actor().pool) - effect.amount))
      const paid = R.payToReserve(actor().pool, reserve, give)
      if (paid.error) return { error: paid.error }
      setPool(actorId, paid.pool)
      reserve = paid.reserve
      messages.push(`${actor().name} lost ${effect.amount} resources.`)
      break
    }

    case 'allGainAny': {
      // Iftar Party's opening move — everyone takes resources, then the table
      // trades. The trading half is social and is left to the players.
      for (const p of players) {
        const want = ctx.choice?.perPlayer?.[p.id]
        if (!want) continue
        const taken = R.takeFromReserve(p.pool, reserve, want)
        setPool(p.id, taken.pool)
        reserve = taken.reserve
      }
      messages.push(`Every player took ${effect.amount} resources.`)
      break
    }

    // --- tithes -------------------------------------------------------------
    case 'tithe': {
      // Khaki Terror — 1 of each type to the Reserve.
      const give = Object.fromEntries(Object.keys(R.emptyPool()).map((k) => [k, effect.perType]))
      if (!R.canAfford(actor().pool, give)) {
        return {
          manual: true,
          prompt: 'You owe 1 of each resource to the Public Reserve and cannot pay yet. No purchases until you do.',
        }
      }
      const paid = R.payToReserve(actor().pool, reserve, give)
      setPool(actorId, paid.pool)
      reserve = paid.reserve
      messages.push(`${actor().name} donated 1 of each resource to the Public Reserve.`)
      break
    }

    // --- voters -------------------------------------------------------------
    case 'discardOwnVoters':
    case 'discardVoters': {
      const targets = ctx.targets || []
      if (targets.length !== effect.count) {
        return { manual: true, prompt: `Select ${effect.count} voter(s) to discard.` }
      }
      for (const t of targets) {
        const owner = board.zones[t.zoneId]?.owners[t.areaIndex]
        if (!owner) return { error: 'No voter in that area' }
        if (effect.type === 'discardOwnVoters' && owner !== actorId) {
          return { error: 'You must discard your own voters' }
        }
        const r = Board.discardVoter(board, t.zoneId, t.areaIndex, { allowMajority: true })
        if (r.error) return { error: r.error }
        board = r.board

        // Crushed Under Belly compensates the voter's owner from the Reserve.
        if (effect.compensationPerVoter) {
          const pick = ctx.choice?.compensation?.[owner]
          if (pick) {
            const p = players.find((x) => x.id === owner)
            const taken = R.takeFromReserve(p.pool, reserve, pick)
            setPool(owner, taken.pool)
            reserve = taken.reserve
          }
        }
      }
      messages.push(`${effect.count} voter(s) discarded.`)
      break
    }

    case 'massEvict': {
      // Cough It Up — every opponent evicts one of their own voters.
      const picks = ctx.targets || []
      for (const t of picks) {
        const owner = board.zones[t.zoneId]?.owners[t.areaIndex]
        if (!owner || owner === actorId) return { error: 'Each opponent evicts one of their own' }
        const heldBefore = Board.majorityHolder(board, t.zoneId)
        const r = Board.evictVoter(board, t.zoneId, t.areaIndex, { allowMajority: true })
        if (r.error) return { error: r.error }
        board = r.board
        const heldAfter = Board.majorityHolder(board, t.zoneId)
        if (heldBefore && !heldAfter) {
          messages.push(`A majority in ${t.zoneId} broke — opponents of ${owner} each take 1 resource.`)
        }
      }
      messages.push('Every opponent evicted a voter.')
      break
    }

    case 'donateVoter': {
      const t = (ctx.targets || [])[0]
      if (!t) return { manual: true, prompt: 'Select a voter to donate to the player on your left.' }
      const r = Board.convertVoter(board, t.zoneId, t.areaIndex, ctx.recipientId, { allowMajority: true })
      if (r.error) return { error: r.error }
      board = r.board
      messages.push(`${actor().name} donated a voter.`)
      break
    }

    // --- choices ------------------------------------------------------------
    case 'choice': {
      const chosen = effect.options.find((o) => o.id === ctx.choice?.optionId)
      if (!chosen) {
        return {
          manual: true,
          prompt: 'Pick one option.',
          options: effect.options.map((o) => o.id),
        }
      }
      return applyEffect(chosen.effect, ctx)
    }

    // --- persistent and delayed --------------------------------------------
    case 'resourceCapDelta': {
      players = players.map((p) =>
        p.id === actorId ? { ...p, resourceCap: p.resourceCap + effect.amount } : p
      )
      messages.push(`${actor().name}'s resource cap is now ${actor().resourceCap}.`)
      break
    }

    // --- installs an ongoing effect ----------------------------------------
    case 'conspiracySurcharge': {
      // Pythonpost — every Conspiracy Card you buy costs an extra resource.
      players = players.map((p) =>
        p.id === actorId
          ? E.withEffects(p, { conspiracySurcharge: E.effectsOf(p).conspiracySurcharge + effect.amount })
          : p
      )
      messages.push(`${actor().name} now pays ${effect.amount} extra for every Conspiracy Card.`)
      break
    }

    case 'voterCardSurcharge': {
      // Too Much Freedom — bites on the player's NEXT turn.
      players = players.map((p) =>
        p.id === actorId ? E.withEffects(p, { voterCardSurcharge: effect.amount }) : p
      )
      messages.push(`Voter Cards cost ${effect.amount} more for ${actor().name} next turn.`)
      break
    }

    case 'suppressIdeologyPayout': {
      // IT Raid — the card pays nothing; Ideologue passives still do.
      players = players.map((p) =>
        p.id === actorId ? E.withEffects(p, { suppressIdeologyPayout: effect.cards }) : p
      )
      messages.push(`${actor().name} gets nothing from their next Ideology Card.`)
      break
    }

    case 'lockLevel3': {
      // Tukde Tukde — or discard 2 resources if they hold no L3 power at all.
      const holder = actor()
      const hasL3 = Object.values(
        (holder.ideologyCards || []).reduce((acc, c) => {
          acc[c.ideologue] = (acc[c.ideologue] || 0) + 1
          return acc
        }, {})
      ).some((n) => n >= 3)

      if (hasL3) {
        players = players.map((p) =>
          p.id === actorId ? E.withEffects(p, { lockedLevel3: effect.count }) : p
        )
        messages.push(`${holder.name} loses a Level 3 power next turn.`)
      } else {
        return applyEffect(effect.fallback, ctx)
      }
      break
    }

    case 'lethalGerrymander': {
      // Nayi Soch — the next N voters this player Gerrymanders die instead.
      players = players.map((p) =>
        p.id === actorId ? E.withEffects(p, { lethalGerrymander: effect.count }) : p
      )
      messages.push(`The next ${effect.count} voters ${actor().name} Gerrymanders will die.`)
      break
    }

    case 'voterPenalty': {
      // Not Indian Enough — up to 2 opponents get 1 less voter on their next card.
      const targets = ctx.choice?.targetIds || []
      if (!targets.length) {
        return { manual: true, prompt: `Choose up to ${effect.targets} opponents.` }
      }
      players = players.map((p) =>
        targets.includes(p.id) ? E.withEffects(p, { voterPenalty: effect.cardsAffected }) : p
      )
      messages.push('Marked opponents get 1 less voter on their next Voter Card.')
      break
    }

    case 'reserveExchange': {
      // The Hawala Network — a standing exchange rate with the Public Reserve.
      players = players.map((p) => (p.id === actorId ? E.withEffects(p, { hawala: true }) : p))
      messages.push(`${actor().name} can now trade 2 alike for 1 other with the Reserve.`)
      break
    }

    case 'doubleLevel3Uses': {
      // Maha Alliance — only powers already unlocked, and only this turn.
      players = players.map((p) => (p.id === actorId ? E.withEffects(p, { doubleLevel3: true }) : p))
      messages.push(`${actor().name} may use every Level 3 power twice this turn.`)
      break
    }

    case 'divertSpend': {
      // Chai-Paani — needs a target and a resource; the game holds the relation.
      const { victimId, resource } = ctx.choice || {}
      if (!victimId || !resource) {
        return { manual: true, prompt: 'Pick an opponent and a resource to siphon.' }
      }
      return {
        players,
        board,
        reserve,
        diversion: { ownerId: actorId, victimId, resource },
        messages: [`${actor().name} is siphoning ${resource} from an opponent.`],
      }
    }

    // --- immediate, mechanical ---------------------------------------------
    case 'demonetise': {
      // Demonetisation — every opponent discards everything; the actor keeps
      // half of what was discarded, rounded up, chosen by them.
      const opponents = players.filter((p) => p.id !== actorId)
      const pot = opponents.reduce((acc, p) => R.addPools(acc, p.pool), R.emptyPool())
      const keep = Math.ceil(R.poolTotal(pot) / 2)

      const chosen = ctx.choice?.resources
      if (!chosen) {
        return {
          manual: true,
          prompt: `Opponents discard ${R.poolTotal(pot)} resources. Choose ${keep} to keep.`,
        }
      }
      if (R.poolTotal(chosen) !== keep) return { error: `Keep exactly ${keep}` }
      if (!R.poolIsNonNegative(R.subtractPools(pot, chosen))) {
        return { error: 'You can only keep resources that were actually discarded' }
      }

      // Everything discarded goes to the Reserve, then the actor draws their half.
      reserve = R.addPools(reserve, pot)
      players = players.map((p) => (p.id === actorId ? p : { ...p, pool: R.emptyPool() }))
      const taken = R.takeFromReserve(actor().pool, reserve, chosen)
      setPool(actorId, taken.pool)
      reserve = taken.reserve
      messages.push(`Every opponent was wiped out; ${actor().name} kept ${keep}.`)
      break
    }

    case 'extortOrConvert': {
      // Booth Capturing — each opponent pays 2, or loses a voter to the actor.
      const payments = ctx.choice?.payments || {}
      const seizures = ctx.targets || []
      let collected = R.emptyPool()

      for (const p of players) {
        if (p.id === actorId) continue
        const paid = payments[p.id]
        if (paid && R.poolTotal(paid) === effect.amount) {
          const after = R.subtractPools(p.pool, paid)
          if (!R.poolIsNonNegative(after)) return { error: `${p.name} cannot pay that` }
          setPool(p.id, after)
          collected = R.addPools(collected, paid)
        }
      }
      setPool(actorId, R.addPools(actor().pool, collected))

      for (const t of seizures) {
        const r = Board.convertVoter(board, t.zoneId, t.areaIndex, actorId, { allowMajority: true })
        if (r.error) return { error: r.error }
        board = r.board
      }
      messages.push(`${actor().name} shook down the table.`)
      break
    }

    case 'stealRandomConspiracy': {
      // Wheeler Dealer Stealer — a random card from a chosen opponent.
      const victimId = ctx.choice?.victimId
      if (!victimId) return { manual: true, prompt: 'Choose an opponent to rob.' }
      const victim = players.find((p) => p.id === victimId)
      if (!victim?.conspiracyCards?.length) return { error: 'They hold no Conspiracy Cards' }

      const pick = ctx.choice?.index ?? 0
      const cardId = victim.conspiracyCards[pick % victim.conspiracyCards.length]
      players = players.map((p) => {
        if (p.id === victimId) {
          const rest = [...p.conspiracyCards]
          rest.splice(rest.indexOf(cardId), 1)
          return { ...p, conspiracyCards: rest }
        }
        if (p.id === actorId) return { ...p, conspiracyCards: [...p.conspiracyCards, cardId] }
        return p
      })
      messages.push(`${actor().name} stole a Conspiracy Card from ${victim.name}.`)
      break
    }

    case 'conditionalDiscard': {
      // Peg Away — only if an opponent has EXACTLY twice your voters in a zone.
      const { zoneId, victimId } = ctx.choice || {}
      const picks = ctx.targets || []
      if (!zoneId || !victimId) {
        return { manual: true, prompt: 'Pick the zone and the opponent.' }
      }
      const mine = Board.voterCount(board, zoneId, actorId)
      const theirs = Board.voterCount(board, zoneId, victimId)
      if (theirs !== mine * effect.ratio) {
        return { error: `They must have exactly ${effect.ratio}x your voters there (${mine} vs ${theirs})` }
      }
      if (picks.length > effect.maxDiscard) return { error: `At most ${effect.maxDiscard}` }

      for (const t of picks) {
        const r = Board.discardVoter(board, t.zoneId, t.areaIndex, { allowMajority: true })
        if (r.error) return { error: r.error }
        board = r.board
      }
      messages.push(`${actor().name} pegged back ${picks.length} voter(s).`)
      break
    }

    case 'freeMove': {
      // Cost of Coal — pay 2, then move up to 4 non-majority voters anywhere.
      const moves = ctx.choice?.moves || []
      if (!moves.length) {
        return { manual: true, prompt: `Pay 2, then move up to ${effect.count} non-majority voters.` }
      }
      if (moves.length > effect.count) return { error: `At most ${effect.count} moves` }

      const payment = ctx.choice?.payment || R.autoAllocate(actor().pool, effect.payment).allocation
      const paid = R.payToReserve(actor().pool, reserve, payment)
      if (paid.error) return { error: paid.error }
      setPool(actorId, paid.pool)
      reserve = paid.reserve

      for (const m of moves) {
        const owner = board.zones[m.from.zoneId]?.owners[m.from.areaIndex]
        if (!owner) return { error: 'No voter there' }
        if (!effect.majorityAllowed && !Board.isNonMajorityVoter(board, m.from.zoneId, m.from.areaIndex)) {
          return { error: 'Only non-majority voters can be moved' }
        }
        const lifted = Board.discardVoter(board, m.from.zoneId, m.from.areaIndex, { allowMajority: false })
        if (lifted.error) return { error: lifted.error }
        const placed = Board.placeVoters(lifted.board, m.to.zoneId, owner, [m.to.areaIndex])
        if (placed.error) return { error: placed.error }
        board = placed.board
      }
      messages.push(`${actor().name} moved ${moves.length} voter(s) across the board.`)
      break
    }

    case 'convertZone': {
      // Vikas Model x3 — take every voter in a 6/11 zone. Volatile Areas are
      // immune and empty areas are not filled (per the card).
      const zoneId = ctx.choice?.zoneId
      if (!zoneId) return { manual: true, prompt: 'Choose a 6/11 zone to seize.' }
      const z = ZONES[zoneId]
      if (!z || z.majority !== effect.zoneFilter.majority || z.areas !== effect.zoneFilter.areas) {
        return { error: 'That is not a 6/11 zone' }
      }
      board.zones[zoneId].owners.forEach((owner, i) => {
        if (!owner || owner === actorId) return
        const r = Board.convertVoter(board, zoneId, i, actorId, { allowMajority: true })
        if (!r.error) board = r.board
      })
      messages.push(`${actor().name} seized ${z.label} outright.`)
      break
    }

    case 'forcedMove': {
      // Gau Mitron — move 2 voters out of your strongest zone into a neighbour.
      const moves = ctx.choice?.moves || []
      if (moves.length !== effect.count) {
        return { manual: true, prompt: `Move ${effect.count} voters into an adjacent zone.` }
      }
      for (const m of moves) {
        if (!areAdjacent(m.from.zoneId, m.to.zoneId)) return { error: 'Zones are not adjacent' }
        const owner = board.zones[m.from.zoneId]?.owners[m.from.areaIndex]
        if (!owner) return { error: 'No voter there' }
        const lifted = Board.discardVoter(board, m.from.zoneId, m.from.areaIndex, { allowMajority: true })
        if (lifted.error) return { error: lifted.error }
        const placed = Board.placeVoters(lifted.board, m.to.zoneId, owner, [m.to.areaIndex])
        if (placed.error) return { error: placed.error }
        board = placed.board
      }
      messages.push(`${effect.count} voters shifted out of ${actor().name}'s strongest zone.`)
      break
    }

    case 'checklistVoters': {
      // Char Dham — 1 voter per goal completed, claimed by the player.
      const done = ctx.choice?.completed || []
      if (!done.length) {
        return { manual: true, prompt: 'Which of the four did you complete?', options: effect.goals }
      }
      const n = done.filter((g) => effect.goals.includes(g)).length
      board = { ...board, evicted: { ...board.evicted, [actorId]: (board.evicted[actorId] || 0) + n } }
      messages.push(`${actor().name} earned ${n} voter(s) from Char Dham.`)
      break
    }

    case 'drawAndAuction': {
      // A Call From Karachi (p.11's "certain events will initiate an auction").
      // Which card you keep is yours to choose in private, so that half stays at
      // the table — but the auction itself is opened here, since nothing else in
      // the game ever started one.
      return {
        players,
        board,
        reserve,
        auction: { sellerId: actorId, itemType: 'conspiracy', minBid: effect.minBid },
        messages: [
          `${actor().name} drew ${effect.draw} Conspiracy Cards, kept one, and put it up at ${effect.minBid}.`,
        ],
      }
    }

    case 'roundOfGerrymanders': {
      // Submerged (p.17) — "Starting with you, every player can Gerrymander 1
      // majority or non-majority voter immediately."
      //
      // The board changes under each player's feet as the round goes on, so
      // this cannot be applied in one shot; it opens a round and the game walks
      // it seat by seat. `round` rides out the same way `auction` does, leaving
      // applyEffect a pure function over players/board/reserve.
      return {
        players,
        board,
        reserve,
        round: {
          kind: 'gerrymander',
          from: actorId,
          include: true, // "starting with you"
          options: {
            allowMajority: effect.allowMajority !== false,
            blockVolatileDestination: effect.blockVolatile !== false,
          },
        },
        messages: [`Every player Gerrymanders one voter, starting with ${actor().name}.`],
      }
    }

    case 'cashOutVoterCards': {
      // A Trip To Goalpara (p.17) — "The next 3 players after you can select and
      // discard an open Voter Card. They will receive the resources denoted on
      // these cards. New Voter Cards will only open after all 3 have been
      // discarded."
      //
      // Also a round: each choice removes a card the next player could have
      // taken, and the market is deliberately held empty until the end.
      return {
        players,
        board,
        reserve,
        round: {
          kind: 'cashOutVoter',
          from: actorId,
          include: false, // "the next 3 players AFTER you"
          count: effect.players,
          options: { holdRefill: effect.holdRefill !== false },
        },
        messages: [
          `The next ${effect.players} players each cash out an open Voter Card.`,
        ],
      }
    }

    case 'sharePowers': {
      // Polo Retreat (p.17) — "Choose 2 players. They can use each other's
      // unlocked Level 3 Ideologue Powers in addition to their own in their
      // next turns."
      //
      // No round: one choice by the actor, then a durable effect on two people.
      // The pairing is symmetric, so each points at the other.
      const chosen = (ctx.targets || []).slice(0, effect.players)
      if (chosen.length < effect.players) {
        return { manual: true, prompt: `Choose ${effect.players} players to pair.` }
      }
      const [a, b] = chosen
      if (a === b) return { error: 'Pick two different players' }
      if (!players.some((p) => p.id === a) || !players.some((p) => p.id === b)) {
        return { error: 'Unknown player' }
      }

      // The clarification: "If either of the players don't have any unlocked
      // Level 3 powers, both players can use any one Level 3 power of their
      // choice." A pairing where one side has nothing to lend is worthless, so
      // the card opens the whole level instead.
      const hasL3 = (id) => {
        const p = players.find((x) => x.id === id)
        return Ideology.activePowerList(p.ideologyCards).some((pw) => pw.level === 3)
      }
      const wildcard = !hasL3(a) || !hasL3(b)

      const grant = (p) => {
        if (p.id !== a && p.id !== b) return p
        return E.withEffects(p, {
          sharedLevel3With: wildcard ? 'any' : p.id === a ? b : a,
        })
      }

      return {
        players: players.map(grant),
        board,
        reserve,
        messages: [
          wildcard
            ? `${nameOf(players, a)} and ${nameOf(players, b)} may each use any one Level 3 power next turn.`
            : `${nameOf(players, a)} and ${nameOf(players, b)} may use each other's Level 3 powers next turn.`,
        ],
      }
    }

    case 'wildIdeologyCard': {
      // Jumla (p.18) — "This is an extra Ideology Card of your choice."
      //
      // Handled by game.js rather than here, because it is not a one-off
      // application at all: it is a persistent object that sits in a player's
      // ideology stack, counts toward income and unlocks, can be bought out
      // from under them, and can be moved at end of turn. `choice` carries the
      // Ideologue it is placed under.
      if (!ctx.choice) {
        return { manual: true, prompt: 'Choose the Ideologue to place Jumla under.' }
      }
      return {
        placeJumla: { ideologue: ctx.choice, playerId: actorId },
        players,
        board,
        reserve,
        messages: [`${actor().name} placed Jumla under an Ideologue.`],
      }
    }

    default:
      // Negotiations, votes and auctions — the social cards. Never automated.
      return { manual: true }
  }

  return { players, board, reserve, messages }
}
