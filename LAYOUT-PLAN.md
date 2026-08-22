# SHASN — replanning the game room

A plan only. Nothing here is built yet.

---

## 1. What is actually wrong

Two measurements explain most of it.

**The map is portrait: 872 × 1218, an aspect of 0.72.** So the board can only get
bigger by getting taller. Height is the one scarce dimension, and every pixel of
vertical stacking above the board comes directly out of the game.

**Width is nearly free.** Even at full available height on a 1080p screen the
board is only 640px wide. On the screenshots' display there is well over a
thousand pixels of empty table either side of it.

The current layout has this exactly backwards. It spends the scarce dimension on
panels and leaves the abundant one empty.

### Where the height goes today

| Region | Share of the viewport | What it contains |
|---|---|---|
| Header | ~5% | Title, room code, seat chips, Leave |
| **Turn panel** | **~38%** | Resource chips, a hint line, and three headings |
| Market strip | ~11% | Three voter cards and two decks |
| **Board** | **~36%, below the fold** | The game |
| Mat | ~10% | Floating, overlapping the board |

The turn panel is roughly 450px tall. In the screenshot it is telling you: you
are up, you hold five resources, and here is a button. The rest is headings
reporting absence — "No auction running", "No rights", and a **Conspiracy Cards
in hand** heading with nothing beneath it.

Two of those headings render unconditionally. Only their contents are behind a
condition, so the label appears whether or not there is anything to label.

### The other five faults

1. **The board is below the fold.** You scroll to reach the thing you are playing.
2. **Rivals are in two places at once.** Chips at the top and compact mats beside
   the board are the same information, split.
3. **The mat floats over the board** it exists to support.
4. **Actions are prose.** "Click 2 empty area(s) in a single zone" is a sentence
   in a panel, when the board itself could simply show which areas are legal.
5. **The room is a 1278-line page.** Layout, turn logic, action handling and
   several hundred lines of inline styles in one file. That is why every layout
   change so far has been a patch rather than a decision.

---

## 2. The target

Three columns, mat docked, nothing scrolls during play.

```
┌────────────────────────────────────────────────────────────────┐
│  SHASN · J4ZP62 · Turn 2                               Leave   │  56px
├──────────────┬──────────────────────────────┬──────────────────┤
│              │                              │                  │
│  RIVALS      │                              │   MARKET         │
│  one card    │          THE BOARD           │   3 voter cards  │
│  per seat,   │      fits remaining height   │   stacked        │
│  turn order  │      zoom and pan            │                  │
│              │                              │   DECKS          │
│  ─────────   │                              │   ───────        │
│  auction     │                              │   log            │
│  trades      │  ┌────────────────────────┐  │   rulebook       │
│  (only when  │  │ one-line prompt        │  │                  │
│   live)      │  └────────────────────────┘  │                  │
├──────────────┴──────────────────────────────┴──────────────────┤
│  YOUR MAT — resources · ideologues      [ command bar ]        │  132px
└────────────────────────────────────────────────────────────────┘
```

### The height budget, for real

