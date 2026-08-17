# Election Strategy Game — Full Design & Implementation Plan

*A private, friends-only, election-themed strategy board game (web/mobile), inspired by the genre of games like SHASN but with fully original theme, mechanics detail, cards, and branding.*

---

## 1. Project Scope & Intent

- **Private use only** — built for a closed friend group, not published or monetized.
- Original content throughout: own setting, own card text, own art direction, own rules wording.
- Genre inspiration: election/political strategy games (voter influence, ideology-building, alliances & betrayal) — these are mechanics categories, not owned by any single game.
- Target platforms: Web first (desktop + mobile browser), optional native mobile wrap later.

---

## 2. Game Concept

### 2.1 Setting

Give the game world a name so it reads as clearly your own — e.g. a fictional country, state, or city holding an election. Suggestions to pick from or riff on:
- "The Republic of Meridia"
- "Election Night: [Your City], Fictional Edition"
- A near-future or alt-history setting to give visual/art freedom

### 2.2 Players & Roles

- **3–6 players**, each playing a candidate/party competing in the same election.
- Each player has a private **Ideology Board**: 2–3 axes they position themselves on, e.g.:
  - Tradition ↔ Progress
  - Centralized Power ↔ Local Autonomy
  - Market-Driven ↔ State-Driven
- Ideology position affects which Policy cards synergize with a player and how voter blocs respond to their campaigns.

### 2.3 Shared Board: Voter Blocs

A shared board of voter segments, each starting at a neutral support level. Suggested blocs (name freely):
- Youth
- Farmers
- Business/Industry
- Working Class
- Retirees
- Urban Professionals

Each bloc has a **support meter** (e.g. 0–100, or a track of pips) that shifts as players play cards targeting it. At game end (or at scoring checkpoints), the player with the most support across blocs (weighted or summed) is ahead.

### 2.4 Core Game Loop (per round)

