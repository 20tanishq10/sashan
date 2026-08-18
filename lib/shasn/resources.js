// SHASN — resource economy (Phase 2)
//
// Four resources (p.10), a shared Public Reserve of 30 each, and a per-player
// cap of 12 (p.11). All functions are pure.
//
// COST MODEL
//
//   Costs are `{ funds, clout, media, trust, any }`. The `any` field is the
//   rulebook's wildcard symbol: "A ⬡ indicates that a player can spend any
//   resource of their choice" (p.10). Conspiracy Cards are priced entirely in
//   wildcards — "bought for any 4-5 resources" (p.18).
//
//   Because the player chooses which resources to spend on wildcards, paying is
//   a two-step process: the caller supplies an explicit allocation, and we
//   verify it satisfies the cost. `autoAllocate` provides a sensible default.
//
// RESOURCE CAP IS A TOTAL, NOT PER-TYPE
//
//   The rulebook says only "a default resource cap of 12". Component counts
//   settle it: the box holds 30 of each resource, 120 total. A per-type cap of
//   12 would allow 48 per player — 240 across 5 players, double what exists. A
//   total cap of 12 gives a 60-resource ceiling, which fits. Total it is.

import { RESOURCE_IDS, DEFAULT_RESOURCE_CAP } from './constants'

export function emptyPool() {
  return Object.fromEntries(RESOURCE_IDS.map((id) => [id, 0]))
}

export function poolTotal(pool) {
  return RESOURCE_IDS.reduce((n, id) => n + (pool[id] || 0), 0)
}

export function addPools(a, b) {
  const out = emptyPool()
  for (const id of RESOURCE_IDS) out[id] = (a[id] || 0) + (b[id] || 0)
  return out
}

export function subtractPools(a, b) {
  const out = emptyPool()
  for (const id of RESOURCE_IDS) out[id] = (a[id] || 0) - (b[id] || 0)
  return out
}

