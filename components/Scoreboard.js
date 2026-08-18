// SHASN — scoring, made legible.
//
// Scoring is all-or-nothing per zone (p.19): every voter used to form a majority
// is worth 1 point, and everything else is worth nothing. In practice that means
// a player can spend a dozen turns building position while their score still
// reads zero — which looks broken even though it is exactly right.
//
// So alongside the banked score this shows what is actually happening: the zones
// you hold, the zones you are contesting and how far short you are, and the best
// score still reachable if every contest went your way.
//
// The end-game view adds the per-zone scorecard so the result is auditable.

import { ZONES } from '../lib/shasn/zones'
import { TOTAL_MAJORITY_POINTS } from '../lib/shasn/zones'

export default function Scoreboard({
  standings = [],
  breakdown = null,
  colorOf,
  myPlayerId = null,
  finished = false,
}) {
  if (!standings.length) return null

  const leader = standings[0]
  const winners = standings.filter((r) => r.rank === 1)
  const awarded = breakdown ? breakdown.reduce((n, z) => n + z.points, 0) : null

  return (
    <div>
      {finished && (
        <div style={S.verdict}>
          {winners.length > 1 ? (
            <>
              <strong style={S.verdictName}>
                {winners.map((w) => w.nickname).join(' and ')}
              </strong>
              <span style={S.verdictSub}>
                tie on {winners[0].score} majority voters — a genuine draw
              </span>
            </>
          ) : (
            <>
              <strong style={S.verdictName}>{leader.nickname} wins</strong>
              <span style={S.verdictSub}>
                {leader.score} majority voters across {leader.zonesHeld.length} zone
                {leader.zonesHeld.length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>
      )}

      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Candidate</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Points</th>
            <th style={S.th}>Zones held</th>
            {!finished && <th style={S.th}>In contention</th>}
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const mine = row.playerId === myPlayerId
            return (
              <tr key={row.playerId} style={mine ? S.myRow : undefined}>
                <td style={S.td}>
                  <span style={{ ...S.dot, background: colorOf(row.playerId) }} />
                  {row.nickname}
                  {mine && <span style={S.youTag}>you</span>}
                  {finished && row.rank === 1 && <span style={S.crown}>👑</span>}
                </td>

                <td style={{ ...S.td, textAlign: 'right' }}>
                  <strong style={S.points}>{row.score}</strong>
                  {!finished && row.projected > row.score && (
                    <span style={S.projected} title="Best score still reachable">
                      → {row.projected}
                    </span>
                  )}
                </td>

                <td style={S.td}>
                  {row.zonesHeld.length ? (
                    <span style={S.zoneList}>{row.zonesHeld.join(', ')}</span>
                  ) : (
                    <span style={S.none}>none yet</span>
                  )}
                </td>

                {!finished && (
                  <td style={S.td}>
                    {row.contested?.length ? (
                      <div style={S.contestWrap}>
                        {row.contested
                          .slice()
                          .sort((a, b) => a.needed - b.needed)
                          .slice(0, 3)
                          .map((c) => (
                            <span
                              key={c.zoneId}
                              style={{
                                ...S.contestChip,
                                borderColor: c.leading ? colorOf(row.playerId) : '#d8d2c4',
                                opacity: c.reachable ? 1 : 0.45,
                              }}
                              title={
                                c.reachable
                                  ? `${c.held} of ${c.majority} — ${c.needed} more to take ${c.label}`
                                  : `${c.label} can no longer be won`
                              }
                            >
                              {c.label} <strong>{c.held}/{c.majority}</strong>
                            </span>
                          ))}
                      </div>
                    ) : (
                      <span style={S.none}>—</span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      {!finished && (
        <p style={S.footnote}>
          Points come only from completed majorities — a zone part-won is worth nothing until the
          requirement is met (p.19). The arrow is the best score still reachable.
        </p>
      )}

      {breakdown && finished && (
        <>
          <h4 style={S.h4}>Zone by zone</h4>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Zone</th>
                <th style={S.th}>Required</th>
                <th style={S.th}>Taken by</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((z) => (
                <tr key={z.zoneId}>
                  <td style={S.td}>{z.label}</td>
                  <td style={S.td}>
                    {z.majority} of {z.areas}
                  </td>
                  <td style={S.td}>
                    {z.holder ? (
                      <>
                        <span style={{ ...S.dot, background: colorOf(z.holder) }} />
                        {z.holderName}
                      </>
                    ) : (
                      <span style={S.none}>no majority formed</span>
                    )}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{z.points || '—'}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...S.td, fontWeight: 700 }} colSpan={3}>
                  Awarded
                </td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>
                  {awarded} / {TOTAL_MAJORITY_POINTS}
                </td>
              </tr>
            </tbody>
          </table>
          {awarded < TOTAL_MAJORITY_POINTS && (
            <p style={S.footnote}>
              {TOTAL_MAJORITY_POINTS - awarded} point(s) went unclaimed — those zones filled up
              without anyone reaching the requirement.
            </p>
          )}
        </>
      )}
    </div>
  )
}

const S = {
  verdict: {
    background: '#3d5145',
    color: '#fff',
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  verdictName: { fontSize: 20, letterSpacing: 0.4 },
  verdictSub: { fontSize: 12, opacity: 0.85 },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '6px 8px',
    borderBottom: '1px solid #e6e0d2',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: '#8a8478',
    fontWeight: 600,
  },
  td: { padding: '8px 8px', borderBottom: '1px solid #f0ece1', verticalAlign: 'top' },
  myRow: { background: '#fbf8f0' },
  dot: {
    display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
    marginRight: 7, verticalAlign: 'middle',
  },
  youTag: {
    fontSize: 9, background: '#e6e0d2', color: '#6b6559', borderRadius: 3,
    padding: '1px 5px', marginLeft: 6, letterSpacing: 0.5,
  },
  crown: { marginLeft: 6 },
  points: { fontSize: 17, fontVariantNumeric: 'tabular-nums' },
  projected: { fontSize: 11, color: '#8a8478', marginLeft: 6 },
  zoneList: { fontSize: 12 },
  none: { color: '#a8a294', fontSize: 12 },
  contestWrap: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  contestChip: {
    fontSize: 10, border: '1.5px solid', borderRadius: 10,
    padding: '2px 7px', background: '#fff', whiteSpace: 'nowrap',
  },
  footnote: { fontSize: 11, color: '#8a8478', lineHeight: 1.5, marginTop: 10 },
  h4: {
    fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7,
    color: '#6b6559', margin: '20px 0 8px',
  },
}
