// SHASN — working out what just changed.
//
// The server sends a whole new game object on every poll, so nothing arrives
// labelled "this is the bit that moved". Every animation in the app therefore
// starts here: compare what we have now against what we drew last time, and say
// precisely which token, card or slot is new.
//
// Pure, and deliberately kept out of the components. Getting this wrong is
// invisible in a screenshot and obvious in play — a token that animates every
// render, or one that never animates at all — so it wants tests rather than
// eyeballing.

import { RESOURCE_IDS } from '../shasn/constants'

/**
 * The chain lays tokens out grouped by resource, in RESOURCE_IDS order. Two
 * pools therefore produce two arrays that agree on everything except where one
 * has more of a type than the other.
 */
export function layoutTokens(pool) {
  const out = []
  for (const id of RESOURCE_IDS) {
    for (let i = 0; i < (pool?.[id] || 0); i++) out.push(id)
  }
  return out
}

/**
 * Which slots in the NEW layout hold a token that was not there before.
 *
 * The trick is that tokens of a type are interchangeable, so "which one is new"
 * is only answerable positionally: if you held 2 Funds and now hold 4, the third
 * and fourth Funds in the row are the new ones. Counting through the layout and
 * comparing against the old count per type gives exactly that.
 */
export function arrivedSlots(before, after) {
  const arrived = new Set()
  const seen = {}
  const layout = layoutTokens(after)

  for (let i = 0; i < layout.length; i++) {
    const id = layout[i]
    seen[id] = (seen[id] || 0) + 1
    if (seen[id] > (before?.[id] || 0)) arrived.add(i)
  }
  return arrived
}

/**
 * Which slots in the OLD layout held a token that has since gone.
 *
 * Used to fly ghosts off from where the tokens actually were, rather than from
 * wherever the row happens to have reflowed to.
 */
export function departedSlots(before, after) {
  const departed = new Set()
  const seen = {}
  const layout = layoutTokens(before)

  for (let i = 0; i < layout.length; i++) {
    const id = layout[i]
    seen[id] = (seen[id] || 0) + 1
    if (seen[id] > (after?.[id] || 0)) departed.add(i)
  }
  return departed
}

/** Net movement per resource, for anything that wants the totals. */
export function poolDelta(before, after) {
  const delta = {}
  for (const id of RESOURCE_IDS) {
    const d = (after?.[id] || 0) - (before?.[id] || 0)
    if (d !== 0) delta[id] = d
  }
  return delta
}

/**
 * Which positions in a list now hold something different.
 *
 * The Voter Card market is three face-up slots; buying one replaces that slot
 * and leaves the others alone, so a positional comparison says exactly which
 * card should flip up.
 */
export function replacedSlots(before = [], after = []) {
  const replaced = new Set()
  for (let i = 0; i < after.length; i++) {
    if (before[i] !== after[i]) replaced.add(i)
  }
  return replaced
}

/**
 * Which Ideologues just crossed a threshold.
 *
 * Returns { [ideologue]: 3 | 5 } — the level that opened, so the power row that
 * woke up can say so rather than silently un-dimming.
 */
export function crossedThresholds(before = {}, after = {}, thresholds = [3, 5]) {
  const out = {}
  for (const id of Object.keys(after)) {
    const was = before[id] || 0
    const now = after[id] || 0
    // The highest threshold crossed this turn — gaining two cards at once can
    // clear both, and the bigger unlock is the one worth announcing.
    for (const t of thresholds) {
      if (was < t && now >= t) out[id] = t
    }
  }
  return out
}

/** Ids present in `after` but not in `before`, in `after` order. */
export function newIds(before = [], after = [], key = (x) => x) {
  const had = new Set(before.map(key))
  return after.filter((x) => !had.has(key(x))).map(key)
}