export function poolIsNonNegative(pool) {
  return RESOURCE_IDS.every((id) => (pool[id] || 0) >= 0)
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

export function normalizeCost(cost = {}) {
  const out = { ...emptyPool(), any: 0 }
  for (const id of RESOURCE_IDS) out[id] = cost[id] || 0
  out.any = cost.any || 0
  return out
}

export function costTotal(cost) {
  const c = normalizeCost(cost)
  return poolTotal(c) + c.any
}

/** Could this pool cover the cost at all, given the player picks wildcards freely? */
export function canAfford(pool, cost) {
  const c = normalizeCost(cost)
  let spare = 0
  for (const id of RESOURCE_IDS) {
    const have = pool[id] || 0
    if (have < c[id]) return false
    spare += have - c[id]
  }
  return spare >= c.any
}

/**
 * Verify an explicit allocation actually pays the cost.
 * Specific components must be paid in kind; the surplus covers the wildcards.
 */
export function allocationSatisfies(allocation, cost) {
  const c = normalizeCost(cost)
  let wildcardPaid = 0
  for (const id of RESOURCE_IDS) {
    const paid = allocation[id] || 0
    if (paid < c[id]) return { ok: false, error: `Not enough ${id} allocated` }
    wildcardPaid += paid - c[id]
  }
  if (wildcardPaid !== c.any) {
    return {
      ok: false,
      error: `Allocation covers ${wildcardPaid} wildcard resources, cost needs ${c.any}`,
    }
  }
  return { ok: true }
}

/**
 * Default wildcard allocation: pay specific components in kind, then cover the
 * wildcards from whatever the player holds most of. Keeps scarce resources back.
 */
export function autoAllocate(pool, cost) {
  const c = normalizeCost(cost)
  const alloc = emptyPool()

  for (const id of RESOURCE_IDS) {
    if ((pool[id] || 0) < c[id]) return { error: `Not enough ${id}` }
    alloc[id] = c[id]
  }

  let remaining = c.any
  while (remaining > 0) {
    let pick = null
    let most = 0
    for (const id of RESOURCE_IDS) {
      const spare = (pool[id] || 0) - alloc[id]
      if (spare > most) {
        most = spare
        pick = id
      }
    }
    if (!pick) return { error: 'Not enough resources' }
    alloc[pick] += 1
    remaining -= 1
  }

  return { allocation: alloc }
}

/**
 * Idealist L3 "Helping Hands" (p.26) — pay 1 resource less on a purchase, twice
 * per turn. The player chooses which resource(s) to discount. Discounts apply to
 * influencing Voter Cards and buying Conspiracy Cards only.
 */
export function applyDiscounts(cost, discounts = []) {
  let c = normalizeCost(cost)
  for (const d of discounts) {
    if (d === 'any') {
      if (c.any > 0) c = { ...c, any: c.any - 1 }
      else {
        const id = RESOURCE_IDS.find((r) => c[r] > 0)
        if (id) c = { ...c, [id]: c[id] - 1 }
      }
    } else if (c[d] > 0) {
      c = { ...c, [d]: c[d] - 1 }
    } else if (c.any > 0) {
      c = { ...c, any: c.any - 1 }
    }
  }
  return c
}

// ---------------------------------------------------------------------------
// Public Reserve transfers
// ---------------------------------------------------------------------------

/** Pay an allocation from a player pool into the Public Reserve. */
export function payToReserve(pool, reserve, allocation) {
  const nextPool = subtractPools(pool, allocation)
  if (!poolIsNonNegative(nextPool)) return { error: 'Insufficient resources' }
  return { pool: nextPool, reserve: addPools(reserve, allocation) }
}

/**
 * Take resources from the Public Reserve. The Reserve is a finite component
 * (30 each), so a request can come up short; we report the shortfall rather
 * than inventing resources.
 */
export function takeFromReserve(pool, reserve, gains) {
  const granted = emptyPool()
  const shortfall = emptyPool()
  for (const id of RESOURCE_IDS) {
    const want = gains[id] || 0
    const have = reserve[id] || 0
    granted[id] = Math.min(want, have)
    shortfall[id] = want - granted[id]
  }
  return {
    pool: addPools(pool, granted),
    reserve: subtractPools(reserve, granted),
    granted,
    shortfall: poolTotal(shortfall) > 0 ? shortfall : null,
  }
}

// ---------------------------------------------------------------------------
// Resource cap (p.11)
// ---------------------------------------------------------------------------

export function isOverCap(pool, cap = DEFAULT_RESOURCE_CAP) {
  return poolTotal(pool) > cap
}

export function excessOverCap(pool, cap = DEFAULT_RESOURCE_CAP) {
  return Math.max(0, poolTotal(pool) - cap)
}

/**
 * p.11 — "you must choose and discard any excess resources down to your current
 * resource cap. You cannot take any other actions until you do so."
 *
 * The choice is the player's, so this validates their discard rather than
 * picking for them. Discarded resources return to the Public Reserve.
 */
export function discardToCap(pool, reserve, discard, cap = DEFAULT_RESOURCE_CAP) {
  const needed = excessOverCap(pool, cap)
  if (needed === 0) return { error: 'Not over the resource cap' }

  const total = poolTotal(discard)
  if (total !== needed) {
    return { error: `Must discard exactly ${needed} resource(s), got ${total}` }
  }

  const nextPool = subtractPools(pool, discard)
  if (!poolIsNonNegative(nextPool)) return { error: 'Cannot discard resources you do not hold' }

  return { pool: nextPool, reserve: addPools(reserve, discard) }
}

/** Default cap discard: shed from whatever the player holds most of. */
export function autoDiscardToCap(pool, cap = DEFAULT_RESOURCE_CAP) {
  let remaining = excessOverCap(pool, cap)
  const discard = emptyPool()
  const working = { ...pool }
  while (remaining > 0) {
    let pick = null
    let most = 0
    for (const id of RESOURCE_IDS) {
      if ((working[id] || 0) > most) {
        most = working[id]
        pick = id
      }
    }
    if (!pick) break
    working[pick] -= 1
    discard[pick] += 1
    remaining -= 1
  }
  return discard
}

/**
 * Pick `count` resources out of a pool, drawing from whatever is most plentiful.
 * Used when a rule says "take N resources" without naming types — auction
 * payouts, for instance. Returns fewer than asked if the pool runs dry.
 */
export function autoTake(pool, count) {
  const out = emptyPool()
  const working = { ...pool }
  for (let i = 0; i < count; i++) {
    let pick = null
    let most = 0
    for (const id of RESOURCE_IDS) {
      if ((working[id] || 0) > most) {
        most = working[id]
        pick = id
      }
    }
    if (!pick) break
    working[pick] -= 1
    out[pick] += 1
  }
  return out
}

// ---------------------------------------------------------------------------
// Trading (p.11) — any ratio, but both sides must give at least 1 resource
// ---------------------------------------------------------------------------

export function validateTrade(offerPool, requestPool, proposerPool, targetPool) {
  if (poolTotal(offerPool) < 1) return { ok: false, error: 'You must offer at least 1 resource' }
  if (poolTotal(requestPool) < 1) return { ok: false, error: 'You must request at least 1 resource' }
  if (!poolIsNonNegative(subtractPools(proposerPool, offerPool))) {
    return { ok: false, error: 'You do not hold the resources you offered' }
  }
  if (!poolIsNonNegative(subtractPools(targetPool, requestPool))) {
    return { ok: false, error: 'They do not hold the resources you requested' }
  }
  return { ok: true }
}

export function executeTrade(proposerPool, targetPool, offerPool, requestPool) {
  return {
    proposerPool: addPools(subtractPools(proposerPool, offerPool), requestPool),
    targetPool: addPools(subtractPools(targetPool, requestPool), offerPool),
  }
}
