// SHASN — the panel that says what you missed.
//
// Appears once, when the turn comes back to you, and goes as soon as you do
// anything. It is a briefing, not a log: six lines at most, most consequential
// first, and then out of the way.
//
// Deliberately not a modal. You should be able to look at the board while
// reading it, because half of what it says is about the board.

import { turnDigest } from '../../lib/shasn/digest'

const TONE = {
  majority: { fg: 'var(--brass-light)', mark: '◆' },
  headline: { fg: 'var(--amber)', mark: '!' },
  conspiracy: { fg: 'var(--danger)', mark: '✦' },
  resolution: { fg: 'var(--danger)', mark: '✦' },
  gerrymander: { fg: 'var(--ink-on-dark-2)', mark: '⇄' },
  auction: { fg: 'var(--ink-on-dark-2)', mark: '¤' },
  trade: { fg: 'var(--ink-on-dark-2)', mark: '⇆' },
  power: { fg: 'var(--good)', mark: '★' },
}

export default function TurnDigest({ game, playerId, onDismiss }) {
  const { entries, missedTurns } = turnDigest(game, playerId)
  if (!entries.length) return null

  return (
    <aside style={S.panel} aria-label="What happened since your last turn">
      <div style={S.head}>
        <span style={S.title}>
          While you were away
          {missedTurns > 0 && (
            <span style={S.turns}>
              {missedTurns} turn{missedTurns === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <button type="button" onClick={onDismiss} style={S.close} aria-label="Dismiss">
          ×
        </button>
      </div>

      <ul style={S.list}>
        {entries.map((e, i) => {
          const tone = TONE[e.type] || { fg: 'var(--ink-on-dark-2)', mark: '·' }
          return (
            <li key={`${e.turn}-${i}`} style={S.item}>
              <span style={{ ...S.mark, color: tone.fg }} aria-hidden>
                {tone.mark}
              </span>
              <span style={{ ...S.text, color: tone.fg }}>{e.message}</span>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

const S = {
  panel: {
    backgroundColor: 'var(--lacquer-2)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,220,150,.1), transparent 45%)',
    border: '1px solid var(--brass-dark)',
    borderRadius: 'var(--r-lg)',
    padding: '11px 13px 12px',
    boxShadow: 'var(--sh-3), var(--sh-brass)',
    color: 'var(--ink-on-dark)',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 9,
  },
  title: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    fontFamily: 'var(--head)',
    fontSize: 12,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--brass)',
  },
  turns: {
    fontSize: 10,
    letterSpacing: 0,
    textTransform: 'none',
    color: 'var(--ink-on-dark-3)',
  },
  close: {
    border: 'none',
    background: 'none',
    color: 'var(--brass)',
    fontSize: 18,
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 4px',
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  mark: { fontSize: 11, lineHeight: 1.5, flexShrink: 0, width: 10, textAlign: 'center' },
  text: { fontSize: 12.5, lineHeight: 1.5 },
}
