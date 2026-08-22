// SHASN — a card going round the table.
//
// Submerged and A Trip To Goalpara stop the game and ask every player in turn.
// That is an unusual state for this game: it is nobody's turn in the normal
// sense, and the person who has to act is usually not the person whose turn it
// is. So this says three things, in this order:
//
//   1. whose slot it is         — because it is probably not the active player
//   2. what they have to do     — in the card's own words
//   3. how far through we are   — so waiting feels finite
//
// When it is YOUR slot the panel is the loud one and carries the controls. When
// it is somebody else's it is a quiet line, because there is nothing you can do
// and a panel shouting at you about it would be noise.

const WHAT = {
  gerrymander: {
    yours: 'Move one voter — majority or not. It cannot land in a Volatile Area.',
    theirs: (name) => `${name} is moving a voter.`,
  },
  cashOutVoter: {
    yours: 'Take one of the open Voter Cards for the resources printed on it.',
    theirs: (name) => `${name} is taking a Voter Card.`,
  },
}

export default function RoundPanel({
  round,
  players,
  myPlayerId,
  colorOf,
  onPass,
  busy = false,
  children, // whatever the current slot needs — a hint, a picker
}) {
  if (!round) return null

  const currentId = round.queue[0]
  const current = players.find((p) => p.id === currentId)
  const mine = currentId === myPlayerId
  const copy = WHAT[round.kind] || { yours: 'Take your turn on this card.', theirs: (n) => `${n} is acting.` }

  const done = round.acted.length
  const total = done + round.queue.length

  return (
    <section
      style={{
        ...S.panel,
        borderColor: mine ? 'var(--brass)' : 'rgba(217,173,62,.22)',
        boxShadow: mine ? 'var(--sh-3), var(--sh-brass)' : 'var(--sh-1)',
      }}
      aria-label={`${round.cardName} is going round the table`}
    >
      <header style={S.head}>
        <span style={S.card}>{round.cardName}</span>
        <span style={S.count}>
          {done} of {total}
        </span>
      </header>

      {mine ? (
        <>
          <p style={S.yours}>{copy.yours}</p>
          {children}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={onPass}
            style={S.pass}
          >
            Pass
          </button>
        </>
      ) : (
        <p style={S.theirs}>
          <span
            style={{ ...S.dot, background: colorOf ? colorOf(currentId) : 'var(--brass)' }}
            aria-hidden
          />
          {copy.theirs(current?.name || 'Someone')}
        </p>
      )}

      {/* Who is still to be asked. Named rather than counted, because "you are
          third" is a different feeling from "3 remaining". */}
      {round.queue.length > 1 && (
        <p style={S.waiting}>
          then{' '}
          {round.queue
            .slice(1)
            .map((id) => players.find((p) => p.id === id)?.name || '?')
            .join(', ')}
        </p>
      )}
    </section>
  )
}

const S = {
  panel: {
    backgroundColor: 'var(--lacquer-2)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,220,150,.08), transparent 50%)',
    border: '1px solid',
    borderRadius: 'var(--r-lg)',
    padding: '10px 12px 11px',
    color: 'var(--ink-on-dark)',
  },
  head: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  card: {
    fontFamily: 'var(--head)',
    fontSize: 12,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--brass)',
  },
  count: {
    fontSize: 10.5,
    color: 'var(--ink-on-dark-3)',
    fontVariantNumeric: 'tabular-nums',
  },
  yours: { fontSize: 12.5, lineHeight: 1.5, margin: '0 0 8px' },
  theirs: {
    fontSize: 12.5,
    lineHeight: 1.5,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    color: 'var(--ink-on-dark-2)',
  },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  waiting: { fontSize: 10.5, color: 'var(--ink-on-dark-3)', margin: '7px 0 0' },
  pass: { marginTop: 4 },
}
