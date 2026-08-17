import { getSupabaseAdmin } from '../../lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { lobbyId, sessionToken } = req.body || {}
  if (!lobbyId || !sessionToken) return res.status(400).json({ error: 'Missing lobbyId or sessionToken' })

  const supabase = getSupabaseAdmin()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, status')
    .eq('id', lobbyId)
    .single()

  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })
  if (lobby.status !== 'waiting') return res.status(400).json({ error: 'Lobby is not in waiting state' })

  const { data: player, error: playerError } = await supabase
    .from('lobby_players')
    .select('id, is_ready')
    .eq('lobby_id', lobbyId)
    .eq('session_token', sessionToken)
    .single()

  if (playerError || !player) return res.status(403).json({ error: 'Player not in lobby' })

  const { data: updated, error: updateError } = await supabase
    .from('lobby_players')
    .update({ is_ready: !player.is_ready })
    .eq('id', player.id)
    .select('id, is_ready')
    .single()

  if (updateError) return res.status(500).json({ error: 'Could not update ready status' })

  return res.status(200).json({ playerId: updated.id, isReady: updated.is_ready })
}