1. **Draw phase** — each player draws up to a hand limit (e.g. 5 cards) from the shared or personal deck.
2. **Campaign phase** — each player spends **Action Points (AP)** (e.g. 3 per round) to:
   - Play **Policy cards** (build platform, gain steady bloc support, may require ideology alignment)
   - Play **Scandal/Attack cards** (reduce an opponent's support or ideology standing)
   - Propose or activate **Alliance cards** (private deals — see below)
   - Hold a "Rally" action (spend AP for a bigger single-bloc swing, no card needed)
3. **Resolution phase** — all plays resolve in turn order or simultaneously (design choice — simultaneous is more fun but harder to implement first; start with turn order).
4. **Event phase** (optional, every N rounds) — draw a random **Event card** affecting all players/blocs equally (adds unpredictability).
5. **Scoring checkpoint** (e.g. every 3rd round) — tally current standing, resolve any Alliance pacts due at this checkpoint (kept vs betrayed), apply bonuses/penalties.
6. Repeat for a fixed number of rounds (e.g. 9–12) or until a support threshold is hit.

### 2.5 Alliance / Betrayal Mechanic

- Players can privately agree to an alliance (in-app private message or a "propose alliance" card played face-down between two players).
- At a scoring checkpoint, each party to the alliance secretly chooses **Honor** or **Betray**.
- Suggested payoff matrix (classic prisoner's-dilemma shape, tune numbers to taste):
  - Both Honor → both get a moderate bloc-support bonus
  - Both Betray → both get a small penalty
  - One Betrays, one Honors → betrayer gets a large bonus, honorer gets a large penalty
- This is the "drama" engine of the game — keep it visible/dramatic in the UI (a reveal animation, etc.)

### 2.6 Win Condition

Pick one (or combine):
- Most total voter bloc support at the end of the final round.
- First player to cross a fixed support threshold (e.g. 60% aggregate) at any scoring checkpoint.
- Highest "Approval Score" = weighted sum of bloc support + ideology consistency bonus - scandal penalties.

### 2.7 Card Categories to Design (original content)

| Category | Approx. Count | Purpose |
|---|---|---|
| Policy Cards | 15–20 | Build platform, steady bloc gains, may need ideology match |
| Scandal/Attack Cards | 10 | Reduce opponent support or ideology standing |
| Alliance Cards | 8 | Propose/formalize private deals |
| Event Cards | 8 | Random global effects, adds variance |

*(Full card text/wording to be drafted separately — flag when ready to write these out; each card needs: name, flavor text, effect text, AP cost, target type.)*

---

## 3. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js (React) | Familiar, fast to ship, works for web + easy PWA wrap |
| Realtime | Supabase Realtime (Postgres presence + broadcast channels) | No separate WebSocket server to manage; handles lobby presence and game state sync natively |
| Database | Postgres (via Supabase) | Relational fit for lobbies/players/game state |
| Auth | Guest sessions (nickname + device/session token, no signup) | Friends-only casual play shouldn't need real accounts |
| Hosting | Vercel (frontend) + Supabase (DB/Realtime) | Free tier sufficient for a private friend game |
| Mobile (later) | Expo / React Native wrapping the same logic | Reuse game logic layer, native shell later |

**Fallback option**: if Supabase Realtime hits limits with complex turn validation, swap in a small Node.js + Socket.io server for authoritative game-state resolution, keeping Supabase for persistence only.

---

## 4. Lobby System

### 4.1 Flow

1. Host taps **Create Game** → server generates a 6-character lobby code (uppercase alphanumeric, excluding ambiguous characters `0/O`, `1/I`).
2. Lobby row created with `status: waiting`.
3. Friends enter the code on a **Join** screen → validated against active lobbies → added to `lobby_players`.
4. A realtime channel scoped to the lobby broadcasts the live player list (joins, leaves, ready-toggle) to everyone connected.
5. Host sees a **Start Game** button, enabled once minimum player count (e.g. 3) is met and all are marked ready.
6. On start: server validates state, transitions lobby to `in_progress`, initializes `game_state` and per-player `player_state` rows, deals starting hands, sets round 1.

### 4.2 Data Model

```sql
-- Lobbies
lobbies (
  id            uuid primary key,
  code          varchar(6) unique not null,
  host_id       uuid not null,
  status        text not null default 'waiting', -- waiting | in_progress | finished
  max_players   int not null default 6,
  created_at    timestamptz default now()
)

-- Players in a lobby (pre-game)
lobby_players (
  id             uuid primary key,
  lobby_id       uuid references lobbies(id),
  nickname       text not null,
  session_token  text not null,
  is_ready       boolean default false,
  joined_at      timestamptz default now()
)

-- Active game state
game_state (
  id                     uuid primary key,
  lobby_id               uuid references lobbies(id),
  round                  int default 1,
  phase                  text default 'draw', -- draw | campaign | resolution | event | scoring
  board_state            jsonb, -- voter bloc support levels
  current_turn_player_id uuid,
  updated_at             timestamptz default now()
)

-- Per-player game state
player_state (
  id               uuid primary key,
  game_state_id    uuid references game_state(id),
  player_id        uuid references lobby_players(id),
  hand             jsonb, -- array of card ids
  action_points    int default 3,
  influence_score  int default 0,
  ideology_position jsonb, -- e.g. { tradition_progress: 40, centralized_local: 60 }
  active_alliances jsonb -- pending/active alliance pacts
)
```

### 4.3 Code Generation Rules

- Generate server-side, check uniqueness against currently-active (`waiting` or `in_progress`) lobbies.
- Recycle/expire codes after game finishes or after a TTL (e.g. 2 hours with no activity) to avoid collisions.

---

## 5. Build Phases

### Phase 1 — Lobby Infrastructure (ship first, highest infra risk)
- Create game → generate code
- Join game via code
- Realtime player list with join/leave/ready events
- Host-only "Start Game" gating
- **No game logic yet** — just prove the realtime plumbing works reliably with multiple friends' devices

### Phase 2 — Core Game Loop (single round, minimal cards)
- Turn order / AP spending
- Voter bloc board with live realtime updates
- One card type only (e.g. just Policy cards) to validate the play → resolve → broadcast loop

### Phase 3 — Full Card Set & Alliances
- All four card categories implemented
- Alliance propose/accept flow (private channel between two players)
- Betrayal reveal mechanic at scoring checkpoints
- Event card draws

### Phase 4 — Polish
- Reconnect handling (player refreshes or loses wifi mid-game — rejoin same session via token)
- Spectator mode (late joiners or eliminated players can watch)
- Game log / round-by-round history, end-game summary screen

### Phase 5 — Mobile Wrap
- Expo/React Native shell reusing the same game logic and Supabase client
- Push notification for "it's your turn" (optional, nice-to-have for async play)

---

## 6. Open Design Decisions (to finalize before/while building)

- [ ] Final theme name (country/setting name, voter bloc names, ideology axis names)
- [ ] Exact AP economy (AP per round, card costs)
- [ ] Turn order vs simultaneous resolution for the campaign phase
- [ ] Number of rounds / scoring checkpoint frequency
- [ ] Exact win-condition formula (weighted sum vs threshold)
- [ ] Full card text for all ~40–50 cards
- [ ] Visual/art direction (color palette, card frame style, board layout)

---

## 7. Next Steps

1. Lock in setting names and voter bloc/ideology axis names.
2. Draft full card text for all categories (can be done in parallel with Phase 1 build).
3. Scaffold Phase 1 (Next.js + Supabase lobby: create/join/ready-up with realtime sync).
4. Playtest lobby flow with friends before building game logic on top.
