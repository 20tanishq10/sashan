// SHASN — what you can do, as controls rather than prose.
//
// The turn panel used to describe your options in sentences, under headings, in
// a box four hundred pixels from the board. "No rights — you need the most
// voters in a zone (p.15)" is a rule, not a control, and it was on screen every
// turn of every game whether or not it applied.
//
// So: one row of controls. Each says what it does, whether it is available, and
// if not, why — on hover, rather than as a permanent line of text. A control
// that cannot be used stays visible and stays explicable, because "why can I not
// do this" is a question the interface should be able to answer.

import { STATE } from '../../lib/ui/states'

export default function CommandBar({ actions = [], onEndTurn, canEndTurn = true, busy = false }) {
  return (
    <div style={S.bar}>
      <div style={S.actions}>
        {actions.map((a) => {
          const available = a.available && !busy
          return (
            <button
              key={a.id}
              type="button"
              onClick={available ? a.onClick : undefined}
              disabled={!available}
              aria-disabled={!available}
              // The reason lives here rather than as a line in a panel: it is
              // needed at the moment you wonder, and never before.
              title={available ? a.hint || a.label : a.why || 'Not available right now'}
              style={{
                ...S.action,
                ...(a.active ? S.actionOn : null),
                ...(available ? null : S.actionOff),
              }}
            >
              <span style={S.actionLabel}>{a.label}</span>
              {a.detail && <span style={S.actionDetail}>{a.detail}</span>}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="btn btn--primary"
        onClick={onEndTurn}
        disabled={!canEndTurn || busy}
        style={S.end}
      >
        End turn
      </button>
    </div>
  )
}

const S = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 },

  action: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 1,
    padding: '6px 13px',
    borderRadius: 'var(--r-md)',
    border: '1px solid rgba(217,173,62,.4)',
    background: 'linear-gradient(180deg, var(--lacquer-3), var(--lacquer-2))',
    color: 'var(--ivory)',
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: 'var(--sh-brass)',
    transition: 'border-color 140ms var(--ease-out), background 140ms var(--ease-out)',
  },
  actionOn: {
    borderColor: 'var(--brass)',
    background: 'linear-gradient(180deg, rgba(224,130,20,.35), rgba(180,95,6,.3))',
  },
  // The shared vocabulary, so an unusable control here looks like an unusable
  // card there. See lib/ui/states.js.
  actionOff: { ...STATE.disabled, pointerEvents: 'auto', cursor: 'not-allowed' },

  actionLabel: {
    fontFamily: 'var(--head)',
    fontSize: 12,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  actionDetail: { fontSize: 10.5, color: 'var(--ink-on-dark-3)' },

  end: { marginLeft: 'auto' },
}
