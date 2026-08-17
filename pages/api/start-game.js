import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { MIN_PLAYERS } from '../../lib/lobbyCodes'
import { initBoardState } from '../../lib/game/state'
import { STARTER_HAND } from '../../lib/game/cards'
import { AP_PER_ROUND } from '../../lib/game/constants'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { lobbyId, sessionToken } = req.body || {}
  if (!lobbyId || !sessionToken) return res.status(400).json({ error: 'Missing lobbyId or sessionToken' })

  const supabase = getSupabaseAdmin()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status, host_id')
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
  if (hostPlayer.id !== lobby.host_id) return res.status(403).json({ error: 'Only the host can start the game' })

  const { data: players, error: playersError } = await supabase
    .from('lobby_players')
    .select('id, is_ready')
    .eq('lobby_id', lobbyId)
    .order('joined_at', { ascending: true })

  if (playersError) return res.status(500).json({ error: 'Could not load players' })
  if (players.length < MIN_PLAYERS) {
    return res.status(400).json({ error: `Need at least ${MIN_PLAYERS} players to start` })
  }
  if (players.some((p) => !p.is_ready)) {
    return res.status(400).json({ error: 'All players must be ready' })
  }

  const playerIds = players.map((p) => p.id)
  const boardState = initBoardState(playerIds)

  const { data: gameState, error: gameError } = await supabase
    .from('game_state')
    .insert([{
      lobby_id: lobby.id,
      round: 1,
      phase: 'campaign',
      board_state: boardState,
      current_turn_player_id: playerIds[0],
    }])
    .select('id')
    .single()

  if (gameError) return res.status(500).json({ error: 'Could not create game state' })

  const playerStateRows = players.map((p) => ({
    game_state_id: gameState.id,
    player_id: p.id,
    hand: STARTER_HAND,
    action_points: AP_PER_ROUND,
    influence_score: 0,
    ideology_position: { tradition_progress: 50, centralized_local: 50 },
    active_alliances: [],
  }))

  const { error: playerStateError } = await supabase.from('player_state').insert(playerStateRows)
  if (playerStateError) {
    await supabase.from('game_state').delete().eq('id', gameState.id)
    return res.status(500).json({ error: 'Could not initialize player state' })
  }

  const { error: statusError } = await supabase
    .from('lobbies')
    .update({ status: 'in_progress' })
    .eq('id', lobby.id)

  if (statusError) return res.status(500).json({ error: 'Could not update lobby status' })

  return res.status(200).json({
    gameStateId: gameState.id,
    code: lobby.code,
  })
}
