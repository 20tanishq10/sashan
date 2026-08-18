// Resolving a Headline or Conspiracy that needs input.
//
// Cards declare a `mode`. Mechanically resolvable ones get a real picker here —
// without it they fall through to the manual box and do nothing, which is how
// Vikas Model (4 of the 20 Conspiracies) and Time's Up ended up inert.
//
// Cards that are genuine negotiations or votes ("convince 2 other players to
// become investors", "your opponents will vote and decide") still get the
// manual box. Automating those would destroy them.

import { useState } from 'react'
import * as R from '../lib/shasn/resources'
import { RESOURCES, RESOURCE_IDS } from '../lib/shasn/constants'

export default function CardResolver({ card, kind, prompt, onResolve, onManual, busy }) {
  const effect = card?.effect
  const options = effect?.type === 'choice' ? effect.options : null
  const [picked, setPicked] = useState(null)
  const [take, setTake] = useState(R.emptyPool())
  const [note, setNote] = useState('')

  if (!card) return null

  const chosen = options?.find((o) => o.id === picked)
  const needsResourcePick =
    chosen?.effect?.type === 'gainAny' ? chosen.effect.amount : null
  const takeTotal = R.poolTotal(take)

  return (
    <div style={S.wrap} className="shasn-deal">
      <span
        style={{
          ...S.tone,
          background: kind === 'headline' ? 'var(--amber)' : 'var(--danger)',
        }}
      />
      <div style={S.head}>
        <span
          style={{
            ...S.kind,
            background: kind === 'headline' ? 'var(--amber-bg)' : 'var(--danger-bg)',
            color: kind === 'headline' ? 'var(--amber)' : 'var(--danger)',
            borderColor: kind === 'headline' ? 'var(--amber-brd)' : 'var(--danger-brd)',
          }}
        >
          {kind === 'headline' ? 'Headline' : 'Conspiracy'}
        </span>
        <strong style={S.name}>{card.name}</strong>
      </div>

      <pre style={S.text}>{card.text}</pre>
      {card.clarification && <p style={S.clar}>{card.clarification}</p>}

      {options ? (
        <>
          <p style={S.prompt}>{prompt || 'Pick one:'}</p>
          <div style={S.options}>
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setPicked(o.id)
                  setTake(R.emptyPool())
                }}
                style={{
                  ...S.option,
                  borderColor: picked === o.id ? 'var(--accent)' : 'var(--border)',
                  background: picked === o.id ? 'var(--accent-bg)' : 'var(--surface)',
                }}
              >
                {labelFor(o)}
                {o.requiresCopies && (
                  <span style={S.badge}>needs {o.requiresCopies} copies</span>
                )}
              </button>
            ))}
          </div>

          {needsResourcePick && (
            <>
              <p style={S.prompt}>
                Take any {needsResourcePick} ({takeTotal}/{needsResourcePick})
              </p>
              <div style={S.steppers}>
                {RESOURCE_IDS.map((id) => (
                  <div key={id} style={S.stepper}>
                    <span style={{ ...S.chip, background: RESOURCES[id].color }}>
                      {RESOURCES[id].label}
                    </span>
                    <button
                      style={S.step}
                      onClick={() => setTake({ ...take, [id]: Math.max(0, take[id] - 1) })}
                    >
                      −
                    </button>
                    <span style={S.num}>{take[id]}</span>
                    <button
                      style={S.step}
                      disabled={takeTotal >= needsResourcePick}
                      onClick={() => setTake({ ...take, [id]: take[id] + 1 })}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            style={S.primary}
            disabled={
              busy || !picked || (needsResourcePick && takeTotal !== needsResourcePick)
            }
            onClick={() =>
              onResolve({
                optionId: picked,
                ...(needsResourcePick ? { resources: take } : {}),
              })
            }
          >
            Resolve
          </button>
        </>
      ) : (
        <>
          <p style={S.prompt}>
            {prompt ||
              'This one is settled at the table — negotiate or vote it out, then record what you agreed.'}
          </p>
          <input
            style={S.input}
            placeholder="What did you agree?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button style={S.primary} disabled={busy} onClick={() => onManual(note)}>
            Mark resolved
          </button>
        </>
      )}
    </div>
  )
}

function labelFor(option) {
  const e = option.effect || {}
  if (e.type === 'gainAny') return `Take any ${e.amount} resources`
  if (e.type === 'gain') {
    const parts = RESOURCE_IDS.filter((r) => e.resources?.[r]).map(
      (r) => `${e.resources[r]} ${RESOURCES[r].label}`
    )
    return `Get ${parts.join(' + ')}`
  }
  if (e.type === 'convertZone') return 'Seize a 6/11 zone'
  if (e.type === 'discardOwnVoters') return `Discard ${e.count} of your own voters`
  if (e.type === 'donateVoter') return `Donate ${e.count} voter to your left`
  return option.id.replace(/_/g, ' ')
}

const S = {
  wrap: {
    position: 'relative', overflow: 'hidden',
    border: '1px solid var(--border)', background: 'var(--surface)',
    borderRadius: 'var(--r-lg)', padding: '16px 14px 14px', marginTop: 12,
    boxShadow: 'var(--sh-2)',
  },
  // The hairline that says which deck this came off.
  tone: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  head: { display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 9, flexWrap: 'wrap' },
  kind: {
    fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600,
    border: '1px solid', padding: '1px 8px', borderRadius: 999,
  },
  name: { fontSize: 17, fontWeight: 600 },
  text: {
    fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', fontFamily: 'inherit',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    padding: 12, borderRadius: 'var(--r-md)', margin: '0 0 8px',
  },
  clar: { fontSize: 11.5, color: 'var(--ink-3)', margin: '0 0 10px', lineHeight: 1.5 },
  prompt: { fontSize: 13, margin: '13px 0 8px', fontWeight: 600 },
  options: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  option: {
    flex: '1 1 190px', textAlign: 'left', padding: '10px 12px',
    border: '1.5px solid var(--border)', borderRadius: 'var(--r-md)', cursor: 'pointer',
    fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4,
    background: 'var(--surface)',
    transition: 'border-color 140ms var(--ease-out), background 140ms var(--ease-out)',
  },
  badge: { fontSize: 10, color: 'var(--ink-3)' },
  steppers: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  stepper: { display: 'flex', alignItems: 'center', gap: 5 },
  chip: {
    display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11,
    color: 'var(--on-dark)', whiteSpace: 'nowrap', fontWeight: 550,
  },
  step: {
    width: 22, height: 22, border: '1px solid var(--border-2)', background: 'var(--surface)',
    borderRadius: 'var(--r-sm)', cursor: 'pointer', lineHeight: 1,
  },
  num: { minWidth: 16, textAlign: 'center', fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  input: {
    padding: '9px 11px', border: '1px solid var(--border-2)', borderRadius: 'var(--r-md)',
    fontSize: 13, width: '100%', boxSizing: 'border-box', marginBottom: 8,
    background: 'var(--surface)',
  },
  primary: {
    padding: '9px 18px', background: 'var(--accent)', color: 'var(--on-dark)',
    border: 'none', borderRadius: 'var(--r-md)', fontSize: 14, fontWeight: 550,
    cursor: 'pointer', marginTop: 10,
  },
}
