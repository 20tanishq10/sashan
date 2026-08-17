// SHASN — Ideologue powers (Phase 4)
//
// The eight unlockable powers from rulebook p.23-27, plus the Gerrymander
// allowance they modify. Every function is pure: it takes a game and returns a
// new one, or { error }.
//
// Five are ACTIVATED actions the player invokes directly:
//   Capitalist L3  Prospecting     1x/turn
//   Capitalist L5  Breaking Ground 3x/turn
//   Supremo    L3  Donations       2x/turn
//   Supremo    L5  Payback         2x/turn
//   Idealist   L5  Tough Love      1x/turn
//
// Three are MODIFIERS consumed by other actions rather than invoked:
//   Showstopper L3 Going Viral     +1 voter on up to 2 Voter Cards per turn
//   Showstopper L5 Election Fever  Gerrymander 2 per zone instead of 1
//   Idealist    L3 Helping Hands   1 resource off a purchase, twice per turn
//
// Voters in Volatile Areas are immune to all of these (p.17) — board.js enforces
// that, so none of the removal powers need to re-check it.

import { IDEOLOGUES } from './constants'
import * as Board from './board'
import * as R from './resources'
import * as Ideology from './ideology'
import { ZONES } from './zones'

// ---------------------------------------------------------------------------
// Local helpers (kept here so powers.js never imports game.js — no cycles)
// ---------------------------------------------------------------------------

const active = (game) => game.players[game.activeSeat]

function setPlayer(game, playerId, patch) {
  return {
    ...game,
    players: game.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
  }
}

function log(game, message, type = 'power') {
  return { ...game, log: [...game.log, { type, message }].slice(-200) }
}

/** Guard shared by every activated power: unlocked, and uses left this turn. */
function claimUse(game, ideologueId, level) {
  const player = active(game)
  const remaining = Ideology.powerUsesRemaining(
    player.ideologyCards,
    player.powerUses,
    ideologueId,
    level
  )
  if (remaining <= 0) {
    const unlocked = Ideology.unlockedPowers(player.ideologyCards)[ideologueId]
    return {
      error: unlocked?.[`level${level}`]
        ? `${IDEOLOGUES[ideologueId][`level${level}`].name} is exhausted this turn`
        : `${IDEOLOGUES[ideologueId].label} Level ${level} is not unlocked`,
    }
  }
  return {
    player,
    commit: (g) =>
      setPlayer(g, player.id, {
        powerUses: Ideology.recordPowerUse(g.players.find((p) => p.id === player.id).powerUses, ideologueId, level),
      }),
  }
}

// ---------------------------------------------------------------------------
// The Capitalist
// ---------------------------------------------------------------------------

/**
 * L3 Prospecting (p.23) — "give 1 resource to the Public Reserve to get up to 2
 * resources of your choice." Both taken at once; they may differ.
 *
 * This is the rulebook's main escape hatch from a starved economy: it converts
 * a resource you have into ones you need.
 */
export function prospect(game, { give, take }) {
  const claim = claimUse(game, 'capitalist', 3)
  if (claim.error) return { error: claim.error }
  const player = claim.player

  if (R.poolTotal(give) !== 1) return { error: 'Prospecting gives exactly 1 resource' }
  const wanted = R.poolTotal(take)
  if (wanted < 1 || wanted > 2) return { error: 'Prospecting takes up to 2 resources' }

  const paid = R.payToReserve(player.pool, game.reserve, give)
  if (paid.error) return { error: paid.error }

  const taken = R.takeFromReserve(paid.pool, paid.reserve, take)
  if (taken.shortfall) return { error: 'The Public Reserve cannot cover that' }

  let next = { ...game, reserve: taken.reserve }
  next = setPlayer(next, player.id, { pool: taken.pool })
  next = claim.commit(next)
  return { game: log(next, `${player.name} prospected for ${wanted} resource(s).`) }
}

/**
 * L5 Breaking Ground (p.23) — "three times per turn, evict any 1 voter from the
 * board and send it back to its player (including majority voters)."
 */
