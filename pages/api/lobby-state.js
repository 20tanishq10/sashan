import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import * as Setup from '../../lib/shasn/setup'

export default async function handler(req, res) {
  const code = (req.query.code || req.body?.code || '').trim().toUpperCase()
  if (!code) return res.status(400).json({ error: 'Lobby code is required' })

  const supabase = getSupabaseAdmin()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status, host_id, max_players, created_at, setup')
    .eq('code', code)
    .single()

  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })

  const { data: players, error: playersError } = await supabase
    .from('lobby_players')
    .select('id, nickname, is_ready, joined_at')
    .eq('lobby_id', lobby.id)
    .order('joined_at', { ascending: true })

  if (playersError) return res.status(500).json({ error: 'Could not load players' })

  return res.status(200).json({
    lobby: {
      id: lobby.id,
      code: lobby.code,
      status: lobby.status,
      hostId: lobby.host_id,
      maxPlayers: lobby.max_players,
      setup: Setup.normaliseSetup(lobby.setup),
    },
    players: players || [],
  })
}
