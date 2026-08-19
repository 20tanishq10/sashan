// SHASN — the status strip on a player mat.
//
// Only appears when something is actually true, which most turns it is not. The
// mat should be quiet until a Conspiracy lands on you, and then it should say so
// until it wears off — because the card that did it scrolls out of the log within
// a turn or two and after that nothing on screen explains why your purchases are
// failing.
//
// Tones are the four from the design system, used for their meaning rather than
// their colour: danger stops you, amber costs you, accent waits on you, good is
// in your favour.

import { matStatus } from '../lib/shasn/matStatus'

const TONES = {
  danger: { bg: 'var(--danger-bg)', fg: 'var(--danger)', br: 'var(--danger-brd)' },
  warn: { bg: 'var(--amber-bg)', fg: 'var(--amber)', br: 'var(--amber-brd)' },
  accent: { bg: 'var(--accent-bg)', fg: 'var(--accent-ink)', br: 'var(--accent-brd)' },
  good: { bg: 'var(--good-bg)', fg: 'var(--good)', br: 'var(--good-brd)' },
}

export default function MatStatus({ player, board = null, compact = false, max = null }) {
  const all = matStatus(player, { board })
  if (!all.length) return null

  const shown = max ? all.slice(0, max) : all
  const hidden = all.length - shown.length

  return (
    <div style={{ ...S.strip, gap: compact ? 3 : 5 }}>
      {shown.map((s) => {
        const t = TONES[s.tone] || TONES.warn
        return (
          <span
            key={s.id}
            title={s.detail}
            style={{
              ...S.chip,
              fontSize: compact ? 9 : 10.5,
              padding: compact ? '0 6px' : '1px 8px',
              background: t.bg,
              color: t.fg,
              borderColor: t.br,
            }}
          >
            {s.label}
          </span>
        )
      })}
      {hidden > 0 && (
        <span
          style={{ ...S.chip, fontSize: compact ? 9 : 10.5, ...S.more }}
          title={all.slice(shown.length).map((s) => s.label).join(' · ')}
        >
          +{hidden}
        </span>
      )}
    </div>
  )
}

const S = {
  strip: { display: 'flex', flexWrap: 'wrap', alignItems: 'center' },
  chip: {
    border: '1px solid',
    borderRadius: 999,
    fontWeight: 600,
    lineHeight: 1.7,
    whiteSpace: 'nowrap',
  },
  more: {
    background: 'var(--surface-3)',
    color: 'var(--ink-3)',
    borderColor: 'var(--border)',
    padding: '0 6px',
  },
}
