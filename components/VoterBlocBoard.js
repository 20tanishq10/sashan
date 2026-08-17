import { BLOCS, BLOC_IDS } from '../lib/game/constants'
import { blocLeaders } from '../lib/game/scoring'

const BOARD_REGIONS = {
  frontier: { area: 'frontier', region: 'Northwest', note: 'Border towns, veterans, and hardline local bosses' },
  agraria: { area: 'agraria', region: 'North Plains', note: 'Granaries, mandis, and subsidy politics' },
  capital: { area: 'capital', region: 'Capital District', note: 'Cabinet whispers, donors, and institutional power' },
  coast: { area: 'coast', region: 'Northeast Coast', note: 'Ports, customs houses, and merchant networks' },
  foundry: { area: 'foundry', region: 'Western Foundries', note: 'Industrial belts and labor unions' },
  riverland: { area: 'riverland', region: 'Eastern Rivers', note: 'Floodplains, canals, and local patronage' },
  highlands: { area: 'highlands', region: 'Southwest Highlands', note: 'Mountain councils and autonomy movements' },
  metro: { area: 'metro', region: 'Southern Metro', note: 'Studios, startups, and urban middle-class opinion' },
  delta: { area: 'delta', region: 'Southeast Delta', note: 'Fishing cooperatives, relief politics, and migration' },
}

export default function VoterBlocBoard({ gameState, players, highlightPlayerId }) {
  const support = gameState?.board_state?.playerSupport || {}
  const leaders = blocLeaders(gameState, players)
  const palette = ['crimson', 'gold', 'teal', 'plum', 'slate']
  const contestedZones = BLOC_IDS.filter((blocId) =>
    players.some((player) => (support[player.id]?.[blocId] || 0) > 0)
  ).length

  return (
    <div className="bloc-board">
      <div className="board-heading">
        <div>
          <span className="hud-label">Election map</span>
          <h3>National campaign map</h3>
        </div>
        <p className="board-copy">
          Press into weak districts, defend your strongholds, and watch which campaign is building
          a national story.
        </p>
      </div>

      <div className="board-map">
        <div className="board-seal">
          <span className="hud-label">Campaign seal</span>
          <strong>{contestedZones} / {BLOC_IDS.length} zones active</strong>
          <p>Nine zones decide the election. Control spreads from local strongholds into the national imagination.</p>
        </div>
        {BLOC_IDS.map((blocId) => {
          const bloc = BLOCS[blocId]
          const region = BOARD_REGIONS[blocId]
          const leader = leaders[blocId]
          const entries = players
            .map((p, index) => ({
              nickname: p.nickname,
              playerId: p.id,
              tone: palette[index % palette.length],
              score: support[p.id]?.[blocId] || 0,
            }))
            .filter((e) => e.score > 0)
            .sort((a, b) => b.score - a.score)
          const total = entries.reduce((sum, e) => sum + e.score, 0)

          return (
            <div
              key={blocId}
              className="bloc-card"
              style={{ '--bloc-color': bloc.color, gridArea: region.area }}
            >
              <div className="bloc-header">
                <div>
                  <span className="bloc-tag">{region.region}</span>
                  <strong>{bloc.label}</strong>
                  <p className="bloc-note">{region.note}</p>
                </div>
                <div className="bloc-header-meta">
                  {leader && leader.score > 0 && (
                    <span className="bloc-leader">{leader.nickname} leads</span>
                  )}
                  <span className="bloc-total">{total} total</span>
                </div>
              </div>

              <div className="bloc-track" aria-hidden="true">
                {entries.length === 0 ? (
                  <span className="bloc-empty-track" />
                ) : (
                  entries.map((e) => (
                    <span
                      key={e.playerId}
                      className={`track-segment tone-${e.tone}`}
                      style={{ width: `${Math.max((e.score / total) * 100, 8)}%` }}
                    />
                  ))
                )}
              </div>

              <ul className="bloc-scores">
                {entries.length === 0 ? (
                  <li className="muted">No ground operation yet</li>
                ) : (
                  entries.map((e) => (
                    <li
                      key={e.playerId}
                      className={`${e.playerId === highlightPlayerId ? 'highlight' : ''} tone-row tone-${e.tone}`}
                    >
                      <span className="player-pill">
                        <span className={`tone-dot tone-${e.tone}`} />
                        {e.nickname}
                      </span>
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
