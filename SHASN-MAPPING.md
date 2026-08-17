# SHASN — Rulebook → Code Mapping

Source: *Essential Edition India Rulebook 2022–23* (32pp) + board scan in `Images/board/`.
Purpose: agree scope before rewriting `lib/game/`.

**Verdict up front:** the current build is not a partial SHASN — it is a different game wearing
some SHASN vocabulary. Every core loop (voters, majorities, ideology cards, gerrymandering,
volatile areas) is absent. The lobby/session/realtime layer is sound and stays. `lib/game/` is a
rewrite, not a repair.

---

## 1. Confirmed components (rulebook p.3)

| Component | Count | Notes |
|---|---:|---|
| Ideology Cards | 108 | 2 answers each, one per Ideologue |
| Voter Cards | 60 | 3 face-up at all times; reshuffle discards when empty |
| Conspiracy Cards | 20 | buy top card only, cost 4–5 resources |
| Headline Cards | 20 | triggered by Volatile Areas |
| Zone Requirement Cards | 14 | **2-player mode only** |
| Voter Tokens | 250 | 50 per player × 5 |
| Resources | 120 | 30 each of Funds / Clout / Media / Trust |
| Player Mats | 5 | → **max 5 players**, not 6 |

Player count is **2–5**. Current code allows 6 and `MIN_PLAYERS` is 2 — 2 players requires the
entirely separate 2-player mode (different board side, 7 zones, Zone Requirement Cards).

---

## 2. Board geometry (from scan)

Nine zones, `majority/total` as printed:

| Zone | Majority | Areas |
|---|---:|---:|
| North-West | 6 | 11 |
| North | 11 | 21 |
| North-East | 6 | 11 |
| West | 9 | 17 |
| Central | 5 | 9 |
| East | 9 | 17 |
| South-West | 6 | 11 |
| South | 11 | 21 |
| South-East | 6 | 11 |
| **Total** | **69** | **129** |

Max achievable score across all players = 69 points. 11 Volatile Areas, at least one per zone.

**Blocker:** the scan is cropped at the right edge and too low-res to derive exact area
coordinates or which specific areas are Volatile. I need a full flat scan of the 5-player board
side to build the area map and the zone adjacency graph (adjacency is required for
Gerrymandering — "move a voter between two *adjacent* zones").

---

## 3. Mechanic-by-mechanic mapping

| Rulebook mechanic | Current code | Action |
|---|---|---|
| **Voters as discrete tokens in areas** | Support = unbounded int per bloc | **Rewrite.** Board becomes an area array per zone, each holding `{playerId, isMajority, isVolatile}` |
| **Majority = fill > half a zone; flip tokens; 1pt each** | None | **Build.** Check on every placement; flip N tokens |
| **Breaking majorities** | None | **Build.** Re-check after evict/discard/convert/gerrymander |
| **Voter Cards — pay resources, place in ONE zone** | Policy cards granting flat support | **Replace.** 3 open cards, discard→reflip, splitting banned |
| **Resources: 4 types, cap 12, Public Reserve of 30 each** | Constants exist, `RESOURCES` **not imported** → crash | **Rewrite.** Real economy: earn from Ideology, spend on Voter/Conspiracy |
| **Ideology Cards — 2 answers, pick one, gain resources, kept under mat** | None | **Build.** This is the entire engine. Drawn at start of every turn |
| **Ideologue passive — +1 resource per 2 cards of that type** | None | **Build** |
| **Ideologue L3 / L5 powers (8 total)** | None | **Build.** Per-turn use counters, see §4 |
| **Gerrymandering Rights — most voters in a zone** | None | **Build.** Needs adjacency graph; ties = nobody |
| **Volatile Areas → trigger Headline at end of turn** | None | **Build.** Tokens there are permanently immune |
| **Conspiracy Cards — buy top, hold unlimited, play anytime incl. opponent's turn** | Scandal cards, fixed AP cost | **Replace.** Interrupt window before next player answers |
| **Headline Cards** | Event cards on a round timer | **Replace.** Trigger-driven, not scheduled |
| **Trading — any ratio, anytime in turn, resources + Conspiracies** | None | **Build.** Needs propose/accept UI |
| **Auction — bid past your holdings, pay in debt** | None | **Build.** Blocks purchases until repaid |
| **Game end — all possible majorities formed** | Fixed 9 rounds | **Replace.** No round limit |
| **Scoring — majority voters only** | Sum of all support | **Replace** |
| **Turn structure — no AP, unlimited actions** | 3 AP per turn | **Delete AP entirely** |
| **Alliances / betrayal** | Fully built, ~360 lines | **Delete.** Not in SHASN |
| **Setup — P1 gets 1 resource, P2 gets 2… P5 gets 5** | None | **Build** |
| **2-player mode — 7 zones + Zone Requirements** | None | **Defer to phase 2** |

