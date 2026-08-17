import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { applyAction } from '../../lib/game/state'
import { getWinner } from '../../lib/game/scoring'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code, sessionToken, action } = req.body || {}
  if (!code || !sessionToken || !action?.type) {
    return res.status(400).json({ error: 'Missing code, sessionToken, or action' })
  }

  const supabase = getSupabaseAdmin()
  const lobbyCode = code.trim().toUpperCase()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status')
    .eq('code', lobbyCode)
    .single()

  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })

  const { data: player, error: playerError } = await supabase
    .from('lobby_players')
    .select('id, nickname')
    .eq('lobby_id', lobby.id)
    .eq('session_token', sessionToken)
    .single()

  if (playerError || !player) return res.status(403).json({ error: 'Player not in game' })

  const { data: gameState, error: gameError } = await supabase
    .from('game_state')
    .select('*')
    .eq('lobby_id', lobby.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (gameError || !gameState) return res.status(404).json({ error: 'Game not found' })

  const { data: playerStates, error: psError } = await supabase
    .from('player_state')
    .select('*')
    .eq('game_state_id', gameState.id)

  if (psError) return res.status(500).json({ error: 'Could not load player states' })

  const { data: players } = await supabase
    .from('lobby_players')
    .select('id, nickname')
    .eq('lobby_id', lobby.id)

  const result = applyAction(
    gameState,
    playerStates,
    player.id,
    action,
    player.nickname
  )

  if (!result.ok) return res.status(400).json({ error: result.error })

  const { error: gsError } = await supabase
    .from('game_state')
    .update({
      round: result.gameState.round,
      phase: result.gameState.phase,
      board_state: result.gameState.board_state,
      current_turn_player_id: result.gameState.current_turn_player_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameState.id)

  if (gsError) return res.status(500).json({ error: 'Could not save game state' })

  for (const ps of result.playerStates) {
    await supabase
      .from('player_state')
      .update({
        hand: ps.hand,
        action_points: ps.action_points,
        influence_score: ps.influence_score,
      })
      .eq('id', ps.id)
  }

  if (result.gameOver) {
    const winner = getWinner(result.gameState, players || [])
    await supabase.from('lobbies').update({ status: 'finished' }).eq('id', lobby.id)
    return res.status(200).json({ ok: true, gameOver: true, winner })
  }

  return res.status(200).json({ ok: true, endedRound: result.endedRound || false })
}
