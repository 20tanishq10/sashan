import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getStoredPlayer } from '../../lib/session'
import { getSupabase } from '../../lib/supabaseClient'
import GameHUD from '../../components/GameHUD'
import VoterBlocBoard from '../../components/VoterBlocBoard'
import PlayerHand from '../../components/PlayerHand'
import GameLog from '../../components/GameLog'
import { getStandings } from '../../lib/game/scoring'

export default function GameRoom() {
  const router = useRouter()
  const { code } = router.query

  const [player, setPlayer] = useState(null)
  const [gameState, setGameState] = useState(null)
  const [players, setPlayers] = useState([])
  const [myPlayerState, setMyPlayerState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState(null)
  const [winner, setWinner] = useState(null)

  const fetchGame = useCallback(async () => {
    if (!code || !player?.sessionToken) return
    const res = await fetch(
      `/api/game-state?code=${encodeURIComponent(code)}&sessionToken=${encodeURIComponent(player.sessionToken)}`
    )
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Could not load game')
    setGameState(json.gameState)
    setPlayers(json.players)
    setMyPlayerState(json.myPlayerState)
    if (json.lobby.status === 'waiting') {
      router.replace(`/lobby/${code}`)
    }
  }, [code, player, router])

  useEffect(() => {
    const stored = getStoredPlayer()
    if (stored?.code === code) {
      setPlayer(stored)
    } else {
      setError('Join this game from the lobby first.')
      setLoading(false)
    }
  }, [code])

  useEffect(() => {
    if (!player) return
    fetchGame()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [player, fetchGame])

  useEffect(() => {
    if (!gameState?.id) return

    const supabase = getSupabase()
    if (!supabase) return

    const channel = supabase
      .channel(`game-${gameState.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_state', filter: `id=eq.${gameState.id}` },
        () => fetchGame()
      )
      .subscribe()

    const poll = setInterval(() => fetchGame().catch(() => {}), 4000)

    return () => {
      clearInterval(poll)
      if (supabase) supabase.removeChannel(channel)
    }
  }, [gameState?.id, fetchGame])

  async function sendAction(action) {
    if (!player) return
    setActionLoading(true)
    setError(null)
    const res = await fetch('/api/game-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        sessionToken: player.sessionToken,
        action,
      }),
    })
    const json = await res.json()
    setActionLoading(false)
    if (!res.ok) {
      setError(json.error || 'Action failed')
      return
    }
    if (json.gameOver) {
      setWinner(json.winner)
    }
    await fetchGame()
  }

  const isMyTurn = gameState?.current_turn_player_id === player?.playerId
  const isOver = gameState?.phase === 'finished'
  const standings = gameState ? getStandings(gameState, players) : []
  const ap = myPlayerState?.action_points ?? 0

  if (loading) {
    return (
      <main className="page game-page">
        <div className="card"><p>Assembling the election board…</p></div>
      </main>
    )
  }

  if (error && !gameState) {
    return (
      <main className="page game-page">
        <div className="card">
          <p className="error">{error}</p>
          <Link href="/" className="btn btn-secondary">Return home</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page game-page">
      <div className="game-layout">
        <div className="game-main">
          <GameHUD
            gameState={gameState}
            players={players}
            myPlayerId={player?.playerId}
            actionPoints={myPlayerState?.action_points}
          />

          <VoterBlocBoard
            gameState={gameState}
            players={players}
            highlightPlayerId={player?.playerId}
          />

          {isOver && (
            <div className="game-over-banner">
              <h3>Polls closed</h3>
              <p>
                <strong>{winner?.nickname || standings[0]?.nickname}</strong> carries the election
                with {winner?.total ?? standings[0]?.total} total support.
              </p>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          {!isOver && isMyTurn && (
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

          <PlayerHand
            hand={myPlayerState?.hand}
            actionPoints={myPlayerState?.action_points}
            isMyTurn={isMyTurn && !isOver}
            onPlayCard={(cardId) => sendAction({ type: 'play_card', cardId })}
            onRally={(bloc) => sendAction({ type: 'rally', bloc })}
            loading={actionLoading}
          />
        </div>

        <aside className="game-sidebar">
          <GameLog log={gameState?.board_state?.log} />
          <div className="reference-card">
            <span className="hud-label">Turn rhythm</span>
            <p>Read the map, spend AP with care, and only yield when your campaign has squeezed enough value from this window.</p>
          </div>
          <div className="reference-card">
            <span className="hud-label">Victory brief</span>
            <p>Stack support across the whole country. A narrow lead in one zone is fragile, but a broad coalition is hard to uproot.</p>
          </div>
          <Link href="/" className="btn btn-secondary btn-sm">Exit to home</Link>
        </aside>
      </div>
    </main>
  )
}
