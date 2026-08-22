// SHASN — the room's title bar.
//
// It used to carry the seating as well: a chip per player with a name and a
// score. Those chips said the same thing as the mats beside the board, so the
// same information was on screen twice in two shapes. The seating now lives in
// one place, the rivals rail, where there is room to say something useful.
//
// What is left is genuinely header material: where you are, whose turn number
// this is, and the way out.

import Link from 'next/link'

export default function RoomHeader({
  code,
  turnNumber,
  isSpectator = false,
  turnLabel = null, // "Your turn" or "Bo is playing" — never absent during play
  turnColor = null,
  phase = null,
  children,
}) {
  return (
    <header style={S.bar}>
      <div style={S.brand}>
        <h1 style={S.title}>SHASN</h1>
        <span style={S.room}>
          {code} · Turn {turnNumber}
          {isSpectator && ' · spectating'}
        </span>
      </div>

      {/* Whose turn it is belongs here, not in a panel. It is true for the whole
          screen and has to be visible at every moment, which a banner that
          announces the handoff and then leaves cannot manage on its own. */}
      {turnLabel && (
        <div style={S.turn}>
          <span style={{ ...S.turnDot, background: turnColor || 'var(--brass)' }} />
          <strong style={S.turnLabel}>{turnLabel}</strong>
          {phase && <span style={S.phase}>{phase}</span>}
        </div>
      )}

      {/* Whatever the room wants in the middle — the turn banner lives here. */}
      <div style={S.middle}>{children}</div>

      <Link href="/" className="btn btn--ghost btn--sm">
        Leave
      </Link>
    </header>
  )
}

const S = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 18px 10px',
    borderBottom: '1px solid rgba(217,173,62,0.22)',
  },
  brand: { display: 'flex', alignItems: 'baseline', gap: 11, minWidth: 0 },
  title: {
    fontFamily: 'var(--display)',
    fontSize: 26,
    margin: 0,
    letterSpacing: '0.18em',
    background: 'linear-gradient(180deg, var(--brass-light), var(--brass) 55%, var(--saffron-deep))',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  },
  room: {
    fontSize: 12.5,
    color: 'var(--brass)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  middle: { flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 },

  turn: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  turnDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  turnLabel: {
    fontFamily: 'var(--head)',
    fontSize: 15,
    color: 'var(--ivory)',
    whiteSpace: 'nowrap',
  },
  phase: {
    fontFamily: 'var(--head)',
    fontSize: 10,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    padding: '2px 9px',
    borderRadius: 999,
    border: '1px solid rgba(217,173,62,.3)',
    background: 'rgba(0,0,0,.3)',
    color: 'var(--brass)',
    whiteSpace: 'nowrap',
  },
}
