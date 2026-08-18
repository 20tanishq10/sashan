import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { hydrate, viewFor } from '../../lib/shasn/persistence'
import { getStandings, isStalled } from '../../lib/shasn/game'

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

  if (lobby.status === 'waiting') {
    return res.status(200).json({ lobby, gameState: null, game: null })
  }

  const { data: row, error: gameError } = await supabase
    .from('game_state')
    .select('*')
    .eq('lobby_id', lobby.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (gameError || !row) return res.status(404).json({ error: 'Game state not found' })

  const game = hydrate(row)
  if (!game) {
    // A game created by the retired lib/game/ engine. Its shape is not
    // convertible, so say so plainly rather than rendering a broken board.
    return res.status(409).json({
      error:
        'This game was created by the previous engine and cannot be loaded. Start a new lobby.',
      legacy: true,
    })
  }

  // Identify the caller.
  let myPlayerId = null
  let isSpectator = true
  if (sessionToken) {
    const { data: lp } = await supabase
      .from('lobby_players')
      .select('id')
      .eq('lobby_id', lobby.id)
      .eq('session_token', sessionToken)
      .maybeSingle()
    if (lp && game.players.some((p) => p.id === lp.id)) {
      myPlayerId = lp.id
      isSpectator = false
    }
  }

  return res.status(200).json({
    lobby,
    gameStateId: row.id,
    updatedAt: row.updated_at,
    game: viewFor(game, myPlayerId),
    myPlayerId,
    isSpectator,
    standings: getStandings(game),
    stalled: isStalled(game),
  })
}
