import { getSupabaseAdmin } from '../../lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { lobbyId, sessionToken } = req.body || {}
  if (!lobbyId || !sessionToken) return res.status(400).json({ error: 'Missing lobbyId or sessionToken' })

  const supabase = getSupabaseAdmin()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, status, host_id')
    .eq('id', lobbyId)
    .single()

  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })

  const { data: player, error: playerError } = await supabase
    .from('lobby_players')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('session_token', sessionToken)
    .single()

  if (playerError || !player) return res.status(403).json({ error: 'Player not in lobby' })

  await supabase.from('lobby_players').delete().eq('id', player.id)

  if (player.id === lobby.host_id && lobby.status === 'waiting') {
    const { data: remaining } = await supabase
      .from('lobby_players')
      .select('id')
      .eq('lobby_id', lobbyId)
      .order('joined_at', { ascending: true })
      .limit(1)

    if (remaining?.length) {
      await supabase.from('lobbies').update({ host_id: remaining[0].id }).eq('id', lobbyId)
    } else {
      await supabase.from('lobbies').delete().eq('id', lobbyId)
    }
  }

  return res.status(200).json({ ok: true })
}
