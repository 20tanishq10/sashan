import { BLOCS, BLOC_IDS } from '../lib/game/constants'
import { blocLeaders } from '../lib/game/scoring'

const ZONE_META = {
  frontier:  { region: 'Frontier Marches',   note: 'Border towns & veterans' },
  agraria:   { region: 'Agraria',            note: 'Granaries & subsidy politics' },
  capital:   { region: 'Capital Circle',     note: 'Donors & institutions' },
  coast:     { region: 'Coast of Trade',     note: 'Ports & merchant networks' },
  foundry:   { region: 'Foundry Belt',       note: 'Factories & labour unions' },
  riverland: { region: 'Riverland',          note: 'Canals & local patronage' },
  highlands: { region: 'Highlands',          note: 'Mountain councils & autonomy' },
  metro:     { region: 'Metro Corridor',     note: 'Studios, startups & opinion' },
  delta:     { region: 'Delta Republic',     note: 'Fishing coops & relief politics' },
}

const PLAYER_COLORS = ['#c0392b','#d4943a','#27ae60','#8e44ad','#2980b9','#16a085']

// How many pips to show per zone (represents the vote scale)
const PIPS_PER_ZONE = 20

export default function VoterBlocBoard({ gameState, players, highlightPlayerId }) {
  const support = gameState?.board_state?.playerSupport || {}
  const leaders = blocLeaders(gameState, players)
  const activeZones = BLOC_IDS.filter((b) =>
    players.some((p) => (support[p.id]?.[b] || 0) > 0)
  ).length

  // Build a stable colour map: player index → colour
  const colorMap = {}
  players.forEach((p, i) => { colorMap[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length] })

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <span className="label">Republic of Meridia</span>
          <h3 style={{ marginTop: 2 }}>Voter Bloc Map</h3>
        </div>
        <span className="pill pill--default">{activeZones} / {BLOC_IDS.length} contested</span>
      </div>

      <div className="board-map">
        {/* Centre seal */}
        <div className="board-seal">
          <span className="seal-title">Election</span>
          <span className="seal-count">{activeZones}</span>
          <span className="seal-label">Blocs Active</span>
        </div>

        {BLOC_IDS.map((blocId) => {
          const bloc = BLOCS[blocId]
          const meta = ZONE_META[blocId]
          const leader = leaders[blocId]

          const entries = players
            .map((p) => ({
              id: p.id,
              nickname: p.nickname,
              score: support[p.id]?.[blocId] || 0,
              color: colorMap[p.id],
            }))
            .filter((e) => e.score > 0)
            .sort((a, b) => b.score - a.score)

          const total = entries.reduce((s, e) => s + e.score, 0)

          // Build pip array — each pip gets a fill colour or stays empty
          const pips = []
          let filled = 0
          for (const entry of entries) {
            const count = Math.round((entry.score / Math.max(total, 1)) * PIPS_PER_ZONE)
            for (let k = 0; k < count && filled < PIPS_PER_ZONE; k++) {
              pips.push(entry.color)
              filled++
            }
          }
          while (pips.length < PIPS_PER_ZONE) pips.push(null)

          return (
            <div
              key={blocId}
              className="zone-card"
              style={{ '--zone-color': bloc.color, gridArea: blocId }}
            >
              <div className="zone-color-bar" />
              <div className="zone-body">
                <div className="zone-name">{bloc.label}</div>
                <div className="zone-region">{meta.note}</div>

                {/* Leader progress bar */}
                {total > 0 && (
                  <div className="zone-leader-bar">
                    {entries.map((e) => (
                      <div
                        key={e.id}
                        className="zone-leader-fill"
                        style={{
                          width: `${Math.max((e.score / total) * 100, 4)}%`,
                          background: e.color,
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Pip track */}
                <div className="pip-track">
                  {pips.map((color, idx) => (
                    <div
                      key={idx}
                      className={`pip${color ? ' is-filled' : ''}`}
                      style={color ? { background: color, borderColor: color } : {}}
                    />
                  ))}
                </div>

                {/* Score rows */}
                <div className="zone-scores">
                  {entries.length === 0 ? (
                    <span className="zone-empty">No campaign presence</span>
                  ) : (
                    entries.map((e) => (
                      <div
                        key={e.id}
                        className={`zone-score-row${e.id === highlightPlayerId ? ' is-me' : ''}`}
                      >
                        <span className="zone-score-name">
                          <span
                            className="zone-dot"
                            style={{ background: e.color }}
                          />
                          {e.nickname}
                          {leader?.playerId === e.id && e.score > 0 && (
                            <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'Cinzel,serif', marginLeft: 3, letterSpacing: '0.1em' }}>
                              ◆ LEADS
                            </span>
                          )}
                        </span>
                        <span className="zone-score-val">{e.score}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Player colour legend */}
      {players.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--parch-line-2)' }}>
          {players.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: colorMap[p.id], flexShrink: 0 }} />
              <span style={{ color: 'var(--parch-ink-2)', fontFamily: 'Cinzel,serif', fontSize: 10, letterSpacing: '0.06em' }}>
                {p.nickname}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