export function breakingGround(game, { zoneId, areaIndex }) {
  const claim = claimUse(game, 'capitalist', 5)
  if (claim.error) return { error: claim.error }

  const r = Board.evictVoter(game.board, zoneId, areaIndex, { allowMajority: true })
  if (r.error) return { error: r.error }

  let next = claim.commit({ ...game, board: r.board })
  const victim = game.players.find((p) => p.id === r.owner)
  return {
    game: log(next, `${claim.player.name} evicted a voter belonging to ${victim?.name} in ${ZONES[zoneId].label}.`),
  }
}

// ---------------------------------------------------------------------------
// The Supremo
// ---------------------------------------------------------------------------

/**
 * L3 Donations (p.24) — "twice per turn, snatch 1 resource from another player."
 * Taken without compensation; may hit the same player twice or two different ones.
 */
export function donations(game, { targetPlayerId, resource }) {
  const claim = claimUse(game, 'supremo', 3)
  if (claim.error) return { error: claim.error }
  const player = claim.player

  if (targetPlayerId === player.id) return { error: 'Snatch from an opponent, not yourself' }
  const target = game.players.find((p) => p.id === targetPlayerId)
  if (!target) return { error: 'Unknown player' }
  if ((target.pool[resource] || 0) < 1) return { error: `${target.name} has no ${resource}` }

  let next = setPlayer(game, target.id, {
    pool: { ...target.pool, [resource]: target.pool[resource] - 1 },
  })
  next = setPlayer(next, player.id, {
    pool: { ...player.pool, [resource]: (player.pool[resource] || 0) + 1 },
  })
  next = claim.commit(next)
  return { game: log(next, `${player.name} snatched 1 ${resource} from ${target.name}.`) }
}

/**
 * L5 Payback (p.24) — "twice per turn, spend 1 resource to discard 1 of an
 * opponent's voters (including majority voters)." Discarded, not evicted: the
 * voter leaves the board permanently.
 */
export function payback(game, { zoneId, areaIndex, payWith }) {
  const claim = claimUse(game, 'supremo', 5)
  if (claim.error) return { error: claim.error }
  const player = claim.player

  const owner = game.board.zones[zoneId]?.owners[areaIndex]
  if (!owner) return { error: 'No voter in that area' }
  if (owner === player.id) return { error: "Payback targets an opponent's voter" }

  const cost = payWith || R.autoAllocate(player.pool, { any: 1 }).allocation
  if (!cost || R.poolTotal(cost) !== 1) return { error: 'Payback costs exactly 1 resource' }

  const paid = R.payToReserve(player.pool, game.reserve, cost)
  if (paid.error) return { error: paid.error }

  const r = Board.discardVoter(game.board, zoneId, areaIndex, { allowMajority: true })
  if (r.error) return { error: r.error }

  let next = { ...game, board: r.board, reserve: paid.reserve }
  next = setPlayer(next, player.id, { pool: paid.pool })
  next = claim.commit(next)
  const victim = game.players.find((p) => p.id === owner)
  return {
    game: log(next, `${player.name} discarded a voter of ${victim?.name} in ${ZONES[zoneId].label}.`),
  }
}

// ---------------------------------------------------------------------------
// The Idealist
// ---------------------------------------------------------------------------

/**
 * L5 Tough Love (p.26) — "once per turn, spend 2 Trust + any 2 resources to
 * convert 2 of an opponent's voters into yours (including majority voters)."
 * Both voters must belong to the same player and sit in the same zone.
 * The cost may itself be discounted by Helping Hands.
 */
export function toughLove(game, { zoneId, areaIndices, allocation, discounts = [] }) {
  const claim = claimUse(game, 'idealist', 5)
  if (claim.error) return { error: claim.error }
  const player = claim.player

  if (!Array.isArray(areaIndices) || areaIndices.length !== 2) {
    return { error: 'Tough Love converts exactly 2 voters' }
  }

  const owners = areaIndices.map((i) => game.board.zones[zoneId]?.owners[i])
  if (owners.some((o) => !o)) return { error: 'Both areas must contain a voter' }
  if (owners[0] !== owners[1]) return { error: 'Both voters must belong to the same player' }
  if (owners[0] === player.id) return { error: 'Tough Love targets an opponent' }

  const cost = R.applyDiscounts({ trust: 2, any: 2 }, discounts)
  let alloc = allocation
  if (!alloc) {
    const auto = R.autoAllocate(player.pool, cost)
    if (auto.error) return { error: auto.error }
    alloc = auto.allocation
  } else {
    const check = R.allocationSatisfies(alloc, cost)
    if (!check.ok) return { error: check.error }
  }

  const paid = R.payToReserve(player.pool, game.reserve, alloc)
  if (paid.error) return { error: paid.error }

  let board = game.board
  for (const i of areaIndices) {
    const r = Board.convertVoter(board, zoneId, i, player.id, { allowMajority: true })
    if (r.error) return { error: r.error }
    board = r.board
  }

  let next = { ...game, board, reserve: paid.reserve }
  next = setPlayer(next, player.id, { pool: paid.pool })
  next = claim.commit(next)
  const victim = game.players.find((p) => p.id === owners[0])
  return {
    game: log(next, `${player.name} converted 2 of ${victim?.name}'s voters in ${ZONES[zoneId].label}.`),
  }
}

