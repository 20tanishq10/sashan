// SHASN — the detail behind a zone plaque.
//
// The plaque has to fit on the map, so it carries the least it can get away
// with: the requirement, a proportional track, and whether the zone is dead.
// Everything else — who holds exactly how much, how far off you are, whether it
// is still worth contesting — was a counting exercise across scattered pips.
//
// This is what the plaque would say if it had room. It appears beside the board
// on hover, so it never covers the zone you are looking at.
//
// Almost all of it already existed: majorityTrack() computes these numbers for
// the plaque, and the plaque's tooltip already wrote a version of the summary
// line. This is surfacing what was there rather than deriving anything new.

import { ZONES } from '../../lib/shasn/zones'
import { majorityTrack, needed } from '../../lib/shasn/majorityTrack'

export default function ZoneCard({ zoneId, board, players, colorOf, myPlayerId }) {
  if (!zoneId || !board) return null

  const zone = ZONES[zoneId]
  const track = majorityTrack(board, zoneId)
  const nameOf = (id) => players.find((p) => p.id === id)?.name || 'someone'

  // Holders biggest first, which is the order the track draws them in — the two
  // should agree or the card contradicts the plaque it explains.
  const holdings = track.runs.filter((r) => r.owner)

  const mine = needed(board, zoneId, myPlayerId)

  return (
    <div style={S.card} role="tooltip">
      <div style={S.head}>
        <span style={S.name}>{zone.label}</span>
        <span style={S.req}>
          {zone.majority} of {zone.areas} to hold
        </span>
      </div>

      <div style={S.rows}>
        {holdings.map((run) => (
          <div key={run.owner} style={S.row}>
            <span style={{ ...S.swatch, background: colorOf(run.owner) }} />
            <span style={S.who}>
              {run.owner === myPlayerId ? 'you' : nameOf(run.owner)}
            </span>
            <span style={S.count}>{run.count}</span>
          </div>
        ))}

        <div style={S.row}>
          <span style={{ ...S.swatch, ...S.emptySwatch }} />
          <span style={{ ...S.who, color: 'var(--ink-on-dark-3)' }}>empty</span>
          <span style={{ ...S.count, color: 'var(--ink-on-dark-3)' }}>{track.empty}</span>
        </div>
      </div>

      <p style={S.verdict}>{verdict({ track, zone, mine, nameOf, myPlayerId })}</p>
    </div>
  )
}

/** The one line that answers "should I care about this zone". */
function verdict({ track, zone, mine, nameOf, myPlayerId }) {
  if (track.holder) {
    return track.holder === myPlayerId
      ? `Yours — ${zone.majority} points, as long as you keep it.`
      : `${nameOf(track.holder)} holds it. ${zone.majority} points, unless you break it.`
  }
  if (track.dead) {
    return `Full, and nobody reached ${zone.majority}. Its ${zone.majority} points are gone (p.19).`
  }
  if (mine === null) {
    return 'You can no longer reach the requirement here.'
  }
  if (mine === 0) return 'You are at the requirement.'
  return `You need ${mine} more. ${track.empty} area${track.empty === 1 ? '' : 's'} still open.`
}

const S = {
  card: {
    width: 218,
    padding: '11px 13px 12px',
    backgroundColor: 'var(--lacquer-2)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,220,150,.09), transparent 45%)',
    border: '1px solid var(--brass-dark)',
    borderRadius: 'var(--r-lg)',
    boxShadow: 'var(--sh-3), var(--sh-brass)',
    color: 'var(--ink-on-dark)',
    pointerEvents: 'none',
  },
  head: { display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 9 },
  name: {
    fontFamily: 'var(--head)',
    fontSize: 14,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--brass-light)',
  },
  req: { fontSize: 11, color: 'var(--ink-on-dark-3)', fontVariantNumeric: 'tabular-nums' },

  rows: { display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 9 },
  row: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 },
  swatch: { width: 11, height: 11, borderRadius: 3, flexShrink: 0 },
  emptySwatch: {
    background: 'transparent',
    border: '1px solid var(--ink-on-dark-3)',
  },
  who: { flex: 1, minWidth: 0, color: 'var(--ivory)' },
  count: { fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--brass-light)' },

  verdict: {
    fontSize: 11.5,
    lineHeight: 1.5,
    color: 'var(--ink-on-dark-2)',
    borderTop: '1px solid rgba(217,173,62,.22)',
    paddingTop: 8,
    margin: 0,
  },
}
