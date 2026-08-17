import { getSupabaseAdmin } from '../../lib/supabaseAdmin'

export default async function handler(req, res) {
  const code = (req.query.code || '').trim().toUpperCase()
  const sessionToken = req.query.sessionToken || req.body?.sessionToken

  if (!code) return res.status(400).json({ error: 'Lobby code is required' })

  const supabase = getSupabaseAdmin()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status')
    .eq('code', code)
    .single()
  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })
  if (lobby.status !== 'in_progress' && lobby.status !== 'finished') {
    return res.status(400).json({ error: 'Game has not started' })
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

  const { data: playerStates, error: psError } = await supabase
    .from('player_state')
    .select('*')
    .eq('game_state_id', gameState.id)
  if (psError) return res.status(500).json({ error: 'Could not load player states' })

  let myPlayerId = null
  let myPlayerState = null

  if (sessionToken) {
    const { data: lp } = await supabase
      .from('lobby_players')
      .select('id, nickname')
      .eq('lobby_id', lobby.id)
      .eq('session_token', sessionToken)
      .maybeSingle()

    if (lp) {
      myPlayerId = lp.id
      myPlayerState = playerStates.find((s) => s.player_id === lp.id) || null

      // --- Alliance data for this player only ---
      // Fetch pacts where this player is proposer or target, not yet resolved
      const { data: myPacts } = await supabase
        .from('alliance_pacts')
        .select('id, proposer_id, target_id, proposer_bloc, target_bloc, round, status, proposer_choice, target_choice')
        .eq('game_state_id', gameState.id)
        .in('status', ['pending', 'accepted'])
        .or(`proposer_id.eq.${lp.id},target_id.eq.${lp.id}`)

      // Sanitise: never expose the opponent's choice to this player
      const myAlliances = (myPacts || []).map((pact) => {
        const isProposer = pact.proposer_id === lp.id
        return {
          id: pact.id,
          proposerId: pact.proposer_id,
          targetId: pact.target_id,
          proposerBloc: pact.proposer_bloc,
          targetBloc: pact.target_bloc,
          round: pact.round,
          status: pact.status,
          // Only tell this player whether THEY have submitted a choice, not the opponent's
          myChoice: isProposer ? (pact.proposer_choice || null) : (pact.target_choice || null),
          partnerChoseYet: isProposer
            ? pact.target_choice !== null
            : pact.proposer_choice !== null,
        }
      })

      return res.status(200).json({
        lobby: { id: lobby.id, code: lobby.code, status: lobby.status },
        gameState,
        players,
        myPlayerId,
        myPlayerState,
        myAlliances,
      })
    }
  }

  return res.status(200).json({
    lobby: { id: lobby.id, code: lobby.code, status: lobby.status },
    gameState,
    players,
    myPlayerId,
    myPlayerState,
    myAlliances: [],
  })
}
