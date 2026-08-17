import { MAX_ROUNDS, SCORING_CHECKPOINT_ROUNDS, SETTING_NAME } from '../lib/game/constants'
import { getStandings } from '../lib/game/scoring'

const PLAYER_COLORS = ['#c0392b','#d4943a','#27ae60','#8e44ad','#2980b9','#16a085']

export default function GameHUD({ gameState, players, myPlayerId, actionPoints }) {
  const standings  = getStandings(gameState, players)
  const current    = players.find((p) => p.id === gameState?.current_turn_player_id)
  const isMyTurn   = gameState?.current_turn_player_id === myPlayerId
  const isOver     = gameState?.phase === 'finished'
  const round      = gameState?.round || 1
  const isCheckpoint = SCORING_CHECKPOINT_ROUNDS.includes(round)
  const lastEvent  = gameState?.board_state?.lastEventCard
  const ap         = actionPoints ?? 0

  const colorMap = {}
  players.forEach((p, i) => { colorMap[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length] })

  return (
    <div className="panel">
      {/* ── Top bar ── */}
      <div className="hud-topbar">
        {/* Round tracker */}
        <div className="round-tracker">
          <span className="round-tracker-label">Round&nbsp;</span>
          <span className="round-tracker-value">{round}</span>
          <span className="round-tracker-total">/ {MAX_ROUNDS}</span>
        </div>

        {/* Turn indicator */}
        {!isOver && (
          <span className={`turn-pill ${isMyTurn ? 'turn-pill--yours' : 'turn-pill--theirs'}`}>
            {isMyTurn ? '◆ Your Turn' : `${current?.nickname || '…'}'s Turn`}
          </span>
        )}
        {isOver && <span className="turn-pill turn-pill--over">Polls Closed</span>}

        {/* AP tokens */}
        {!isOver && actionPoints != null && (
          <div className="ap-tokens" title={`${ap} Action Points remaining`}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`ap-token${i >= ap ? ' is-spent' : ''}`} />
            ))}
          </div>
        )}

        {isCheckpoint && !isOver && (
          <span className="checkpoint-badge">Scoring Checkpoint</span>
        )}
      </div>

      {/* ── Event card banner ── */}
      {lastEvent && (
        <div className="event-banner">
          <span className="label label--gold" style={{ marginBottom: 2 }}>National Event</span>
          <strong>{lastEvent.name}</strong>
          <p>{lastEvent.description}</p>
        </div>
      )}

      {/* ── Key stats ── */}
      <div className="hud-grid">
        <div className="hud-stat">
          <span className="hud-stat-label">Front-runner</span>
          <span className="hud-stat-value">{standings[0]?.nickname || '—'}</span>
          <span className="hud-stat-sub">{standings[0]?.total ?? 0} total support</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-label">Your Position</span>
          <span className="hud-stat-value">
            {myPlayerId
              ? (() => { const r = standings.findIndex((s) => s.playerId === myPlayerId); return r >= 0 ? `#${r + 1}` : '—' })()
              : '—'}
          </span>
          <span className="hud-stat-sub">{isMyTurn ? 'Playing now' : 'Awaiting turn'}</span>
        </div>
        <div className="hud-stat">
          <span className="hud-stat-label">Active Campaign</span>
          <span className="hud-stat-value">{current?.nickname || '—'}</span>
          <span className="hud-stat-sub">{isOver ? 'Election concluded' : 'Holds the floor'}</span>
        </div>
      </div>

      {/* ── Scoreboard ── */}
      <div style={{ marginBottom: 4 }}>
        <span className="label">National Standings</span>
      </div>
      <div className="scoreboard">
        {standings.map((s, i) => (
          <div
            key={s.playerId}
            className={`score-row${s.playerId === myPlayerId ? ' is-me' : ''}${i === 0 ? ' is-leading' : ''}`}
          >
            <span className="score-rank">{i + 1}</span>
            <span
              className="score-swatch"
              style={{ background: colorMap[s.playerId] || '#888' }}
            />
            <span className="score-name">{s.nickname}</span>
            <span className="score-pts">{s.total}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
