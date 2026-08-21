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

import { useEffect, useRef, useState } from 'react'
import { ZONES } from '../lib/shasn/zones'
import { TOTAL_MAJORITY_POINTS } from '../lib/shasn/zones'

export default function Scoreboard({
  standings = [],
  breakdown = null,
  colorOf,
  myPlayerId = null,
  finished = false,
}) {
  // Which rows changed place since the last render — the table is a leaderboard
  // and overtaking somebody is the whole point.
  //
  // Above the guard below, and it has to stay there. Hooks must run in the same
  // order on every render, and standings arrive empty on the first one; a hook
  // called after the early return would run later but not initially, which React
  // treats as fatal and which takes the whole page down rather than just this
  // table. See tests/hooks.test.mjs.
  const moved = useMovedRows(standings)

  if (!standings.length) return null

  const leader = standings[0]
  const winners = standings.filter((r) => r.rank === 1)
  const awarded = breakdown ? breakdown.reduce((n, z) => n + z.points, 0) : null

  return (
    <div>
      {finished && (
        <div style={S.verdict} className="shasn-winner">
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
              <tr
                key={row.playerId}
                style={mine ? S.myRow : undefined}
                className={moved.has(row.playerId) ? 'shasn-rank-move' : undefined}
              >
                <td style={S.td}>
                  <span style={{ ...S.dot, background: colorOf(row.playerId) }} />
                  {row.nickname}
                  {mine && <span style={S.youTag}>you</span>}
                  {finished && row.rank === 1 && <span style={S.crown}>👑</span>}
                </td>

                <td style={{ ...S.td, textAlign: 'right' }}>
                  <Ticker value={row.score} style={S.points} />
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
                                borderColor: c.leading ? colorOf(row.playerId) : 'var(--border)',
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
              {breakdown.map((z, i) => (
                <tr
                  key={z.zoneId}
                  className="shasn-tally"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
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

/** Player ids whose rank changed since last render. */
function useMovedRows(standings) {
  const prev = useRef(new Map())
  const [moved, setMoved] = useState(new Set())

  useEffect(() => {
    const now = new Map(standings.map((r, i) => [r.playerId, i]))
    const changed = new Set()
    for (const [id, i] of now) {
      const was = prev.current.get(id)
      if (was !== undefined && was !== i) changed.add(id)
    }
    prev.current = now
    if (!changed.size) return
    setMoved(changed)
    const t = setTimeout(() => setMoved(new Set()), 700)
    return () => clearTimeout(t)
  }, [standings])

  return moved
}

/** A score that counts to its new value rather than snapping to it. */
function Ticker({ value, style, duration = 520 }) {
  const [shown, setShown] = useState(value)
  const [dir, setDir] = useState(null)
  const from = useRef(value)

  useEffect(() => {
    if (value === from.current) return
    const start = from.current
    const delta = value - start
    setDir(delta > 0 ? 'up' : 'down')

    let raf
    const t0 = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration)
      setShown(Math.round(start + delta * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(step)
      else {
        from.current = value
        setTimeout(() => setDir(null), 260)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return (
    <strong
      key={dir || 'idle'}
      className={dir === 'up' ? 'shasn-score-up' : dir === 'down' ? 'shasn-score-down' : undefined}
      style={style}
    >
      {shown}
    </strong>
  )
}

const S = {
  verdict: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderLeft: '3px solid var(--good)',
    color: 'var(--ink)',
    borderRadius: 'var(--r-lg)',
    padding: '16px 18px',
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    boxShadow: 'var(--sh-1)',
  },
  verdictName: { fontSize: 21, fontWeight: 650, letterSpacing: '-0.02em' },
  verdictSub: { fontSize: 12.5, color: 'var(--ink-on-dark-3)' },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: 'var(--ink-on-dark-3)',
    fontWeight: 600,
  },
  td: { padding: '9px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  myRow: { background: 'var(--accent-bg)' },
  dot: {
    display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
    marginRight: 7, verticalAlign: 'middle',
  },
  youTag: {
    fontSize: 9, background: 'var(--surface-3)', color: 'var(--ink-on-dark-3)', borderRadius: 999,
    padding: '1px 7px', marginLeft: 6, letterSpacing: '0.08em',
    textTransform: 'uppercase', fontWeight: 600,
  },
  crown: { marginLeft: 6 },
  points: { fontSize: 17, fontWeight: 650, fontVariantNumeric: 'tabular-nums', display: 'inline-block' },
  projected: { fontSize: 11, color: 'var(--ink-on-dark-3)', marginLeft: 6 },
  zoneList: { fontSize: 12 },
  none: { color: 'var(--ink-on-dark-3)', fontSize: 12 },
  contestWrap: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  contestChip: {
    fontSize: 10, border: '1.5px solid', borderRadius: 999,
    padding: '2px 8px', background: 'var(--surface)', whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  footnote: { fontSize: 11, color: 'var(--ink-on-dark-3)', lineHeight: 1.5, marginTop: 10 },
  h4: {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.09em',
    fontWeight: 600, color: 'var(--ink-on-dark-3)', margin: '22px 0 8px',
  },
}
