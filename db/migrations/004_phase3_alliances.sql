-- Phase 3: Alliance pacts table for private per-player choice storage
-- Alliance proposals and resolutions are tracked here (server-side only).
-- The browser client never reads this table directly — it receives only
-- its own relevant alliance data via /api/game-state and /api/alliance-action.

create table if not exists alliance_pacts (
  id            text primary key,          -- matches the allianceId from board_state
  game_state_id uuid references game_state(id) on delete cascade,
  proposer_id   uuid references lobby_players(id),
  target_id     uuid references lobby_players(id),
  proposer_bloc text not null,
  target_bloc   text not null,
  round         int not null,
  status        text not null default 'pending',  -- pending | accepted | declined | resolved
  -- Private choices stored server-side only; never returned to opposing player
  proposer_choice text,   -- null | 'honor' | 'betray'
  target_choice   text,   -- null | 'honor' | 'betray'
  created_at    timestamptz default now(),
  resolved_at   timestamptz
);

create index if not exists idx_alliance_pacts_game_state
  on alliance_pacts (game_state_id);

create index if not exists idx_alliance_pacts_proposer
  on alliance_pacts (proposer_id);

create index if not exists idx_alliance_pacts_target
  on alliance_pacts (target_id);

-- RLS: no direct client access — all reads/writes via service-role API routes
alter table alliance_pacts enable row level security;
-- No SELECT policy intentionally: the server API uses service role and bypasses RLS.
