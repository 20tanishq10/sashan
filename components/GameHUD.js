import { MAX_ROUNDS, SCORING_CHECKPOINT_ROUNDS } from '../lib/game/constants'
import { getStandings } from '../lib/game/scoring'

export default function GameHUD({ gameState, players, myPlayerId, actionPoints }) {
  const standings = getStandings(gameState, players)
  const current = players.find((p) => p.id === gameState?.current_turn_player_id)
  const isMyTurn = gameState?.current_turn_player_id === myPlayerId
  const isOver = gameState?.phase === 'finished'
  const round = gameState?.round || 1
  const isCheckpoint = SCORING_CHECKPOINT_ROUNDS.includes(round)
  const lastEvent = gameState?.board_state?.lastEventCard

  return (
    <div className="panel">
      {/* Top meta row */}
      <div className="hud-meta">
        <span className="label" style={{ marginBottom: 0 }}>Round {round} / {MAX_ROUNDS}</span>

        {!isOver && (
          <span className={`pill ${isMyTurn ? 'pill--green' : 'pill--default'}`}>
            {isMyTurn ? 'Your turn' : `${current?.nickname || '…'}'s turn`}
          </span>
        )}

        {isOver && <span className="pill pill--accent">Polls closed</span>}

        {actionPoints != null && !isOver && (
          <span className="pill pill--accent">{actionPoints} AP</span>
        )}

        {isCheckpoint && !isOver && (
          <span className="checkpoint-badge">Checkpoint</span>
        )}
      </div>

      {/* Event banner */}
      {lastEvent && (
        <div className="event-banner">
          <span className="label label--amber" style={{ marginBottom: 2 }}>National event</span>
          <strong>{lastEvent.name}</strong>
          <p>{lastEvent.description}</p>
        </div>
      )}

      {/* Key stats */}
      <div className="hud-body">
        <div className="hud-stat">
          <span className="hud-stat-label">Leader</span>
          <span className="hud-stat-value">{standings[0]?.nickname || '—'}</span>
          <span className="hud-stat-sub">{standings[0]?.total ?? 0} pts</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-label">Your rank</span>
          <span className="hud-stat-value">
            {myPlayerId ? `#${(standings.findIndex((s) => s.playerId === myPlayerId) + 1) || '—'}` : '—'}
          </span>
          <span className="hud-stat-sub">{isMyTurn ? 'Your turn' : 'Waiting'}</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-label">Active</span>
          <span className="hud-stat-value">{current?.nickname || '—'}</span>
          <span className="hud-stat-sub">{isOver ? 'Game over' : 'Holds the floor'}</span>
        </div>
      </div>

      {/* Standings */}
      <div className="standings-list">
        {standings.map((s, i) => (
          <div
            key={s.playerId}
            className={`standings-row${s.playerId === myPlayerId ? ' is-me' : ''}`}
          >
            <span className="standings-rank">{i + 1}</span>
            <span className="standings-name">{s.nickname}</span>
            <span className="standings-pts">{s.total}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
