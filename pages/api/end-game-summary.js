/**
 * GET /api/end-game-summary?code=XXXX
 *
 * Aggregates everything needed for the post-game summary screen:
 *   - winner + final standings
 *   - per-checkpoint standings snapshots (from board_state.checkpointSnapshots)
 *   - all resolved alliances with both choices revealed
 *   - event cards that fired (from board_state.usedEventIds)
 *   - full player list for nickname resolution
 *
 * Public route — no sessionToken required (game is over, nothing private to protect).
 */
import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { getWinner, getStandings } from '../../lib/game/scoring'
import { getEventCard } from '../../lib/game/cards'

export default async function handler(req, res) {
  const code = (req.query.code || '').trim().toUpperCase()
  if (!code) return res.status(400).json({ error: 'Lobby code is required' })

  const supabase = getSupabaseAdmin()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status')
    .eq('code', code)
    .single()
  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })
  if (lobby.status !== 'finished') {
    return res.status(400).json({ error: 'Game is not finished yet' })
  }

  const { data: gameState, error: gameError } = await supabase
    .from('game_state')
    .select('*')
    .eq('lobby_id', lobby.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (gameError || !gameState) return res.status(404).json({ error: 'Game state not found' })

  const { data: players, error: playersError } = await supabase
    .from('lobby_players')
    .select('id, nickname, joined_at')
    .eq('lobby_id', lobby.id)
    .order('joined_at', { ascending: true })
  if (playersError) return res.status(500).json({ error: 'Could not load players' })

  // --- Final standings ---
  const finalStandings = getStandings(gameState, players)
  const winner = getWinner(gameState, players)

  // --- Checkpoint snapshots from board_state ---
  // board_state.checkpointSnapshots is { [round]: [ { playerId, nickname, total } ] }
  const rawSnapshots = gameState.board_state?.checkpointSnapshots || {}
  const checkpointSnapshots = Object.entries(rawSnapshots)
    .map(([round, snapshot]) => ({ round: Number(round), snapshot }))
    .sort((a, b) => a.round - b.round)

  // --- Resolved alliances from DB (both choices now safe to reveal) ---
  const { data: resolvedPacts } = await supabase
    .from('alliance_pacts')
    .select('id, proposer_id, target_id, proposer_bloc, target_bloc, round, proposer_choice, target_choice, resolved_at')
    .eq('game_state_id', gameState.id)
    .eq('status', 'resolved')
    .order('resolved_at', { ascending: true })

  function nicknameOf(id) {
    return players.find((p) => p.id === id)?.nickname || '?'
  }

  const resolvedAlliances = (resolvedPacts || []).map((pact) => {
    const pc = pact.proposer_choice
    const tc = pact.target_choice
    let outcome
    if (pc === 'honor' && tc === 'honor') outcome = 'mutual_honor'
    else if (pc === 'betray' && tc === 'betray') outcome = 'mutual_betray'
    else if (pc === 'betray') outcome = 'proposer_betrayed'
    else outcome = 'target_betrayed'

    return {
      id: pact.id,
      round: pact.round,
      proposerNickname: nicknameOf(pact.proposer_id),
      targetNickname: nicknameOf(pact.target_id),
      proposerBloc: pact.proposer_bloc,
      targetBloc: pact.target_bloc,
      proposerChoice: pc,
      targetChoice: tc,
      outcome,
    }
  })

  // --- Events that fired ---
  const usedEventIds = gameState.board_state?.usedEventIds || []
  const eventsFired = usedEventIds
    .map((id) => getEventCard(id))
    .filter(Boolean)
    .map((ev) => ({ id: ev.id, name: ev.name, description: ev.description, effects: ev.effects }))

  return res.status(200).json({
    winner,
    finalStandings,
    checkpointSnapshots,
    resolvedAlliances,
    eventsFired,
    players,
    totalRounds: gameState.round,
  })
}
