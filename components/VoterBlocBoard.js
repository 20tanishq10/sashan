import { BLOCS, BLOC_IDS } from '../lib/game/constants'
import { blocLeaders } from '../lib/game/scoring'

export default function VoterBlocBoard({ gameState, players, highlightPlayerId }) {
  const support = gameState?.board_state?.playerSupport || {}
  const leaders = blocLeaders(gameState, players)

  return (
    <div className="bloc-board">
      <h3>Voter Blocs</h3>
      <div className="bloc-grid">
        {BLOC_IDS.map((blocId) => {
          const bloc = BLOCS[blocId]
          const leader = leaders[blocId]
          const entries = players
            .map((p) => ({
              nickname: p.nickname,
              playerId: p.id,
              score: support[p.id]?.[blocId] || 0,
            }))
            .filter((e) => e.score > 0)
            .sort((a, b) => b.score - a.score)

          return (
            <div key={blocId} className="bloc-card" style={{ borderTopColor: bloc.color }}>
              <div className="bloc-header">
                <strong>{bloc.label}</strong>
                {leader && leader.score > 0 && (
                  <span className="bloc-leader">{leader.nickname} leads</span>
                )}
              </div>
              <ul className="bloc-scores">
                {entries.length === 0 ? (
                  <li className="muted">No support yet</li>
                ) : (
                  entries.map((e) => (
                    <li
                      key={e.playerId}
                      className={e.playerId === highlightPlayerId ? 'highlight' : ''}
                    >
                      <span>{e.nickname}</span>
                      <span className="score">+{e.score}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