| Viewport | Board gets | Board renders at |
|---|---|---|
| 900px (13" laptop) | 712px | 712 × 510 |
| 1080px | 892px | 892 × 639 |
| 1440px | 1252px | 1252 × 896 |

Below 820px tall the mat collapses to a 64px summary bar and the board keeps the
difference. Below 1100px wide the columns fold: rivals become a horizontal strip
under the header, market moves beside them, board takes the full width.

### Column widths

Rivals 260px, market 240px, board takes the rest. Both side columns are fixed
because their contents are fixed — a card per player, three market cards. Letting
them flex would only make them emptier on a wide screen.

---

## 3. What changes, component by component

### Deleted

| What | Why |
|---|---|
| `FloatingMat` (325 lines) | Replaced by a docked `MatDock`. It currently covers the board. |
| The turn panel block in the page | Split between the prompt line, the command bar and the mat. |
| Top seat chips | The rivals column already shows turn order, with more in it. |
| Empty auction / trading boxes | Rendered only when there is an auction or an offer. |
| The two bare headings | A heading with nothing under it is not information. |

### New

| Component | Does |
|---|---|
| `RoomHeader` | Title, code, turn number, leave. Nothing else. |
| `RivalRail` | One card per opponent in turn order. Emblem, score, resources, four unlock tracks, status chips, zones held. Selecting one lights their territory. |
| `BoardStage` | Owns the board's size, zoom and pan, and the one-line prompt beneath it. |
| `MarketRail` | Three voter cards stacked vertically, the two decks below, then the log and rulebook. |
| `MatDock` | Your mat as a docked strip. Collapsed by default on short screens, expands over the board's lower edge on demand — never permanently. |
| `CommandBar` | Influence, gerrymander, powers, trade, end turn. Each shows cost and whether it is available, with the reason on hover. |
| `ZoneCard` | The hover panel described below. |
| `TurnDigest` | The "what you missed" panel described below. |

### Kept, unchanged

`ShasnBoard`, `Card`, `CardStack`, `ResourceChain`, `UnlockTrack`, `MatStatus`,
`PartyEmblem`, `IdeologueMark`, `DeckGlyph`, `IdeologyPrompt`, `InterruptPrompt`,
`CardResolver`, `Announcer`, and the whole `lib/shasn` engine.

None of the design work from the last several rounds is thrown away — the
majority track, the unlock track, the status strip, the state vocabulary, the
animations and the ornament all survive. This is a rearrangement, not a rebuild.

### The page

`pages/game/[code].js` goes from 1278 lines to roughly 250: state, data fetching,
action dispatch, and five region components. The inline style object goes with the
regions that use it.

---

## 4. The three extras

### Since your last turn

The strongest of the four, and the reason is structural: in a five-player game
you are away for four turns, and nothing currently tells you what happened. The
log is a scroll of lines; the board just looks different.

A panel that appears when the turn returns to you:

```
Since your turn
  Bo took the North — 11 points
  Chai-Paani hit you — your next payment is diverted
  2 new Voter Cards on offer
  Cy is one short in the West
```

Derived from `game.log` entries since your last turn number, plus a board diff for
the zone changes. Dismisses on your first action. Open question: the log may not
carry enough structure for all of this, in which case the digest is computed from
a stored snapshot of the board as it was when your turn ended.

### Zone card on hover

The plaque is small because it has to fit on the map. Hovering a zone shows what
is behind it:

```
NORTH — 11 of 21 to hold
  you        4
  Bo         6
  Cy         2
  empty      9
You need 7 more. Still reachable.
```

Most of this already exists: `majorityTrack()` computes exactly these numbers and
the plaque's tooltip already writes a version of the last line. This is largely
surfacing what is already there.

### Click a rival, light their territory

Selecting a rival in the column lifts every zone and voter of theirs and drops
everything else back. Click again to release. Turns the column from a scoreboard
into a way of reading the map.

Reuses the `outOfScope` state that already exists for dimming illegal zones, so
the visual language is one the player has already met.

### Not building

**Preview before you commit** — you did not pick it. Worth revisiting later: it
removes the whole class of "wait, did I just waste that", and the ghost-voter
machinery from the animation work would do most of the job.

---

## 5. Sequence

Each step leaves the game playable. Nothing here is a long-lived broken branch.

| # | Step | Independently useful? |
|---|---|---|
| 1 | **Stop rendering empty things.** Auction, trading, conspiracy hand and the two bare headings appear only with content. | Yes — immediately recovers most of the wasted height, with no layout change at all. |
| 2 | **Split the page into regions.** No visual change; purely moving code out of the monolith so the rest is possible. | No, but it unblocks everything after it. |
| 3 | **The three-column shell**, board fitted to height, mat docked. | Yes — this is the change you actually asked for. |
| 4 | **Command bar and prompt line**, replacing the prose panel. | Yes. |
| 5 | **Rivals column**, merged from the chips and the side mats, with territory highlight. | Yes. |
| 6 | **Zone card on hover.** | Yes. |
| 7 | **Since your last turn.** | Yes. |
| 8 | **Board zoom and pan.** | Yes, and safe to drop if it feels unnecessary once the board is bigger. |

Step 1 alone is worth doing whatever happens to the rest. It is small, it is
low-risk, and it recovers most of the lost height on its own.

---

## 6. What could go wrong

**A no-scroll layout is unforgiving on short screens.** A 13" laptop in a browser
with bookmarks showing has about 700px. The mat collapse and the column fold both
have to work, and they are the parts I cannot verify by running.

**Losing the floating mat loses a feature.** It can be dragged, resized and
remembers where you left it. Docking is better for most people most of the time,
but if you were using that, say so and the dock can keep an "undock" option.

**Zoom and pan is more work than it looks.** Pointer, wheel, touch, and keeping
clicks accurate at every zoom level. It is last in the sequence for that reason.

**The digest depends on log structure I have not audited.** If the log turns out
to be too thin, the fallback is a stored board snapshot per player, which is a
schema change and therefore a bigger job than it appears.

---

## 7. What I still cannot check

I cannot run a browser. Every number in section 2 is arithmetic from the board's
aspect ratio, not something I have watched. The specific things worth looking at
first once it exists:

- whether the board at 510px wide on a small laptop is still workable, or whether
  the columns need to fold sooner
- whether the docked mat at 132px is enough to be useful or just enough to be in
  the way
- whether the rivals column is legible at 260px with four unlock tracks in it
