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

    default:
      // Everything else — negotiations, votes, auctions, ongoing hooks — is
      // recorded as an active effect and resolved at the table.
      return { manual: true }
  }

  return { players, board, reserve, messages }
}
