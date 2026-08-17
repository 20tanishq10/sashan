import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getOrCreateSessionToken, getStoredPlayer, storePlayer } from '../../lib/session'
import { getSupabase } from '../../lib/supabaseClient'
import GameHUD from '../../components/GameHUD'
import VoterBlocBoard from '../../components/VoterBlocBoard'
import PlayerHand from '../../components/PlayerHand'
import GameLog from '../../components/GameLog'
import AlliancePanel from '../../components/AlliancePanel'
import EndGameSummary from '../../components/EndGameSummary'
import { getStandings } from '../../lib/game/scoring'

export default function GameRoom() {
  const router = useRouter()
  const { code } = router.query

  const [player, setPlayer] = useState(null)       // { playerId, sessionToken, nickname, … }
  const [isSpectator, setIsSpectator] = useState(false)
  const [gameState, setGameState] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerState, setMyPlayerState] = useState(null)
  const [myAlliances, setMyAlliances] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reconnecting, setReconnecting] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState(null)

  // ── Fetch full game state ─────────────────────────────────────────────────

  const fetchGame = useCallback(async (sessionToken) => {
    if (!code) return
    const token = sessionToken
    const res = await fetch(
      `/api/game-state?code=${encodeURIComponent(code)}${token ? `&sessionToken=${encodeURIComponent(token)}` : ''}`
    )
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Could not load game')
    setGameState(json.gameState)
    setPlayers(json.players)
    setMyPlayerState(json.myPlayerState)
    setMyAlliances(json.myAlliances || [])
    setIsSpectator(json.isSpectator ?? true)
    if (json.lobby.status === 'waiting') {
      router.replace(`/lobby/${code}`)
    }
    return json
  }, [code, router])

  // ── Fetch end-game summary (only when game is finished) ───────────────────

  const fetchSummary = useCallback(async () => {
    if (!code) return
    try {
      const res = await fetch(`/api/end-game-summary?code=${encodeURIComponent(code)}`)
      if (!res.ok) return
      const json = await res.json()
      setSummary(json)
    } catch {
      // non-fatal — summary is nice-to-have
    }
  }, [code])

  // ── Bootstrap: stored player → rejoin attempt → spectator fallback ────────

  useEffect(() => {
    if (!code) return

    async function init() {
      const sessionToken = getOrCreateSessionToken()
      const stored = getStoredPlayer()

      // 1. Happy path — we already have stored player for this code
      if (stored?.code === code && stored.sessionToken === sessionToken) {
        setPlayer(stored)
        try {
          const json = await fetchGame(sessionToken)
          if (json?.gameState?.phase === 'finished') fetchSummary()
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
        return
      }

      // 2. No stored match — try to rejoin mid-game by session token
      setReconnecting(true)
      try {
        const rejoinRes = await fetch('/api/rejoin-game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, sessionToken }),
        })

        if (rejoinRes.ok) {
          const rj = await rejoinRes.json()
          const restored = {
            playerId: rj.playerId,
            lobbyId: rj.lobbyId,
            code: rj.code,
            nickname: rj.nickname,
            sessionToken,
            isHost: rj.isHost,
          }
          storePlayer(restored)
          setPlayer(restored)
          const json = await fetchGame(sessionToken)
          if (json?.gameState?.phase === 'finished') fetchSummary()
          setLoading(false)
          setReconnecting(false)
          return
        }

        // 3. Not a registered player — fall through as spectator
        const json = await fetchGame(sessionToken)
        if (json?.gameState?.phase === 'finished') fetchSummary()
        // isSpectator will be set inside fetchGame via the API response
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
        setReconnecting(false)
      }
    }

    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // ── Realtime subscription + polling ──────────────────────────────────────

  useEffect(() => {
    if (!gameState?.id) return

    const sessionToken = player?.sessionToken || getOrCreateSessionToken()

    const supabase = getSupabase()
    if (!supabase) return

    const channel = supabase
      .channel(`game-${gameState.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_state', filter: `id=eq.${gameState.id}` },
        async () => {
          const json = await fetchGame(sessionToken).catch(() => null)
          if (json?.gameState?.phase === 'finished' && !summary) fetchSummary()
        }
      )
      .subscribe()

    const poll = setInterval(async () => {
      const json = await fetchGame(sessionToken).catch(() => null)
      if (json?.gameState?.phase === 'finished' && !summary) fetchSummary()
    }, 4000)

    return () => {
      clearInterval(poll)
      if (supabase) supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.id])

  // ── Game actions ──────────────────────────────────────────────────────────

  async function sendAction(action) {
    if (!player || isSpectator) return
    setActionLoading(true)
    setError(null)
    const res = await fetch('/api/game-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, sessionToken: player.sessionToken, action }),
    })
    const json = await res.json()
    setActionLoading(false)
    if (!res.ok) {
      setError(json.error || 'Action failed')
      return
    }
    const updated = await fetchGame(player.sessionToken)
    if (json.gameOver || updated?.gameState?.phase === 'finished') fetchSummary()
  }

  function handlePlayCard(cardId, targetPlayerId) {
    const action = { type: 'play_card', cardId }
    if (targetPlayerId) action.targetPlayerId = targetPlayerId
    sendAction(action)
  }

  function handleRally(bloc) {
    sendAction({ type: 'rally', bloc })
  }

  function handleProposeAlliance({ targetPlayerId, proposerBloc, targetBloc }) {
    sendAction({ type: 'propose_alliance', targetPlayerId, proposerBloc, targetBloc })
  }

  async function handleAllianceAction(allianceId, actionType, choice) {
    if (!player || isSpectator) return
    setActionLoading(true)
    setError(null)
    const res = await fetch('/api/alliance-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        sessionToken: player.sessionToken,
        allianceId,
        action: { type: actionType, choice },
      }),
    })
    const json = await res.json()
    setActionLoading(false)
    if (!res.ok) {
      setError(json.error || 'Alliance action failed')
      return
    }
    fetchGame(player.sessionToken)
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const isMyTurn = !isSpectator && gameState?.current_turn_player_id === player?.playerId
  const isOver = gameState?.phase === 'finished'
  const standings = gameState ? getStandings(gameState, players) : []
  const ap = myPlayerState?.action_points ?? 0

  // ── Loading / error guards ────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="page game-page">
        <div className="card">
          <p>{reconnecting ? 'Reconnecting to the campaign…' : 'Assembling the election board…'}</p>
        </div>
      </main>
    )
  }

  if (error && !gameState) {
    return (
      <main className="page game-page">
        <div className="card">
          <p className="error">{error}</p>
          <Link href="/" className="btn btn-secondary">
            Return home
          </Link>
        </div>
      </main>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="page game-page">
      <div className="game-layout">
        <div className="game-main">

          {/* Spectator badge */}
          {isSpectator && (
            <div className="spectator-badge" role="status">
              <span className="spectator-dot" aria-hidden="true" />
              Spectating — you are watching this election live
            </div>
          )}

          <GameHUD
            gameState={gameState}
            players={players}
            myPlayerId={player?.playerId}
            actionPoints={isSpectator ? null : myPlayerState?.action_points}
          />

          <VoterBlocBoard
            gameState={gameState}
            players={players}
            highlightPlayerId={isSpectator ? null : player?.playerId}
          />

          {/* End-game: full summary replaces the old banner */}
          {isOver && (
            <EndGameSummary summary={summary} myPlayerId={player?.playerId} />
          )}

          {error && <p className="error">{error}</p>}

          {/* Active player controls — hidden for spectators */}
          {!isSpectator && !isOver && isMyTurn && (
            <div className="turn-actions chamber-card">
              <div>
                <span className="hud-label">Floor action</span>
                <h4>Close this speaking window</h4>
                <p className="board-copy">
                  {ap > 0
                    ? `You still have ${ap} AP. Play a card, rally a zone, or yield the floor when your move is complete.`
                    : 'You are out of AP. Yield the floor to move the election to the next campaign.'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={actionLoading}
                onClick={() => sendAction({ type: 'end_turn' })}
              >
                Yield the floor
              </button>
            </div>
          )}

          {!isSpectator && (
            <PlayerHand
              hand={myPlayerState?.hand}
              actionPoints={myPlayerState?.action_points}
              isMyTurn={isMyTurn && !isOver}
              onPlayCard={handlePlayCard}
              onRally={handleRally}
              onProposeAlliance={handleProposeAlliance}
              players={players}
              myPlayerId={player?.playerId}
              loading={actionLoading}
            />
          )}
        </div>

        <aside className="game-sidebar">
          <GameLog log={gameState?.board_state?.log} />

          {!isSpectator && (
            <AlliancePanel
              myAlliances={myAlliances}
              myPlayerId={player?.playerId}
              players={players}
              currentRound={gameState?.round}
              onAllianceAction={handleAllianceAction}
              loading={actionLoading}
            />
          )}

          <div className="reference-card">
            <span className="hud-label">Turn rhythm</span>
            <p>
              Read the map, spend AP with care, and only yield when your campaign has squeezed
              enough value from this window.
            </p>
          </div>
          <div className="reference-card">
            <span className="hud-label">Victory brief</span>
            <p>
              Stack support across the whole country. A narrow lead in one zone is fragile, but
              a broad coalition is hard to uproot.
            </p>
          </div>
          <Link href="/" className="btn btn-secondary btn-sm">
            Exit to home
          </Link>
        </aside>
      </div>
    </main>
  )
}
