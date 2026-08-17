-- Phase 2 game updates: publish the authoritative game tables so clients
-- subscribed in pages/game/[code].js receive card plays and turn changes.
alter publication supabase_realtime add table game_state;

-- Game data is read through the server API, but Realtime subscriptions need
-- SELECT access for the anonymous browser client.
alter table game_state enable row level security;
-- Hands and other player-specific data must never be directly readable by the
-- anonymous client. Server routes use the service role and remain unaffected.
alter table player_state enable row level security;

create policy "Allow public read on game_state"
  on game_state for select
  using (true);
