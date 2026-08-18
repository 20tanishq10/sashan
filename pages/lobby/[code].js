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
  const [copied, setCopied] = useState(false)

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
          const restored = { playerId: json.playerId, lobbyId: json.lobbyId, code: json.code, nickname: json.nickname, sessionToken, isHost: json.isHost }
          storePlayer(restored)
          setPlayer(restored)
          return
        }
        setError('Join this lobby from the Join page.')
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_players', filter: `lobby_id=eq.${lobby.id}` }, () => fetchLobbyState())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lobbies', filter: `id=eq.${lobby.id}` }, () => fetchLobbyState())
      .subscribe()
    const poll = setInterval(fetchLobbyState, 5000)
    return () => { clearInterval(poll); supabase.removeChannel(channel) }
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
    if (!res.ok) { setError(json.error || 'Could not toggle ready'); return }
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
    if (!res.ok) { setError(json.error || 'Could not start game'); return }
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
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* unavailable */ }
  }

  const isHost = player && lobby && player.playerId === lobby.hostId
  const readyToStart = canStartGame(players)
  const me = players.find((p) => p.id === player?.playerId)

  if (loading) {
    return (
      <main className="page">
        <div className="card card--sm"><p className="muted">Loading lobby…</p></div>
      </main>
    )
  }

  if (error && !lobby) {
    return (
      <main className="page">
        <div className="card card--sm">
          <p className="error" style={{ marginBottom: 16 }}>{error}</p>
          <Link href="/" className="btn btn--ghost">Back home</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page page--top lobby-page">
      <div className="lobby-shell">
        <Link href="/" className="back-link">← Home</Link>

        <div className="lobby-header">
          <div className="lobby-title-block">
            <span className="label">Waiting room</span>
            <h2>Election lobby</h2>
            <p>{players.length} / {lobby?.maxPlayers || 5} players — need {MIN_PLAYERS}+ all ready to begin</p>
          </div>

          <div className="code-block">
            <div>
              <span className="label" style={{ display: 'block', marginBottom: 4 }}>Election code</span>
              <span className="code-value">{code}</span>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={copyCode}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="lobby-grid">
          <div className="lobby-panel">
            <h3>Players</h3>
            <LobbyPlayerList
              players={players}
              hostId={lobby?.hostId}
              currentPlayerId={player?.playerId}
            />
          </div>

          <div className="lobby-panel">
            <h3>Before you start</h3>
            <ul className="brief-list">
              <li>Share the code with everyone at the table.</li>
              <li>Each player clicks <strong>Ready</strong> when seated.</li>
              <li>The host starts once {MIN_PLAYERS}+ players are ready.</li>
            </ul>
          </div>
        </div>

        {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

        {player && (
          <div className="lobby-actions">
            <button
              type="button"
              className={`btn ${me?.is_ready ? 'btn--ghost' : 'btn--primary'}`}
              onClick={handleToggleReady}
              disabled={actionLoading}
            >
              {me?.is_ready ? 'Unready' : 'Ready up'}
            </button>

            {isHost && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleStartGame}
                disabled={actionLoading || !readyToStart}
              >
                Start game
              </button>
            )}

            <button
              type="button"
              className="btn btn--danger"
              onClick={handleLeave}
              disabled={actionLoading}
            >
              Leave
            </button>
          </div>
        )}

        {!player && (
          <p className="muted">
            Use the <Link href="/join">Join page</Link> with code <strong>{code}</strong> to enter.
          </p>
        )}
      </div>
    </main>
  )
}
