import { BLOCS, BLOC_IDS } from '../lib/game/constants'
import { blocLeaders } from '../lib/game/scoring'

const ZONE_META = {
  frontier:  { region: 'Northwest',        note: 'Border towns & veterans' },
  agraria:   { region: 'North Plains',     note: 'Granaries & subsidies' },
  capital:   { region: 'Capital District', note: 'Donors & institutions' },
  coast:     { region: 'NE Coast',         note: 'Ports & merchants' },
  foundry:   { region: 'West',             note: 'Factories & unions' },
  riverland: { region: 'East',             note: 'Canals & patronage' },
  highlands: { region: 'SW Highlands',     note: 'Councils & autonomy' },
  metro:     { region: 'South Metro',      note: 'Studios & startups' },
  delta:     { region: 'SE Delta',         note: 'Fishing & migration' },
}

// Five distinct tone colours that match the player-tones CSS custom props
const TONES = ['#4f6ef7', '#d4943a', '#4caf82', '#9b6db5', '#e05555']

export default function VoterBlocBoard({ gameState, players, highlightPlayerId }) {
  const support = gameState?.board_state?.playerSupport || {}
  const leaders = blocLeaders(gameState, players)
  const activeZones = BLOC_IDS.filter((b) =>
    players.some((p) => (support[p.id]?.[b] || 0) > 0)
  ).length

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <span className="label" style={{ marginBottom: 2 }}>Election map</span>
          <h3>Voter blocs</h3>
        </div>
        <span className="pill pill--default">{activeZones} / {BLOC_IDS.length} active</span>
      </div>

      <div className="board-map">
        {/* Centre seal */}
        <div className="board-seal" style={{ gridArea: 'seal' }}>
          <span className="board-seal-count">{activeZones}</span>
          <span className="board-seal-sub">zones contested</span>
        </div>

        {BLOC_IDS.map((blocId) => {
          const bloc = BLOCS[blocId]
          const meta = ZONE_META[blocId]
          const leader = leaders[blocId]

          const entries = players
            .map((p, idx) => ({
              id: p.id,
              nickname: p.nickname,
              score: support[p.id]?.[blocId] || 0,
              color: TONES[idx % TONES.length],
            }))
            .filter((e) => e.score > 0)
            .sort((a, b) => b.score - a.score)

          const total = entries.reduce((s, e) => s + e.score, 0)

          return (
            <div
              key={blocId}
              className="bloc-card"
              style={{ '--bloc-color': bloc.color, gridArea: blocId }}
            >
              <div className="bloc-card-inner">
                <div className="bloc-name">{bloc.label}</div>
                <div className="bloc-region">{meta.region} · {meta.note}</div>

                {/* Support bar */}
                <div className="bloc-track">
                  {entries.map((e) => (
                    <div
                      key={e.id}
                      className="bloc-track-fill"
                      style={{
                        width: `${Math.max((e.score / total) * 100, 5)}%`,
                        background: e.color,
                      }}
                    />
                  ))}
                </div>

                {/* Score rows */}
                <div className="bloc-scores">
                  {entries.length === 0 ? (
                    <span className="bloc-empty">No support yet</span>
                  ) : (
                    entries.map((e) => (
                      <div
                        key={e.id}
                        className={`bloc-score-row${e.id === highlightPlayerId ? ' is-me' : ''}`}
                      >
                        <span className="bloc-score-name">
                          <span className="bloc-score-dot" style={{ background: e.color }} />
                          {e.nickname}
                        </span>
                        <span className="bloc-score-val">{e.score}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
