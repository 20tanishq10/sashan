// SHASN — what the mat says about a player (p.3, p.11, p.18)
//
// The mat used to be silent about every one of these. A Conspiracy would land on
// you, the log entry would scroll away within a turn or two, and after that
// nothing on screen explained why your purchases were failing. This is the
// wording of each rule, so it lives next to the rule and can be checked without
// a renderer.
//
// Run with:  node tests/matStatus.test.mjs

import {
  matStatus as MS,
  effects as FX,
  board as B,
  resources as R,
  consts,
  createRunner,
  eq,
  ok,
} from './harness.mjs'

const { check, report } = createRunner()

const player = (patch = {}) => ({
  id: 'p1',
  name: 'Ada',
  pool: R.emptyPool(),
  resourceCap: consts.DEFAULT_RESOURCE_CAP,
  ideologyCards: [],
  conspiracyCards: [],
  powerUses: {},
  auctionDebt: 0,
  effects: FX.emptyEffects(),
  ...patch,
})

const withFx = (patch) => player({ effects: { ...FX.emptyEffects(), ...patch } })
const ids = (list) => list.map((s) => s.id)

// ---------------------------------------------------------------------------
// Nothing to say
// ---------------------------------------------------------------------------

check('a clean player has an empty strip', () => {
  eq(MS.matStatus(player()), [], 'nothing is true:')
})

check('a missing player does not blow up', () => {
  eq(MS.matStatus(null), [], 'no player, no status:')
})

// ---------------------------------------------------------------------------
// Things stopping you
// ---------------------------------------------------------------------------

check('auction debt is shown, and shown as blocking', () => {
  // p.11 — you may bid past your holdings, but you cannot buy again until the
  // debt is repaid. Previously this lived only in the auction rail.
  const s = MS.matStatus(player({ auctionDebt: 3 }))
  ok(ids(s).includes('debt'), `debt is listed: ${ids(s)}`)
  ok(ids(s).includes('blocked'), 'and it is named as the thing blocking purchases')
  ok(
    s.find((x) => x.id === 'debt').label.includes('3'),
    'the amount is in the label'
  )
})

check('an owed tithe blocks purchases', () => {
  const s = MS.matStatus(withFx({ owedTithe: { resource: 'funds', amount: 2 } }))
  ok(ids(s).includes('tithe'), `tithe is listed: ${ids(s)}`)
})

check('being over the cap is stated with the number to hand back', () => {
  const p = player({ pool: { ...R.emptyPool(), funds: 9, trust: 6 }, resourceCap: 12 })
  const s = MS.matStatus(p)
  const over = s.find((x) => x.id === 'overcap')
  ok(over, `over cap is listed: ${ids(s)}`)
  ok(over.label.includes('3'), `says how many: ${over.label}`)
})

check('a player at exactly the cap is not flagged', () => {
  const p = player({ pool: { ...R.emptyPool(), funds: 12 }, resourceCap: 12 })
  ok(!ids(MS.matStatus(p)).includes('overcap'), 'at the cap is fine')
})

// ---------------------------------------------------------------------------
// Things costing you
// ---------------------------------------------------------------------------

check('surcharges say how much and whether they wear off', () => {
  const s = MS.matStatus(withFx({ conspiracySurcharge: 2, voterCardSurcharge: 1 }))
  const con = s.find((x) => x.id === 'conspiracy-surcharge')
  const vot = s.find((x) => x.id === 'voter-surcharge')
  ok(con.label.includes('2'), `conspiracy surcharge: ${con.label}`)
  ok(con.detail.toLowerCase().includes('permanent'), 'and that it never expires')
  ok(vot.label.includes('1'), `voter surcharge: ${vot.label}`)
  ok(vot.detail.toLowerCase().includes('turn'), 'and that it does')
})

check('a suppressed payout reads differently for one and for several', () => {
  const one = MS.matStatus(withFx({ suppressIdeologyPayout: 1 }))
  const many = MS.matStatus(withFx({ suppressIdeologyPayout: 3 }))
  ok(one.find((x) => x.id === 'payout-suppressed').label.startsWith('Next Ideology'))
  ok(many.find((x) => x.id === 'payout-suppressed').label.includes('3'))
})

check('a lethal gerrymander is spelled out — the voters die', () => {
  const s = MS.matStatus(withFx({ lethalGerrymander: 2 }))
  const x = s.find((x) => x.id === 'lethal-gerrymander')
  ok(x, `listed: ${ids(s)}`)
  ok(x.detail.includes('discarded'), `says what happens: ${x.detail}`)
})

