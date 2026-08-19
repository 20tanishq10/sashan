// SHASN — what is currently true about a player.
//
// A player can be carrying ten different states that change what they are
// allowed to do this turn, and the mat showed none of them. You could be unable
// to buy anything and the only clue was a badge in the auction rail. Every
// Conspiracy that lands on you does something lasting, and the card that did it
// scrolls out of the log within a turn or two.
//
// None of this is secret: `viewFor` passes `effects` and `auctionDebt` straight
// through, and only Conspiracy card IDENTITIES are redacted. So opponents get
// the same strip. In an open-information area-control game, knowing that the
// player to your left cannot buy anything is exactly the kind of thing you are
// supposed to be able to see and act on.
//
// Derived here rather than in the component so it can be tested without a
// renderer, and so the wording of a rule lives next to the rule.

import * as Effects from './effects'
import * as R from './resources'
import { LEVEL_3_THRESHOLD, LEVEL_5_THRESHOLD } from './constants'

/**
 * Every state worth showing, most urgent first.
 *
 *   { id, tone, label, detail }
 *
 * `tone` is 'danger' for something stopping you, 'warn' for something costing
 * you, 'accent' for something waiting on you, 'good' for something in your
 * favour. Empty when nothing is true, which is the common case.
 */
export function matStatus(player, { board = null } = {}) {
  const out = []
  if (!player) return out
  const fx = Effects.effectsOf(player)

  // ── Stopping you ─────────────────────────────────────────────────────────
  const blocked = Effects.purchasesBlocked(player)
  if (blocked) {
    out.push({
      id: 'blocked',
      tone: 'danger',
      label: 'Purchases blocked',
      detail: `You cannot buy anything until this clears — ${blocked}.`,
    })
  }

  if ((player.auctionDebt || 0) > 0) {
    out.push({
      id: 'debt',
      tone: 'danger',
      label: `Owe ${player.auctionDebt} to the auction`,
      detail: 'Bid beyond your holdings. Repay before you can buy again (p.11).',
    })
  }

  if (fx.owedTithe) {
    out.push({
      id: 'tithe',
      tone: 'danger',
      label: 'Tithe owed',
      detail: 'Khaki Terror — purchases are barred until the tithe is paid.',
    })
  }

  const over = R.poolTotal(player.pool) - player.resourceCap
  if (over > 0) {
    out.push({
      id: 'overcap',
      tone: 'danger',
      label: `Over cap by ${over}`,
      detail: `Hand ${over} back to the Public Reserve before doing anything else (p.11).`,
    })
  }

  // ── Costing you ──────────────────────────────────────────────────────────
  if (fx.conspiracySurcharge > 0) {
    out.push({
      id: 'conspiracy-surcharge',
      tone: 'warn',
      label: `Conspiracies cost +${fx.conspiracySurcharge}`,
      detail: 'Permanent.',
    })
  }

  if (fx.voterCardSurcharge > 0) {
    out.push({
      id: 'voter-surcharge',
      tone: 'warn',
      label: `Voter Cards cost +${fx.voterCardSurcharge}`,
      detail: 'Wears off after this turn.',
    })
  }

  if (fx.suppressIdeologyPayout > 0) {
    out.push({
      id: 'payout-suppressed',
      tone: 'warn',
      label:
        fx.suppressIdeologyPayout === 1
          ? 'Next Ideology answer pays nothing'
          : `Next ${fx.suppressIdeologyPayout} Ideology answers pay nothing`,
      detail: 'You still keep the card and it still counts toward your Ideologue.',
    })
  }

  if (fx.voterPenalty > 0) {
    out.push({
      id: 'voter-penalty',
      tone: 'warn',
      label: `Next ${fx.voterPenalty === 1 ? 'Voter Card yields' : `${fx.voterPenalty} Voter Cards yield`} 1 fewer`,
      detail: 'A 3-voter card gives 2.',
    })
  }

  if (fx.lethalGerrymander > 0) {
    out.push({
      id: 'lethal-gerrymander',
      tone: 'warn',
      label: `Next ${fx.lethalGerrymander} gerrymandered voter${fx.lethalGerrymander === 1 ? '' : 's'} die`,
      detail: 'Moved voters are discarded rather than relocated.',
    })
  }

  if (fx.lockedLevel3 > 0) {
    out.push({
      id: 'locked-l3',
      tone: 'warn',
      label: 'A level 3 power is barred',
      detail: 'Wears off after this turn.',
    })
  }

  // ── Waiting on you ───────────────────────────────────────────────────────
  const evicted = board?.evicted?.[player.id] || 0
  if (evicted > 0) {
    out.push({
      id: 'evicted',
      tone: 'accent',
      label: `${evicted} evicted voter${evicted === 1 ? '' : 's'} to place`,
      detail: 'Click an empty area to put them back on the board.',
    })
  }

  // ── In your favour ───────────────────────────────────────────────────────
  if (fx.doubleLevel3) {
    out.push({
      id: 'double-l3',
      tone: 'good',
      label: 'Level 3 powers twice this turn',
      detail: 'Maha Alliance.',
    })
  }

  if (fx.hawala) {
    out.push({
      id: 'hawala',
      tone: 'good',
      label: 'Hawala open',
      detail: 'Trade any 2 alike for 1 of another type, permanently.',
    })
  }

  if (fx.sharedLevel3With) {
    out.push({
      id: 'shared-l3',
      tone: 'good',
      label: 'Borrowing a level 3 power',
      detail: 'Polo Retreat — you may also use their level 3 powers.',
    })
  }

  return out
}

/**
 * How far along an Ideologue is, for the unlock track.
 *
 * The same shape as a zone's majority track and for the same reason: the mat
 * showed a count and a dimmed power row, so "one more card and Tough Love opens"
 * was something you had to work out rather than see.
 */
export function unlockTrack(held) {
  const slots = LEVEL_5_THRESHOLD
  const segments = Array.from({ length: slots }, (_, i) => ({
    filled: i < held,
    threshold:
      i === LEVEL_3_THRESHOLD - 1 ? 3 : i === LEVEL_5_THRESHOLD - 1 ? 5 : null,
  }))

  const level3 = held >= LEVEL_3_THRESHOLD
  const level5 = held >= LEVEL_5_THRESHOLD

  let note
  if (level5) note = 'both unlocked'
  else if (level3) note = `${LEVEL_5_THRESHOLD - held} more to level 5`
  else if (held > 0) note = `${LEVEL_3_THRESHOLD - held} more to level 3`
  else note = 'none yet'

  return { segments, held, level3, level5, note }
}
