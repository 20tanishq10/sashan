-- SHASN rebuild — Phase 0
--
-- Replaces the ad-hoc "voter bloc support" model with the real SHASN board:
-- discrete voter tokens in areas, a resource economy, Ideology Card holdings,
-- and Ideologue power tracking.
--
-- The alliance/betrayal mechanic is not part of SHASN and is retired here.
-- Migration 004 is left in place so existing rows are not lost; the table is
-- simply no longer written to.

-- ---------------------------------------------------------------------------
-- Player count: the box ships 5 player mats (rulebook p.3).
-- ---------------------------------------------------------------------------
alter table lobbies
  alter column max_players set default 5;

-- Existing lobbies were created under the old default of 6, which would violate
-- the constraint below. Clamp them into range first — a check constraint is
-- validated against every existing row the moment it is added.
update lobbies set max_players = 5 where max_players > 5;
update lobbies set max_players = 2 where max_players < 2;

alter table lobbies
  drop constraint if exists lobbies_max_players_check;
alter table lobbies
  add constraint lobbies_max_players_check check (max_players between 2 and 5);

-- ---------------------------------------------------------------------------
-- game_state.board_state now holds:
--   {
--     zones:    { <zone_id>: { owners: [player_id | null, ...] } },
--     evicted:  { <player_id>: int },
--     playerIds:[ ... ],
--     publicReserve: { funds, clout, media, trust },
--     voterMarket:   { open: [...], drawPile: [...], discard: [...] },
--     conspiracy:    { drawPile: [...], discard: [...] },
--     headline:      { drawPile: [...], discard: [...] },
--     ideology:      { drawPile: [...], discard: [...] },
--     pendingHeadlines: [ { zoneId, areaIndex, playerId } ],
--     turnOrder: [ ... ],
--     log: [ ... ]
--   }
-- ---------------------------------------------------------------------------

-- SHASN has no action points. A turn is: answer Ideology Card, check resource
-- cap, then take unlimited actions in any order (rulebook p.22).
alter table player_state drop column if exists action_points;

-- Support totals are replaced by derived majority scoring.
alter table player_state drop column if exists influence_score;

-- Alliances are not a SHASN mechanic.
alter table player_state drop column if exists active_alliances;

-- The old two-axis ideology position is replaced by Ideology Card holdings.
alter table player_state drop column if exists ideology_position;

-- Resources held on the player mat. Cap 12 by default (p.11).
alter table player_state
  add column if not exists resources jsonb not null default
    '{"funds": 0, "clout": 0, "media": 0, "trust": 0}'::jsonb;

alter table player_state
  add column if not exists resource_cap int not null default 12;

-- Answered Ideology Cards kept under the player mat. Each entry records the
-- card and which Ideologue's answer was chosen (p.12).
--   [ { "cardId": "...", "ideologue": "capitalist" }, ... ]
alter table player_state
  add column if not exists ideology_cards jsonb not null default '[]'::jsonb;

-- Conspiracy Cards held in hand. No limit (p.18).
alter table player_state
  add column if not exists conspiracy_cards jsonb not null default '[]'::jsonb;

-- Per-turn use counters for Ideologue powers, reset at the start of each turn.
--   { "capitalist_l3": 0, "capitalist_l5": 2, ... }
alter table player_state
  add column if not exists power_uses jsonb not null default '{}'::jsonb;

-- Outstanding auction debt (p.11). No purchases allowed while > 0.
alter table player_state
  add column if not exists auction_debt int not null default 0;

-- Seat order, used for the staggered starting resources (p.6) and turn order.
alter table player_state
  add column if not exists seat_index int;

-- `hand` held policy/scandal card ids in the old model. Voter Cards are a shared
-- open market, not a hand, so this is no longer per-player.
alter table player_state drop column if exists hand;

-- ---------------------------------------------------------------------------
-- Turn tracking. SHASN turns have internal phases (p.22).
-- ---------------------------------------------------------------------------
alter table game_state
  add column if not exists turn_phase text not null default 'ideology';

-- The Ideology Card currently drawn for the active player, before they answer.
alter table game_state
  add column if not exists pending_ideology_card text;

-- Set when the board fills before all majorities form (p.19): every player takes
-- one final turn, starting with whoever filled the last area.
alter table game_state
  add column if not exists final_round_triggered_by uuid;

-- `round` is retained only as a turn counter for logging. SHASN has no fixed
-- round limit — the game ends when all majorities are settled.
comment on column game_state.round is
  'Turn counter for logging only. SHASN has no fixed round limit.';

-- ---------------------------------------------------------------------------
-- Trades (p.11) — structured propose / counter / accept.
-- ---------------------------------------------------------------------------
create table if not exists trades (
  id             uuid default gen_random_uuid() primary key,
  game_state_id  uuid references game_state(id) on delete cascade,
  proposer_id    uuid references lobby_players(id),
  target_id      uuid references lobby_players(id),
  -- { "resources": {"funds": 2}, "conspiracyCards": ["..."] }
  offer          jsonb not null default '{}'::jsonb,
  request        jsonb not null default '{}'::jsonb,
  status         text not null default 'pending',  -- pending | accepted | declined | countered | expired
  countered_from uuid references trades(id),
  created_at     timestamptz default now(),
  resolved_at    timestamptz
);

create index if not exists idx_trades_game_state on trades (game_state_id);
create index if not exists idx_trades_target on trades (target_id, status);

alter table trades enable row level security;

-- ---------------------------------------------------------------------------
-- Auctions (p.11) — bid beyond your holdings, repay across turns.
-- ---------------------------------------------------------------------------
create table if not exists auctions (
  id            uuid default gen_random_uuid() primary key,
  game_state_id uuid references game_state(id) on delete cascade,
  seller_id     uuid references lobby_players(id),   -- null when the Reserve sells
  item_type     text not null,                        -- conspiracy_card | voter_card | other
  item_ref      text,
  min_bid       int not null default 0,
  status        text not null default 'open',         -- open | resolved | discarded
  winner_id     uuid references lobby_players(id),
  winning_bid   int,
  created_at    timestamptz default now(),
  resolved_at   timestamptz
);

create table if not exists auction_bids (
  id         uuid default gen_random_uuid() primary key,
  auction_id uuid references auctions(id) on delete cascade,
  player_id  uuid references lobby_players(id),
  amount     int not null,
  created_at timestamptz default now()
);

create index if not exists idx_auctions_game_state on auctions (game_state_id, status);
create index if not exists idx_auction_bids_auction on auction_bids (auction_id);

alter table auctions enable row level security;
alter table auction_bids enable row level security;