check('a voter penalty and a barred level 3 are both surfaced', () => {
  const s = MS.matStatus(withFx({ voterPenalty: 1, lockedLevel3: 1 }))
  ok(ids(s).includes('voter-penalty'), `voter penalty: ${ids(s)}`)
  ok(ids(s).includes('locked-l3'), 'barred power')
})

// ---------------------------------------------------------------------------
// Waiting on you, and in your favour
// ---------------------------------------------------------------------------

check('evicted voters waiting to be placed are shown on the mat', () => {
  let board = B.initBoard(['p1', 'p2'])
  board = { ...board, evicted: { ...board.evicted, p1: 2 } }
  const s = MS.matStatus(player(), { board })
  const x = s.find((x) => x.id === 'evicted')
  ok(x, `listed: ${ids(s)}`)
  ok(x.label.includes('2'), `how many: ${x.label}`)
  eq(x.tone, 'accent', 'tone says it is waiting on you:')
})

check('advantages are shown too, not only afflictions', () => {
  const s = MS.matStatus(withFx({ doubleLevel3: true, hawala: true, sharedLevel3With: 'p2' }))
  eq(ids(s).sort(), ['double-l3', 'hawala', 'shared-l3'], 'all three:')
  ok(s.every((x) => x.tone === 'good'), 'and marked as in your favour')
})

// ---------------------------------------------------------------------------
// Ordering, so the urgent thing is not buried
// ---------------------------------------------------------------------------

check('what stops you is listed before what merely costs you', () => {
  let board = B.initBoard(['p1'])
  board = { ...board, evicted: { ...board.evicted, p1: 1 } }
  const p = {
    ...withFx({ conspiracySurcharge: 1, hawala: true }),
    auctionDebt: 2,
  }
  const tones = MS.matStatus(p, { board }).map((s) => s.tone)
  const rank = { danger: 0, warn: 1, accent: 2, good: 3 }
  const sorted = [...tones].sort((a, b) => rank[a] - rank[b])
  eq(tones, sorted, 'ordered by urgency:')
})

check('every entry has a label and an explanation', () => {
  let board = B.initBoard(['p1'])
  board = { ...board, evicted: { ...board.evicted, p1: 1 } }
  const p = {
    ...withFx({
      conspiracySurcharge: 1,
      voterCardSurcharge: 1,
      suppressIdeologyPayout: 1,
      lethalGerrymander: 1,
      voterPenalty: 1,
      lockedLevel3: 1,
      hawala: true,
      doubleLevel3: true,
      sharedLevel3With: 'p2',
      owedTithe: { resource: 'funds', amount: 1 },
    }),
    auctionDebt: 1,
  }
  const all = MS.matStatus(p, { board })
  ok(all.length >= 10, `covers every state: ${all.length}`)
  for (const s of all) {
    ok(s.label && s.label.length > 3, `${s.id} has a label`)
    ok(s.detail && s.detail.length > 3, `${s.id} explains itself`)
    ok(['danger', 'warn', 'accent', 'good'].includes(s.tone), `${s.id} has a known tone`)
  }
})

// ---------------------------------------------------------------------------
// The unlock track (p.14)
// ---------------------------------------------------------------------------

check('the unlock track has a slot per card up to level 5', () => {
  const t = MS.unlockTrack(0)
  eq(t.segments.length, consts.LEVEL_5_THRESHOLD, 'five slots:')
  ok(t.segments.every((s) => !s.filled), 'none filled at zero')
  eq(t.note, 'none yet')
})

check('the lines fall at 3 and at 5', () => {
  const marks = MS.unlockTrack(0)
    .segments.map((s, i) => (s.threshold ? [i, s.threshold] : null))
    .filter(Boolean)
  eq(marks, [[consts.LEVEL_3_THRESHOLD - 1, 3], [consts.LEVEL_5_THRESHOLD - 1, 5]])
})

check('the track counts up and says what is left', () => {
  eq(MS.unlockTrack(1).note, '2 more to level 3')
  eq(MS.unlockTrack(3).note, '2 more to level 5')
  eq(MS.unlockTrack(4).note, '1 more to level 5')
  eq(MS.unlockTrack(5).note, 'both unlocked')

  const t = MS.unlockTrack(3)
  eq(t.segments.filter((s) => s.filled).length, 3, 'three filled:')
  ok(t.level3 && !t.level5, 'level 3 open, level 5 not')
})

check('holding more than five does not overflow the track', () => {
  const t = MS.unlockTrack(9)
  eq(t.segments.length, consts.LEVEL_5_THRESHOLD, 'still five slots:')
  ok(t.segments.every((s) => s.filled), 'all filled')
  ok(t.level5, 'and both powers are open')
})

report('Player mat status and unlocks')
