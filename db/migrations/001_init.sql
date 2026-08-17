-- Initial schema for lobbies and game state
create table if not exists lobbies (
  id uuid default gen_random_uuid() primary key,
  code varchar(6) unique not null,
  host_id uuid,
  status text not null default 'waiting',
  max_players int not null default 6,
  created_at timestamptz default now()
);

create table if not exists lobby_players (
  id uuid default gen_random_uuid() primary key,
  lobby_id uuid references lobbies(id),
  nickname text not null,
  session_token text not null,
  is_ready boolean default false,
  joined_at timestamptz default now()
);

create table if not exists game_state (
  id uuid default gen_random_uuid() primary key,
  lobby_id uuid references lobbies(id),
  round int default 1,
  phase text default 'draw',
  board_state jsonb,
  current_turn_player_id uuid,
  updated_at timestamptz default now()
);

create table if not exists player_state (
  id uuid default gen_random_uuid() primary key,
  game_state_id uuid references game_state(id),
  player_id uuid references lobby_players(id),
  hand jsonb,
  action_points int default 3,
  influence_score int default 0,
  ideology_position jsonb,
  active_alliances jsonb
);
