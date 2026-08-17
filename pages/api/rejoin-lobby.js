import { getSupabaseAdmin } from '../../lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code, sessionToken } = req.body || {}
  if (!code?.trim() || !sessionToken) {
    return res.status(400).json({ error: 'Code and sessionToken required' })
  }

  const supabase = getSupabaseAdmin()
  const lobbyCode = code.trim().toUpperCase()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status, host_id')
    .eq('code', lobbyCode)
    .single()

  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })

  const { data: player, error: playerError } = await supabase
    .from('lobby_players')
    .select('id, nickname')
    .eq('lobby_id', lobby.id)
    .eq('session_token', sessionToken)
    .single()

  if (playerError || !player) return res.status(404).json({ error: 'Not in this lobby' })

  return res.status(200).json({
    code: lobby.code,
    lobbyId: lobby.id,
    playerId: player.id,
    nickname: player.nickname,
    isHost: lobby.host_id === player.id,
  })
}
