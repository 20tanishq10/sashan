import { SETTING_NAME, MAX_ROUNDS } from '../lib/game/constants'
import { getStandings } from '../lib/game/scoring'

export default function GameHUD({ gameState, players, myPlayerId, actionPoints }) {
  const current = players.find((p) => p.id === gameState?.current_turn_player_id)
  const isMyTurn = gameState?.current_turn_player_id === myPlayerId
  const standings = getStandings(gameState, players)
  const isOver = gameState?.phase === 'finished'

  return (
    <div className="game-hud">
      <div className="hud-row">
        <div>
          <span className="hud-label">{SETTING_NAME}</span>
          <h2>Round {gameState?.round || 1} / {MAX_ROUNDS}</h2>
        </div>
        <div className="hud-stats">
          <span className="stat">
            <strong>{actionPoints ?? '—'}</strong> AP
          </span>
          {!isOver && (
            <span className={`turn-badge ${isMyTurn ? 'your-turn' : ''}`}>
              {isMyTurn ? 'Your turn' : `${current?.nickname || '…'}'s turn`}
            </span>
          )}
          {isOver && <span className="turn-badge finished">Game over</span>}
        </div>
      </div>

      <div className="standings">
        <h4>Standings</h4>
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
