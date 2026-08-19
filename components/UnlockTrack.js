// SHASN — progress toward an Ideologue's powers.
//
// Five slots, filled by the Ideology Cards you hold of that Ideologue, with the
// level 3 and level 5 lines marked. The mat used to show a count and a dimmed
// power row, so "one more card and Tough Love opens" was something you worked
// out rather than saw.
//
// Deliberately the same device as a zone's majority track, at a smaller size.
// Progress toward a threshold is the same question whether it is a zone or an
// Ideologue, and it should not need learning twice.

import { unlockTrack } from '../lib/shasn/matStatus'
import { useChange } from '../lib/ui/useChanges'

export default function UnlockTrack({ held, color, height = 7, showNote = true }) {
  const track = unlockTrack(held)

  // Crossing 3 or 5 is the moment a power opens, and it used to happen by a row
  // quietly ceasing to be dim. The track says so.
  const crossed = useChange(held, crossing, 900, null)

  return (
    <div>
      <div style={S.row}>
        {track.segments.map((seg, i) => (
          <span
            key={i}
            style={S.cell}
            className={crossed && seg.filled ? 'shasn-track-hit' : undefined}
          >
            <span
              style={{
                ...S.seg,
                height,
                color, // so the track-hit glow picks up the Ideologue's colour
                background: seg.filled ? color : 'var(--surface)',
                borderColor: seg.filled ? 'transparent' : 'var(--border-2)',
              }}
            />
            {/* The unlock lines, in the gap after the slot that reaches them. */}
            {seg.threshold && i < track.segments.length - 1 && (
              <span style={{ ...S.line, height: height + 6 }} />
            )}
          </span>
        ))}
      </div>

      {showNote && (
        <p
          style={{
            ...S.note,
            color: track.level5 ? 'var(--good)' : track.held ? 'var(--ink-2)' : 'var(--ink-3)',
            fontWeight: track.level5 ? 600 : 400,
          }}
        >
          {track.note}
        </p>
      )}
    </div>
  )
}

/** The threshold just passed, if any — 3, 5, or nothing. */
function crossing(before, after) {
  if (before < 3 && after >= 3) return after >= 5 ? 5 : 3
  if (before < 5 && after >= 5) return 5
  return null
}

const S = {
  row: { display: 'flex', gap: 2, alignItems: 'center', color: 'inherit' },
  cell: { position: 'relative', flex: 1, display: 'flex' },
  seg: {
    flex: 1,
    borderRadius: 2,
    border: '1px solid',
    transition: 'background 220ms var(--ease)',
  },
  line: {
    position: 'absolute',
    right: -2,
    top: -3,
    width: 1.5,
    background: 'var(--ink)',
    borderRadius: 1,
  },
  note: { fontSize: 9, textAlign: 'center', margin: '3px 0 0', lineHeight: 1.35 },
}
