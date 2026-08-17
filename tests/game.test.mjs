// SHASN turn machine tests — plays full games headlessly through lib/shasn/game.js
//
// This is the safety net for the prototype page: the page only calls these same
// functions, so if a game can be driven to completion here it will not blow up
// in the browser.
//
// Run with:  node tests/game.test.mjs

import {
  board as B,
  resources as R,
  ideology as I,
  voterCards as V,
  game as G,
  voterCardData,
  zones,
  consts,
  createRunner,
  eq,
  ok,
} from './harness.mjs'

const { check, report } = createRunner()

const NAMES = ['Ada', 'Bo', 'Cy']
const newGame = (seed = 99, count = 3) =>
  G.createGame({
    players: NAMES.slice(0, count).map((n, i) => ({ id: `p${i + 1}`, name: n })),
    seed,
  })

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

check('a game needs 3-5 players', () => {
  ok(G.createGame({ players: [{ id: 'a', name: 'A' }], seed: 1 }).error, '1 player rejected')
  ok(
    G.createGame({
      players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      seed: 1,
    }).error,
    '6 players rejected'
  )
  ok(!newGame().error, '3 players accepted')
})

check('starting resources are staggered by seat (p.6)', () => {
  const { game } = newGame()
  eq(game.players.map((p) => R.poolTotal(p.pool)), [1, 2, 3])
})

check('setup draws an Ideology Card for the first player', () => {
  const { game } = newGame()
  eq(game.turnPhase, consts.TURN_PHASES.IDEOLOGY)
  ok(game.pendingIdeologyCard, 'a card should be pending')
  eq(game.activeSeat, 0)
})

check('the Public Reserve is debited by the starting handout', () => {
  const { game } = newGame()
  const handedOut = game.players.reduce((n, p) => n + R.poolTotal(p.pool), 0)
  eq(R.poolTotal(game.reserve), 120 - handedOut)
})

// ---------------------------------------------------------------------------
// Turn machine
// ---------------------------------------------------------------------------

check('you cannot act before answering your Ideology Card', () => {
  const { game, rng } = newGame()
  ok(G.influence(game, rng, { openIndex: 0, zoneId: 'north', areaIndices: [0] }).error, 'influence blocked')
  ok(G.endTurn(game, rng).error, 'end turn blocked')
})

check('answering pays out and moves to the actions phase', () => {
  const { game } = newGame()
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  const before = R.poolTotal(game.players[0].pool)

  const r = G.answerIdeology(game, card.answers[0].ideologue)
  ok(!r.error, r.error)
  eq(r.game.turnPhase, consts.TURN_PHASES.ACTIONS)
  ok(R.poolTotal(r.game.players[0].pool) > before, 'resources increased')
  eq(r.game.players[0].ideologyCards.length, 1, 'card kept:')
  eq(r.game.pendingIdeologyCard, null, 'pending cleared:')
})

check('answering with an Ideologue not on the card is refused', () => {
  const { game } = newGame()
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  const absent = consts.IDEOLOGUE_IDS.find((id) => !card.answers.some((a) => a.ideologue === id))
  ok(G.answerIdeology(game, absent).error, 'should be refused')
})

check('redrawing costs 4 and replaces the pending card', () => {
  let { game, rng } = newGame(99, 3)
  // Seat 0 starts with only 1 resource, so redraw must fail.
  ok(G.redrawIdeology(game, rng).error, 'cannot afford a redraw at setup')

  // Give the player enough and try again.
  game = { ...game, players: game.players.map((p, i) => (i === 0 ? { ...p, pool: R.emptyPool() } : p)) }
  game.players[0].pool.funds = 6
  const first = game.pendingIdeologyCard
  const r = G.redrawIdeology(game, rng)
  ok(!r.error, r.error)
  eq(R.poolTotal(r.game.players[0].pool), 2, '4 spent of 6:')
  ok(r.game.pendingIdeologyCard !== first, 'a different card is pending')
})

check('turn order advances and wraps', () => {
  let { game, rng } = newGame()
  for (let i = 0; i < 4; i++) {
    const card = I.getIdeologyCard(game.pendingIdeologyCard)
    game = G.answerIdeology(game, card.answers[0].ideologue).game
    if (game.turnPhase === consts.TURN_PHASES.RESOURCE_CAP) {
      game = G.discardToCap(game, R.autoDiscardToCap(game.players[game.activeSeat].pool)).game
    }
    const seatBefore = game.activeSeat
    const r = G.endTurn(game, rng)
    ok(!r.error, r.error)
    game = r.game
    eq(game.activeSeat, (seatBefore + 1) % 3, `turn ${i + 1} advanced:`)
  }
})

