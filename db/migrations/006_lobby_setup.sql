-- 006 — pre-game setup (rulebook p.6, p.13)
--
-- The vote for Player 1, each player's chosen opening resources, and the content
-- advisory toggle all happen in the lobby before any game state exists. They are
-- kept as one JSON blob on the lobby row so Realtime broadcasts a single change
-- and every seat stays in step.
--
--   { step, round, votes, tally, order, resources, excludeAdvisory, skipped }
--
-- Safe to re-run.

alter table lobbies add column if not exists setup jsonb not null default '{}'::jsonb;

comment on column lobbies.setup is
  'Pre-game setup state: Player 1 vote, opening resource picks, content advisory (rulebook p.6, p.13).';
