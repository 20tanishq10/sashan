import { SETTING_NAME, MAX_ROUNDS } from '../lib/game/constants'
import { getStandings } from '../lib/game/scoring'

export default function GameHUD({ gameState, players, myPlayerId, actionPoints }) {
  const current = players.find((p) => p.id === gameState?.current_turn_player_id)
  const isMyTurn = gameState?.current_turn_player_id === myPlayerId
  const standings = getStandings(gameState, players)
  const isOver = gameState?.phase === 'finished'
  const leader = standings[0]
  const myStanding = standings.findIndex((s) => s.playerId === myPlayerId)

  return (
    <div className="game-hud">
      <div className="hud-topline">
        <span className="hud-label">Campaign Setting</span>
        <span className="hud-seal">Election Dossier</span>
      </div>

      <div className="hud-row hud-row-main">
        <div className="hud-title-block">
          <p className="setting-name">{SETTING_NAME}</p>
          <h2>National Election Board</h2>
          <p className="hud-subtitle">
            Round {gameState?.round || 1} of {MAX_ROUNDS}
          </p>
        </div>
        <div className="hud-stats">
          <span className="stat"><strong>{actionPoints ?? '—'}</strong> AP</span>
          {!isOver && (
            <span className={`turn-badge ${isMyTurn ? 'your-turn' : ''}`}>
              {isMyTurn ? 'You hold the floor' : `${current?.nickname || '…'} holds the floor`}
            </span>
          )}
          {isOver && <span className="turn-badge finished">Polls closed</span>}
        </div>
      </div>

      <div className="campaign-strip">
        <div className="campaign-card">
          <span className="hud-label">Front-runner</span>
          <strong>{leader?.nickname || '—'}</strong>
          <span>{leader?.total ?? 0} support</span>
        </div>
        <div className="campaign-card">
          <span className="hud-label">Your position</span>
          <strong>{myStanding >= 0 ? `#${myStanding + 1}` : '—'}</strong>
          <span>{isMyTurn ? 'Your coalition can move now' : 'Await your speaking window'}</span>
        </div>
        <div className="campaign-card">
          <span className="hud-label">Active chair</span>
          <strong>{current?.nickname || '—'}</strong>
          <span>{isOver ? 'Final count underway' : 'Setting the tone this turn'}</span>
        </div>
      </div>

      <div className="standings">
        <h4>National standings</h4>
        <ol>
          {standings.map((s, i) => (
            <li key={s.playerId} className={s.playerId === myPlayerId ? 'highlight' : ''}>
              <span>{i + 1}. {s.nickname}</span>
              <span>{s.total} pts</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
