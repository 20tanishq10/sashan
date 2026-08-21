// SHASN — the response window on a played Conspiracy Card (p.18, p.22).
//
//   "You can use a Conspiracy Card at any point in your turn. You can also use
//    one right before an opponent answers their Ideology Card."
//   Block:   "Play this immediately out of turn when an opponent plays a
//             Conspiracy Card to negate its effect."
//   Reverse: "When a player uses a Conspiracy Card on you, you may play this
//             card immediately to reverse its effect back to them."
//
// Only players actually holding Block or Reverse are asked — nobody else could
// respond anyway, and asking the whole table would stall every card.
//
// The asymmetry matters and is stated on the cards: a Block cannot itself be
// reversed, so it beats everything. A Reverse can be blocked.

import { IDEOLOGUES } from '../lib/shasn/constants'
import * as Cards from '../lib/shasn/cards'

export default function InterruptPrompt({ interrupt, game, me, busy = false, onRespond }) {
  if (!interrupt) return null

  const card = Cards.getConspiracyCard(interrupt.cardId)
  const playedBy = game.players.find((p) => p.id === interrupt.playerId)
  const amEligible = interrupt.eligible.includes(me?.id)
  const haveAnswered = interrupt.responses.some((r) => r.playerId === me?.id)
  const waitingOn = interrupt.eligible.filter(
    (id) => !interrupt.responses.some((r) => r.playerId === id)
  )

  const myBlock = me?.conspiracyCards?.find((c) => c === 'block')
  const myReverse = me?.conspiracyCards?.find((c) => c === 'reverse')

  // Watching, not holding a response.
  if (!amEligible || haveAnswered) {
    return (
      <div style={S.watch}>
        <span style={S.eyebrow}>Conspiracy in play</span>
        <p style={S.text}>
          <strong>{playedBy?.name}</strong> played <strong>{card?.name}</strong>.
          {waitingOn.length > 0 ? (
            <>
              {' '}Waiting on{' '}
              {waitingOn
                .map((id) => game.players.find((p) => p.id === id)?.name)
                .filter(Boolean)
                .join(', ')}
              .
            </>
          ) : (
            ' Resolving…'
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="shasn-scrim">
      <div className="shasn-drop" style={S.card}>
        <span style={S.eyebrow}>Respond?</span>
        <h3 style={S.title}>
          {playedBy?.name} played {card?.name}
        </h3>
        <pre style={S.body}>{card?.text}</pre>
        {card?.clarification && <p style={S.clar}>{card.clarification}</p>}

        <div style={S.actions}>
          {myBlock && (
            <button
              style={{ ...S.btn, background: 'var(--danger)' }}
              disabled={busy}
              onClick={() => onRespond({ action: 'block', cardId: 'block' })}
            >
              Block it
              <em style={S.sub}>negates the card outright</em>
            </button>
          )}
          {myReverse && (
            <button
              style={{ ...S.btn, background: 'var(--good)' }}
              disabled={busy}
              onClick={() => onRespond({ action: 'reverse', cardId: 'reverse' })}
            >
              Reverse it
              <em style={S.sub}>turns it back on {playedBy?.name}</em>
            </button>
          )}
          <button style={S.pass} disabled={busy} onClick={() => onRespond({ action: 'pass' })}>
            Let it stand
          </button>
        </div>

        <p style={S.note}>
          A Block cannot itself be reversed, so it always wins. A Reverse can be blocked.
        </p>
      </div>
    </div>
  )
}

const S = {
  card: {
    background: 'var(--surface)',
    borderRadius: 14,
    padding: '20px 22px 16px',
    maxWidth: 520,
    width: '100%',
    boxShadow: '0 20px 50px rgba(20,14,8,.45)',
  },
  eyebrow: {
    fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ink-on-dark-3)',
  },
  title: { fontSize: 19, margin: '6px 0 12px' },
  body: {
    fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', fontFamily: 'inherit',
    background: 'var(--surface)', border: '1px solid var(--border)', padding: 11, borderRadius: 7, margin: 0,
  },
  clar: { fontSize: 11, color: 'var(--ink-on-dark-3)', fontStyle: 'italic', margin: '8px 0 0', lineHeight: 1.5 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 },
  btn: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    padding: '10px 15px', color: 'var(--surface)', border: 'none', borderRadius: 8,
    fontSize: 14, cursor: 'pointer', textAlign: 'left',
  },
  sub: { fontStyle: 'normal', fontSize: 10, opacity: 0.85 },
  pass: {
    padding: '10px 15px', background: 'var(--surface)', border: '1px solid var(--border-2)',
    borderRadius: 8, fontSize: 13, cursor: 'pointer',
  },
  note: { fontSize: 10.5, color: 'var(--ink-on-dark-3)', marginTop: 12, fontStyle: 'italic', lineHeight: 1.5 },

  watch: {
    background: 'var(--amber-bg)', border: '1px solid var(--amber-brd)', borderRadius: 8,
    padding: '9px 12px', marginTop: 10,
  },
  text: { fontSize: 13, margin: '4px 0 0', lineHeight: 1.45 },
}
