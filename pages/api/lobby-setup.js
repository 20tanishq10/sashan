// Pre-game setup actions (rulebook p.6, p.13).
//
// Everything lives in `lobbies.setup` as JSON so all seats read the same state
// over Realtime. The engine functions in lib/shasn/setup.js are pure; this
// handler just does authentication, loads, and the write-back.

import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import * as Setup from '../../lib/shasn/setup'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { lobbyId, sessionToken, action, ...payload } = req.body || {}
  if (!lobbyId || !sessionToken || !action) {
    return res.status(400).json({ error: 'Missing lobbyId, sessionToken or action' })
  }

  const supabase = getSupabaseAdmin()

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id, status, host_id, setup')
    .eq('id', lobbyId)
    .single()

  if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' })
  if (lobby.status !== 'waiting') return res.status(400).json({ error: 'The game has already started' })

  const { data: me, error: meError } = await supabase
    .from('lobby_players')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('session_token', sessionToken)
    .single()

  if (meError || !me) return res.status(403).json({ error: 'You are not in this lobby' })

  const { data: players, error: playersError } = await supabase
    .from('lobby_players')
    .select('id, nickname')
    .eq('lobby_id', lobbyId)
    .order('joined_at', { ascending: true })

  if (playersError) return res.status(500).json({ error: 'Could not load players' })

  const isHost = me.id === lobby.host_id
  const setup = Setup.normaliseSetup(lobby.setup)
  let result

  switch (action) {
    case 'vote':
      result = Setup.castVote(setup, { playerId: me.id, choice: payload.choice, players })
      break

    case 'pick_resources':
      result = Setup.pickResources(setup, { playerId: me.id, pool: payload.pool, players })
      break

    case 'set_advisory':
      if (!isHost) return res.status(403).json({ error: 'Only the host can change this' })
      result = Setup.setAdvisory(setup, payload.exclude)
      break

    case 'skip':
      if (!isHost) return res.status(403).json({ error: 'Only the host can skip setup' })
      result = Setup.skipSetup(setup, players)
      break

    case 'reset':
      if (!isHost) return res.status(403).json({ error: 'Only the host can reset setup' })
      result = { setup: { ...Setup.defaultSetup(), excludeAdvisory: setup.excludeAdvisory } }
      break

    default:
      return res.status(400).json({ error: `Unknown setup action: ${action}` })
  }

  if (result.error) return res.status(400).json({ error: result.error })

  const { error: writeError } = await supabase
    .from('lobbies')
    .update({ setup: result.setup })
    .eq('id', lobbyId)

  if (writeError) return res.status(500).json({ error: 'Could not save setup' })

  return res.status(200).json({ setup: result.setup, tie: result.tie || false })
}
