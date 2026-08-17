/**
 * POST /api/rejoin-game
 *
 * Called when a player lands on /game/[code] without a stored session
 * (e.g. page refresh, different tab, or browser restart mid-game).
 *
 * Looks up the session token against lobby_players for the given lobby code,
 * even when the game is already in_progress or finished.
 *
 * Body: { code, sessionToken }
 * Returns: { code, lobbyId, playerId, nickname, isHost }
 */
import { getSupabaseAdmin } from '../../lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code, sessionToken } = req.body || {}
  if (!code?.trim() || !sessionToken) {
    return res.status(400).json({ error: 'code and sessionToken are required' })
  }

  const supabase = getSupabaseAdmin()
  const lobbyCode = code.trim().toUpperCase()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status, host_id')
    .eq('code', lobbyCode)
    .single()

  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })

  // Allow rejoin during active game or after it finishes
  if (lobby.status !== 'in_progress' && lobby.status !== 'finished') {
    return res.status(400).json({ error: 'Game is not active' })
  }

  const { data: player, error: playerError } = await supabase
    .from('lobby_players')
    .select('id, nickname')
    .eq('lobby_id', lobby.id)
    .eq('session_token', sessionToken)
    .maybeSingle()

  if (playerError) return res.status(500).json({ error: 'Could not look up player' })
  if (!player) return res.status(404).json({ error: 'No player found for this session' })

  return res.status(200).json({
    code: lobby.code,
    lobbyId: lobby.id,
    playerId: player.id,
    nickname: player.nickname,
    isHost: lobby.host_id === player.id,
  })
}
