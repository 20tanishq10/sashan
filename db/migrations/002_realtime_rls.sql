-- Indexes and constraints for lobby lookups
create unique index if not exists idx_lobby_players_lobby_session
  on lobby_players (lobby_id, session_token);

create index if not exists idx_lobby_players_lobby_id
  on lobby_players (lobby_id);

create index if not exists idx_lobbies_code
  on lobbies (code);

-- Enable Realtime for lobby tables (run in Supabase dashboard if this fails)
alter publication supabase_realtime add table lobby_players;
alter publication supabase_realtime add table lobbies;

-- RLS: allow anonymous reads for realtime sync (mutations go through API with service role)
alter table lobbies enable row level security;
alter table lobby_players enable row level security;

create policy "Allow public read on lobbies"
  on lobbies for select
  using (true);

create policy "Allow public read on lobby_players"
  on lobby_players for select
  using (true);
