import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { MAX_PLAYERS } from '../../lib/lobbyCodes'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code, nickname, sessionToken } = req.body || {}
  if (!code?.trim()) return res.status(400).json({ error: 'Lobby code is required' })
  if (!nickname?.trim()) return res.status(400).json({ error: 'Nickname is required' })
  if (!sessionToken) return res.status(400).json({ error: 'Session token is required' })

  const supabase = getSupabaseAdmin()
  const lobbyCode = code.trim().toUpperCase()
  const trimmedNickname = nickname.trim().slice(0, 20)

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, code, status, host_id, max_players')
    .eq('code', lobbyCode)
    .single()

  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })
  if (lobby.status !== 'waiting') return res.status(400).json({ error: 'Lobby is no longer accepting players' })

  const { data: existingPlayer } = await supabase
    .from('lobby_players')
    .select('id, nickname, is_ready')
    .eq('lobby_id', lobby.id)
    .eq('session_token', sessionToken)
    .maybeSingle()

  if (existingPlayer) {
    return res.status(200).json({
      code: lobby.code,
      lobbyId: lobby.id,
      playerId: existingPlayer.id,
      nickname: existingPlayer.nickname,
      isHost: lobby.host_id === existingPlayer.id,
      rejoined: true,
    })
  }

  const { count, error: countError } = await supabase
    .from('lobby_players')
    .select('id', { count: 'exact', head: true })
    .eq('lobby_id', lobby.id)

  if (countError) return res.status(500).json({ error: 'Could not check lobby capacity' })
  if (count >= (lobby.max_players || MAX_PLAYERS)) {
    return res.status(400).json({ error: 'Lobby is full' })
  }

  const { data: player, error: playerError } = await supabase
    .from('lobby_players')
    .insert([{
      lobby_id: lobby.id,
      nickname: trimmedNickname,
      session_token: sessionToken,
      is_ready: false,
    }])
    .select('id, nickname, is_ready')
    .single()

  if (playerError) return res.status(500).json({ error: 'Could not join lobby' })

  return res.status(200).json({
    code: lobby.code,
    lobbyId: lobby.id,
    playerId: player.id,
    nickname: player.nickname,
    isHost: lobby.host_id === player.id,
    rejoined: false,
  })
}
