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

  // --- Lobby ---
  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status')
    .eq('code', lobbyCode)
    .single()
  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })

  // --- Player ---
  const { data: player, error: playerError } = await supabase
    .from('lobby_players')
    .select('id, nickname')
    .eq('lobby_id', lobby.id)
    .eq('session_token', sessionToken)
    .single()
  if (playerError || !player) return res.status(403).json({ error: 'Player not in game' })

  // --- Game state ---
  const { data: gameState, error: gameError } = await supabase
    .from('game_state')
    .select('*')
    .eq('lobby_id', lobby.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (gameError || !gameState) return res.status(404).json({ error: 'Game not found' })

  // --- Player states ---
  const { data: playerStates, error: psError } = await supabase
    .from('player_state')
    .select('*')
    .eq('game_state_id', gameState.id)
  if (psError) return res.status(500).json({ error: 'Could not load player states' })

  // --- All players (for winner calculation and nicknames) ---
  const { data: players } = await supabase
    .from('lobby_players')
    .select('id, nickname')
    .eq('lobby_id', lobby.id)

  // Validate scandal card target is actually in this game
  if (action.type === 'play_card' && action.targetPlayerId) {
    const targetInGame = (players || []).some((p) => p.id === action.targetPlayerId)
    if (!targetInGame) return res.status(400).json({ error: 'Target player not in this game' })
  }

  // --- Apply action (pure logic) ---
  const result = applyAction(
    gameState,
    playerStates,
    player.id,
    action,
    player.nickname
  )
  if (!result.ok) return res.status(400).json({ error: result.error })

  // --- Commit game state (optimistic lock on updated_at) ---
  const { data: savedGameStates, error: gsError } = await supabase
    .from('game_state')
    .update({
      round: result.gameState.round,
      phase: result.gameState.phase,
      board_state: result.gameState.board_state,
      current_turn_player_id: result.gameState.current_turn_player_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameState.id)
    .eq('updated_at', gameState.updated_at)
    .select('id')

  if (gsError) return res.status(500).json({ error: 'Could not save game state' })
  if (!savedGameStates?.length) {
    return res.status(409).json({ error: 'The game changed. Please try that action again.' })
  }

  // --- Commit player states ---
  for (const ps of result.playerStates) {
    const { error: updateErr } = await supabase
      .from('player_state')
      .update({
        hand: ps.hand,
        action_points: ps.action_points,
        influence_score: ps.influence_score,
      })
      .eq('id', ps.id)
    if (updateErr) return res.status(500).json({ error: 'Could not save player state' })
  }

  // --- Alliance proposal: write the pact row ---
  if (action.type === 'propose_alliance') {
    const allianceId = `alliance_${player.id}_${action.targetPlayerId}_r${gameState.round}`
    const { error: pactError } = await supabase
      .from('alliance_pacts')
      .upsert({
        id: allianceId,
        game_state_id: gameState.id,
        proposer_id: player.id,
        target_id: action.targetPlayerId,
        proposer_bloc: action.proposerBloc,
        target_bloc: action.targetBloc,
        round: gameState.round,
        status: 'pending',
      })
    if (pactError) {
      // Non-fatal — the board_state already has the pending alliance recorded
      console.error('Could not write alliance_pacts row:', pactError.message)
    }
    return res.status(200).json({ ok: true, allianceProposed: true, allianceId })
  }

  // --- Game over ---
  if (result.gameOver) {
    const winner = getWinner(result.gameState, players || [])
    await supabase.from('lobbies').update({ status: 'finished' }).eq('id', lobby.id)
    return res.status(200).json({ ok: true, gameOver: true, winner })
  }

  return res.status(200).json({
    ok: true,
    endedRound: result.endedRound || false,
    isCheckpoint: result.isCheckpoint || false,
    firedEvent: result.firedEvent
      ? { id: result.firedEvent.id, name: result.firedEvent.name, description: result.firedEvent.description }
      : null,
  })
}
