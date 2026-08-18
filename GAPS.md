# SHASN — rulebook audit

Every page of the Essential Edition India rulebook checked against the code, plus
a sweep for engine features with no UI path. Ordered by what actually hurts.

> **Status after the first fix pass:** 24 of 36 unique cards now resolve in the
> engine, up from 7. The two dead Ideologue powers are fixed. Remaining items are
> marked ⬜ below.

**Original headline: 7 of the 40 real Conspiracy and Headline cards resolved
mechanically.** The other 33 fell through to the table — and 21 of those were
tagged in the data as something the engine *should* handle.

---

## 1. Live bugs

### 1.1 Two Ideologue powers are dead ends in the multiplayer room — ✅ FIXED

`Prospecting` (Capitalist L3) and `Donations` (Supremo L3) can be clicked on your
mat, which arms a power mode — and then nothing can complete it. Both need a
resource picker, not a board target, and the game room only implements board
targeting. The prototype has the pickers; `/game/[code]` does not.

~~The API accepts `prospect` and `donations`; the UI never sends either.~~

**Fixed.** `components/PowerPanel.js` is now shared by both pages and carries the
resource pickers, so both powers complete.

This matters more than a normal missing control: Prospecting is the rulebook's own
escape hatch from a starved economy (p.23), and `isStalled()` already counts on it
existing. Right now a table can deadlock with the cure sitting unusable on a mat.

### 1.2 Cards silently do nothing — ✅ MOSTLY FIXED

21 cards declare `mode: auto | choice | persistent | delayed` — my own marker for
"the engine resolves this" — but `applyEffect` has no branch for their effect
type, so they fall to the manual box and have no mechanical result. A player reads
the card, agrees an outcome, and the game state does not move.

17 of the 21 missing effect types are now implemented, along with
`lib/shasn/effects.js` for the persistent, delayed and counted effects they
install. Four remain, all needing a sequenced multi-player flow that does not
exist yet: `roundOfGerrymanders`, `sharePowers`, `wildIdeologyCard`,
`cashOutVoterCards`.

Originally missing:

```
cashOutVoterCards   checklistVoters      conditionalDiscard   conspiracySurcharge
convertZone         demonetise           divertSpend          doubleLevel3Uses
extortOrConvert     forcedMove           freeMove             lethalGerrymander
lockLevel3          reserveExchange      roundOfGerrymanders  sharePowers
stealRandomConspiracy  suppressIdeologyPayout  voterCardSurcharge
voterPenalty        wildIdeologyCard
```

Worst offenders by table impact: **Vikas Model** (4 copies), **Chai-Paani** (2),
**Demonetisation**, **Booth Capturing**, **Cost of Coal**, **Gau Mitron**,
**Submerged**.

---

## 2. Rules in the book that are not implemented

| Rule | Page | State |
|---|---|---|
| **Conspiracy interrupt window** — play a card "right before an opponent answers their Ideology Card", and simultaneous plays resolve in turn order | p.18, p.22 | Not built. **Block** and **Reverse** are unplayable by design, since both are interrupts |
| **Player 1 decided by a vote** — all players vote, cannot vote for themselves, re-vote on a tie | p.6 | Seat order is lobby join order |
| **Starting resources are the player's choice** — "Player 2 receives any 2 resources" | p.6 | Auto-assigned round-robin |
| ~~**An in-game event opens an auction**~~ | p.11 | ✅ *A Call From Karachi* now opens one at a reserve of 2 |
| **Content advisory** — remove flagged Ideology Cards before play | p.13 | Engine supports `excludeAdvisory`; no lobby control |

---

## 3. Built but unreachable

The engine is done and tested; there is no way to use it from the browser.

| Feature | Engine | UI |
|---|---|---|
| **Trading** — any ratio, resources + Conspiracy Cards | ✅ tested | ✅ **done** — propose/accept/decline/counter |
| **Auctions** — bidding above your holdings, debt ledger that freezes purchases | ✅ tested | ✅ **done** — left rail |
| **2-player mode** — 7 zones, opening bid, Zone Requirements | ✅ tested | ⬜ lobby caps at 3–5, and the 7-zone board geometry is invented |

Every API action is now reachable except `resolve_manually`, which is
superseded by `resolve_awaiting`.

---

## 4. Card content still stubbed

| Deck | Count | State |
|---|---:|---|
| Conspiracy | 20 | ✅ real India deck, verbatim |
| Headline | 20 | ✅ real India deck, verbatim |
| **Voter Cards** | 60 | ⚠️ stub — costs are my invented curve |
| **Ideology Cards** | 108 | ⚠️ **24 stubs standing in for 108** |
| **Zone Requirements** | 14 | ⚠️ stub, 2-player only |

The Ideology deck is the one that matters most. It is the engine of the whole
game, players read every card aloud, and 24 placeholders will repeat inside a
single session — which also blunts the hidden-answer mechanic, because after a
couple of games people will recognise the questions.

---

## 5. Confirmed correct

Checked and passing, so they need no further work:

- Majority forming and breaking, all-or-nothing scoring, game end (p.7–8, p.19)
- Voter Cards: single zone, no splitting, card wasted if the zone lacks room,
  reshuffle on empty, three always open (p.9)
- Resource cap of 12 as a **total**, discard before any other action (p.11)
- Ideology answering, the 4-resource redraw, passive income, L3/L5 unlocks
  (p.12, p.14)
- The card being hidden from the player answering it (p.12)
- Gerrymandering: rights on strict majority, ties give nobody rights, one move per
  zone per turn, Volatile voters immune, cannot move your only voter out (p.15–16)
- Volatile Areas trigger Headlines at end of turn in placement order (p.17)
- All eight Ideologue powers, with per-turn use limits (p.23–26)
- Trading rules and auction debt as *engine behaviour* (p.11)
- Ideology Cards cannot be traded (p.11)
- Board geometry: 9 zones, 129 areas, 69 points, 11 Volatile Areas, adjacency

---

## 6. Suggested order

1. ~~**Fix Prospecting and Donations.**~~ ✅ done
2. ~~**Implement the missing effect types.**~~ ✅ 17 of 21 done; the last four need
   a sequenced multi-player flow
3. ~~**Trading UI.**~~ ✅ done — full negotiation, not just a transfer button
4. **Conspiracy interrupt window** ⬜ next, which unlocks Block and Reverse and finishes
   the Conspiracy rules properly.
5. **Real Ideology Card content** — the largest content job, and it needs your
   physical deck.
6. Setup details (vote for Player 1, choose starting resources, advisory toggle),
   then 2-player mode.