**The AP system is the biggest structural mismatch.** SHASN has no action points. A turn is:
answer Ideology Card → check resource cap → then take *unlimited* actions in any order until you
choose to stop. Removing AP touches every API route and most components.

---

## 4. Ideologue powers (exact, p.23–27)

Passive (all four): +1 resource of that type per 2 Ideology Cards held.

| Ideologue | Level 3 | Level 5 |
|---|---|---|
| Capitalist | *Prospecting* — 1×/turn, give 1 resource → take any 2 | *Breaking Ground* — 3×/turn, evict any 1 voter (incl. majority) |
| Supremo | *Donations* — 2×/turn, snatch 1 resource from a player | *Payback* — 2×/turn, pay 1 resource → discard an opponent's voter |
| Showstopper | *Going Viral* — 2×/turn, +1 voter on a Voter Card you influence | *Election Fever* — Gerrymander 2 instead of 1 per zone (incl. majority voters) |
| Idealist | *Helping Hands* — 2×/turn, 1-resource discount on a purchase | *Tough Love* — 1×/turn, pay 2 Trust + any 2 → convert 2 of one opponent's voters in one zone |

Powers unlock mid-turn and are usable the same turn. Multiple can be active. Voters in Volatile
Areas are immune to **all** of these.

---

## 5. What the rulebook does *not* contain

It is mechanics-only. **None of the card text is in it.** To "match the rulebook exactly" we still
need content for:

- **108 Ideology Cards** — question + 2 answers + Ideologue tag + resource payouts each
- **60 Voter Cards** — resource cost + voter count (1–3)
- **20 Conspiracy Cards** — effect + 4-or-5 resource cost
- **20 Headline Cards** — effect
- **14 Zone Requirement Cards** — 2-player only

That's ~220 cards of content that has to come from somewhere: photograph your physical deck, or
write originals to the same specs. This is the single largest unknown in the project and it
gates any "complete" build.

---

## 6. Mechanics needing digital redesign

These don't port literally:

1. **Ideology Card read aloud by the player to your right** — becomes: server deals card, only the
   active player sees it, answer is then revealed publicly.
2. **Free-form trading in any ratio** — needs a structured propose/counter/accept flow with a
   timeout, or table-talk stays verbal and only the transfer is executed in-app.
3. **Auction with debt** — "bid more than you hold, repay over turns, no purchases until repaid."
   Implementable but fiddly; needs a debt ledger per player.
4. **Tie-breaker** — the printed rule is the real-life privilege calculator. Recommend replacing
   with fewest-turns-taken or a coin flip.
5. **Conspiracy interrupt window** — playable *during another player's turn*, before they answer.
   Realtime sync has to pause and offer the window; this is the hardest sync problem in the build.

---

## 7. Bugs in current code (fix regardless of direction)

1. `state.js:398` — `validateAction(gameState, playerStates, …)` passes the array where a single
   `playerState` is expected. Every `play_card` fails; AP limits never enforced.
2. `state.js` + `api/start-game.js` — `RESOURCES` / `PUBLIC_RESOURCE_START` used but never
   imported → `initBoardState()` throws → **starting a game crashes**.
3. `state.js` — `for (const [a,b] of Object.keys(excess))` destructures strings.
4. No `resources` column in any migration, but `start-game.js` inserts one.
5. Checkpoint snapshot reads `ps.nickname` off `player_state`, which has no such column.
6. `ZONE_LAYOUT` / `PIPS_PER_ZONE` defined in `state.js`, never used.

---

## 8. Proposed build order