// ---------------------------------------------------------------------------
// Modifiers — consumed by other actions, not invoked directly
// ---------------------------------------------------------------------------

/**
 * Showstopper L3 Going Viral (p.25) — "+1 voter for any Voter Card that you
 * influence", on up to 2 distinct cards per turn.
 */
export function goingViralAvailable(player) {
  return Ideology.powerUsesRemaining(player.ideologyCards, player.powerUses, 'showstopper', 3) > 0
}

export function consumeGoingViral(game, playerId) {
  const p = game.players.find((x) => x.id === playerId)
  return setPlayer(game, playerId, {
    powerUses: Ideology.recordPowerUse(p.powerUses, 'showstopper', 3),
  })
}

/**
 * Idealist L3 Helping Hands (p.26) — "twice per turn, get 1 resource discount on
 * any purchase." Applies only to influencing Voter Cards and buying Conspiracy
 * Cards; may be split across two purchases or stacked on one.
 */
export function discountsAvailable(player) {
  return Ideology.powerUsesRemaining(player.ideologyCards, player.powerUses, 'idealist', 3)
}

export function consumeDiscounts(game, playerId, count) {
  let next = game
  for (let i = 0; i < count; i++) {
    const p = next.players.find((x) => x.id === playerId)
    next = setPlayer(next, playerId, {
      powerUses: Ideology.recordPowerUse(p.powerUses, 'idealist', 3),
    })
  }
  return next
}

/**
 * Gerrymander allowance per zone per turn.
 *
 * p.15 grants one move per zone where you hold rights, every turn — a limit the
 * engine previously did not enforce at all. Showstopper L5 Election Fever
 * raises it to 2 and additionally permits moving majority voters (p.25).
 */
export function gerrymanderAllowance(player) {
  const unlocked = Ideology.unlockedPowers(player.ideologyCards)
  return unlocked.showstopper?.level5 ? 2 : 1
}

export function canMoveMajorityVoters(player) {
  return Ideology.unlockedPowers(player.ideologyCards).showstopper?.level5 === true
}

export function gerrymanderUsesRemaining(player, zoneId) {
  const used = player.gerrymanderUses?.[zoneId] || 0
  return Math.max(0, gerrymanderAllowance(player) - used)
}

export function recordGerrymanderUse(game, playerId, zoneId) {
  const p = game.players.find((x) => x.id === playerId)
  return setPlayer(game, playerId, {
    gerrymanderUses: { ...(p.gerrymanderUses || {}), [zoneId]: (p.gerrymanderUses?.[zoneId] || 0) + 1 },
  })
}

/** Every activated power, with its live availability — drives the UI. */
export function availableActions(game) {
  const player = active(game)
  const defs = [
    ['capitalist', 3, 'prospect'],
    ['capitalist', 5, 'breakingGround'],
    ['supremo', 3, 'donations'],
    ['supremo', 5, 'payback'],
    ['idealist', 5, 'toughLove'],
  ]
  return defs
    .map(([ideologue, level, action]) => {
      const def = IDEOLOGUES[ideologue][`level${level}`]
      const remaining = Ideology.powerUsesRemaining(
        player.ideologyCards,
        player.powerUses,
        ideologue,
        level
      )
      const unlocked = Ideology.unlockedPowers(player.ideologyCards)[ideologue][`level${level}`]
      return { ideologue, level, action, name: def.name, text: def.text, unlocked, remaining }
    })
    .filter((p) => p.unlocked)
}
