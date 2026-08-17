import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getSupabase } from '../../lib/supabaseClient'
import { getOrCreateSessionToken, getStoredPlayer, storePlayer, clearStoredPlayer } from '../../lib/session'
import LobbyPlayerList, { canStartGame } from '../../components/LobbyPlayerList'
import { MIN_PLAYERS } from '../../lib/lobbyCodes'

export default function LobbyRoom() {
  const router = useRouter()
  const { code } = router.query

  const [lobby, setLobby] = useState(null)
  const [players, setPlayers] = useState([])
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchLobbyState = useCallback(async () => {
    if (!code) return
    const res = await fetch(`/api/lobby-state?code=${encodeURIComponent(code)}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Could not load lobby')
    setLobby(json.lobby)
    setPlayers(json.players)
    if (json.lobby.status === 'in_progress') {
      router.replace(`/game/${json.lobby.code}`)
    }
  }, [code, router])

  useEffect(() => {
    if (!code) return

    const stored = getStoredPlayer()
    const sessionToken = getOrCreateSessionToken()

    async function init() {
      try {
        await fetchLobbyState()

        if (stored?.code === code && stored.sessionToken === sessionToken) {
          setPlayer(stored)
          return
        }

        const rejoinRes = await fetch('/api/rejoin-lobby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, sessionToken }),
        })

        if (rejoinRes.ok) {
          const json = await rejoinRes.json()
          const restored = {
            playerId: json.playerId,
            lobbyId: json.lobbyId,
            code: json.code,
            nickname: json.nickname,
            sessionToken,
            isHost: json.isHost,
          }
          storePlayer(restored)
          setPlayer(restored)
          return
        }

        setError('Join this lobby from the Join page with your nickname.')
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [code, fetchLobbyState])

  useEffect(() => {
    if (!lobby?.id) return

    const supabase = getSupabase()
    if (!supabase) return

    const channel = supabase
      .channel(`lobby-${lobby.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobby_players', filter: `lobby_id=eq.${lobby.id}` },
        () => fetchLobbyState()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lobbies', filter: `id=eq.${lobby.id}` },
        () => fetchLobbyState()
      )
      .subscribe()

    const poll = setInterval(fetchLobbyState, 5000)

    return () => {
      clearInterval(poll)
      if (supabase) supabase.removeChannel(channel)
    }
  }, [lobby?.id, fetchLobbyState])

  async function handleToggleReady() {
    if (!player) return
    setActionLoading(true)
    setError(null)
    const res = await fetch('/api/toggle-ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobbyId: player.lobbyId, sessionToken: player.sessionToken }),
    })
    const json = await res.json()
    setActionLoading(false)
    if (!res.ok) {
      setError(json.error || 'Could not toggle ready')
      return
    }
    await fetchLobbyState()
  }

  async function handleStartGame() {
    if (!player) return
    setActionLoading(true)
    setError(null)
    const res = await fetch('/api/start-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobbyId: player.lobbyId, sessionToken: player.sessionToken }),
    })
    const json = await res.json()
    setActionLoading(false)
    if (!res.ok) {
      setError(json.error || 'Could not start game')
      return
    }
    router.push(`/game/${json.code}`)
  }

  async function handleLeave() {
    if (!player) return
    setActionLoading(true)
    await fetch('/api/leave-lobby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobbyId: player.lobbyId, sessionToken: player.sessionToken }),
    })
    clearStoredPlayer()
    router.push('/')
  }

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // clipboard may be unavailable
    }
  }

  const isHost = player && lobby && player.playerId === lobby.hostId
  const readyToStart = canStartGame(players)
  const me = players.find((p) => p.id === player?.playerId)

  if (loading) {
    return (
      <main className="page">
        <div className="card"><p>Loading lobby…</p></div>
      </main>
    )
  }

  if (error && !lobby) {
    return (
      <main className="page">
        <div className="card">
          <p className="error">{error}</p>
          <Link href="/" className="btn btn-secondary">Back home</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page lobby-page">
      <div className="card lobby-card campaign-lobby-card">
        <Link href="/" className="back-link">← Home</Link>
        <div className="lobby-hero">
          <div>
            <span className="hud-label">Campaign chamber</span>
            <h2>Election lobby</h2>
            <p className="subtitle">
              {players.length} / {lobby?.maxPlayers || 6} players assembled. Need {MIN_PLAYERS}+ and
              unanimous readiness before polls open.
            </p>
          </div>
          <div className="code-panel">
            <span className="hud-label">Election code</span>
            <div className="code-display">
              <span className="code">{code}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={copyCode}>Copy</button>
            </div>
          </div>
        </div>

        <div className="lobby-grid">
          <section className="lobby-panel">
            <div className="section-heading">
              <span className="hud-label">Delegates</span>
              <h3>Campaign table</h3>
            </div>

            <LobbyPlayerList
              players={players}
              hostId={lobby?.hostId}
              currentPlayerId={player?.playerId}
            />
          </section>

          <aside className="lobby-panel lobby-brief">
            <div className="section-heading">
              <span className="hud-label">Briefing</span>
              <h3>Before the first round</h3>
            </div>
            <ul className="brief-list">
              <li>Share the code with the full table.</li>
              <li>Each campaign marks itself ready when seated.</li>
              <li>The host may begin once at least {MIN_PLAYERS} campaigns are ready.</li>
            </ul>
          </aside>
        </div>

        {error && <p className="error">{error}</p>}

        {player && (
          <div className="lobby-actions">
            <button
              type="button"
              className={`btn ${me?.is_ready ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleToggleReady}
              disabled={actionLoading}
            >
              {me?.is_ready ? 'Unready' : 'Ready up'}
            </button>

            {isHost && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartGame}
                disabled={actionLoading || !readyToStart}
              >
                Start Game
              </button>
            )}

            <button type="button" className="btn btn-danger" onClick={handleLeave} disabled={actionLoading}>
              Leave
            </button>
          </div>
        )}

        {!player && (
          <p className="muted">Use the Join page with code <strong>{code}</strong> to enter this lobby.</p>
        )}
      </div>
    </main>
  )
}