| Phase | Scope | Status |
|---|---|---|
| 0 | New schema + board geometry. Delete AP, alliances, policy/scandal/event cards | ✅ done |
| 1 | Voters, areas, placement, majority forming/breaking, scoring, game-end | ✅ done |
| 2 | Resource economy + Voter Cards + Public Reserve + cap/discard | ✅ done |
| 3 | Ideology Cards + Ideologue tracking + passive powers | ✅ done |
| 4 | L3/L5 powers (8) wired to actions, per-zone Gerrymander limits | ✅ done |
| 5 | Volatile Areas + Headline Cards | ✅ done |
| 6 | Conspiracy Cards | ✅ buy/hold/play done; Block & Reverse interrupts pending |
| 7 | Trading, auction | ⬜ primitives done, flow pending |
| 8 | 2-player mode + Zone Requirements | ⬜ |
| — | **Rewire API routes + board UI onto the new engine** | ⬜ **required for multiplayer** |

### Card content — no longer stubbed

The community "Headlines and Conspiracies Explained" doc supplied the real India
deck, and it reconciles exactly with the rulebook's component list:

- **20 Conspiracies** — 16 unique, with Chai-Paani ×2 and Vikas Model ×4
- **20 Headlines** — 20 unique

Both are transcribed verbatim in `lib/shasn/data/`, including the clarification
notes. Voter Cards and Ideology Cards remain stubs.

### How card effects resolve

About a third of the India deck is explicit negotiation or voting — *"convince 2
other players to become investors"*, *"your opponents will vote and decide where
to place"*. Forcing those through a UI would destroy what makes them good, so
every card declares a `mode`:

| mode | handling |
|---|---|
| `auto`, `choice`, `delayed`, `persistent` | engine resolves, prompting for a choice or target where needed |
| `interrupt` | played out of turn (Block, Reverse) — **not yet wired** |
| `table` | engine shows the full card text and records the outcome the table agrees |

Both paths write identical log entries, so the game history reads the same either way.

### What exists now

```
lib/shasn/
  zones.js       board geometry — 9 zones, 129 areas, 69 points
  constants.js   rules constants, all four Ideologues and their 8 powers
  board.js       voters, majorities, gerrymandering, scoring, game-end
  resources.js   pools, wildcard costs, Reserve transfers, cap-12, trades
  deck.js        seeded RNG + generic draw/discard/reshuffle
  voterCards.js  the 3-card open market and influencing
  ideology.js    answer flow, redraw, Ideologue tallies, passive income, unlocks
  powers.js      the 8 Ideologue powers + Gerrymander allowances
  cards.js       Headline and Conspiracy handling, effect application
  game.js        turn machine tying it all together
  data/          real India Headline + Conspiracy decks; stub Voter + Ideology
pages/
  prototype.js   hot-seat playtest UI, drives lib/shasn directly
tests/
  harness.mjs        loads lib/shasn under bare Node
  board.test.mjs     32 assertions
  economy.test.mjs   45 assertions
  game.test.mjs      24 assertions, incl. full games played to completion
  powers.test.mjs    41 assertions
```

`npm test` → **142 assertions**, all green. Every test names the rulebook page it
enforces. Full games are played to completion for 3, 4 and 5 players across
multiple seeds, asserting resource conservation and that every zone settles.

The engine plays a complete game. `/prototype` is playable now; multiplayer still
needs the API routes and board components moved off the old `lib/game/` model.

### Known deadlock, and why the stub data looks the way it does

The Voter Card market only cycles when a card is **bought**. Playtesting hit a
state where every open card demanded Trust, nobody held any, and the game froze
permanently with 126 of 129 areas empty. The rulebook's escape valves are trading
(p.11) and Capitalist Prospecting (p.23). Prospecting is now implemented and
`isStalled()` accounts for it; stub Voter Card costs were also made
wildcard-dominant. Revisit that cost curve once trading lands — the real deck is
likely more demanding.

---

## 9. Open questions

1. **Card content** — photograph the physical decks, or write originals to spec?
2. **Board scan** — can you get a flat, uncropped scan of the 5-player side?
3. **Player count** — cap at 5 per the rulebook, and treat 2-player as its own mode?
4. **Trading/auction** — full in-app implementation, or assume players are in the same room /
   on a call and keep negotiation verbal?
5. **Tie-breaker** — replace the printed rule with what?
