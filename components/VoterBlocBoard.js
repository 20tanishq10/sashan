import { BLOCS, BLOC_IDS } from '../lib/game/constants'
import { blocLeaders } from '../lib/game/scoring'
import { RESOURCES, RESOURCE_CAP, gainResourcesFromCard, checkResourceCap } from '../lib/game/constants'

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

// Uneven zone layout positions (x, y, width, height) - irregular pattern
// These positions are designed to create an "uneven zonal pattern" as seen in the board design
const ZONE_LAYOUT = {
  frontier:  { x: 40,  y: 40,  w: 120, h: 100 },
  agraria:   { x: 200, y: 20,  w: 100, h: 130 },
  capital:   { x: 350, y: 50,  w: 110, h: 90 },
  coast:     { x: 500, y: 15,  w: 95,  h: 120 },
  foundry:   { x: 420, y: 140, w: 100, h: 80 },
  riverland: { x: 300, y: 160, w: 110, h: 90 },
  highlands: { x: 150, y: 150, w: 95,  h: 85 },
  metro:     { x: 50,  y: 130, w: 90,  h: 100 },
  delta:     { x: 600, y: 130, w: 95,  h: 95 },
}

const PIPS_PER_ZONE = 20

export default function VoterBlocBoard({ gameState, players, highlightPlayerId, playerStates }) {
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

      <div className="board-map" style={{ position: 'relative', width: '100%', height: 0, paddingBottom: '206.5%', overflow: 'hidden' }}>
        {/* Centre seal */}
        <div className="board-seal" style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50)', textAlign: 'center' }}>
          <span className="seal-title">Election</span>
          <span className="seal-count">{activeZones}</span>
          <span className="seal-label">Blocs Active</span>
        </div>

        {BLOC_IDS.map((blocId) => {
          const bloc = BLOCS[blocId]
          const meta = ZONE_META[blocId]
          const leader = leaders[blocId]

          const layout = ZONE_LAYOUT[blocId] || { x: 0, y: 0, w: 100, h: 100 }

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
              style={{
                position: 'absolute',
                left: `${layout.x}%`,
                top: `${layout.y}%`,
                width: `${layout.w}%`,
                height: `${layout.h}%`,
                '--zone-color': bloc.color,
              }}
            >
              <div className="zone-color-bar" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: bloc.color }} />
              <div className="zone-body" style={{ position: 'relative', padding: 8 }}>
                <div className="zone-name" style={{ fontSize: 10, marginBottom: 4 }}>{bloc.label}</div>
                <div className="zone-region" style={{ fontSize: 8, opacity: 0.7, marginBottom: 4 }}>{meta.note}</div>

                {/* Leader progress bar */}
                {total > 0 && (
                  <div className="zone-leader-bar" style={{ height: 16, marginBottom: 6 }}>
                    {entries.map((e) => (
                      <div
                        key={e.id}
                        className="zone-leader-fill"
                        style={{
                          width: `${Math.max((e.score / total) * 100, 4)}%`,
                          background: e.color,
                          height: 14,
                          borderRadius: 2,
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Pip track */}
                <div className="pip-track" style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 6 }}>
                  {pips.map((color, idx) => (
                    <div
                      key={idx}
                      className={`pip${color ? ' is-filled' : ''}`}
                      style={color ? { width: 10, height: 10, borderRadius: 5, background: color, border: '1px solid currentColor' } : {}}
                    />
                  ))}
                </div>

                {/* Score rows */}
                <div className="zone-scores">
                  {entries.length === 0 ? (
                    <span className="zone-empty" style={{ fontSize: 8, opacity: 0.5 }}>No campaign presence</span>
                  ) : (
                    entries.map((e) => (
                      <div
                        key={e.id}
                        className={`zone-score-row${e.id === highlightPlayerId ? ' is-me' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8 }}
                      >
                        <span className="zone-score-name" style={{ flex: 1, color: 'var(--parch-ink-2)', fontFamily: 'Cinzel,serif', fontSize: 9, letterSpacing: '0.06em' }}>
                          <span
                            className="zone-dot"
                            style={{ width: 6, height: 6, borderRadius: 3, background: e.color, flexShrink: 0 }}
                          />
                          {e.nickname}
                          {leader?.playerId === e.id && e.score > 0 && (
                            <span style={{ fontSize: 7, color: 'var(--gold)', fontFamily: 'Cinzel,serif', marginLeft: 2, letterSpacing: '0.1em' }}>
                              ◆ LEADS
                            </span>
                          )}
                        </span>
                        <span className="zone-score-val" style={{ minWidth: 24, textAlign: 'right' }}>{e.score}</span>
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
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 10,
          borderTop: '1px solid var(--parch-line-2)', background: 'var(--parch-background)', padding: 8
        }}>
          {players.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colorMap[p.id], flexShrink: 0 }} />
              <span style={{ color: 'var(--parch-ink-2)', fontFamily: 'Cinzel,serif', fontSize: 9, letterSpacing: '0.06em' }}>
                {p.nickname}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Resource mats - each player's resources visible to all */}
      {players.length > 0 && playerStates && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 12, paddingTop: 8,
          borderTop: '1px solid var(--parch-line-2)', background: 'var(--parch-background)', padding: 6
        }}>
          {players.map((p) => {
            const pPlayerState = playerStates?.find(ps => ps.player_id === p.id) || {}
            const pRes = pPlayerState.resources || {}
            return (
              <div key={p.id} style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
                <div style={{ fontSize: 8, fontWeight: 600, marginBottom: 4, color: 'var(--parch-ink-2)' }}>
                  {p.nickname}'s Resources
                </div>
                <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                  {Object.entries(RESOURCES).map(([key, res]) => {
                    const amount = pRes[key] || 0
                    return (
                      <span key={key} style={{
                        display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                        width: 24, height: 24, borderRadius: 50,
                        background: res.color + '20', color: res.color, fontSize: 9,
                        border: '1px solid ' + res.color
                      }}>
                        {res.symbol}
                        <div style={{ fontSize: 7 }}>{amount}/{RESOURCE_CAP}</div>
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Turn information */}
      <div style={{
        marginTop: 12, padding: 8, background: 'var(--parch-background)', borderTop: '1px solid var(--parch-line-2)'
      }}>
        <span className="label" style={{ marginBottom: 4 }}>Resources</span>
        <p style={{ fontSize: 10, color: 'var(--parch-ink-2)' }}>
          Each player starts with a cap of {RESOURCE_CAP} resources per type.
          Resources are earned by playing Ideology Cards and can be traded with opponents.
        </p>
      </div>
    </div>
  )
}