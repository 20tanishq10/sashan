# Sashan — Election Strategy Game

A private, friends-only election strategy game built with Next.js and Supabase.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create a [Supabase](https://supabase.com) project and run migrations in order:
   - `db/migrations/001_init.sql`
   - `db/migrations/002_realtime_rls.sql`

3. Set environment variables in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

4. Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Current features (Phase 1)

- Create lobby with nickname → get a 6-character code
- Join lobby via code + nickname
- Live waiting room with player list (Supabase Realtime + polling fallback)
- Ready / unready toggle
- Host-only start game (min 3 players, all ready)
- Session token rejoin on refresh
- Leave lobby (host transfer if host leaves)

## Project structure

```
pages/
  index.js          — Home
  create.js         — Create lobby
  join.js           — Join lobby
  lobby/[code].js   — Waiting room
  game/[code].js    — Game room (Phase 2 placeholder)
  api/              — Server routes (authoritative mutations)
lib/
  session.js        — Client session token + player storage
  supabaseClient.js — Browser Supabase client (realtime)
  supabaseAdmin.js  — Server Supabase client (service role)
components/
  LobbyPlayerList.js
db/migrations/      — Postgres schema
```

## Next up (Phase 2)

- Voter bloc board UI
- Policy card play loop
- Turn order and AP spending
- Server-validated game actions

See `election-game-plan.md` for the full design.
