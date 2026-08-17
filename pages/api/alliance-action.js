/**
 * POST /api/alliance-action
 *
 * Handles all alliance lifecycle operations:
 *   action.type === 'accept'   — target player accepts a pending proposal
 *   action.type === 'decline'  — target player declines a pending proposal
 *   action.type === 'resolve'  — either party submits their honor/betray choice
 *                                at a scoring checkpoint; once both choices are in
 *                                the outcome is applied to game_state immediately.
 *
 * Note: The *proposal* itself is created via the normal /api/game-action route
 * (action type 'propose_alliance'), which writes the pending alliance into
 * board_state and costs the proposer 1 AP. This route handles everything after.
 *
 * Body: { code, sessionToken, allianceId, action: { type, choice? } }
 */
import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { applyAllianceOutcome } from '../../lib/game/scoring'
import { getWinner } from '../../lib/game/scoring'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code, sessionToken, allianceId, action } = req.body || {}
  if (!code || !sessionToken || !allianceId || !action?.type) {
    return res.status(400).json({ error: 'Missing code, sessionToken, allianceId, or action' })
  }

  const supabase = getSupabaseAdmin()
  const lobbyCode = code.trim().toUpperCase()

  // --- Resolve lobby and player ---
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

  // --- Load game state ---
  const { data: gameState, error: gameError } = await supabase
    .from('game_state')
    .select('*')
    .eq('lobby_id', lobby.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (gameError || !gameState) return res.status(404).json({ error: 'Game not found' })
  if (gameState.phase === 'finished') return res.status(400).json({ error: 'Game is over' })

  // --- Load the alliance pact record ---
  const { data: pact, error: pactError } = await supabase
    .from('alliance_pacts')
    .select('*')
    .eq('id', allianceId)
    .eq('game_state_id', gameState.id)
    .single()
  if (pactError || !pact) return res.status(404).json({ error: 'Alliance not found' })

  const isProposer = pact.proposer_id === player.id
  const isTarget = pact.target_id === player.id
  if (!isProposer && !isTarget) {
    return res.status(403).json({ error: 'You are not party to this alliance' })
  }

  // ---------------------------------------------------------------------------
  // ACCEPT
  // ---------------------------------------------------------------------------
  if (action.type === 'accept') {
    if (!isTarget) return res.status(403).json({ error: 'Only the target can accept' })
    if (pact.status !== 'pending') return res.status(400).json({ error: 'Alliance is not pending' })

    const { error: updateError } = await supabase
      .from('alliance_pacts')
      .update({ status: 'accepted' })
      .eq('id', allianceId)
    if (updateError) return res.status(500).json({ error: 'Could not accept alliance' })

    // Reflect acceptance in board_state log
    const boardState = { ...(gameState.board_state || {}) }
    const log = [...(boardState.log || []), {
      type: 'alliance_accepted',
      playerId: player.id,
      targetPlayerId: pact.proposer_id,
      message: `${player.nickname} accepted a secret alliance`,
      at: new Date().toISOString(),
    }]
    const newBoard = { ...boardState, log: log.slice(-50) }

    await supabase
      .from('game_state')
      .update({ board_state: newBoard, updated_at: new Date().toISOString() })
      .eq('id', gameState.id)

    return res.status(200).json({ ok: true, status: 'accepted' })
  }

  // ---------------------------------------------------------------------------
  // DECLINE
  // ---------------------------------------------------------------------------
  if (action.type === 'decline') {
    if (!isTarget) return res.status(403).json({ error: 'Only the target can decline' })
    if (pact.status !== 'pending') return res.status(400).json({ error: 'Alliance is not pending' })

    const { error: updateError } = await supabase
      .from('alliance_pacts')
      .update({ status: 'declined' })
      .eq('id', allianceId)
    if (updateError) return res.status(500).json({ error: 'Could not decline alliance' })

    // Remove from pendingAlliances in board_state
    const boardState = { ...(gameState.board_state || {}) }
    const pendingAlliances = (boardState.pendingAlliances || []).filter((a) => a.id !== allianceId)
    const log = [...(boardState.log || []), {
      type: 'alliance_declined',
      playerId: player.id,
      message: `An alliance proposal was declined`,
      at: new Date().toISOString(),
    }]
    const newBoard = { ...boardState, pendingAlliances, log: log.slice(-50) }

    await supabase
      .from('game_state')
      .update({ board_state: newBoard, updated_at: new Date().toISOString() })
      .eq('id', gameState.id)

    return res.status(200).json({ ok: true, status: 'declined' })
  }

  // ---------------------------------------------------------------------------
  // RESOLVE — submit honor/betray choice
  // ---------------------------------------------------------------------------
  if (action.type === 'resolve') {
    const { choice } = action
    if (choice !== 'honor' && choice !== 'betray') {
      return res.status(400).json({ error: 'Choice must be "honor" or "betray"' })
    }
    if (pact.status !== 'accepted') {
      return res.status(400).json({ error: 'Alliance must be accepted before resolving' })
    }

    // Store this player's choice
    const choiceField = isProposer ? 'proposer_choice' : 'target_choice'
    const { error: choiceError } = await supabase
      .from('alliance_pacts')
      .update({ [choiceField]: choice })
      .eq('id', allianceId)
    if (choiceError) return res.status(500).json({ error: 'Could not save choice' })

    // Re-fetch to check if both choices are now in
    const { data: updatedPact } = await supabase
      .from('alliance_pacts')
      .select('*')
      .eq('id', allianceId)
      .single()

    const proposerChoice = updatedPact.proposer_choice
    const targetChoice = updatedPact.target_choice

    // If both choices are in, apply the outcome
    if (proposerChoice && targetChoice) {
      const boardState = { ...(gameState.board_state || {}) }

      const allianceDef = {
        proposerId: pact.proposer_id,
        targetId: pact.target_id,
        proposerBloc: pact.proposer_bloc,
        targetBloc: pact.target_bloc,
      }
      const choices = { [pact.proposer_id]: proposerChoice, [pact.target_id]: targetChoice }
      let newBoard = applyAllianceOutcome(boardState, allianceDef, choices)

      // Build a public-facing outcome message (doesn't reveal individual choices)
      let outcomeMsg
      if (proposerChoice === 'honor' && targetChoice === 'honor') {
        outcomeMsg = 'Both parties honoured their alliance — mutual gains applied.'
      } else if (proposerChoice === 'betray' && targetChoice === 'betray') {
        outcomeMsg = 'Both parties betrayed — mutual losses applied.'
      } else {
        outcomeMsg = 'One party betrayed the alliance — the betrayer gains, the honoured party loses.'
      }

      // Load proposer + target nicknames for the log
      const { data: allPlayers } = await supabase
        .from('lobby_players')
        .select('id, nickname')
        .eq('lobby_id', lobby.id)
      const proposerPlayer = (allPlayers || []).find((p) => p.id === pact.proposer_id)
      const targetPlayer = (allPlayers || []).find((p) => p.id === pact.target_id)

      const log = [...(newBoard.log || []), {
        type: 'alliance_resolved',
        proposerId: pact.proposer_id,
        targetId: pact.target_id,
        proposerChoice,
        targetChoice,
        message: `Alliance resolved — ${proposerPlayer?.nickname || '?'} & ${targetPlayer?.nickname || '?'}: ${outcomeMsg}`,
        at: new Date().toISOString(),
      }]

      // Move from pendingAlliances → resolvedAlliances
      const pendingAlliances = (newBoard.pendingAlliances || []).filter((a) => a.id !== allianceId)
      const resolvedAlliances = [
        ...(newBoard.resolvedAlliances || []),
        {
          ...allianceDef,
          id: allianceId,
          round: pact.round,
          choices,
          resolvedAt: new Date().toISOString(),
        },
      ]

      newBoard = { ...newBoard, pendingAlliances, resolvedAlliances, log: log.slice(-50) }

      // Optimistic-lock the game_state update
      const { data: saved, error: saveError } = await supabase
        .from('game_state')
        .update({ board_state: newBoard, updated_at: new Date().toISOString() })
        .eq('id', gameState.id)
        .eq('updated_at', gameState.updated_at)
        .select('id')

      if (saveError) return res.status(500).json({ error: 'Could not save alliance outcome' })
      if (!saved?.length) return res.status(409).json({ error: 'Game state changed. Please retry.' })

      // Mark pact as resolved
      await supabase
        .from('alliance_pacts')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', allianceId)

      // Also update influence_scores in player_state for both players
      const { data: playerStates } = await supabase
        .from('player_state')
        .select('id, player_id')
        .eq('game_state_id', gameState.id)
        .in('player_id', [pact.proposer_id, pact.target_id])

      for (const ps of playerStates || []) {
        const support = newBoard.playerSupport?.[ps.player_id] || {}
        const newScore = Object.values(support).reduce((s, v) => s + v, 0)
        await supabase
          .from('player_state')
          .update({ influence_score: newScore })
          .eq('id', ps.id)
      }

      return res.status(200).json({
        ok: true,
        status: 'resolved',
        proposerChoice,
        targetChoice,
        outcomeMsg,
      })
    }

    // One choice in, waiting for the other
    return res.status(200).json({ ok: true, status: 'waiting_for_partner' })
  }

  return res.status(400).json({ error: 'Unknown alliance action type' })
}
