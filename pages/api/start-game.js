import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { createGame } from '../../lib/shasn/game'
import { MIN_PLAYERS, MAX_PLAYERS } from '../../lib/shasn/constants'
import { mirrorColumns } from '../../lib/shasn/persistence'
import * as Setup from '../../lib/shasn/setup'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { lobbyId, sessionToken } = req.body || {}
  if (!lobbyId || !sessionToken) {
    return res.status(400).json({ error: 'Missing lobbyId or sessionToken' })
  }

  const supabase = getSupabaseAdmin()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status, host_id, setup')
    .eq('id', lobbyId)
    .single()

  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })
  if (lobby.status !== 'waiting') return res.status(400).json({ error: 'Game already started' })

  const { data: hostPlayer, error: hostError } = await supabase
    .from('lobby_players')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('session_token', sessionToken)
    .single()

  if (hostError || !hostPlayer) return res.status(403).json({ error: 'Player not in lobby' })
  if (hostPlayer.id !== lobby.host_id) {
    return res.status(403).json({ error: 'Only the host can start the game' })
  }

  const { data: players, error: playersError } = await supabase
    .from('lobby_players')
    .select('id, nickname, is_ready')
    .eq('lobby_id', lobbyId)
    .order('joined_at', { ascending: true })

  if (playersError) return res.status(500).json({ error: 'Could not load players' })

  // The box ships 5 player mats (rulebook p.3). 2-player is a separate board side
  // and is not wired into the lobby flow yet.
  if (players.length < MIN_PLAYERS) {
    return res.status(400).json({ error: `Need at least ${MIN_PLAYERS} players to start` })
  }
  if (players.length > MAX_PLAYERS) {
    return res.status(400).json({ error: `SHASN supports at most ${MAX_PLAYERS} players` })
  }
  if (players.some((p) => !p.is_ready)) {
    return res.status(400).json({ error: 'All players must be ready' })
  }

  // p.6 — the table votes for Player 1 and each player picks their own opening
  // resources; p.13 — advisory cards may be removed. All of that is settled in
  // the lobby and read here once. A lobby that skipped setup falls back to join
  // order and the engine's round-robin resource spread.
  const setup = Setup.normaliseSetup(lobby.setup)
  if (!Setup.isReady(setup)) {
    const outstanding = Setup.waitingOn(setup, players)
      .map((id) => players.find((p) => p.id === id)?.nickname)
      .filter(Boolean)
    return res.status(400).json({
      error:
        setup.step === Setup.SETUP_STEPS.VOTE
          ? `Still voting for Player 1 — waiting on ${outstanding.join(', ') || 'the table'}`
          : `Waiting on opening resources from ${outstanding.join(', ') || 'the table'}`,
    })
  }

  const byId = new Map(players.map((p) => [p.id, p]))
  const seated = (setup.order || players.map((p) => p.id))
    .map((id) => byId.get(id))
    .filter(Boolean)
  // Anyone who joined after the vote still gets a seat, at the back.
  for (const p of players) if (!seated.includes(p)) seated.push(p)

  const created = createGame({
    players: seated.map((p) => ({ id: p.id, name: p.nickname })),
    seed: Math.floor(Math.random() * 2 ** 31),
    startingResources: setup.resources,
    excludeAdvisory: setup.excludeAdvisory,
  })
  if (created.error) return res.status(400).json({ error: created.error })

  const game = { ...created.game, rngTicks: 0 }

  const { data: gameState, error: gameError } = await supabase
    .from('game_state')
    .insert([{ lobby_id: lobby.id, ...mirrorColumns(game) }])
    .select('id')
    .single()

  if (gameError) {
    return res.status(500).json({ error: `Could not create game state: ${gameError.message}` })
  }

  // player_state rows are kept as thin pointers so existing joins and the
  // rejoin flow keep working. The engine's own player objects are authoritative.
  const rows = seated.map((p, i) => ({
    game_state_id: gameState.id,
    player_id: p.id,
    seat_index: i,
  }))
  const { error: psError } = await supabase.from('player_state').insert(rows)
  if (psError) {
    await supabase.from('game_state').delete().eq('id', gameState.id)
    return res.status(500).json({ error: `Could not initialise players: ${psError.message}` })
  }

  const { error: statusError } = await supabase
    .from('lobbies')
    .update({ status: 'in_progress' })
    .eq('id', lobby.id)

  if (statusError) return res.status(500).json({ error: 'Could not update lobby status' })

  return res.status(200).json({ gameStateId: gameState.id, code: lobby.code })
}
