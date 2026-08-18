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
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.kind}>{kind === 'headline' ? 'Headline' : 'Conspiracy'}</span>
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
                  borderColor: picked === o.id ? '#2b2b2b' : '#d8d2c4',
                  background: picked === o.id ? '#fffdf6' : '#fff',
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
  wrap: { border: '1px solid #e0d6b8', background: '#fffdf4', borderRadius: 10, padding: 14, marginTop: 12 },
  head: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  kind: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, background: '#3d5145', color: '#fff', padding: '2px 7px', borderRadius: 4 },
  name: { fontSize: 17 },
  text: { fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#fff', border: '1px solid #efe8d6', padding: 11, borderRadius: 7, margin: '0 0 8px' },
  clar: { fontSize: 11, color: '#8a8478', fontStyle: 'italic', margin: '0 0 10px', lineHeight: 1.5 },
  prompt: { fontSize: 13, margin: '12px 0 8px', fontWeight: 600 },
  options: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  option: { flex: '1 1 190px', textAlign: 'left', padding: '10px 12px', border: '2px solid #d8d2c4', borderRadius: 8, cursor: 'pointer', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 },
  badge: { fontSize: 10, color: '#8a8478' },
  steppers: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  stepper: { display: 'flex', alignItems: 'center', gap: 5 },
  chip: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, color: '#fff', whiteSpace: 'nowrap' },
  step: { width: 22, height: 22, border: '1px solid #d8d2c4', background: '#fff', borderRadius: 4, cursor: 'pointer', lineHeight: 1 },
  num: { minWidth: 16, textAlign: 'center', fontSize: 13 },
  input: { padding: '8px 10px', border: '1px solid #d8d2c4', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box', marginBottom: 8 },
  primary: { padding: '9px 18px', background: '#2b2b2b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer', marginTop: 10 },
}
