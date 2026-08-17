import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { generateLobbyCode } from '../../lib/lobbyCodes'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { nickname, sessionToken } = req.body || {}
  if (!nickname?.trim()) return res.status(400).json({ error: 'Nickname is required' })
  if (!sessionToken) return res.status(400).json({ error: 'Session token is required' })

  const supabase = getSupabaseAdmin()
  const trimmedNickname = nickname.trim().slice(0, 20)

  for (let i = 0; i < 8; i++) {
    const code = generateLobbyCode()

    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .insert([{ code, status: 'waiting' }])
      .select('id, code')
      .single()

    if (lobbyError) continue

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

    if (playerError) {
      await supabase.from('lobbies').delete().eq('id', lobby.id)
      return res.status(500).json({ error: 'Could not add host to lobby' })
    }

    const { error: hostError } = await supabase
      .from('lobbies')
      .update({ host_id: player.id })
      .eq('id', lobby.id)

    if (hostError) {
      return res.status(500).json({ error: 'Could not set lobby host' })
    }

    return res.status(200).json({
      code: lobby.code,
      lobbyId: lobby.id,
      playerId: player.id,
      nickname: player.nickname,
      isHost: true,
    })
  }

  return res.status(500).json({ error: 'Could not create lobby' })
}