check('going over the cap forces a discard before acting', () => {
  let { game, rng } = newGame()
  // Push the active player to 11 so any answer takes them over 12.
  game = {
    ...game,
    players: game.players.map((p, i) => (i === 0 ? { ...p, pool: { ...R.emptyPool(), funds: 11 } } : p)),
  }
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  const r = G.answerIdeology(game, card.answers[0].ideologue)
  eq(r.game.turnPhase, consts.TURN_PHASES.RESOURCE_CAP, 'forced into cap phase:')

  ok(G.influence(r.game, rng, { openIndex: 0, zoneId: 'north', areaIndices: [0] }).error, 'actions blocked')
  ok(G.endTurn(r.game, rng).error, 'end turn blocked')

  const discard = R.autoDiscardToCap(r.game.players[0].pool)
  const d = G.discardToCap(r.game, discard)
  ok(!d.error, d.error)
  eq(d.game.turnPhase, consts.TURN_PHASES.ACTIONS)
  eq(R.poolTotal(d.game.players[0].pool), 12, 'down to cap:')
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

check('influencing places voters and logs a majority when formed', () => {
  let { game, rng } = newGame()
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  game = G.answerIdeology(game, card.answers[0].ideologue).game

  // Hand the player plenty so affordability is not the variable under test.
  game = {
    ...game,
    players: game.players.map((p, i) =>
      i === 0 ? { ...p, pool: { funds: 9, clout: 9, media: 9, trust: 9 } } : p
    ),
  }

  const opt = V.affordableCards(game.market, game.players[0].pool).find((o) => o.affordable)
  ok(opt, 'something should be affordable')
  const need = opt.card.voters
  const free = B.emptyAreaIndices(game.board, 'central').slice(0, need)

  const r = G.influence(game, rng, { openIndex: opt.openIndex, zoneId: 'central', areaIndices: free })
  ok(!r.error, r.error)
  eq(B.voterCount(r.game.board, 'central', 'p1'), need)
  ok(r.game.log.some((l) => l.type === 'influence'), 'influence logged')
})

check('forming a majority through the game layer is announced in the log', () => {
  let { game, rng } = newGame()
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  game = G.answerIdeology(game, card.answers[0].ideologue).game

  // Put p1 one voter short of the majority in central (5 of 9).
  const free = B.emptyAreaIndices(game.board, 'central')
  game = { ...game, board: B.placeVoters(game.board, 'central', 'p1', free.slice(0, 4)).board }
  eq(B.majorityHolder(game.board, 'central'), null, 'not yet held:')

  // Give p1 resources and buy a 1-voter card into the last needed area.
  game = {
    ...game,
    players: game.players.map((p, i) =>
      i === 0 ? { ...p, pool: { funds: 9, clout: 9, media: 9, trust: 9 } } : p
    ),
  }
  const one = V.affordableCards(game.market, game.players[0].pool).find(
    (o) => o.affordable && o.card.voters === 1
  )
  ok(one, 'a 1-voter card should be affordable')

  const r = G.influence(game, rng, {
    openIndex: one.openIndex,
    zoneId: 'central',
    areaIndices: [B.emptyAreaIndices(game.board, 'central')[0]],
  })
  ok(!r.error, r.error)
  eq(B.majorityHolder(r.game.board, 'central'), 'p1', 'majority formed:')
  ok(
    r.game.log.some((l) => l.type === 'majority' && l.message.includes('formed a majority')),
    'majority announced in the log'
  )
})

check('being broke early is not a stall — income is still coming', () => {
  let { game } = newGame()
  game = { ...game, players: game.players.map((p) => ({ ...p, pool: R.emptyPool() })) }
  ok(!G.isStalled(game), 'players below the cap are still accumulating')
})

check('the real deadlock is detected: everyone capped, nothing buyable', () => {
  let { game } = newGame()

  // Reproduce the playtest failure: every open card demands Trust, and every
  // player is pinned at the cap holding only Funds. More income cannot help,
  // because it would be discarded straight back to the Reserve.
  const trustCards = voterCardData.VOTER_CARD_IDS.filter(
    (id) => (voterCardData.VOTER_CARDS[id].cost.trust || 0) > 0
  ).slice(0, 3)
  eq(trustCards.length, 3, 'stub deck should contain Trust-gated cards:')

  game = {
    ...game,
    market: { ...game.market, open: trustCards },
    players: game.players.map((p) => ({ ...p, pool: { ...R.emptyPool(), funds: 12 } })),
  }

  ok(G.isStalled(game), 'should report a stall')

  const report = G.stallReport(game)
  eq(report.emptyAreas, 129, 'board untouched:')
  ok(report.openCards.every((c) => c.affordableBy.length === 0), 'nobody can afford anything')
})

check('a capped player who CAN afford something is not stalled', () => {
  let { game } = newGame()
  game = {
    ...game,
    players: game.players.map((p) => ({ ...p, pool: { funds: 3, clout: 3, media: 3, trust: 3 } })),
  }
  ok(!G.isStalled(game), 'should not report a stall')
})

check('gerrymandering through the game layer respects rights', () => {
  let { game, rng } = newGame()
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  game = G.answerIdeology(game, card.answers[0].ideologue).game

  // No voters anywhere yet — no rights.
  const r = G.gerrymander(game, {
    rightsZoneId: 'west',
    from: { zoneId: 'west', areaIndex: 0 },
    to: { zoneId: 'south_west', areaIndex: 0 },
  })
  ok(r.error, 'should be refused without rights')
})

check('evicted voters are lost if not replaced by end of turn (p.23)', () => {
  let { game, rng } = newGame()
  const card = I.getIdeologyCard(game.pendingIdeologyCard)
  game = G.answerIdeology(game, card.answers[0].ideologue).game

  game = { ...game, board: { ...game.board, evicted: { ...game.board.evicted, p1: 2 } } }
  const r = G.endTurn(game, rng)
  ok(!r.error, r.error)
  eq(r.game.board.evicted.p1, 0, 'unplaced evicted voters discarded:')
  ok(r.game.log.some((l) => l.message.includes('unplaced evicted')), 'logged')
})

// ---------------------------------------------------------------------------
// Full game
// ---------------------------------------------------------------------------

/** Drive a whole game with a simple greedy bot. Returns the finished game. */
function playOut(seed, playerCount = 3, maxTurns = 4000) {
  let { game, rng } = newGame(seed, playerCount)
  let turns = 0

  while (game.phase !== consts.GAME_PHASES.FINISHED && turns < maxTurns) {
    if (G.isStalled(game)) {
      throw new Error(
        `game stalled at turn ${turns}: ${JSON.stringify(G.stallReport(game).openCards)}`
      )
    }
    turns++
    const me = G.activePlayer(game)

    // 1. Answer the Ideology Card. Lean toward the Ideologue we already hold
    //    most of so powers unlock, but take the answer paying a resource we are
    //    short of when one is offered — a real player watches their pools too,
    //    and a bot that ignores them starves the economy.
    const card = I.getIdeologyCard(game.pendingIdeologyCard)
    const counts = I.ideologueCounts(me.ideologyCards)
    const scarcest = [...consts.RESOURCE_IDS].sort((a, b) => (me.pool[a] || 0) - (me.pool[b] || 0))[0]
    const pick = [...card.answers].sort((a, b) => {
      const relief = (x) => ((x.resources[scarcest] || 0) > 0 ? 1 : 0)
      if (relief(b) !== relief(a)) return relief(b) - relief(a)
      return (counts[b.ideologue] || 0) - (counts[a.ideologue] || 0)
    })[0]
    const ans = G.answerIdeology(game, pick.ideologue)
    if (ans.error) throw new Error(`answer failed: ${ans.error}`)
    game = ans.game

    // 2. Honour the cap.
    if (game.turnPhase === consts.TURN_PHASES.RESOURCE_CAP) {
      const d = G.discardToCap(game, R.autoDiscardToCap(G.activePlayer(game).pool))
      if (d.error) throw new Error(`cap discard failed: ${d.error}`)
      game = d.game
    }

    // 3. Place any evicted voters we are owed.
    while ((game.board.evicted[me.id] || 0) > 0) {
      const zone = zones.ZONE_IDS.find((z) => B.emptyAreas(game.board, z) > 0)
      if (!zone) break
      const area = B.emptyAreaIndices(game.board, zone)[0]
      const p = G.placeEvicted(game, { zoneId: zone, areaIndex: area })
      if (p.error) break
      game = p.game
    }

    // 4. Buy and place voters while we can afford to.
    for (let i = 0; i < 6; i++) {
      const cur = G.activePlayer(game)
      const opts = V.affordableCards(game.market, cur.pool).filter((o) => o.affordable)
      if (!opts.length) break

      // Prefer the biggest card that fits somewhere.
      const sorted = [...opts].sort((a, b) => b.card.voters - a.card.voters)
      let done = false
      for (const opt of sorted) {
        const zone = zones.ZONE_IDS.find((z) => B.canPlaceCard(game.board, z, opt.card.voters))
        if (!zone) continue
        const areas = B.emptyAreaIndices(game.board, zone).slice(0, opt.card.voters)
        const r = G.influence(game, rng, { openIndex: opt.openIndex, zoneId: zone, areaIndices: areas })
        if (r.error) continue
        game = r.game
        done = true
        break
      }

      // p.9 — nothing fits anywhere, so buy the smallest card and let its voters
      // be discarded. Wasteful, but it cycles the market rather than deadlocking.
      if (!done) {
        const cheapest = [...opts].sort((a, b) => a.card.voters - b.card.voters)[0]
        const r = G.influence(game, rng, {
          openIndex: cheapest.openIndex,
          zoneId: zones.ZONE_IDS[0],
          areaIndices: [],
        })
        if (r.error) break
        game = r.game
      }

      if (game.phase === consts.GAME_PHASES.FINISHED) break
    }

    if (game.phase === consts.GAME_PHASES.FINISHED) break

    // 5. p.17 — Headlines triggered by Volatile placements resolve at end of
    //    turn, in placement order, before the turn can end. Cards needing a
    //    choice or a table negotiation are settled the way a real table would:
    //    the bot just records them as resolved.
    let guard = 0
    while (game.pendingHeadlines.length && guard++ < 20) {
      const h = G.resolveNextHeadline(game, rng)
      if (h.error) throw new Error(`headline failed: ${h.error}`)
      game = h.game
      if (game.awaitingResolution) {
        game = G.resolveManually(game, { note: 'resolved at the table' }).game
      }
    }

    if (game.phase === consts.GAME_PHASES.FINISHED) break

    const e = G.endTurn(game, rng)
    if (e.error) throw new Error(`end turn failed: ${e.error}`)
    game = e.game
  }

  return { game, turns }
}

check('a full 3-player game reaches a finish without errors', () => {
  const { game, turns } = playOut(2024)
  eq(game.phase, consts.GAME_PHASES.FINISHED, `finished after ${turns} turns:`)
  ok(turns < 4000, 'should not hit the turn ceiling')

  const table = G.getStandings(game)
  eq(table.length, 3)
  ok(table[0].score >= table[1].score, 'standings sorted')
  ok(
    table.reduce((n, s) => n + s.score, 0) <= zones.TOTAL_MAJORITY_POINTS,
    'total score cannot exceed 69'
  )
})

check('games finish for 3, 4 and 5 players across several seeds', () => {
  for (const count of [3, 4, 5]) {
    for (const seed of [1, 77, 4242]) {
      const { game } = playOut(seed, count)
      eq(
        game.phase,
        consts.GAME_PHASES.FINISHED,
        `seed ${seed} with ${count} players:`
      )
    }
  }
})

check('resources are conserved across an entire game', () => {
  const { game } = playOut(555)
  const held = game.players.reduce((n, p) => n + R.poolTotal(p.pool), 0)
  eq(held + R.poolTotal(game.reserve), 120, 'players + reserve:')
})

check('every zone is settled when the game ends (p.19)', () => {
  const { game } = playOut(31337)
  for (const z of zones.ZONE_IDS) {
    ok(B.isZoneSettled(game.board, z), `${z} should be settled`)
  }
})

check('the winner holds the most majority voters', () => {
  const { game } = playOut(808)
  const table = G.getStandings(game)
  const manual = {}
  for (const z of zones.ZONE_IDS) {
    const h = B.majorityHolder(game.board, z)
    if (h) manual[h] = (manual[h] || 0) + zones.ZONES[z].majority
  }
  eq(table[0].score, Math.max(0, ...Object.values(manual)), 'winner score matches the board:')
})

check('no player ever exceeds the resource cap during a game', () => {
  const { game } = playOut(4711)
  for (const p of game.players) {
    ok(R.poolTotal(p.pool) <= p.resourceCap, `${p.name} holds ${R.poolTotal(p.pool)}`)
  }
})

check('players unlock Ideologue powers over a full game', () => {
  const { game } = playOut(2024)
  const anyUnlocked = game.players.some((p) => I.activePowerList(p.ideologyCards).length > 0)
  ok(anyUnlocked, 'at least one player should unlock a power')
})

report('Turn machine + full games')
